/**
 * @tw/og — social card images, built from TW values.
 *
 * Next's `ImageResponse` takes JSX and rasterises it to PNG through satori.
 * TW's takes a plain description of the card and renders **SVG** — no
 * dependency, no native binary, works on every runtime including the edge.
 *
 * `imageResponse()` returns a real `Response` you can return from a route:
 *
 *   export function GET() { return imageResponse({ title: "Hello" }); }
 *
 * PNG output needs a rasteriser. `toPng()` is provided as a hook so you can
 * plug one in (resvg, sharp, a Worker) without changing your call sites.
 */

export interface OgCard {
  title: string;
  description?: string;
  /** Small text above the title, e.g. the site name. */
  eyebrow?: string;
  /** A short badge in the corner, e.g. "v2.1". */
  badge?: string;
  width?: number;
  height?: number;
  /** Background. A hex colour or a two-stop gradient [from, to]. */
  background?: string | [string, string];
  color?: string;
  /** Accent for the badge and rule. */
  accent?: string;
  font?: string;
}

export interface ImageResponseOptions {
  width?: number;
  height?: number;
  /** Cache the card for this many seconds (default 1 day). */
  revalidate?: number;
}

const DEFAULTS = { width: 1200, height: 630 };

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Wrap text into lines of at most `max` characters, on word boundaries. */
export function wrapText(text: string, max: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line) { line = w; continue; }
    if ((line + " " + w).length <= max) line += " " + w;
    else { lines.push(line); line = w; }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{2}$/, "") + "…";
  }
  return lines;
}

/** The card as an SVG string. */
export function toSvg(card: OgCard): string {
  const W = card.width ?? DEFAULTS.width;
  const H = card.height ?? DEFAULTS.height;
  const bg = card.background ?? ["#0b0b10", "#16161f"];
  const fill = Array.isArray(bg) ? "url(#bg)" : bg;
  const text = card.color ?? "#ffffff";
  const accent = card.accent ?? "#4ade80";
  const font = card.font ?? "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

  const pad = Math.round(W * 0.075);
  const titleSize = Math.round(W * 0.072);
  const descSize = Math.round(W * 0.028);
  const eyebrowSize = Math.round(W * 0.020);

  // Rough character budget for the title at this size.
  const perLine = Math.max(12, Math.floor((W - pad * 2) / (titleSize * 0.52)));
  const titleLines = wrapText(card.title, perLine, 3);

  let y = card.eyebrow ? pad + eyebrowSize + Math.round(H * 0.06) : Math.round(H * 0.30);
  let out = "";

  if (card.eyebrow) {
    out += `<text x="${pad}" y="${pad + eyebrowSize}" font-family="${esc(font)}" font-size="${eyebrowSize}" fill="${esc(accent)}" letter-spacing="2">${esc(card.eyebrow.toUpperCase())}</text>`;
  }
  for (const line of titleLines) {
    out += `<text x="${pad}" y="${y}" font-family="${esc(font)}" font-size="${titleSize}" font-weight="700" fill="${esc(text)}">${esc(line)}</text>`;
    y += Math.round(titleSize * 1.18);
  }
  if (card.description) {
    const descLines = wrapText(card.description, Math.max(20, Math.floor((W - pad * 2) / (descSize * 0.55))), 2);
    y += Math.round(descSize * 0.5);
    for (const line of descLines) {
      out += `<text x="${pad}" y="${y}" font-family="${esc(font)}" font-size="${descSize}" fill="${esc(text)}" opacity="0.72">${esc(line)}</text>`;
      y += Math.round(descSize * 1.35);
    }
  }
  if (card.badge) {
    const bw = card.badge.length * Math.round(eyebrowSize * 0.62) + pad * 0.5;
    const bh = Math.round(eyebrowSize * 2);
    out += `<rect x="${W - pad - bw}" y="${pad}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${esc(accent)}" opacity="0.16"/>`;
    out += `<text x="${W - pad - bw / 2}" y="${pad + bh * 0.68}" text-anchor="middle" font-family="${esc(font)}" font-size="${eyebrowSize}" fill="${esc(accent)}">${esc(card.badge)}</text>`;
  }

  const grad = Array.isArray(bg)
    ? `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${esc(bg[0])}"/><stop offset="1" stop-color="${esc(bg[1])}"/></linearGradient></defs>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${grad}<rect width="${W}" height="${H}" fill="${fill}"/><rect x="${pad}" y="${H - pad - 6}" width="${Math.round(W * 0.12)}" height="6" rx="3" fill="${esc(accent)}"/>${out}</svg>`;
}

/** The card as an SVG `Response`, with cache headers. */
export function imageResponse(card: OgCard, opts: ImageResponseOptions = {}): Response {
  const svg = toSvg({ ...card, width: card.width ?? opts.width, height: card.height ?? opts.height });
  const maxAge = opts.revalidate ?? 86_400;
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}, immutable`,
    },
  });
}

/**
 * Hook for PNG output. Register a rasteriser once at startup and `toPng()`
 * works everywhere:
 *
 *   setPngRenderer(async (svg, w, h) => new Uint8Array(await resvg(svg, w, h)));
 */
let pngRenderer: ((svg: string, width: number, height: number) => Promise<Uint8Array | ArrayBuffer>) | undefined;

export function setPngRenderer(fn: typeof pngRenderer): void { pngRenderer = fn; }

/** True when a PNG renderer has been registered. */
export function canRenderPng(): boolean { return typeof pngRenderer === "function"; }

/** Rasterise to PNG. Throws a clear error when no renderer is registered. */
export async function toPng(card: OgCard): Promise<Uint8Array> {
  if (!pngRenderer) {
    throw new Error(
      "toPng() needs a rasteriser. Call setPngRenderer(fn) at startup, " +
      "or use imageResponse() for SVG output.",
    );
  }
  const W = card.width ?? DEFAULTS.width;
  const H = card.height ?? DEFAULTS.height;
  const out = await pngRenderer(toSvg(card), W, H);
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

/** A PNG `Response`, when a renderer is available. */
export async function pngResponse(card: OgCard, opts: ImageResponseOptions = {}): Promise<Response> {
  const bytes = await toPng(card);
  const maxAge = opts.revalidate ?? 86_400;
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "image/png",
      "cache-control": `public, max-age=${maxAge}, immutable`,
    },
  });
}

/** The most common card, pre-filled -- so you write one line, not twelve. */
export function ogTemplate(title: string, opts: Partial<OgCard> = {}): OgCard {
  return { title, ...opts };
}
