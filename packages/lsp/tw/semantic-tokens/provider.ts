/**
 * Semantic Tokens Provider -- syntax highlighting via semantic tokens.
 * @module lsp/semantic-tokens/provider
 */
import type { SemanticTokens, SemanticTokensLegend, LSPDocument, Range } from "../types";
import { SemanticTokenType } from "../types";

export const TOKEN_TYPES = ["namespace","class","enum","interface","struct","typeParameter","parameter","variable","property","enumMember","event","function","method","macro","keyword","modifier","comment","string","number","regexp","operator","decorator"];
export const TOKEN_MODIFIERS = ["declaration","definition","readonly","static","deprecated","abstract","async","modification","documentation","defaultLibrary"];

export function getSemanticTokensLegend(): SemanticTokensLegend { return { tokenTypes: TOKEN_TYPES, tokenModifiers: TOKEN_MODIFIERS }; }

interface InternalToken { line: number; startChar: number; length: number; typeIdx: number; modifierBits: number; }

const KEYWORDS = new Set(["if","else","elif","for","each","in","while","true","false","null","undefined","this","component","template","slot","ref","key","import","export","default","from","as","const","let","var","function","return","class","extends","implements","new","delete","typeof","instanceof","void","of","async","await","yield","try","catch","finally","throw","break","continue","switch","case"]);

export class SemanticTokensProvider {
  getSemanticTokens(doc: LSPDocument): SemanticTokens {
    const tokens: InternalToken[] = [];
    let inScript = false; let inStyle = false;
    for (let ln = 0; ln < doc.lines.length; ln++) {
      const line = doc.lines[ln];
      if (/<script\b/i.test(line)) inScript = true;
      if (/<style\b/i.test(line)) inStyle = true;
      if (/<\/script>/i.test(line)) inScript = false;
      if (/<\/style>/i.test(line)) inStyle = false;
      if (inScript || inStyle) { this.tokenizeScript(line, ln, tokens); continue; }
      this.tokenizeTemplate(line, ln, tokens);
    }
    return { data: this.encodeTokens(tokens) };
  }

  getSemanticTokensRange(doc: LSPDocument, range: Range): SemanticTokens {
    const tokens: InternalToken[] = [];
    for (let ln = range.start.line; ln <= range.endLine && ln < doc.lines.length; ln++) this.tokenizeTemplate(doc.lines[ln], ln, tokens);
    return { data: this.encodeTokens(tokens) };
  }

  private tokenizeTemplate(line: string, ln: number, tokens: InternalToken[]): void {
    const patterns: Array<[RegExp, number]> = [
      [/<!--[\s\S]*?-->/g, SemanticTokenType.Comment],
      [/(['"`])(?:[^\\\`"'$]|\\.)*\1/g, SemanticTokenType.String],
      [/\b\d+(\.\d+)?\b/g, SemanticTokenType.Number],
      [/([@:v-][\w-]+)/g, SemanticTokenType.Decorator],
      [/[+\-*/%=<>!&|]+/g, SemanticTokenType.Operator],
    ];
    for (const [regex, typeIdx] of patterns) {
      let m: RegExpExecArray | null;
      while ((m = regex.exec(line)) !== null) tokens.push({ line: ln, startChar: m.index, length: m[0].length, typeIdx, modifierBits: 0 });
    }
    const kwRegex = /\b(\w+)\b/g; let km: RegExpExecArray | null;
    while ((km = kwRegex.exec(line)) !== null) { if (KEYWORDS.has(km[1])) tokens.push({ line: ln, startChar: km.index, length: km[0].length, typeIdx: SemanticTokenType.Keyword, modifierBits: 0 }); }
    const varRegex = /\{\{\s*(\w+)/g; let vm: RegExpExecArray | null;
    while ((vm = varRegex.exec(line)) !== null) tokens.push({ line: ln, startChar: vm.index + vm[0].length - vm[1].length, length: vm[1].length, typeIdx: SemanticTokenType.Variable, modifierBits: 0 });
    const funcRegex = /\b(\w+)\s*\(/g; let fm: RegExpExecArray | null;
    while ((fm = funcRegex.exec(line)) !== null) { if (!KEYWORDS.has(fm[1])) tokens.push({ line: ln, startChar: fm.index, length: fm[1].length, typeIdx: SemanticTokenType.Function, modifierBits: 0 }); }
  }

  private tokenizeScript(line: string, ln: number, tokens: InternalToken[]): void { this.tokenizeTemplate(line, ln, tokens); }

  private encodeTokens(tokens: InternalToken[]): number[] {
    const data: number[] = []; let prevLine = 0; let prevChar = 0;
    for (const t of tokens) {
      const dl = t.line - prevLine; const dc = dl === 0 ? t.startChar - prevChar : t.startChar;
      data.push(dl, dc, t.length, t.typeIdx, t.modifierBits); prevLine = t.line; prevChar = t.startChar;
    }
    return data;
  }
}
export function createSemanticTokensProvider(): SemanticTokensProvider { return new SemanticTokensProvider(); }
