/**
 * Completion provider -- provides autocompletion suggestions for TW templates.
 * @module lsp/providers
 */

import type { TextDocument, Position, CompletionItem } from "../types";

export interface CompletionContext {
  document: TextDocument;
  position: Position;
  triggerCharacter?: string;
  wordRange?: { start: Position; end: Position };
  currentWord: string;
  lineText: string;
  linePrefix: string;
  lineSuffix: string;
}

export interface CompletionProviderOptions {
  triggerCharacters?: string[];
  maxItems?: number;
  sortItems?: boolean;
  filterItems?: boolean;
}

export class CompletionProvider {
  private options: Required<CompletionProviderOptions>;
  private keywords: Map<string, CompletionItem[]> = new Map();
  private snippets: Map<string, CompletionItem[]> = new Map();
  private customProviders: Array<(context: CompletionContext) => CompletionItem[]> = [];

  constructor(options: CompletionProviderOptions = {}) {
    this.options = {
      triggerCharacters: options.triggerCharacters ?? [".", ":", "@", "#", "<", "/", "-"],
      maxItems: options.maxItems ?? 100,
      sortItems: options.sortItems ?? true,
      filterItems: options.filterItems ?? true,
    };
    this.initializeDefaults();
  }

  private initializeDefaults(): void {
    this.addKeywords("directive", [
      { label: "@component", detail: "Define a component", insertText: "@component {\n  $0\n}", kind: 1 },
      { label: "@props", detail: "Define props", insertText: "@props {\n  $0\n}", kind: 1 },
      { label: "@state", detail: "Define state", insertText: "@state {\n  $0\n}", kind: 1 },
      { label: "@computed", detail: "Define computed property", insertText: "@computed {\n  $0\n}", kind: 1 },
      { label: "@effect", detail: "Define effect", insertText: "@effect {\n  $0\n}", kind: 1 },
      { label: "@watch", detail: "Watch a property", insertText: "@watch($1) {\n  $0\n}", kind: 1 },
      { label: "@if", detail: "Conditional rendering", insertText: "@if ($1) {\n  $0\n}", kind: 1 },
      { label: "@else", detail: "Else branch", insertText: "@else {\n  $0\n}", kind: 1 },
      { label: "@elseIf", detail: "Else-if branch", insertText: "@elseIf ($1) {\n  $0\n}", kind: 1 },
      { label: "@for", detail: "Loop rendering", insertText: "@for ($1 in $2) {\n  $0\n}", kind: 1 },
      { label: "@each", detail: "Each iteration", insertText: "@each ($1 as $2) {\n  $0\n}", kind: 1 },
      { label: "@while", detail: "While loop", insertText: "@while ($1) {\n  $0\n}", kind: 1 },
      { label: "@switch", detail: "Switch statement", insertText: "@switch ($1) {\n  $0\n}", kind: 1 },
      { label: "@case", detail: "Case branch", insertText: "@case $1 {\n  $0\n}", kind: 1 },
      { label: "@default", detail: "Default case", insertText: "@default {\n  $0\n}", kind: 1 },
      { label: "@try", detail: "Try block", insertText: "@try {\n  $0\n}", kind: 1 },
      { label: "@catch", detail: "Catch block", insertText: "@catch ($1) {\n  $0\n}", kind: 1 },
      { label: "@finally", detail: "Finally block", insertText: "@finally {\n  $0\n}", kind: 1 },
      { label: "@slot", detail: "Define a slot", insertText: "@slot($1) {\n  $0\n}", kind: 1 },
      { label: "@render", detail: "Render a component", insertText: "@render($1) {\n  $0\n}", kind: 1 },
      { label: "@html", detail: "Render raw HTML", insertText: "@html($1)", kind: 1 },
      { label: "@text", detail: "Render text", insertText: "@text($1)", kind: 1 },
      { label: "@show", detail: "Show element", insertText: "@show($1)", kind: 1 },
      { label: "@hide", detail: "Hide element", insertText: "@hide($1)", kind: 1 },
      { label: "@model", detail: "Two-way binding", insertText: "@model($1)", kind: 1 },
      { label: "@bind", detail: "One-way binding", insertText: "@bind($1)", kind: 1 },
      { label: "@on", detail: "Event listener", insertText: "@on($1, $2)", kind: 1 },
      { label: "@click", detail: "Click handler", insertText: "@click($1)", kind: 1 },
      { label: "@input", detail: "Input handler", insertText: "@input($1)", kind: 1 },
      { label: "@change", detail: "Change handler", insertText: "@change($1)", kind: 1 },
      { label: "@submit", detail: "Submit handler", insertText: "@submit($1)", kind: 1 },
      { label: "@focus", detail: "Focus handler", insertText: "@focus($1)", kind: 1 },
      { label: "@blur", detail: "Blur handler", insertText: "@blur($1)", kind: 1 },
      { label: "@keyup", detail: "Keyup handler", insertText: "@keyup($1)", kind: 1 },
      { label: "@keydown", detail: "Keydown handler", insertText: "@keydown($1)", kind: 1 },
      { label: "@mouseenter", detail: "Mouse enter handler", insertText: "@mouseenter($1)", kind: 1 },
      { label: "@mouseleave", detail: "Mouse leave handler", insertText: "@mouseleave($1)", kind: 1 },
      { label: "@ref", detail: "Element reference", insertText: "@ref($1)", kind: 1 },
      { label: "@class", detail: "Class binding", insertText: "@class($1)", kind: 1 },
      { label: "@style", detail: "Style binding", insertText: "@style($1)", kind: 1 },
      { label: "@attr", detail: "Attribute binding", insertText: "@attr($1)", kind: 1 },
      { label: "@transition", detail: "Transition", insertText: "@transition($1)", kind: 1 },
      { label: "@animation", detail: "Animation", insertText: "@animation($1)", kind: 1 },
      { label: "@lazy", detail: "Lazy loading", insertText: "@lazy($1)", kind: 1 },
      { label: "@async", detail: "Async component", insertText: "@async($1)", kind: 1 },
      { label: "@suspense", detail: "Suspense boundary", insertText: "@suspense($1) {\n  $0\n}", kind: 1 },
      { label: "@error", detail: "Error boundary", insertText: "@error($1) {\n  $0\n}", kind: 1 },
      { label: "@memo", detail: "Memoization", insertText: "@memo($1)", kind: 1 },
      { label: "@once", detail: "Render once", insertText: "@once($1)", kind: 1 },
      { label: "@use", detail: "Use a composable", insertText: "@use($1)", kind: 1 },
      { label: "@inject", detail: "Inject dependency", insertText: "@inject($1)", kind: 1 },
      { label: "@provide", detail: "Provide dependency", insertText: "@provide($1, $2)", kind: 1 },
      { label: "@export", detail: "Export value", insertText: "@export($1)", kind: 1 },
      { label: "@import", detail: "Import value", insertText: "@import($1)", kind: 1 },
      { label: "@debug", detail: "Debug mode", insertText: "@debug($1)", kind: 1 },
      { label: "@log", detail: "Log value", insertText: "@log($1)", kind: 1 },
      { label: "@assert", detail: "Assert condition", insertText: "@assert($1)", kind: 1 },
      { label: "@test", detail: "Test block", insertText: "@test($1) {\n  $0\n}", kind: 1 },
      { label: "@benchmark", detail: "Benchmark block", insertText: "@benchmark($1) {\n  $0\n}", kind: 1 },
      { label: "@profile", detail: "Profile block", insertText: "@profile($1) {\n  $0\n}", kind: 1 },
    ]);

    this.addKeywords("tag", [
      { label: "div", detail: "Division element", insertText: "<div>$0</div>", kind: 1 },
      { label: "span", detail: "Span element", insertText: "<span>$0</span>", kind: 1 },
      { label: "p", detail: "Paragraph element", insertText: "<p>$0</p>", kind: 1 },
      { label: "h1", detail: "Heading 1", insertText: "<h1>$0</h1>", kind: 1 },
      { label: "h2", detail: "Heading 2", insertText: "<h2>$0</h2>", kind: 1 },
      { label: "h3", detail: "Heading 3", insertText: "<h3>$0</h3>", kind: 1 },
      { label: "h4", detail: "Heading 4", insertText: "<h4>$0</h4>", kind: 1 },
      { label: "h5", detail: "Heading 5", insertText: "<h5>$0</h5>", kind: 1 },
      { label: "h6", detail: "Heading 6", insertText: "<h6>$0</h6>", kind: 1 },
      { label: "ul", detail: "Unordered list", insertText: "<ul>\n  <li>$0</li>\n</ul>", kind: 1 },
      { label: "ol", detail: "Ordered list", insertText: "<ol>\n  <li>$0</li>\n</ol>", kind: 1 },
      { label: "li", detail: "List item", insertText: "<li>$0</li>", kind: 1 },
      { label: "a", detail: "Anchor link", insertText: '<a href="$1">$0</a>' },
      { label: "img", detail: "Image", insertText: '<img src="$1" alt="$2" />' },
      { label: "button", detail: "Button", insertText: "<button>$0</button>", kind: 1 },
      { label: "input", detail: "Input field", insertText: '<input type="$1" name="$2" />' },
      { label: "textarea", detail: "Textarea", insertText: '<textarea name="$1">$0</textarea>' },
      { label: "select", detail: "Select dropdown", insertText: "<select>\n  <option value=\"$1\">$0</option>\n</select>" },
      { label: "option", detail: "Option element", insertText: '<option value="$1">$0</option>' },
      { label: "form", detail: "Form element", insertText: '<form action="$1" method="$2">\n  $0\n</form>' },
      { label: "label", detail: "Label element", insertText: '<label for="$1">$0</label>' },
      { label: "table", detail: "Table element", insertText: "<table>\n  <tr>\n    <td>$0</td>\n  </tr>\n</table>", kind: 1 },
      { label: "thead", detail: "Table header", insertText: "<thead>\n  $0\n</thead>", kind: 1 },
      { label: "tbody", detail: "Table body", insertText: "<tbody>\n  $0\n</tbody>", kind: 1 },
      { label: "tfoot", detail: "Table footer", insertText: "<tfoot>\n  $0\n</tfoot>", kind: 1 },
      { label: "tr", detail: "Table row", insertText: "<tr>\n  $0\n</tr>", kind: 1 },
      { label: "th", detail: "Table header cell", insertText: "<th>$0</th>", kind: 1 },
      { label: "td", detail: "Table data cell", insertText: "<td>$0</td>", kind: 1 },
      { label: "section", detail: "Section element", insertText: "<section>$0</section>", kind: 1 },
      { label: "article", detail: "Article element", insertText: "<article>$0</article>", kind: 1 },
      { label: "aside", detail: "Aside element", insertText: "<aside>$0</aside>", kind: 1 },
      { label: "header", detail: "Header element", insertText: "<header>$0</header>", kind: 1 },
      { label: "footer", detail: "Footer element", insertText: "<footer>$0</footer>", kind: 1 },
      { label: "nav", detail: "Navigation element", insertText: "<nav>$0</nav>", kind: 1 },
      { label: "main", detail: "Main element", insertText: "<main>$0</main>", kind: 1 },
      { label: "figure", detail: "Figure element", insertText: "<figure>$0</figure>", kind: 1 },
      { label: "figcaption", detail: "Figure caption", insertText: "<figcaption>$0</figcaption>", kind: 1 },
      { label: "details", detail: "Details element", insertText: "<details>\n  <summary>$1</summary>\n  $0\n</details>", kind: 1 },
      { label: "summary", detail: "Summary element", insertText: "<summary>$0</summary>", kind: 1 },
      { label: "dialog", detail: "Dialog element", insertText: "<dialog>$0</dialog>", kind: 1 },
      { label: "canvas", detail: "Canvas element", insertText: '<canvas width="$1" height="$2"></canvas>' },
      { label: "svg", detail: "SVG element", insertText: '<svg xmlns="http://www.w3.org/2000/svg">$0</svg>' },
      { label: "video", detail: "Video element", insertText: '<video src="$1" controls></video>' },
      { label: "audio", detail: "Audio element", insertText: '<audio src="$1" controls></audio>' },
      { label: "source", detail: "Source element", insertText: '<source src="$1" type="$2" />' },
      { label: "iframe", detail: "Iframe element", insertText: '<iframe src="$1"></iframe>' },
      { label: "br", detail: "Line break", insertText: "<br />", kind: 1 },
      { label: "hr", detail: "Horizontal rule", insertText: "<hr />", kind: 1 },
      { label: "meta", detail: "Meta tag", insertText: '<meta name="$1" content="$2" />' },
      { label: "link", detail: "Link tag", insertText: '<link rel="$1" href="$2" />' },
      { label: "script", detail: "Script tag", insertText: '<script src="$1"></script>' },
      { label: "style", detail: "Style tag", insertText: "<style>\n  $0\n</style>", kind: 1 },
    ]);

    this.addKeywords("attribute", [
      { label: "id", detail: "Element ID", insertText: 'id="$1"' },
      { label: "class", detail: "CSS class", insertText: 'class="$1"' },
      { label: "style", detail: "Inline style", insertText: 'style="$1"' },
      { label: "href", detail: "Hyperlink reference", insertText: 'href="$1"' },
      { label: "src", detail: "Source URL", insertText: 'src="$1"' },
      { label: "alt", detail: "Alternative text", insertText: 'alt="$1"' },
      { label: "title", detail: "Title attribute", insertText: 'title="$1"' },
      { label: "type", detail: "Type attribute", insertText: 'type="$1"' },
      { label: "name", detail: "Name attribute", insertText: 'name="$1"' },
      { label: "value", detail: "Value attribute", insertText: 'value="$1"' },
      { label: "placeholder", detail: "Placeholder text", insertText: 'placeholder="$1"' },
      { label: "required", detail: "Required attribute", insertText: "required", kind: 1 },
      { label: "disabled", detail: "Disabled attribute", insertText: "disabled", kind: 1 },
      { label: "readonly", detail: "Readonly attribute", insertText: "readonly", kind: 1 },
      { label: "checked", detail: "Checked attribute", insertText: "checked", kind: 1 },
      { label: "selected", detail: "Selected attribute", insertText: "selected", kind: 1 },
      { label: "multiple", detail: "Multiple attribute", insertText: "multiple", kind: 1 },
      { label: "autocomplete", detail: "Autocomplete attribute", insertText: 'autocomplete="$1"' },
      { label: "autofocus", detail: "Autofocus attribute", insertText: "autofocus", kind: 1 },
      { label: "min", detail: "Min value", insertText: 'min="$1"' },
      { label: "max", detail: "Max value", insertText: 'max="$1"' },
      { label: "step", detail: "Step value", insertText: 'step="$1"' },
      { label: "pattern", detail: "Pattern attribute", insertText: 'pattern="$1"' },
      { label: "maxlength", detail: "Max length", insertText: 'maxlength="$1"' },
      { label: "minlength", detail: "Min length", insertText: 'minlength="$1"' },
      { label: "size", detail: "Size attribute", insertText: 'size="$1"' },
      { label: "rows", detail: "Rows attribute", insertText: 'rows="$1"' },
      { label: "cols", detail: "Columns attribute", insertText: 'cols="$1"' },
      { label: "wrap", detail: "Wrap attribute", insertText: 'wrap="$1"' },
      { label: "for", detail: "For attribute", insertText: 'for="$1"' },
      { label: "form", detail: "Form attribute", insertText: 'form="$1"' },
      { label: "action", detail: "Form action", insertText: 'action="$1"' },
      { label: "method", detail: "Form method", insertText: 'method="$1"' },
      { label: "enctype", detail: "Encoding type", insertText: 'enctype="$1"' },
      { label: "target", detail: "Target attribute", insertText: 'target="$1"' },
      { label: "rel", detail: "Relationship attribute", insertText: 'rel="$1"' },
      { label: "download", detail: "Download attribute", insertText: 'download="$1"' },
      { label: "draggable", detail: "Draggable attribute", insertText: 'draggable="$1"' },
      { label: "contenteditable", detail: "Content editable", insertText: 'contenteditable="$1"' },
      { label: "spellcheck", detail: "Spell check", insertText: 'spellcheck="$1"' },
      { label: "tabindex", detail: "Tab index", insertText: 'tabindex="$1"' },
      { label: "role", detail: "ARIA role", insertText: 'role="$1"' },
      { label: "aria-label", detail: "ARIA label", insertText: 'aria-label="$1"' },
      { label: "aria-hidden", detail: "ARIA hidden", insertText: 'aria-hidden="$1"' },
      { label: "aria-live", detail: "ARIA live", insertText: 'aria-live="$1"' },
      { label: "aria-expanded", detail: "ARIA expanded", insertText: 'aria-expanded="$1"' },
      { label: "aria-controls", detail: "ARIA controls", insertText: 'aria-controls="$1"' },
      { label: "aria-selected", detail: "ARIA selected", insertText: 'aria-selected="$1"' },
      { label: "aria-checked", detail: "ARIA checked", insertText: 'aria-checked="$1"' },
      { label: "aria-disabled", detail: "ARIA disabled", insertText: 'aria-disabled="$1"' },
      { label: "aria-readonly", detail: "ARIA readonly", insertText: 'aria-readonly="$1"' },
      { label: "aria-required", detail: "ARIA required", insertText: 'aria-required="$1"' },
      { label: "aria-invalid", detail: "ARIA invalid", insertText: 'aria-invalid="$1"' },
      { label: "aria-describedby", detail: "ARIA describedby", insertText: 'aria-describedby="$1"' },
      { label: "aria-labelledby", detail: "ARIA labelledby", insertText: 'aria-labelledby="$1"' },
      { label: "data-id", detail: "Data ID", insertText: 'data-id="$1"' },
      { label: "data-name", detail: "Data name", insertText: 'data-name="$1"' },
      { label: "data-value", detail: "Data value", insertText: 'data-value="$1"' },
      { label: "data-type", detail: "Data type", insertText: 'data-type="$1"' },
      { label: "data-index", detail: "Data index", insertText: 'data-index="$1"' },
      { label: "data-url", detail: "Data URL", insertText: 'data-url="$1"' },
      { label: "data-active", detail: "Data active", insertText: 'data-active="$1"' },
      { label: "data-disabled", detail: "Data disabled", insertText: 'data-disabled="$1"' },
      { label: "data-loading", detail: "Data loading", insertText: 'data-loading="$1"' },
      { label: "data-error", detail: "Data error", insertText: 'data-error="$1"' },
    ]);

    this.addSnippets("component", [
      { label: "component", detail: "Full component template", insertText: "@component {\n  @props {\n    $1\n  }\n\n  @state {\n    $2\n  }\n\n  @render {\n    $0\n  }\n}", kind: 1 },
      { label: "component-with-effects", detail: "Component with effects", insertText: "@component {\n  @state {\n    $1\n  }\n\n  @effect {\n    $2\n  }\n\n  @render {\n    $0\n  }\n}", kind: 1 },
      { label: "component-with-computed", detail: "Component with computed", insertText: "@component {\n  @state {\n    $1\n  }\n\n  @computed {\n    $2\n  }\n\n  @render {\n    $0\n  }\n}", kind: 1 },
      { label: "component-with-watch", detail: "Component with watch", insertText: "@component {\n  @state {\n    $1\n  }\n\n  @watch($2) {\n    $3\n  }\n\n  @render {\n    $0\n  }\n}", kind: 1 },
      { label: "component-with-slots", detail: "Component with slots", insertText: "@component {\n  @slot(default) {\n    $1\n  }\n\n  @slot(header) {\n    $2\n  }\n\n  @slot(footer) {\n    $3\n  }\n\n  @render {\n    $0\n  }\n}", kind: 1 },
      { label: "conditional", detail: "Conditional template", insertText: "@if ($1) {\n  $2\n} @else {\n  $0\n}", kind: 1 },
      { label: "loop", detail: "Loop template", insertText: "@for (item in items) {\n  $0\n}", kind: 1 },
      { label: "form", detail: "Form template", insertText: '<form @submit($1)>\n  <input type="text" @model($2) />\n  <button type="submit">Submit</button>\n</form>' },
      { label: "list", detail: "List template", insertText: "<ul>\n  @for (item in items) {\n    <li>@text(item.name)</li>\n  }\n</ul>", kind: 1 },
      { label: "card", detail: "Card component", insertText: '<div class="card">\n  <div class="card-header">\n    <h3>$1</h3>\n  </div>\n  <div class="card-body">\n    $0\n  </div>\n</div>' },
      { label: "modal", detail: "Modal component", insertText: '<div class="modal" @show(isOpen)>\n  <div class="modal-overlay" @click(close)></div>\n  <div class="modal-content">\n    <div class="modal-header">\n      <h2>$1</h2>\n      <button @click(close)>X</button>\n    </div>\n    <div class="modal-body">\n      $0\n    </div>\n  </div>\n</div>' },
      { label: "tabs", detail: "Tabs component", insertText: '<div class="tabs">\n  <div class="tab-headers">\n    <button class="@class({ active: activeTab === \'tab1\' })" @click(activeTab = \'tab1\')">Tab 1</button>\n    <button class="@class({ active: activeTab === \'tab2\' })" @click(activeTab = \'tab2\')">Tab 2</button>\n  </div>\n  <div class="tab-content">\n    @if (activeTab === \'tab1\') {\n      $1\n    }\n    @if (activeTab === \'tab2\') {\n      $0\n    }\n  </div>\n</div>' },
      { label: "accordion", detail: "Accordion component", insertText: '<div class="accordion">\n  <div class="accordion-item">\n    <div class="accordion-header" @click(toggle(0))>\n      <h3>$1</h3>\n    </div>\n    <div class="accordion-body" @show(isOpen(0))>\n      $0\n    </div>\n  </div>\n</div>' },
      { label: "dropdown", detail: "Dropdown component", insertText: '<div class="dropdown" @on("clickOutside", close)>\n  <button class="dropdown-trigger" @click(toggle)>\n    $1\n  </button>\n  <div class="dropdown-menu" @show(isOpen)>\n    $0\n  </div>\n</div>' },
      { label: "navbar", detail: "Navbar component", insertText: '<nav class="navbar">\n  <div class="navbar-brand">\n    <a href="/">$1</a>\n  </div>\n  <div class="navbar-menu">\n    <a href="/about">About</a>\n    <a href="/contact">Contact</a>\n  </div>\n</nav>' },
      { label: "footer-component", detail: "Footer component", insertText: '<footer class="footer">\n  <div class="footer-content">\n    <p>$1</p>\n  </div>\n  <div class="footer-links">\n    <a href="/privacy">Privacy</a>\n    <a href="/terms">Terms</a>\n  </div>\n</footer>' },
    ]);
  }

