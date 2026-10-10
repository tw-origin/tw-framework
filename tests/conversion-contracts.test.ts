/**
 * String and numeric conversions — the approved contracts.
 *
 * String hex/binary used to encode UTF-16 code units and corrupted anything
 * above Latin-1; it is UTF-8 now, with new names and the old ones as aliases.
 * Numeric conversions used `(n >>> 0)`, which wrapped negatives, fractions and
 * values above 2^32 - 1; they validate now.
 */
import { describe, test, expect } from "bun:test";

import {
  stringToHex,
  hexToString,
  stringToBinary,
  binaryToString,
  toHex as stringToHexLegacy,
  fromHex as hexToStringLegacy,
  toBinary as stringToBinaryLegacy,
  fromBinary as binaryToStringLegacy,
} from "../packages/shared/tw/utils/string/transform.ts";
import { ConversionUtils } from "../packages/shared/tw/utils/schema-validator.ts";
import {
  toHex,
  fromHex,
  toBinary,
  fromBinary,
  toOctal,
  fromOctal,
  toBase,
  fromBase,
  MAX_CONVERSION_VALUE,
} from "../packages/shared/tw/utils/number/format.ts";

describe("string conversions: UTF-8 round trip", () => {
  const samples = ["", "hello", "hi", "A", "0", "\u0000", "हिंदी", "😀", "aहिं😀z", "ÿ"];

  test("ASCII", () => {
    expect(hexToString(stringToHex("hello"))).toBe("hello");
    expect(binaryToString(stringToBinary("hello"))).toBe("hello");
  });

  test("Devanagari", () => {
    expect(hexToString(stringToHex("हिंदी"))).toBe("हिंदी");
    expect(binaryToString(stringToBinary("हिंदी"))).toBe("हिंदी");
  });

  test("emoji (surrogate pair)", () => {
    expect(hexToString(stringToHex("😀"))).toBe("😀");
    expect(binaryToString(stringToBinary("😀"))).toBe("😀");
  });

  test("mixed", () => {
    expect(hexToString(stringToHex("aहिं😀z"))).toBe("aहिं😀z");
    expect(binaryToString(stringToBinary("aहिं😀z"))).toBe("aहिं😀z");
  });

  test("every sample round-trips through both formats", () => {
    for (const s of samples) {
      expect(hexToString(stringToHex(s))).toBe(s);
      expect(binaryToString(stringToBinary(s))).toBe(s);
    }
  });

  test("empty string", () => {
    expect(stringToHex("")).toBe("");
    expect(stringToBinary("")).toBe("");
    expect(hexToString("")).toBe("");
    expect(binaryToString("")).toBe("");
  });

  test("hex output is always even length; binary always a multiple of 8", () => {
    for (const s of samples) {
      expect(stringToHex(s).length % 2).toBe(0);
      expect(stringToBinary(s).length % 8).toBe(0);
    }
  });

  test("lowercase hex output", () => {
    expect(stringToHex("hello")).toBe("68656c6c6f");
  });
});

describe("string conversions: invalid input throws", () => {
  test("odd-length hex", () => {
    expect(() => hexToString("616")).toThrow(/odd-length/);
  });

  test("non-hex characters", () => {
    expect(() => hexToString("zz")).toThrow(/invalid hex/);
  });

  test("bytes that are not valid UTF-8", () => {
    expect(() => hexToString("ff")).toThrow(/valid UTF-8/);
  });

  test("incomplete multi-byte sequence", () => {
    expect(() => hexToString("e0a0")).toThrow(/valid UTF-8/);
  });

  test("binary length not a multiple of 8", () => {
    expect(() => binaryToString("101")).toThrow(/multiple of 8/);
  });

  test("non-binary characters", () => {
    expect(() => binaryToString("0101010x")).toThrow(/invalid binary/);
  });

  test("binary bytes that are not valid UTF-8", () => {
    expect(() => binaryToString("11111111")).toThrow(/valid UTF-8/);
  });
});

