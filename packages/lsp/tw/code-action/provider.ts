/**
 * Code Action Provider -- quick fixes, refactorings, source actions.
 * @module lsp/code-action/provider
 */
import type { CodeAction, Diagnostic, Range, LSPDocument, WorkspaceEdit, TextEdit } from "../types";
import { CodeActionKind } from "../types";

export class CodeActionProvider {
  getCodeActions(doc: LSPDocument, range: Range, diagnostics: Diagnostic[]): CodeAction[] {
    const actions: CodeAction[] = [];
    for (const diag of diagnostics) { if (this.overlapsRange(diag.range, range)) actions.push(...this.getQuickFixes(doc, diag)); }
    actions.push(...this.getRefactoringActions(doc, range));
    actions.push(...this.getSourceActions(doc));
    return actions;
  }

  private getQuickFixes(doc: LSPDocument, diag: Diagnostic): CodeAction[] {
    const actions: CodeAction[] = [];
    switch (diag.code) {
      case "TW003": actions.push({ title: "Add :key attribute", kind: CodeActionKind.QuickFix, diagnostics: [diag], isPreferred: true, edit: this.createEdit(doc.uri, diag.range, ' :key="item.id"') }); break;
      case "TW005": actions.push({ title: "Remove empty attribute", kind: CodeActionKind.QuickFix, diagnostics: [diag], isPreferred: true, edit: this.createEdit(doc.uri, diag.range, "") }); break;
      case "TW007": actions.push({ title: "Add alt attribute", kind: CodeActionKind.QuickFix, diagnostics: [diag], isPreferred: true, edit: this.createEdit(doc.uri, diag.range, ' alt=""') }); break;
      case "TW020": actions.push({ title: "Add lang attribute", kind: CodeActionKind.QuickFix, diagnostics: [diag], isPreferred: true, edit: this.createEdit(doc.uri, diag.range, ' lang="en"') }); break;
    }
    return actions;
  }

  private getRefactoringActions(doc: LSPDocument, range: Range): CodeAction[] {
    const actions: CodeAction[] = [];
    const selectedText = this.getTextInRange(doc, range);
    if (selectedText) {
      actions.push({ title: "Extract to component", kind: CodeActionKind.RefactorExtract });
      actions.push({ title: "Extract to variable", kind: CodeActionKind.RefactorExtract });
      actions.push({ title: "Inline expression", kind: CodeActionKind.RefactorInline });
    }
    actions.push({ title: "Wrap with <div>", kind: CodeActionKind.RefactorRewrite });
    return actions;
  }

  private getSourceActions(doc: LSPDocument): CodeAction[] {
    const actions: CodeAction[] = [];
    if (doc.content.includes("import ")) actions.push({ title: "Organize imports", kind: CodeActionKind.SourceOrganizeImports });
    actions.push({ title: "Format document", kind: CodeActionKind.Source });
    return actions;
  }

  private createEdit(uri: string, range: Range, newText: string): WorkspaceEdit { return { changes: { [uri]: [{ range, newText }] } }; }
  private getTextInRange(doc: LSPDocument, range: Range): string {
    if (range.start.line === range.end.line) { const line = doc.lines[range.start.line] ?? ""; return line.slice(range.start.character, range.end.character); }
    const parts: string[] = [];
    for (let i = range.start.line; i <= range.end.line; i++) { const line = doc.lines[i] ?? ""; if (i === range.start.line) parts.push(line.slice(range.start.character)); else if (i === range.end.line) parts.push(line.slice(0, range.end.character)); else parts.push(line); }
    return parts.join("\n");
  }
  private overlapsRange(a: Range, b: Range): boolean {
    if (a.start.line > b.end.line || a.end.line < b.start.line) return false;
    if (a.start.line === b.end.line && a.start.character > b.end.character) return false;
    if (a.end.line === b.start.line && a.end.character < b.start.character) return false;
    return true;
  }
}
export function createCodeActionProvider(): CodeActionProvider { return new CodeActionProvider(); }