  addKeywords(category: string, items: CompletionItem[]): void {
    this.keywords.set(category, items);
  }

  addSnippets(category: string, items: CompletionItem[]): void {
    this.snippets.set(category, items);
  }

  addCustomProvider(provider: (context: CompletionContext) => CompletionItem[]): void {
    this.customProviders.push(provider);
  }

  getCompletions(context: CompletionContext): CompletionItem[] {
    let items: CompletionItem[] = [];
    for (const [, categoryItems] of this.keywords) {
      items.push(...categoryItems);
    }
    for (const [, categoryItems] of this.snippets) {
      items.push(...categoryItems);
    }
    for (const provider of this.customProviders) {
      items.push(...provider(context));
    }
    if (this.options.filterItems && context.currentWord) {
      items = items.filter((item) => item.label.toLowerCase().includes(context.currentWord.toLowerCase()));
    }
    if (this.options.sortItems) {
      items.sort((a, b) => {
        const aMatch = a.label.toLowerCase().startsWith(context.currentWord.toLowerCase()) ? 0 : 1;
        const bMatch = b.label.toLowerCase().startsWith(context.currentWord.toLowerCase()) ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return a.label.localeCompare(b.label);
      });
    }
    return items.slice(0, this.options.maxItems);
  }

  getTriggerCharacters(): string[] {
    return [...this.options.triggerCharacters];
  }

