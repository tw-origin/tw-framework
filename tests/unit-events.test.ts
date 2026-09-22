/**
 * Event matrix: every EVENT_TYPES entry binds via on:<event>, every
 * EVENT_HANDLER_ATTRS entry passes through in HTML form (Next.js it.each).
 */
import { describe, expect, test } from "bun:test";
import { compileSync } from "../packages/compiler/tw/index.ts";
import { EVENT_TYPES, EVENT_HANDLER_ATTRS } from "../packages/shared/tw/index.ts";

const tmp = "/tmp/tw2k-events.tw";
const compile = (src: string) => compileSync(src, { filePath: tmp });

describe("event matrix (it.each over EVENT_TYPES)", () => {
  for (const ev of EVENT_TYPES) {
    test(`on:${ev} binds a handler`, () => {
      const out = compile(`page { title "T" }\ndiv { button on:${ev} "count++" { "B" } }`);
      expect(out.html).toContain(`data-tw-event-${ev}`);
    });
  }
});

describe("event handler attributes (it.each over EVENT_HANDLER_ATTRS)", () => {
  for (const attr of EVENT_HANDLER_ATTRS) {
    test(`${attr} passes through in HTML form`, () => {
      const out = compile(`page { title "T" }\ndiv { <button ${attr}="x()">B</button> }`);
      expect(out.html).toContain(`${attr}="x()"`);
    });
  }
});

describe("event diagnostics", () => {
  test("unknown event still binds (any DOM event is accepted)", () => {
    const out = compile(`page { title "T" }\ndiv { button on:notanevent "count++" { "B" } }`);
    expect(out.html).toContain("data-tw-event-notanevent");
    // documented behavior (docs/syntax-events.md): any DOM event name is
    // accepted -- if the browser dispatches it, the handler binds.
  });
  test("unknown event handler attr in HTML form passes through", () => {
    const out = compile(`page { title "T" }\ndiv { <button onmadething="x()">B</button> }`);
    expect(out.html).toContain('onmadething="x()"');
  });
});
