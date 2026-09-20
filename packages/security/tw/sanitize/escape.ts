/** Escapes HTML special characters to prevent XSS. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/** Escapes for use in an HTML attribute value. */
export function escapeAttribute(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escapes for use inside a <script> block. */
export function escapeJavaScript(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "\"")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/<\//g, "<\\/");
}

/** Unescapes HTML entities. */
export function unescapeHtml(str: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    '&quot;': '"',
    "&#x27;": "'",
    "&#39;": "'",
    "&#47;": "/",
    "&sol;": "/",
    "&#96;": "`",
    "&grave;": "`",
    "&#61;": "=",
    "&equals;": "=",
  };
  return str.replace(/&[a-z#0-9]+;/gi, (m) => entities[m] ?? m);
}

/** Escapes a string for use in a CSS context. */
export function escapeCss(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c);
}

/** Escapes a URL for safe embedding in HTML attributes. */
export function escapeUrl(url: string): string {
  return escapeAttribute(url);
}
