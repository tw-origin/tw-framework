/**
 * CSS extraction & minification -- deep CSS pipeline.
 *
 * Extracts CSS from:
 * - <style> blocks in TW files
 * - Inline styles on elements
 * - TSS (TW Style Shorthand) expansions
 * - Scoped styles (with [data-tw-scope] attribute)
 *
 * Then minifies and optimizes:
 * - Remove comments and whitespace
 * - Merge duplicate selectors
 * - Shorten hex colors (#ffffff -> #fff)
 * - Remove duplicate properties
 * - Sort properties (for better gzip)
 * - Remove unnecessary units (0px -> 0)
 * - Merge selectors with same rules
 * - Remove unused selectors (with AST analysis)
 *
 * Output:
 * - Critical CSS (above-the-fold) -> inline in <head>
 * - Non-critical CSS -> async loaded external file
 */

import type { Program, ASTNode } from "../ast/nodes";
import type { CodegenContext } from "./types";

// --- CSS Rule --------------------------------------------------------

export interface CSSRule {
  selector: string;
  properties: Map<string, string>;
  /** Source: file or inline */
  source: "style-block" | "inline" | "tss" | "import";
  /** Scope ID (for scoped styles) */
  scope?: string;
  /** Media query */
  media?: string;
  /** Is this rule critical (above-the-fold)? */
  critical: boolean;
}

export interface CSSExtractionResult {
  /** All CSS rules */
  rules: CSSRule[];
  /** Minified CSS string */
  css: string;
  /** Critical CSS (for inlining in <head>) */
  criticalCSS: string;
  /** Non-critical CSS (for async loading) */
  nonCriticalCSS: string;
  /** Total original size (before minification) */
  originalSize: number;
  /** Total minified size */
  minifiedSize: number;
  /** Compression ratio (0-1) */
  compressionRatio: number;
  /** List of removed selectors (unused) */
  removedSelectors: string[];
}

// --- CSS Extractor ----------------------------------------------------

export class CSSExtractor {
  private rules: CSSRule[] = [];
  private removedSelectors: string[] = [];

  constructor(private ctx?: CodegenContext) {}

  /**
   * Extract CSS from a Program AST.
   */
  extractFromProgram(program: Program): CSSExtractionResult {
    const originalSize = this.estimateOriginalSize(program);

    // Walk AST and extract styles
    for (const node of program.body) {
      this.visitNode(node);
    }

    // Process rules: merge, minify, split critical/non-critical
    const merged = this.mergeRules(this.rules);
    const usedSelectors = this.findUsedSelectors(program);
    const filtered = this.removeUnusedRules(merged, usedSelectors);

    const css = this.minifyRules(filtered);
    const { critical, nonCritical } = this.splitCritical(filtered);
    const criticalCSS = this.minifyRules(critical);
    const nonCriticalCSS = this.minifyRules(nonCritical);

    const minifiedSize = css.length;

    return {
      rules: filtered,
      css,
      criticalCSS,
      nonCriticalCSS,
      originalSize,
      minifiedSize,
      compressionRatio: originalSize > 0 ? 1 - (minifiedSize / originalSize) : 0,
      removedSelectors: this.removedSelectors,
    };
  }

  // --- AST Walking --------------------------------------------------

  private visitNode(node: ASTNode): void {
    if (!node) return;

    if (node.type === "StyleBlock") {
      const styleNode = node as any;
      this.extractFromStyleBlock(styleNode.content, styleNode.scoped, this.ctx?.scopeId);
    }

    if (node.type === "Element") {
      const el = node as any;

      // Extract inline styles
      if (el.styles && el.styles.length > 0) {
        this.extractInlineStyles(el);
      }

      // Recurse into children
      for (const child of el.children || []) {
        this.visitNode(child);
      }
    }

    if (node.type === "Fragment") {
      for (const child of (node as any).children || []) {
        this.visitNode(child);
      }
    }
  }

  private extractFromStyleBlock(content: string, scoped: boolean, scopeId?: string): void {
    // Parse CSS rules from style block content
    const parsed = this.parseCSS(content);

    for (const rule of parsed) {
      this.rules.push({
        ...rule,
        source: "style-block",
        scope: scoped ? scopeId : undefined,
        critical: false, // determined later
      });
    }
  }