  setMaxItems(max: number): void {
    this.options.maxItems = max;
  }

  setSortItems(sort: boolean): void {
    this.options.sortItems = sort;
  }

  setFilterItems(filter: boolean): void {
    this.options.filterItems = filter;
  }

  getKeywordCategories(): string[] {
    return [...this.keywords.keys()];
  }

  getSnippetCategories(): string[] {
    return [...this.snippets.keys()];
  }

  getKeywordCount(): number {
    let count = 0;
    for (const items of this.keywords.values()) {
      count += items.length;
    }
    return count;
  }

  getSnippetCount(): number {
    let count = 0;
    for (const items of this.snippets.values()) {
      count += items.length;
    }
    return count;
  }

  getTotalCount(): number {
    return this.getKeywordCount() + this.getSnippetCount();
  }

  clear(): void {
    this.keywords.clear();
    this.snippets.clear();
    this.customProviders = [];
  }

  removeCustomProvider(provider: (context: CompletionContext) => CompletionItem[]): void {
    const index = this.customProviders.indexOf(provider);
    if (index !== -1) {
      this.customProviders.splice(index, 1);
    }
  }

  getContext(document: TextDocument, position: Position): CompletionContext {
    const doc = document as any;
    const lineText = typeof doc.getLineText === "function"
      ? doc.getLineText(position.line)
      : (doc.text ? doc.text.split("\n")[position.line] ?? "" : "");
    const linePrefix = lineText.slice(0, position.character);
    const lineSuffix = lineText.slice(position.character);
    const wordMatch = linePrefix.match(/[a-zA-Z0-9_-]+$/);
    const currentWord = wordMatch ? wordMatch[0] : "";
    const wordStart = position.character - currentWord.length;
    return {
      document,
      position,
      currentWord,
      lineText,
      linePrefix,
      lineSuffix,
      wordRange: {
        start: { line: position.line, character: wordStart },
        end: position,
      },
    };
  }

