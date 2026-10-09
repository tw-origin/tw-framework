import { describe, test, expect } from "bun:test";
import { createI18n, parseAcceptLanguage } from "../packages/server/tw/i18n-runtime.ts";

// Per-instance locale state + client switching.

function req(headers: Record<string, string> = {}): any {
  const h = new Map(Object.entries(headers));
  return { headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null } };
}

describe("i18n runtime: per-instance state", () => {
  test("two instances keep independent locales", () => {
    const a = createI18n({ locales: ["en", "hi"], messages: { en: { hi: "Hello" }, hi: { hi: "नमस्ते" } } });
    const b = createI18n({ locales: ["en", "hi"], messages: { en: { hi: "Hello" }, hi: { hi: "नमस्ते" } } });
    a.setLocale("hi");
    expect(a.getLocale()).toBe("hi");
    expect(b.getLocale()).toBe("en");
    expect(a.t("hi")).toBe("नमस्ते");
    expect(b.t("hi")).toBe("Hello");
  });

  test("t falls back to the default locale then the key", () => {
    const i = createI18n({ locales: ["en", "hi"], messages: { en: { a: "A" } } });
    i.setLocale("hi");
    expect(i.t("a")).toBe("A");
    expect(i.t("missing")).toBe("missing");
  });

  test("interpolation replaces {vars}", () => {
    const i = createI18n({ locales: ["en"], messages: { en: { w: "Welcome, {name} ({n})" } } });
    expect(i.t("w", { name: "Raj", n: 3 })).toBe("Welcome, Raj (3)");
  });

  test("setLocale ignores an unknown locale", () => {
    const i = createI18n({ locales: ["en", "hi"] });
    i.setLocale("fr");
    expect(i.getLocale()).toBe("en");
  });
});

describe("i18n runtime: request detection", () => {
  test("a valid cookie wins", () => {
    const i = createI18n({ locales: ["en", "hi", "ta"] });
    expect(i.detect(req({ cookie: "locale=ta" }))).toBe("ta");
  });
  test("an invalid cookie falls through to Accept-Language", () => {
    const i = createI18n({ locales: ["en", "hi"] });
    expect(i.detect(req({ cookie: "locale=fr", "accept-language": "hi-IN,hi;q=0.9" }))).toBe("hi");
  });
  test("Accept-Language is honoured by quality", () => {
    const i = createI18n({ locales: ["en", "hi", "ta"] });
    expect(i.detect(req({ "accept-language": "en;q=0.3, ta;q=0.9" }))).toBe("ta");
  });
  test("no signal falls back to the default", () => {
    const i = createI18n({ locales: ["en", "hi"] });
    expect(i.detect(req())).toBe("en");
  });
  test("parseAcceptLanguage sorts by q", () => {
    expect(parseAcceptLanguage("en;q=0.2, hi;q=0.9, ta")).toEqual(["ta", "hi", "en"]);
  });
  test("cookieHeader remembers the choice", () => {
    const i = createI18n({ locales: ["en", "hi"] });
    expect(i.cookieHeader("hi")).toContain("locale=hi");
  });
});

describe("i18n runtime: client switching", () => {
  test("subscribe fires on a locale change", () => {
    const i = createI18n({ locales: ["en", "hi"] });
    const seen: string[] = [];
    i.subscribe((l) => seen.push(l));
    i.setLocale("hi");
    expect(seen).toEqual(["hi"]);
  });
  test("unsubscribe stops the notifications", () => {
    const i = createI18n({ locales: ["en", "hi"] });
    const seen: string[] = [];
    const off = i.subscribe((l) => seen.push(l));
    off();
    i.setLocale("hi");
    expect(seen).toEqual([]);
  });
  test("clientScript carries the locales, messages and a switcher", () => {
    const i = createI18n({ locales: ["en", "hi"], messages: { en: { hello: "Hello" } } });
    const js = i.clientScript();
    expect(js).toContain('"en"');
    expect(js).toContain('"hi"');
    expect(js).toContain("twI18n");
    expect(js).toContain("data-i18n");
    expect(js).toContain("setLocale");
    expect(js).toContain("Hello");
  });
});