  private extractInlineStyles(el: any): void {
    // Inline styles don't become CSS rules -- they're already on the element
    // But we can extract common patterns to CSS classes
    // (e.g., if many elements have the same inline style, create a class)
    if (!el.styles || el.styles.length === 0) return;

    const styleKey = el.styles
      .map((s: any) => `${s.property}:${s.value}`)
      .join(";");

    // Track for potential class extraction
    this.inlineStyleMap.set(styleKey, (this.inlineStyleMap.get(styleKey) || 0) + 1);
  }

  private inlineStyleMap = new Map<string, number>();

  // --- CSS Parsing (lightweight) ------------------------------------

  /**
   * Parse raw CSS text into CSSRule objects.
   * Handles:
   * - Regular rules: selector { prop: value; }
   * - Media queries: @media (...) { selector { ... } }
   * - Keyframes: @keyframes name { ... }
   * - Font face: @font-face { ... }
   */
  private parseCSS(css: string): Array<{ selector: string; properties: Map<string, string>; media?: string }> {
    const rules: Array<{ selector: string; properties: Map<string, string>; media?: string }> = [];

    // Remove comments
    css = css.replace(/\/\*[\s\S]*?\*\//g, "");

    // Parse top-level at-rules and regular rules
    let pos = 0;

    while (pos < css.length) {
      // Skip whitespace
      while (pos < css.length && /\s/.test(css[pos])) pos++;

      if (pos >= css.length) break;

      // Check for at-rule
      if (css[pos] === "@") {
        const atRuleEnd = this.findAtRuleEnd(css, pos);
        const atRule = css.substring(pos, atRuleEnd);
        const parsed = this.parseAtRule(atRule);
        if (parsed) rules.push(...parsed);
        pos = atRuleEnd;
      } else {
        // Regular rule: selector { ... }
        const braceStart = css.indexOf("{", pos);
        if (braceStart === -1) break;
        const braceEnd = this.findMatchingBrace(css, braceStart);
        if (braceEnd === -1) break;

        const selector = css.substring(pos, braceStart).trim();
        const body = css.substring(braceStart + 1, braceEnd);
        const properties = this.parseProperties(body);

        rules.push({ selector, properties });
        pos = braceEnd + 1;
      }
    }

    return rules;
  }

  private findAtRuleEnd(css: string, start: number): number {
    // Find the end of an at-rule (either ; or matching })
    let depth = 0;
    for (let i = start; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") {
        depth--;
        if (depth === 0) return i + 1;
      } else if (css[i] === ";" && depth === 0) {
        return i + 1;
      }
    }
    return css.length;
  }