  resolveCompletionItem(item: CompletionItem): CompletionItem {
    return { ...item };
  }

  shouldTrigger(triggerCharacter: string): boolean {
    return this.options.triggerCharacters.includes(triggerCharacter);
  }

  getOptions(): Required<CompletionProviderOptions> {
    return { ...this.options };
  }
}

export function createCompletionProvider(options?: CompletionProviderOptions): CompletionProvider {
  return new CompletionProvider(options);
}

export class HoverProvider {
  private hoverInfo: Map<string, string> = new Map();

  registerHoverInfo(word: string, info: string): void {
    this.hoverInfo.set(word, info);
  }

  getHoverInfo(word: string): string | undefined {
    return this.hoverInfo.get(word);
  }

  hasHoverInfo(word: string): boolean {
    return this.hoverInfo.has(word);
  }

  removeHoverInfo(word: string): void {
    this.hoverInfo.delete(word);
  }

  clear(): void {
    this.hoverInfo.clear();
  }

  size(): number {
    return this.hoverInfo.size;
  }

  getAllWords(): string[] {
    return [...this.hoverInfo.keys()];
  }
}

export function createHoverProvider(): HoverProvider {
  return new HoverProvider();
}

export class DefinitionProvider {
  private definitions: Map<string, string> = new Map();

