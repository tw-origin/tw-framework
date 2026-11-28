/**
 * Client-safe security analysis.
 *
 * This is an EXTRA LAYER, not a guarantee. It finds shapes that are usually a
 * leak; it cannot know intent, and it cannot see a secret that is assembled at
 * run time (`"sk_" + "live_" + …`) or fetched from a vault. docs/security.md
 * says so in the same words.
 *
 * Two tiers, kept apart on purpose:
 *   - CONFIRMED: the private-key block and the AWS key-id + secret pair. These
 *     are unambiguous. Even so they are WARNINGS today, because `tw build` has
 *     no `--ignore` escape hatch yet and a new build-breaking check would be a
 *     behaviour change. Move them to errors once build can be told to skip.
 *   - SUSPICIOUS: everything else here. Pattern-matched, so warnings/info only.
 *
 * Scan input is the source AFTER `stripServerBlockRegions()`, which blanks the
 * server-block regions in place (newlines kept), so line and column still point
 * at the original file.
 */

export interface SecretFinding {
  code: SecretCode;
  message: string;
  line: number;
  col: number;
}

export type SecretCode =
  | "TW311" | "TW312" | "TW313" | "TW314" | "TW315" | "TW316" | "TW317";

/** Packages that are server-only but are NOT on the TW1007 denylist. */
export const SERVER_ONLY_HINTS = [
  "stripe", "twilio", "openai", "@aws-sdk/", "@sendgrid/", "firebase-admin",
  "googleapis", "@octokit/",
];

/** Same name convention the server-block serializer already uses. */
const SECRET_NAME = /KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|DATABASE_URL|DSN/i;

/** Names that are client-exposed by convention, so never a leak. */
const PUBLIC_PREFIX = /^(PUBLIC_|NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_|REACT_APP_)/;

const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/;
const AWS_ID = /\bAKIA[0-9A-Z]{16}\b/;
const AWS_SECRET = /[A-Za-z0-9/+=]{40}/;

