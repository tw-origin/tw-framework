/**
 * Color Provider -- color picker for CSS values.
 * @module lsp/color/provider
 */
import type { LSPDocument, Range } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

export interface Color { red: number; green: number; blue: number; alpha: number; }
export interface ColorInformation { range: Range; color: Color; }
export interface ColorPresentation { label: string; }

const NAMED_COLORS: Record<string, Color> = {
  black: { red: 0, green: 0, blue: 0, alpha: 1 }, white: { red: 1, green: 1, blue: 1, alpha: 1 },
  red: { red: 1, green: 0, blue: 0, alpha: 1 }, green: { red: 0, green: 0.502, blue: 0, alpha: 1 },
  blue: { red: 0, green: 0, blue: 1, alpha: 1 }, yellow: { red: 1, green: 1, blue: 0, alpha: 1 },
  orange: { red: 1, green: 0.647, blue: 0, alpha: 1 }, purple: { red: 0.502, green: 0, blue: 0.502, alpha: 1 },
  pink: { red: 1, green: 0.753, blue: 0.796, alpha: 1 }, gray: { red: 0.502, green: 0.502, blue: 0.502, alpha: 1 },
};

function parseHex(hex: string): Color | null {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i.exec(hex);
  if (m) return { red: parseInt(m[1], 16) / 255, green: parseInt(m[2], 16) / 255, blue: parseInt(m[3], 16) / 255, alpha: m[4] ? parseInt(m[4], 16) / 255 : 1 };
  const sm = /^#?([\da-f])([\da-f])([\da-f])$/i.exec(hex);
  if (sm) return { red: parseInt(sm[1] + sm[1], 16) / 255, green: parseInt(sm[2] + sm[2], 16) / 255, blue: parseInt(sm[3] + sm[3], 16) / 255, alpha: 1 };
  return null;
}

function parseRgb(rgb: string): Color | null {
  const m = /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i.exec(rgb);
  if (m) return { red: parseInt(m[1], 10) / 255, green: parseInt(m[2], 10) / 255, blue: parseInt(m[3], 10) / 255, alpha: m[4] ? parseFloat(m[4]) : 1 };
  return null;
}

function colorToHex(c: Color): string { const r = Math.round(c.red * 255).toString(16).padStart(2, "0"); const g = Math.round(c.green * 255).toString(16).padStart(2, "0"); const b = Math.round(c.blue * 255).toString(16).padStart(2, "0"); return `#${r}${g}${b}`; }
function colorToRgb(c: Color): string { const r = Math.round(c.red * 255); const g = Math.round(c.green * 255); const b = Math.round(c.blue * 255); return c.alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${c.alpha.toFixed(2)})` : `rgb(${r}, ${g}, ${b})`; }

function parseColor(str: string): Color | null {
  const t = str.trim();
  if (t.startsWith("#")) return parseHex(t);
  if (/^rgba?\s*\(/i.test(t)) return parseRgb(t);
  return NAMED_COLORS[t.toLowerCase()] ?? null;
}

export class ColorProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  getDocumentColors(uri: string): ColorInformation[] {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return [];
    const colors: ColorInformation[] = [];
    const regex = /(#(?:[\da-f]{3,4}){1,2}\b|rgba?\s*\([^)]+\)|hsla?\s*\([^)]+\)|\b(?:red|blue|green|yellow|orange|purple|pink|gray|black|white)\b)/gi;
    for (let i = 0; i < doc.lines.length; i++) {
      let m: RegExpExecArray | null;
      while ((m = regex.exec(doc.lines[i])) !== null) {
        const c = parseColor(m[0]);
        if (c) colors.push({ range: { start: { line: i, character: m.index }, end: { line: i, character: m.index + m[0].length } }, color: c });
      }
    }
    return colors;
  }

  getColorPresentations(color: Color): ColorPresentation[] { return [{ label: colorToHex(color) }, { label: colorToRgb(color) }]; }
}
export function createColorProvider(docManager: DocumentSyncManager): ColorProvider { return new ColorProvider(docManager); }
