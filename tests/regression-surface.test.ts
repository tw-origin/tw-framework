import { describe, test, expect } from "bun:test";
import * as sdk from "@tw/sdk";
import * as server from "@tw/server";
import * as runtime from "@tw/runtime";
import { defaultKeyExtractor } from "@tw/security";

// The 2.1 work touched shared files (the client-address migration, the builtin
// alias lists, the server export surface). These assertions lock the surfaces
// that existed before it, so a later change cannot quietly remove one.
describe("regression: pre-existing surfaces stay intact", () => {
  test("the SDK keeps its authoring exports", () => {
    const must = ["createApp", "definePage", "defineLayout", "defineComponent", "definePlugin",
                  "defineRoute", "defineMiddleware", "h", "Fragment", "html", "css", "escapeHtml",
                  "unescapeHtml", "serializeCookie", "parseCookies", "VERSION"];
    expect(must.filter((n) => (sdk as any)[n] === undefined)).toEqual([]);
  });

  test("the runtime router surface is unchanged", () => {
    for (const n of ["createRouter", "useRouter", "useRoute", "routerLink", "routerView", "setRouter"]) {
      expect(typeof (runtime as any)[n]).toBe("function");
    }
  });

  test("ISR invalidation is reachable from the server package", () => {
    // revalidatePath was exported from routing/ but never from the package
    // root, and revalidateTag was not exported from either -- both were
    // unreachable. They are exported now; this keeps it that way.
    expect(typeof (server as any).revalidatePath).toBe("function");
    expect(typeof (server as any).revalidateTag).toBe("function");
    expect((server as any).revalidatePath("/nope")).toBe(0);
    expect((server as any).revalidateTag("nope")).toBe(0);
  });

  test("the migrated IP spots still read the same headers", () => {
    const r = new Request("https://x/");
    r.headers.set("x-forwarded-for", "1.2.3.4, 10.0.0.1");
    expect(defaultKeyExtractor(r)).toBe("1.2.3.4");

    const r2 = new Request("https://x/");
    r2.headers.set("cf-connecting-ip", "5.6.7.8");
    expect(defaultKeyExtractor(r2)).toBe("5.6.7.8");

    const r3 = new Request("https://x/");
    r3.headers.set("x-real-ip", "9.9.9.9");
    expect(defaultKeyExtractor(r3)).toBe("9.9.9.9");
  });

  test("the builtin specifier list is the single source of truth", async () => {
    const compiler: any = await import("@tw/compiler");
    const list: string[] = compiler.BUILTIN_COMPONENT_SPECIFIERS;
    expect(list).toContain("@tw/optImage");
    expect(list).toContain("@tw/RouterLink");
    expect(list).toContain("@tw/Head");
    expect(list).toContain("@tw/Script");
    expect(list).toContain("@tw/Form");
  });
});