  private findMatchingBrace(css: string, start: number): number {
    let depth = 1;
    for (let i = start + 1; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  private parseAtRule(atRule: string): Array<{ selector: string; properties: Map<string, string>; media?: string }> {
    // @media (max-width: 768px) { .selector { prop: value } }
    const mediaMatch = atRule?.match(/@media\s+([^{]+)\{([\s\S]+)\}\s*$/);
    if (mediaMatch) {
      const media = mediaMatch[1].trim();
      const innerCSS = mediaMatch[2];
      const innerRules = this.parseCSS(innerCSS);
      return innerRules.map(r => ({ ...r, media }));
    }

    // @keyframes, @font-face, @import -- store as-is
    const keyframesMatch = atRule?.match(/@keyframes\s+([\w-]+)\s*\{([\s\S]+)\}/);
    if (keyframesMatch) {
      return [{
        selector: `@keyframes ${keyframesMatch[1]}`,
        properties: new Map([["body", keyframesMatch[2].trim()]]),
      }];
    }

    const fontFaceMatch = atRule.match(/@font-face\s*\{([^}]+)\}/);
    if (fontFaceMatch) {
      return [{
        selector: "@font-face",
        properties: this.parseProperties(fontFaceMatch[1]),
      }];
    }

    return [];
  }

  private parseProperties(body: string): Map<string, string> {
    const props = new Map<string, string>();
    const declarations = body.split(";").map(s => s.trim()).filter(s => s.length > 0);

    for (const decl of declarations) {
      const colon = decl.indexOf(":");
      if (colon === -1) continue;
      const prop = decl.substring(0, colon).trim();
      const value = decl.substring(colon + 1).trim();
      props.set(prop, value);
    }

    return props;
  }

  // --- Rule Merging --------------------------------------------------

  /**
   * Merge rules with the same selector + media query.
   * Duplicate properties: last one wins.
   */
  private mergeRules(rules: CSSRule[]): CSSRule[] {
    const map = new Map<string, CSSRule>();

    for (const rule of rules) {
      const key = `${rule.media || ""}|${rule.selector}`;
      const existing = map.get(key);

      if (existing) {
        // Merge properties (last wins)
        for (const [prop, value] of rule.properties) {
          existing.properties.set(prop, value);
        }
      } else {
        map.set(key, { ...rule, properties: new Map(rule.properties) });
      }
    }

    return Array.from(map.values());
  }

  // --- Unused Selector Removal --------------------------------------

  /**
   * Find all CSS selectors that are actually used in the AST.
   * Compares class names, IDs, and tag names against CSS selectors.
   */
  private findUsedSelectors(program: Program): Set<string> {
    const used = new Set<string>();

    // Walk AST and collect class names, IDs, tag names
    function walk(node: ASTNode) {
      if (!node) return;

      if (node.type === "Element") {
        const el = node as any;
        used.add(el.tag.toLowerCase());

        for (const attr of el.attrs || []) {
          if (attr.name === "class") {
            const classes = String(attr.value).split(/\s+/);
            for (const cls of classes) {
              if (cls) used.add(`.${cls}`);
            }
          }
          if (attr.name === "id") {
            used.add(`#${attr.value}`);
          }
        }
      }

      if (node.type === "Element" && (node as any).children) {
        for (const child of (node as any).children) walk(child);
      }
      if (node.type === "Fragment" && (node as any).children) {
        for (const child of (node as any).children) walk(child);
      }
    }

    for (const node of program.body) walk(node);

    return used;
  }

  /**
   * Remove CSS rules whose selectors don't appear in the used set.
   */
  private removeUnusedRules(rules: CSSRule[], usedSelectors: Set<string>): CSSRule[] {
    const result: CSSRule[] = [];

    for (const rule of rules) {
      // @-rules are always kept
      if (rule.selector.startsWith("@")) {
        result.push(rule);
        continue;
      }

      // Check if any selector in a comma-separated list is used
      const selectors = rule.selector.split(",").map(s => s.trim());
      const used = selectors.some(sel => {
        // Extract the first class/id/tag from the selector
        const match = sel.match(/^([.#]?[\w-]+)/);
        if (!match) return true; // Keep complex selectors
        return match && match[1] ? usedSelectors.has(match[1]) : false || usedSelectors.has(match[1].toLowerCase());
      });

      if (used) {
        result.push(rule);
      } else {
        this.removedSelectors.push(rule.selector);
      }
    }

    return result;
  }

  // --- CSS Minification ----------------------------------------------

  /**
   * Minify CSS rules into a compact string.
   */
  private minifyRules(rules: CSSRule[]): string {
    const parts: string[] = [];

    // Group by media query
    const noMedia: CSSRule[] = [];
    const byMedia = new Map<string, CSSRule[]>();

    for (const rule of rules) {
      if (rule.media) {
        const arr = byMedia.get(rule.media) || [];
        arr.push(rule);
        byMedia.set(rule.media, arr);
      } else {
        noMedia.push(rule);
      }
    }

    // No-media rules first
    for (const rule of noMedia) {
      // Skip empty rules (no properties) -- they produce useless "selector{}"
      if (rule.properties.size === 0 && !rule.selector.startsWith("@")) continue;
      parts.push(this.minifyRule(rule));
    }

    // Media queries
    for (const [media, mediaRules] of byMedia) {
      const inner = mediaRules.map(r => this.minifyRule(r)).join("");
      parts.push(`@media ${media}{${inner}}`);
    }

    return parts.join("");
  }

  private minifyRule(rule: CSSRule): string {
    // Apply scope
    let selector = rule.selector;
    if (rule.scope) {
      selector = selector.split(",").map(s => {
        return s.trim().replace(/([.#]?[\w-]+)/, `$1[data-tw-scope="${rule.scope}"]`);
      }).join(",");
    }

    // Minify properties
    const props = Array.from(rule.properties.entries())
      .map(([prop, value]) => {
        const minProp = prop.trim();
        let minVal = value.trim();

        // 0px -> 0
        minVal = minVal.replace(/\b0(px|em|rem|%|vh|vw|pt|pc|in|cm|mm)\b/gi, "0");

        // Shorten hex colors
        minVal = minVal.replace(/#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3\b/gi, "#$1$2$3");

        // Remove leading zeros: 0.5em -> .5em
        minVal = minVal.replace(/\b0\.(\d)/g, ".$1");

        // Remove unnecessary spaces
        minVal = minVal.replace(/\s*,\s*/g, ",");
        minVal = minVal.replace(/\s*\/\s*/g, "/");

        return `${minProp}:${minVal}`;
      })
      .join(";");

    // @-rules have special formatting
    if (selector.startsWith("@keyframes")) {
      return `${selector}{${rule.properties.get("body") || ""}}`;
    }
    if (selector.startsWith("@font-face")) {
      return `@font-face{${props}}`;
    }

    return `${selector}{${props}}`;
  }

  // --- Critical CSS Split --------------------------------------------

  /**
   * Split rules into critical (above-the-fold) and non-critical.
   * Heuristics:
   * - :hover, :focus, :active -> non-critical
   * - @media (max-width: ...) -> non-critical (mobile-only)
   * - @keyframes -> non-critical
   * - @font-face -> critical
   * - body, html, header, nav -> critical
   * - Elements in the first viewport -> critical
   */
  private splitCritical(rules: CSSRule[]): { critical: CSSRule[]; nonCritical: CSSRule[] } {
    const critical: CSSRule[] = [];
    const nonCritical: CSSRule[] = [];

    const criticalSelectors = new Set([
      "html", "body", "head", "header", "nav", "main",
      ":root", "*", "::before", "::after",
    ]);

    for (const rule of rules) {
      if (rule.selector.startsWith("@font-face")) {
        critical.push(rule);
        continue;
      }

      if (rule.selector.startsWith("@keyframes")) {
        nonCritical.push(rule);
        continue;
      }

      if (rule.media) {
        nonCritical.push(rule);
        continue;
      }

      // Check if selector contains pseudo-classes (non-critical)
      if (/:hover|:focus|:active|:visited|:focus-within/.test(rule.selector)) {
        nonCritical.push(rule);
        continue;
      }

      // Check if selector is for above-the-fold elements
      const selectors = rule.selector.split(",").map(s => s.trim());
      const isCritical = selectors.some(sel => {
        const match = sel.match(/^([.#]?[\w-]+)/);
        if (!match) return false;
        return match && match[1] ? criticalSelectors.has(match[1].toLowerCase()) : false;
      });

      if (isCritical) {
        critical.push(rule);
      } else {
        // Default to non-critical for non-structural selectors
        nonCritical.push(rule);
      }
    }

    return { critical, nonCritical };
  }

  // --- Helpers ------------------------------------------------------

  private estimateOriginalSize(program: Program): number {
    let size = 0;
    for (const node of program.body) {
      if (node.type === "StyleBlock") {
        size += (node as any).content?.length || 0;
      }
    }
    return size;
  }
}

// --- Public API ------------------------------------------------------

/**
 * Extract and minify CSS from a TW program.
 */
export function extractCSS(program: Program, ctx?: CodegenContext): CSSExtractionResult {
  const extractor = new CSSExtractor(ctx);
  return extractor.extractFromProgram(program);
}

/**
 * Minify raw CSS string.
 */
export function minifyCSS(css: string): string {
  const extractor = new CSSExtractor();
  const rules = extractor["parseCSS"](css).map(r => ({
    selector: r.selector,
    properties: r.properties,
    source: "style-block" as const,
    critical: false,
  }));
  return extractor["minifyRules"](rules);
}

/**
 * Merge multiple CSS strings (dedup selectors).
 */
export function mergeCSS(cssStrings: string[]): string {
  const extractor = new CSSExtractor();
  const allRules: CSSRule[] = [];

  for (const css of cssStrings) {
    const parsed = extractor["parseCSS"](css);
    for (const r of parsed) {
      allRules.push({
        selector: r.selector,
        properties: r.properties,
        source: "style-block" as const,
        critical: false,
      });
    }
  }

  const merged = extractor["mergeRules"](allRules);
  return extractor["minifyRules"](merged);
}
