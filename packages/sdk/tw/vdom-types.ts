/**
 * Minimal VNode type for SDK consumers.
 * Re-exports the full VNode from runtime when available.
 */

export interface VNode {
  type: "element" | "text" | "fragment" | "component" | "comment";
  tag?: string;
  props?: Record<string, unknown>;
  children?: VNode[];
  text?: string;
  key?: string | number;
  el?: Node;
  isComponent?: boolean;
  componentInstance?: unknown;
}