  registerDefinition(word: string, location: string): void {
    this.definitions.set(word, location);
  }

  getDefinition(word: string): string | undefined {
    return this.definitions.get(word);
  }

  hasDefinition(word: string): boolean {
    return this.definitions.has(word);
  }

  removeDefinition(word: string): void {
    this.definitions.delete(word);
  }

  clear(): void {
    this.definitions.clear();
  }

  size(): number {
    return this.definitions.size;
  }
}

export function createDefinitionProvider(): DefinitionProvider {
  return new DefinitionProvider();
}

export class ReferenceProvider {
  private references: Map<string, string[]> = new Map();

  registerReference(word: string, location: string): void {
    if (!this.references.has(word)) {
      this.references.set(word, []);
    }
    this.references.get(word)!.push(location);
  }

  getReferences(word: string): string[] {
    return this.references.get(word) ?? [];
  }

  hasReferences(word: string): boolean {
    return this.references.has(word);
  }

  removeReferences(word: string): void {
    this.references.delete(word);
  }

  clear(): void {
    this.references.clear();
  }

  size(): number {
    return this.references.size;
  }

  getTotalReferences(): number {
    let count = 0;
    for (const refs of this.references.values()) {
      count += refs.length;
    }
    return count;
  }
}

export function createReferenceProvider(): ReferenceProvider {
  return new ReferenceProvider();
}

export class SignatureHelpProvider {
  private signatures: Map<string, Array<{ label: string; documentation: string; parameters: Array<{ label: string; documentation: string }> }>> = new Map();

  registerSignature(functionName: string, signature: { label: string; documentation: string; parameters: Array<{ label: string; documentation: string }> }): void {
    if (!this.signatures.has(functionName)) {
      this.signatures.set(functionName, []);
    }
    this.signatures.get(functionName)!.push(signature);
  }

  getSignatures(functionName: string): Array<{ label: string; documentation: string; parameters: Array<{ label: string; documentation: string }> }> {
    return this.signatures.get(functionName) ?? [];
  }

  hasSignatures(functionName: string): boolean {
    return this.signatures.has(functionName);
  }

  removeSignatures(functionName: string): void {
    this.signatures.delete(functionName);
  }

  clear(): void {
    this.signatures.clear();
  }

  size(): number {
    return this.signatures.size;
  }
}

export function createSignatureHelpProvider(): SignatureHelpProvider {
  return new SignatureHelpProvider();
}

export class FormatProvider {
  private options: { tabSize: number; insertSpaces: boolean; wrapLineLength: number; maxEmptyLines: number };

  constructor(options: { tabSize?: number; insertSpaces?: boolean; wrapLineLength?: number; maxEmptyLines?: number } = {}) {
    this.options = {
      tabSize: options.tabSize ?? 2,
      insertSpaces: options.insertSpaces ?? true,
      wrapLineLength: options.wrapLineLength ?? 120,
      maxEmptyLines: options.maxEmptyLines ?? 2,
    };
  }

