/**
 * Hover Provider -- hover info for tags, directives, attributes.
 * @module lsp/hover/provider
 */
import type { Hover, Position, MarkupContent } from "../types";
import { DocumentSyncManager } from "../document-sync/manager";

interface HoverInfo { name: string; kind: string; detail?: string; documentation?: string; examples?: string[]; }

const TAG_INFO: Record<string, HoverInfo> = {
  div: { name: "div", kind: "HTML Element", detail: "Block-level container", documentation: "The <div> tag defines a division or section in an HTML document." },
  span: { name: "span", kind: "HTML Element", detail: "Inline container", documentation: "The <span> tag is an inline container used to mark up text." },
  p: { name: "p", kind: "HTML Element", detail: "Paragraph", documentation: "The <p> tag defines a paragraph of text." },
  a: { name: "a", kind: "HTML Element", detail: "Anchor / Link", documentation: "The <a> tag defines a hyperlink.", examples: ['<a href="https://example.com">Link</a>'] },
  img: { name: "img", kind: "HTML Element", detail: "Image", documentation: "The <img> tag embeds an image.", examples: ['<img src="photo.jpg" alt="Description" />'] },
  form: { name: "form", kind: "HTML Element", detail: "Form", documentation: "The <form> tag defines an HTML form for user input." },
  input: { name: "input", kind: "HTML Element", detail: "Input Field", documentation: "The <input> tag defines an input control." },
  button: { name: "button", kind: "HTML Element", detail: "Button", documentation: "The <button> tag defines a clickable button." },
  for: { name: "for", kind: "TW Directive", detail: "List rendering", documentation: "The <for> directive renders a list of items. Always use :key for proper diffing.", examples: ['<for item in items :key="item.id">', '  <li>{item.name}</li>', '</for>'] },
  if: { name: "if", kind: "TW Directive", detail: "Conditional rendering", documentation: "The <if> directive conditionally renders content." },
};

const DIRECTIVE_INFO: Record<string, HoverInfo> = {
  "@click": { name: "@click", kind: "TW Directive", detail: "Click event handler", documentation: "Binds a click event handler to the element.", examples: ['<button @click="handleClick">Click</button>'] },
  "@input": { name: "@input", kind: "TW Directive", detail: "Input event handler", documentation: "Binds an input event handler." },
  "@change": { name: "@change", kind: "TW Directive", detail: "Change event handler", documentation: "Binds a change event handler." },
  "@submit": { name: "@submit", kind: "TW Directive", detail: "Submit event handler", documentation: "Binds a submit event handler. Use .prevent to prevent default.", examples: ['<form @submit.prevent="handleSubmit">'] },
  "@keydown": { name: "@keydown", kind: "TW Directive", detail: "Keydown event handler", documentation: "Binds a keydown event handler. Use modifiers like .enter, .esc, .tab." },
  ":if": { name: ":if", kind: "TW Directive", detail: "Conditional rendering", documentation: "Conditionally renders the element." },
  ":for": { name: ":for", kind: "TW Directive", detail: "List rendering", documentation: "Renders the element for each item in a list." },
  ":model": { name: ":model", kind: "TW Directive", detail: "Two-way binding", documentation: "Creates a two-way binding on form inputs." },
  ":show": { name: ":show", kind: "TW Directive", detail: "Visibility toggle", documentation: "Toggles visibility based on a condition." },
  ":class": { name: ":class", kind: "TW Directive", detail: "Class binding", documentation: "Dynamically binds CSS classes." },
  ":style": { name: ":style", kind: "TW Directive", detail: "Style binding", documentation: "Dynamically binds inline styles." },
  ":key": { name: ":key", kind: "TW Directive", detail: "List key", documentation: "Unique key for list items -- required for efficient diffing." },
  ":ref": { name: ":ref", kind: "TW Directive", detail: "Element reference", documentation: "Creates a reference to the DOM element." },
};

export class HoverProvider {
  private docManager: DocumentSyncManager;
  private customInfo: Map<string, HoverInfo> = new Map();
  constructor(docManager: DocumentSyncManager) { this.docManager = docManager; }

  getHover(uri: string, position: Position): Hover | null {
    const doc = this.docManager.getDocument(uri);
    if (!doc) return null;
    const word = this.docManager.getWordAtPosition(doc, position);
    if (!word) return null;
    let info: HoverInfo | null = null;
    if (word.word.startsWith("@") || word.word.startsWith(":") || word.word.startsWith("v-")) info = DIRECTIVE_INFO[word.word] ?? null;
    if (!info) { const line = this.docManager.getLine(doc, position.line); if (/<\/?\w*$/.test(line.slice(0, position.character))) info = TAG_INFO[word.word.toLowerCase()] ?? null; }
    if (!info) info = this.customInfo.get(word.word) ?? null;
    if (!info) return null;
    return { contents: { kind: "markdown", value: this.formatHover(info) }, range: word.range };
  }

  private formatHover(info: HoverInfo): string {
    const parts: string[] = [`**${info.name}** \`${info.kind}\``];
    if (info.detail) { parts.push("", info.detail); }
    if (info.documentation) { parts.push("", info.documentation); }
    if (info.examples?.length) { parts.push("", "**Examples:**"); for (const ex of info.examples) { parts.push("```tw", ex, "```"); } }
    return parts.join("\n");
  }

  addCustomInfo(name: string, info: HoverInfo): void { this.customInfo.set(name, info); }
}
export function createHoverProvider(docManager: DocumentSyncManager): HoverProvider { return new HoverProvider(docManager); }