describe("string conversions: legacy names still work", () => {
  test("the old names are the new functions", () => {
    expect(stringToHexLegacy).toBe(stringToHex);
    expect(hexToStringLegacy).toBe(hexToString);
    expect(stringToBinaryLegacy).toBe(stringToBinary);
    expect(binaryToStringLegacy).toBe(binaryToString);
  });

  test("legacy round trip", () => {
    expect(hexToStringLegacy(stringToHexLegacy("हिं"))).toBe("हिं");
  });

  test("ConversionUtils delegates to the same implementation", () => {
    expect(ConversionUtils.toHex("hello")).toBe(stringToHex("hello"));
    expect(ConversionUtils.fromHex("68656c6c6f")).toBe("hello");
    expect(ConversionUtils.toBinary("hi")).toBe(stringToBinary("hi"));
    expect(ConversionUtils.fromBinary(stringToBinary("hi"))).toBe("hi");
  });
});

describe("numeric conversions: validation", () => {
  test("uppercase, and toBase agrees with toHex", () => {
    expect(toHex(255)).toBe("FF");
    expect(toBase(255, 16)).toBe("FF");
    expect(toHex(255)).toBe(toBase(255, 16));
  });

  test("no leading-zero padding", () => {
    expect(toBinary(5)).toBe("101");
    expect(toBinary(0)).toBe("0");
    expect(toHex(16)).toBe("10");
  });

  test("negatives throw", () => {
    expect(() => toHex(-1)).toThrow(/negative/);
    expect(() => toBinary(-1)).toThrow(/negative/);
    expect(() => toBase(-1, 16)).toThrow(/negative/);
  });

  test("values above 2^32 - 1 throw instead of wrapping", () => {
    expect(toHex(MAX_CONVERSION_VALUE)).toBe("FFFFFFFF");
    expect(() => toHex(MAX_CONVERSION_VALUE + 1)).toThrow(/at most/);
    expect(() => toBinary(4294967296)).toThrow(/at most/);
  });

  test("fractions throw instead of truncating", () => {
    expect(() => toHex(3.7)).toThrow(/integer/);
    expect(() => toBinary(3.7)).toThrow(/integer/);
  });

  test("NaN and non-numbers throw", () => {
    expect(() => toHex(NaN)).toThrow(/integer/);
    expect(() => toHex("ff" as unknown as number)).toThrow(/integer/);
  });

  test("invalid radix throws", () => {
    expect(() => toBase(5, 1)).toThrow(/between 2 and 36/);
    expect(() => toBase(5, 37)).toThrow(/between 2 and 36/);
    expect(() => toBase(5, 2.5)).toThrow(/between 2 and 36/);
    expect(() => fromBase("5", 1)).toThrow(/between 2 and 36/);
  });

  test("invalid digits throw", () => {
    expect(() => fromHex("zz")).toThrow(/outside base 16/);
    expect(() => fromBinary("ff")).toThrow(/outside base 2/);
    expect(() => fromOctal("8")).toThrow(/outside base 8/);
  });

  test("empty input throws", () => {
    expect(() => fromHex("")).toThrow(/non-empty/);
    expect(() => fromBinary("")).toThrow(/non-empty/);
    expect(() => fromOctal("")).toThrow(/non-empty/);
  });

  test("valid input still parses", () => {
    expect(fromHex("ff")).toBe(255);
    expect(fromHex("FF")).toBe(255);
    expect(fromBinary("101")).toBe(5);
    expect(fromOctal("17")).toBe(15);
    expect(fromBase("ff", 16)).toBe(255);
  });

  test("odd-length hex parses (a hex number is not a byte string)", () => {
    expect(fromHex("f")).toBe(15);
    expect(fromHex("abc")).toBe(2748);
  });

  test("round trips", () => {
    for (const n of [0, 1, 5, 16, 255, 2748, MAX_CONVERSION_VALUE]) {
      expect(fromHex(toHex(n))).toBe(n);
      expect(fromBinary(toBinary(n))).toBe(n);
      expect(fromOctal(toOctal(n))).toBe(n);
      expect(fromBase(toBase(n, 16), 16)).toBe(n);
      expect(fromBase(toBase(n, 36), 36)).toBe(n);
    }
  });
});