  format(text: string): string {
    const lines = text.split("\n");
    const formatted: string[] = [];
    let indentLevel = 0;
    let emptyLineCount = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "") {
        emptyLineCount++;
        if (emptyLineCount <= this.options.maxEmptyLines) {
          formatted.push("");
        }
        continue;
      }
      emptyLineCount = 0;
      if (trimmed.startsWith("}") || trimmed.startsWith("]") || trimmed.startsWith(")")) {
        indentLevel = Math.max(0, indentLevel - 1);
      }
      const indent = this.options.insertSpaces ? " ".repeat(indentLevel * this.options.tabSize) : "\t".repeat(indentLevel);
      formatted.push(indent + trimmed);
      const openCount = (trimmed.match(/[\{\[\(]/g) ?? []).length;
      const closeCount = (trimmed.match(/[\}\]\)]/g) ?? []).length;
      indentLevel = Math.max(0, indentLevel + openCount - closeCount);
    }
    return formatted.join("\n");
  }

  formatRange(text: string, startLine: number, endLine: number): string {
    const lines = text.split("\n");
    const before = lines.slice(0, startLine);
    const toFormat = lines.slice(startLine, endLine + 1);
    const after = lines.slice(endLine + 1);
    const formattedRange = this.format(toFormat.join("\n")).split("\n");
    return [...before, ...formattedRange, ...after].join("\n");
  }

  setTabSize(size: number): void {
    this.options.tabSize = size;
  }

  setInsertSpaces(insert: boolean): void {
    this.options.insertSpaces = insert;
  }

  setWrapLineLength(length: number): void {
    this.options.wrapLineLength = length;
  }

  setMaxEmptyLines(max: number): void {
    this.options.maxEmptyLines = max;
  }

  getOptions(): { tabSize: number; insertSpaces: boolean; wrapLineLength: number; maxEmptyLines: number } {
    return { ...this.options };
  }
}

export function createFormatProvider(options?: { tabSize?: number; insertSpaces?: boolean; wrapLineLength?: number; maxEmptyLines?: number }): FormatProvider {
  return new FormatProvider(options);
}

export class CodeActionProvider {
  private actions: Map<string, Array<{ title: string; command: string; arguments?: unknown[] }>> = new Map();

  registerAction(code: string, action: { title: string; command: string; arguments?: unknown[] }): void {
    if (!this.actions.has(code)) {
      this.actions.set(code, []);
    }
    this.actions.get(code)!.push(action);
  }

  getActions(code: string): Array<{ title: string; command: string; arguments?: unknown[] }> {
    return this.actions.get(code) ?? [];
  }

  hasActions(code: string): boolean {
    return this.actions.has(code);
  }

  removeActions(code: string): void {
    this.actions.delete(code);
  }

  clear(): void {
    this.actions.clear();
  }

  size(): number {
    return this.actions.size;
  }
}

export function createCodeActionProvider(): CodeActionProvider {
  return new CodeActionProvider();
}

export class DocumentSymbolProvider {
  private symbols: Map<string, Array<{ name: string; kind: string; range: { start: { line: number; character: number }; end: { line: number; character: number } }; children?: unknown[] }>> = new Map();

  registerSymbols(uri: string, symbols: Array<{ name: string; kind: string; range: { start: { line: number; character: number }; end: { line: number; character: number } }; children?: unknown[] }>): void {
    this.symbols.set(uri, symbols);
  }

  getSymbols(uri: string): Array<{ name: string; kind: string; range: { start: { line: number; character: number }; end: { line: number; character: number } }; children?: unknown[] }> {
    return this.symbols.get(uri) ?? [];
  }

  hasSymbols(uri: string): boolean {
    return this.symbols.has(uri);
  }

  removeSymbols(uri: string): void {
    this.symbols.delete(uri);
  }

  clear(): void {
    this.symbols.clear();
  }

  size(): number {
    return this.symbols.size;
  }
}

export function createDocumentSymbolProvider(): DocumentSymbolProvider {
  return new DocumentSymbolProvider();
}

export class RenameProvider {
  private renameMappings: Map<string, Map<string, string>> = new Map();

  registerRename(uri: string, oldName: string, newName: string): void {
    if (!this.renameMappings.has(uri)) {
      this.renameMappings.set(uri, new Map());
    }
    this.renameMappings.get(uri)!.set(oldName, newName);
  }

  getRename(uri: string, oldName: string): string | undefined {
    return this.renameMappings.get(uri)?.get(oldName);
  }

  getRenames(uri: string): Map<string, string> | undefined {
    return this.renameMappings.get(uri);
  }

  hasRename(uri: string, oldName: string): boolean {
    return this.renameMappings.get(uri)?.has(oldName) ?? false;
  }

  removeRenames(uri: string): void {
    this.renameMappings.delete(uri);
  }

  clear(): void {
    this.renameMappings.clear();
  }

  size(): number {
    return this.renameMappings.size;
  }
}

export function createRenameProvider(): RenameProvider {
  return new RenameProvider();
}

export class FoldingRangeProvider {
  private foldingRanges: Map<string, Array<{ startLine: number; endLine: number; kind?: string }>> = new Map();

  registerFoldingRanges(uri: string, ranges: Array<{ startLine: number; endLine: number; kind?: string }>): void {
    this.foldingRanges.set(uri, ranges);
  }

  getFoldingRanges(uri: string): Array<{ startLine: number; endLine: number; kind?: string }> {
    return this.foldingRanges.get(uri) ?? [];
  }

  hasFoldingRanges(uri: string): boolean {
    return this.foldingRanges.has(uri);
  }

  removeFoldingRanges(uri: string): void {
    this.foldingRanges.delete(uri);
  }

  clear(): void {
    this.foldingRanges.clear();
  }

  size(): number {
    return this.foldingRanges.size;
  }
}

export function createFoldingRangeProvider(): FoldingRangeProvider {
  return new FoldingRangeProvider();
}

export class SelectionRangeProvider {
  private selectionRanges: Map<string, Array<{ start: { line: number; character: number }; end: { line: number; character: number } }>> = new Map();

  registerSelectionRanges(uri: string, ranges: Array<{ start: { line: number; character: number }; end: { line: number; character: number } }>): void {
    this.selectionRanges.set(uri, ranges);
  }

  getSelectionRanges(uri: string): Array<{ start: { line: number; character: number }; end: { line: number; character: number } }> {
    return this.selectionRanges.get(uri) ?? [];
  }

  hasSelectionRanges(uri: string): boolean {
    return this.selectionRanges.has(uri);
  }

  removeSelectionRanges(uri: string): void {
    this.selectionRanges.delete(uri);
  }

  clear(): void {
    this.selectionRanges.clear();
  }

  size(): number {
    return this.selectionRanges.size;
  }
}

export function createSelectionRangeProvider(): SelectionRangeProvider {
  return new SelectionRangeProvider();
}

