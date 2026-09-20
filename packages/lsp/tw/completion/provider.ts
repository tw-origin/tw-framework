/**
 * Completion Provider -- intelligent code completions for .tw files.
 * @module lsp/completion/provider
 */
import type { CompletionItem, CompletionList, Position, LSPDocument } from "../types";
import { CompletionItemKind, InsertTextFormat } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

const HTML_TAGS = ["div","span","p","a","img","ul","ol","li","table","thead","tbody","tr","th","td","form","input","button","label","select","option","textarea","section","article","header","footer","nav","aside","main","h1","h2","h3","h4","h5","h6","br","hr","strong","em","code","pre","blockquote","figure","figcaption","details","summary","dialog","canvas","svg","video","audio","source","track","picture","iframe","script","style","link","meta","title"].map(t => ({ label: t, kind: CompletionItemKind.Keyword, detail: `HTML <${t}> element`, insertText: t }));

const TW_DIRECTIVES = [
  { label: "@click", kind: CompletionItemKind.Function, detail: "Click event handler", insertText: '@click="${1:handler}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: "@input", kind: CompletionItemKind.Function, detail: "Input event handler", insertText: '@input="${1:handler}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: "@change", kind: CompletionItemKind.Function, detail: "Change event handler", insertText: '@change="${1:handler}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: "@submit", kind: CompletionItemKind.Function, detail: "Submit event handler", insertText: '@submit.prevent="${1:handler}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: "@keydown", kind: CompletionItemKind.Function, detail: "Keydown event handler", insertText: '@keydown="${1:handler}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: "@keyup", kind: CompletionItemKind.Function, detail: "Keyup event handler", insertText: '@keyup="${1:handler}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: ":if", kind: CompletionItemKind.Function, detail: "Conditional rendering", insertText: ':if="${1:condition}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: ":else", kind: CompletionItemKind.Function, detail: "Else block", insertText: ":else" },
  { label: ":elif", kind: CompletionItemKind.Function, detail: "Else-if block", insertText: ':elif="${1:condition}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: ":for", kind: CompletionItemKind.Function, detail: "List rendering", insertText: ':for="${1:item} in ${2:items}" :key="${1:item}.id"', insertTextFormat: InsertTextFormat.Snippet },
  { label: ":model", kind: CompletionItemKind.Function, detail: "Two-way binding", insertText: ':model="${1:value}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: ":show", kind: CompletionItemKind.Function, detail: "Visibility toggle", insertText: ':show="${1:condition}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: ":class", kind: CompletionItemKind.Function, detail: "Class binding", insertText: ':class="${1:className}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: ":style", kind: CompletionItemKind.Function, detail: "Style binding", insertText: ':style="{ ${1:color}: ${2:red} }"', insertTextFormat: InsertTextFormat.Snippet },
  { label: ":key", kind: CompletionItemKind.Function, detail: "List key", insertText: ':key="${1:item.id}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: ":ref", kind: CompletionItemKind.Function, detail: "Element reference", insertText: ':ref="${1:elementRef}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: ":slot", kind: CompletionItemKind.Function, detail: "Named slot", insertText: ':slot="${1:slotName}"', insertTextFormat: InsertTextFormat.Snippet },
  { label: ":is", kind: CompletionItemKind.Function, detail: "Dynamic component", insertText: ':is="${1:componentName}"', insertTextFormat: InsertTextFormat.Snippet },
];

const HTML_ATTRS = ["class","id","style","title","href","src","alt","type","value","name","placeholder","disabled","readonly","required","checked","selected","max","min","maxlength","pattern","autocomplete","autofocus","tabindex","role","width","height","target","rel","colspan","rowspan","action","method","enctype","multiple","accept","rows","cols","wrap","download"].map(a => ({ label: a, kind: CompletionItemKind.Property, detail: `Attribute: ${a}`, insertText: `${a}=""`, insertTextFormat: InsertTextFormat.Snippet }));

type CompletionContext = "tag" | "attribute" | "directive" | "expression" | "unknown";

export class CompletionProvider {
  private docManager: DocumentSyncManager;
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  getCompletions(uri: string, position: Position): CompletionList {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return { isIncomplete: false, items: [] };
    const context = this.getContext(doc, position);
    let items: CompletionItem[] = [];
    switch (context) {
      case "tag": items = HTML_TAGS; break;
      case "attribute": items = [...HTML_ATTRS, ...TW_DIRECTIVES]; break;
      case "directive": items = TW_DIRECTIVES; break;
      case "expression": items = this.getExpressionCompletions(doc); break;
      default: items = [...HTML_TAGS, ...TW_DIRECTIVES];
    }
    return { isIncomplete: false, items };
  }

  private getContext(doc: LSPDocument, position: Position): CompletionContext {
    const line = this.docManager.getLine(doc, position.line);
    const before = line.slice(0, position.character);
    if (/<[^>]*$/.test(before)) {
      if (/(?:@|:|v-)[\w-]*$/.test(before)) return "directive";
      if (/<[\w-]+\s+/.test(before)) return "attribute";
      if (/<[\w-]*$/.test(before)) return "tag";
      return "attribute";
    }
    if (/\{\{[^}]*$/.test(before)) return "expression";
    return "unknown";
  }

  private getExpressionCompletions(doc: LSPDocument): CompletionItem[] {
    const items: CompletionItem[] = [];
    const definedVars = new Set<string>();
    const scriptMatch = doc.content.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptMatch) {
      const sc = scriptMatch[1];
      const varRegex = /(?:const|let|var)\s+(\w+)/g; let m: RegExpExecArray | null;
      while ((m = varRegex.exec(sc)) !== null) { if (!definedVars.has(m[1])) { definedVars.add(m[1]); items.push({ label: m[1], kind: CompletionItemKind.Variable, detail: "variable", sortText: `3_${m[1]}` }); } }
      const funcRegex = /function\s+(\w+)/g;
      while ((m = funcRegex.exec(sc)) !== null) { if (!definedVars.has(m[1])) { definedVars.add(m[1]); items.push({ label: m[1], kind: CompletionItemKind.Function, detail: "function", insertText: `${m[1]}($1)`, insertTextFormat: InsertTextFormat.Snippet, sortText: `4_${m[1]}` }); } }
    }
    return items;
  }

  resolveCompletion(item: CompletionItem): CompletionItem { return item; }
}

export function createCompletionProvider(docManager: DocumentSyncManager): CompletionProvider { return new CompletionProvider(docManager); }