const LIVE_KEYS: [string, RegExp][] = [
  ["stripe live key", /\bsk_live_[A-Za-z0-9]{16,}\b/],
  ["GitHub personal access token", /\bghp_[A-Za-z0-9]{30,}\b/],
  ["Slack bot token", /\bxoxb-[A-Za-z0-9-]{20,}\b/],
  ["JSON Web Token", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
];

const SECRET_EXPORT =
  /export\s+(?:const|let|var)\s+([A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL)[A-Za-z0-9_]*)\s*=\s*["'`]([^"'`]{12,})["'`]/g;

const CLIENT_SAFE_MARKER = /import\s+["']@tw\/client-safe["']/;

/** Values that look like secrets but are not. */
const PLACEHOLDER = /^(x+|\*+|\.{3}|YOUR[_-]?\w*|MY[_-]?\w*|SOME[_-]?\w*|CHANGE[_-]?ME|PLACEHOLDER|EXAMPLE|SAMPLE|TEST[_-]?\w*|FAKE[_-]?\w*|DUMMY\w*|REDACTED|TODO|NONE|null|undefined)$/i;

/** How far the AWS secret may sit from the key id, in characters. */
export const AWS_PAIR_MAX_DISTANCE = 500;

/** Never print a secret. Show at most this many leading characters. */
const REVEAL = 4;

function redact(value: string): string {
  if (value.length <= REVEAL) return "\u2026";
  return value.slice(0, REVEAL) + "\u2026";
}

function isPlaceholder(value: string): boolean {
  const v = value.trim();
  if (PLACEHOLDER.test(v)) return true;
  if (/\$\{/.test(v)) return true;            // template interpolation
  if (/process\.env\.|import\.meta\.env\./.test(v)) return true;
  if (/^<.*>$/.test(v)) return true;           // <YOUR_KEY_HERE>
  if (new Set(v).size <= 2) return true;       // "aaaaaaa", "00000000"
  return false;
}

function lineColAt(src: string, index: number): { line: number; col: number } {
  let line = 1, col = 1;
  for (let i = 0; i < index && i < src.length; i++) {
    if (src[i] === "\n") { line++; col = 1; } else col++;
  }
  return { line, col };
}

/**
 * @param source  the file's text with server-block regions already blanked
 */
export function scanSourceForSecrets(source: string, filePath: string): SecretFinding[] {
  const out: SecretFinding[] = [];
  const push = (code: SecretCode, index: number, message: string) => {
    const { line, col } = lineColAt(source, index);
    out.push({ code, message, line, col });
  };

  // ---- TW311: confirmed shapes -------------------------------------------
  for (const m of source.matchAll(new RegExp(PRIVATE_KEY.source, "g"))) {
    const kind = (m[0].match(/(?:RSA |EC |OPENSSH |PGP |DSA )/) ?? [" "])[0].trim() || "unknown";
    push("TW311", m.index ?? 0, `private key block (${kind}) — this file reaches the browser`);
  }
  for (const m of source.matchAll(new RegExp(AWS_ID.source, "g"))) {
    const at = m.index ?? 0;
    const window = source.slice(Math.max(0, at - AWS_PAIR_MAX_DISTANCE), at + AWS_PAIR_MAX_DISTANCE);
    for (const s of window.matchAll(new RegExp(AWS_SECRET.source, "g"))) {
      const secret = s[0];
      if (isPlaceholder(secret) || /EXAMPLE/.test(secret)) continue;
      push("TW311", at, `AWS access key id with its secret nearby (starts ${redact(m[0])})`);
      break;
    }
  }

  // ---- TW312: live-looking keys ------------------------------------------
  for (const [label, re] of LIVE_KEYS) {
    for (const m of source.matchAll(new RegExp(re.source, "g"))) {
      if (isPlaceholder(m[0])) continue;
      push("TW312", m.index ?? 0, `${label} (starts ${redact(m[0])})`);
    }
  }

  // ---- TW313: secret-named export holding a literal -----------------------
  for (const m of source.matchAll(SECRET_EXPORT)) {
    if (isPlaceholder(m[2])) continue;
    push("TW313", m.index ?? 0, `export ${m[1]} holds a literal value (starts ${redact(m[2])})`);
  }

  // ---- TW314: server-only env var read in client code ---------------------
  for (const m of source.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const name = m[1];
    if (PUBLIC_PREFIX.test(name)) continue;
    if (!SECRET_NAME.test(name)) continue;
    push("TW314", m.index ?? 0, `process.env.${name} is read in code that reaches the browser`);
  }

  // ---- TW315: server-only package in the client graph ---------------------
  for (const m of source.matchAll(/(?:from\s*|require\(\s*)["']([^"']+)["']/g)) {
    const spec = m[1];
    const hit = SERVER_ONLY_HINTS.find((p) => spec === p.replace(/\/$/, "") || spec.startsWith(p));
    if (!hit) continue;
    push("TW315", m.index ?? 0, `"${spec}" is a server-only package and this module reaches the browser`);
  }

  // ---- TW316: the client-safe marker on a file that looks risky ----------
  if (CLIENT_SAFE_MARKER.test(source) && out.some((f) => f.code !== "TW316")) {
    const at = source.search(CLIENT_SAFE_MARKER);
    push("TW316", at < 0 ? 0 : at,
      "@tw/client-safe is a promise the build cannot verify, and this file carries a secret-shaped value — check it by hand");
  }

  return out.sort((a, b) => a.line - b.line || a.col - b.col);
}

/**
 * TW317 — exact-match check against the real environment.
 *
 * No pattern matching here: if a value that `secretEnvValues()` calls a secret
 * appears verbatim in the emitted bundle, it IS in the bundle. Only the env var
 * NAME is ever reported, never the value.
 *
 * `define` is empty today (`client-bundle.ts` supports `--define:` but no call
 * site passes one), so this is dormant until env inlining exists.
 */
export function scanBundleForSecrets(
  bundle: string,
  secrets: { name: string; value: string }[],
): SecretFinding[] {
  const out: SecretFinding[] = [];
  for (const s of secrets) {
    if (!s.value || s.value.length < 8) continue;
    const at = bundle.indexOf(s.value);
    if (at < 0) continue;
    const { line, col } = lineColAt(bundle, at);
    out.push({
      code: "TW317",
      message: `the value of ${s.name} appears verbatim in the client bundle`,
      line,
      col,
    });
  }
  return out;
}

/** True when the two package lists share an entry (they must not). */
export function overlapsDenylist(denylist: readonly string[], hints: readonly string[] = SERVER_ONLY_HINTS): string[] {
  const norm = (p: string) => p.replace(/\/$/, "");
  const deny = new Set(denylist.map(norm));
  return hints.map(norm).filter((p) => deny.has(p));
}