export class CallHierarchyProvider {
  private callHierarchy: Map<string, Array<{ from: string; to: string; fromRanges: Array<{ start: number; end: number }> }>> = new Map();

  registerCallHierarchy(uri: string, items: Array<{ from: string; to: string; fromRanges: Array<{ start: number; end: number }> }>): void {
    this.callHierarchy.set(uri, items);
  }

  getCallHierarchy(uri: string): Array<{ from: string; to: string; fromRanges: Array<{ start: number; end: number }> }> {
    return this.callHierarchy.get(uri) ?? [];
  }

  hasCallHierarchy(uri: string): boolean {
    return this.callHierarchy.has(uri);
  }

  removeCallHierarchy(uri: string): void {
    this.callHierarchy.delete(uri);
  }

  clear(): void {
    this.callHierarchy.clear();
  }

  size(): number {
    return this.callHierarchy.size;
  }
}

export function createCallHierarchyProvider(): CallHierarchyProvider {
  return new CallHierarchyProvider();
}

export class TypeDefinitionProvider {
  private typeDefinitions: Map<string, string> = new Map();

  registerTypeDefinition(word: string, location: string): void {
    this.typeDefinitions.set(word, location);
  }

  getTypeDefinition(word: string): string | undefined {
    return this.typeDefinitions.get(word);
  }

  hasTypeDefinition(word: string): boolean {
    return this.typeDefinitions.has(word);
  }

  removeTypeDefinition(word: string): void {
    this.typeDefinitions.delete(word);
  }

  clear(): void {
    this.typeDefinitions.clear();
  }

  size(): number {
    return this.typeDefinitions.size;
  }
}

export function createTypeDefinitionProvider(): TypeDefinitionProvider {
  return new TypeDefinitionProvider();
}

export class ImplementationProvider {
  private implementations: Map<string, string[]> = new Map();

  registerImplementation(word: string, location: string): void {
    if (!this.implementations.has(word)) {
      this.implementations.set(word, []);
    }
    this.implementations.get(word)!.push(location);
  }

  getImplementations(word: string): string[] {
    return this.implementations.get(word) ?? [];
  }

  hasImplementations(word: string): boolean {
    return this.implementations.has(word);
  }

  removeImplementations(word: string): void {
    this.implementations.delete(word);
  }

  clear(): void {
    this.implementations.clear();
  }

  size(): number {
    return this.implementations.size;
  }
}

export function createImplementationProvider(): ImplementationProvider {
  return new ImplementationProvider();
}

export class ColorProvider {
  private colors: Map<string, Array<{ range: { start: number; end: number }; color: { red: number; green: number; blue: number; alpha: number } }>> = new Map();

  registerColors(uri: string, colorItems: Array<{ range: { start: number; end: number }; color: { red: number; green: number; blue: number; alpha: number } }>): void {
    this.colors.set(uri, colorItems);
  }

  getColors(uri: string): Array<{ range: { start: number; end: number }; color: { red: number; green: number; blue: number; alpha: number } }> {
    return this.colors.get(uri) ?? [];
  }

  hasColors(uri: string): boolean {
    return this.colors.has(uri);
  }

  removeColors(uri: string): void {
    this.colors.delete(uri);
  }

  clear(): void {
    this.colors.clear();
  }

  size(): number {
    return this.colors.size;
  }
}

export function createColorProvider(): ColorProvider {
  return new ColorProvider();
}

export class InlayHintProvider {
  private hints: Map<string, Array<{ position: { line: number; character: number }; label: string; kind?: string; tooltip?: string }>> = new Map();

  registerHints(uri: string, inlayHints: Array<{ position: { line: number; character: number }; label: string; kind?: string; tooltip?: string }>): void {
    this.hints.set(uri, inlayHints);
  }

  getHints(uri: string): Array<{ position: { line: number; character: number }; label: string; kind?: string; tooltip?: string }> {
    return this.hints.get(uri) ?? [];
  }

  hasHints(uri: string): boolean {
    return this.hints.has(uri);
  }

  removeHints(uri: string): void {
    this.hints.delete(uri);
  }

  clear(): void {
    this.hints.clear();
  }

  size(): number {
    return this.hints.size;
  }
}

export function createInlayHintProvider(): InlayHintProvider {
  return new InlayHintProvider();
}

export class SemanticTokensProvider {
  private tokens: Map<string, Array<{ line: number; character: number; length: number; type: string; modifiers: string[] }>> = new Map();

  registerTokens(uri: string, semanticTokens: Array<{ line: number; character: number; length: number; type: string; modifiers: string[] }>): void {
    this.tokens.set(uri, semanticTokens);
  }

  getTokens(uri: string): Array<{ line: number; character: number; length: number; type: string; modifiers: string[] }> {
    return this.tokens.get(uri) ?? [];
  }

  hasTokens(uri: string): boolean {
    return this.tokens.has(uri);
  }

  removeTokens(uri: string): void {
    this.tokens.delete(uri);
  }

  clear(): void {
    this.tokens.clear();
  }

  size(): number {
    return this.tokens.size;
  }
}

export function createSemanticTokensProvider(): SemanticTokensProvider {
  return new SemanticTokensProvider();
}

export class LinkedEditingProvider {
  private linkedRanges: Map<string, Array<{ start: { line: number; character: number }; end: { line: number; character: number } }>> = new Map();

  registerLinkedRanges(uri: string, ranges: Array<{ start: { line: number; character: number }; end: { line: number; character: number } }>): void {
    this.linkedRanges.set(uri, ranges);
  }

  getLinkedRanges(uri: string): Array<{ start: { line: number; character: number }; end: { line: number; character: number } }> {
    return this.linkedRanges.get(uri) ?? [];
  }

  hasLinkedRanges(uri: string): boolean {
    return this.linkedRanges.has(uri);
  }

  removeLinkedRanges(uri: string): void {
    this.linkedRanges.delete(uri);
  }

  clear(): void {
    this.linkedRanges.clear();
  }

  size(): number {
    return this.linkedRanges.size;
  }
}

export function createLinkedEditingProvider(): LinkedEditingProvider {
  return new LinkedEditingProvider();
}

