/** String escaping utilities -- HTML, attribute, JS, URL. */

export function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function escapeJS(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/`/g, "\\`");
}

export function escapeURL(str: string): string {
  return encodeURIComponent(str);
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function unescapeHTML(str: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&amp;",
    "&lt;": "&lt;",
    "&gt;": "&gt;",
    "&quot;": '"',
    "&#x27;": "'",
    "&#39;": "'",
    "&#47;": "/",
    "&#60;": "&lt;",
    "&#62;": "&gt;",
  };
  return str.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match) => {
    if (entities[match]) return entities[match];
    const numMatch = match.match(/^&#(\d+);$/);
    if (numMatch) return String.fromCharCode(parseInt(numMatch[1], 10));
    const hexMatch = match.match(/^&#x([0-9a-fA-F]+);$/);
    if (hexMatch) return String.fromCharCode(parseInt(hexMatch[1], 16));
    return match;
  });
}
