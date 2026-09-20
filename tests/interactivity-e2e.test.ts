/**
 * TW Framework -- Real Interactivity End-to-End Tests
 *
 * Every other "E2E" test in this repo checks that `compile()` produces an
 * HTML/CSS/JS *string* containing expected substrings. None of them verify
 * that the framework's actual job -- turning a developer's .tw source into
 * a working, interactive app -- is actually done: mounting the compiled
 * output in a real DOM, firing a real event, and confirming the DOM itself
 * updates in response to a real state change.
 *
 * These tests do that: compile -> mount into happy-dom -> dispatch a real
 * click -> assert the rendered text actually changed.
 */

import { describe, test, expect } from "bun:test";
import { compile, parse, generateJSOnly, transformMarkVDOM } from "@tw/compiler";

/** Compile `source` and mount it into `document.body`, wiring up the real
 *  generated interactivity bundle (state + event handlers + re-render). */
async function mountApp(source: string): Promise<void> {
  const { html } = await compile(source);
  const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
  document.body.innerHTML = bodyMatch ? bodyMatch[1] : "";

  const parsed = parse(source);
  const { program: marked } = transformMarkVDOM(parsed);
  const bundle = generateJSOnly(marked);

  // eslint-disable-next-line no-eval -- running the framework's own compiled
  // output against the real (happy-dom) document/window globals, exactly as
  // a browser would when loading the generated <script> tag.
  eval(bundle.code);
}

describe("Real Interactivity E2E", () => {
  test("clicking a button actually increments displayed state (not just compiler output strings)", async () => {
    await mountApp(`
      @state { count = 0; }
      <button :on:click="count++">Count: {count}</button>`);

    const button = document.querySelector("button")!;
    expect(button.textContent).toBe("Count:0");

    button.click();
    expect(document.querySelector("button")!.textContent).toBe("Count:1");

    document.querySelector("button")!.click();
    expect(document.querySelector("button")!.textContent).toBe("Count:2");
  });

  test("multiple independent clicks each produce a correctly incremented DOM state", async () => {
    await mountApp(`
      @state { clicks = 0; }
      <button :on:click="clicks++">Clicks: {clicks}</button>`);

    const button = document.querySelector("button")!;
    for (let i = 1; i <= 5; i++) {
      button.click();
      expect(document.querySelector("button")!.textContent).toBe(`Clicks:${i}`);
    }
  });

  test("decrementing state via a click is reflected in the DOM", async () => {
    await mountApp(`
      @state { balance = 10; }
      <button :on:click="balance--">Balance: {balance}</button>`);

    expect(document.querySelector("button")!.textContent).toBe("Balance:10");
    document.querySelector("button")!.click();
    expect(document.querySelector("button")!.textContent).toBe("Balance:9");
  });

  test("the compiled event attribute matches what the runtime's attachEvents() looks for", async () => {
    // Regression guard for the :on:eventName parsing bug and the
    // html/attrs-vs-events duplication bug found while building this test --
    // both would have made the button un-clickable or double-bound.
    const { html } = await compile(`
      @state { count = 0; }
      <button :on:click="count++">Count: {count}</button>`);

    const matches = html.match(/data-tw-event-click="count\+\+"/g) ?? [];
    expect(matches.length).toBe(1); // exactly once, not zero, not duplicated
  });
});