export class DocumentLinkProvider {
  private links: Map<string, Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; target: string; tooltip?: string }>> = new Map();

  registerLinks(uri: string, documentLinks: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; target: string; tooltip?: string }>): void {
    this.links.set(uri, documentLinks);
  }

  getLinks(uri: string): Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; target: string; tooltip?: string }> {
    return this.links.get(uri) ?? [];
  }

  hasLinks(uri: string): boolean {
    return this.links.has(uri);
  }

  removeLinks(uri: string): void {
    this.links.delete(uri);
  }

  clear(): void {
    this.links.clear();
  }

  size(): number {
    return this.links.size;
  }
}

export function createDocumentLinkProvider(): DocumentLinkProvider {
  return new DocumentLinkProvider();
}

export class WorkspaceSymbolProvider {
  private symbols: Map<string, Array<{ name: string; kind: string; location: string; containerName?: string }>> = new Map();

  registerSymbols(uri: string, workspaceSymbols: Array<{ name: string; kind: string; location: string; containerName?: string }>): void {
    this.symbols.set(uri, workspaceSymbols);
  }

  search(query: string): Array<{ name: string; kind: string; location: string; containerName?: string }> {
    const results: Array<{ name: string; kind: string; location: string; containerName?: string }> = [];
    for (const symbols of this.symbols.values()) {
      for (const symbol of symbols) {
        if (symbol.name.toLowerCase().includes(query.toLowerCase())) {
          results.push(symbol);
        }
      }
    }
    return results;
  }

  getSymbols(uri: string): Array<{ name: string; kind: string; location: string; containerName?: string }> {
    return this.symbols.get(uri) ?? [];
  }

  hasSymbols(uri: string): boolean {
    return this.symbols.has(uri);
  }

  removeSymbols(uri: string): void {
    this.symbols.delete(uri);
  }

  clear(): void {
    this.symbols.clear();
  }

  size(): number {
    return this.symbols.size;
  }

  getTotalSymbols(): number {
    let count = 0;
    for (const symbols of this.symbols.values()) {
      count += symbols.length;
    }
    return count;
  }
}

export function createWorkspaceSymbolProvider(): WorkspaceSymbolProvider {
  return new WorkspaceSymbolProvider();
}

export class CodeLensProvider {
  private codeLenses: Map<string, Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; command?: { title: string; command: string; arguments?: unknown[] } }>> = new Map();

  registerCodeLenses(uri: string, lenses: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; command?: { title: string; command: string; arguments?: unknown[] } }>): void {
    this.codeLenses.set(uri, lenses);
  }

  getCodeLenses(uri: string): Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; command?: { title: string; command: string; arguments?: unknown[] } }> {
    return this.codeLenses.get(uri) ?? [];
  }

  hasCodeLenses(uri: string): boolean {
    return this.codeLenses.has(uri);
  }

  removeCodeLenses(uri: string): void {
    this.codeLenses.delete(uri);
  }

  clear(): void {
    this.codeLenses.clear();
  }

  size(): number {
    return this.codeLenses.size;
  }
}

export function createCodeLensProvider(): CodeLensProvider {
  return new CodeLensProvider();
}

export class GotoDefinitionProvider {
  private definitions: Map<string, { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }> = new Map();

  registerDefinition(word: string, location: { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }): void {
    this.definitions.set(word, location);
  }

  getDefinition(word: string): { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } } | undefined {
    return this.definitions.get(word);
  }

  hasDefinition(word: string): boolean {
    return this.definitions.has(word);
  }

  removeDefinition(word: string): void {
    this.definitions.delete(word);
  }

  clear(): void {
    this.definitions.clear();
  }

  size(): number {
    return this.definitions.size;
  }
}

export function createGotoDefinitionProvider(): GotoDefinitionProvider {
  return new GotoDefinitionProvider();
}

export class TypeHierarchyProvider {
  private typeHierarchy: Map<string, Array<{ type: string; parents: string[]; children: string[] }>> = new Map();

  registerTypeHierarchy(uri: string, hierarchy: Array<{ type: string; parents: string[]; children: string[] }>): void {
    this.typeHierarchy.set(uri, hierarchy);
  }

  getTypeHierarchy(uri: string): Array<{ type: string; parents: string[]; children: string[] }> {
    return this.typeHierarchy.get(uri) ?? [];
  }

  hasTypeHierarchy(uri: string): boolean {
    return this.typeHierarchy.has(uri);
  }

  removeTypeHierarchy(uri: string): void {
    this.typeHierarchy.delete(uri);
  }

  clear(): void {
    this.typeHierarchy.clear();
  }

  size(): number {
    return this.typeHierarchy.size;
  }
}

export function createTypeHierarchyProvider(): TypeHierarchyProvider {
  return new TypeHierarchyProvider();
}

export class InlineValueProvider {
  private inlineValues: Map<string, Array<{ range: { start: number; end: number }; value: string }>> = new Map();

  registerInlineValues(uri: string, values: Array<{ range: { start: number; end: number }; value: string }>): void {
    this.inlineValues.set(uri, values);
  }

  getInlineValues(uri: string): Array<{ range: { start: number; end: number }; value: string }> {
    return this.inlineValues.get(uri) ?? [];
  }

  hasInlineValues(uri: string): boolean {
    return this.inlineValues.has(uri);
  }

  removeInlineValues(uri: string): void {
    this.inlineValues.delete(uri);
  }

  clear(): void {
    this.inlineValues.clear();
  }

  size(): number {
    return this.inlineValues.size;
  }
}

export function createInlineValueProvider(): InlineValueProvider {
  return new InlineValueProvider();
}

export class DocumentHighlightProvider {
  private highlights: Map<string, Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; kind: string }>> = new Map();

  registerHighlights(uri: string, documentHighlights: Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; kind: string }>): void {
    this.highlights.set(uri, documentHighlights);
  }

  getHighlights(uri: string): Array<{ range: { start: { line: number; character: number }; end: { line: number; character: number } }; kind: string }> {
    return this.highlights.get(uri) ?? [];
  }

  hasHighlights(uri: string): boolean {
    return this.highlights.has(uri);
  }

  removeHighlights(uri: string): void {
    this.highlights.delete(uri);
  }

  clear(): void {
    this.highlights.clear();
  }

  size(): number {
    return this.highlights.size;
  }
}

export function createDocumentHighlightProvider(): DocumentHighlightProvider {
  return new DocumentHighlightProvider();
}
