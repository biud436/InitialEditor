import { describe, expect, it } from "vitest";
import { decodeUtf8, encodeUtf8 } from "./utf8";

describe("utf8", () => {
  it("아스키, 한글, 이모지 왕복", () => {
    const text = "print(\"안녕, 세계\")\n-- 🙂 별\n";
    expect(decodeUtf8(encodeUtf8(text))).toBe(text);
  });

  it("바이트가 표준과 같다", () => {
    expect(Array.from(encodeUtf8("a"))).toEqual([0x61]);
    expect(Array.from(encodeUtf8("é"))).toEqual([0xc3, 0xa9]);
    expect(Array.from(encodeUtf8("한"))).toEqual([0xed, 0x95, 0x9c]);
    expect(Array.from(encodeUtf8("🙂"))).toEqual([0xf0, 0x9f, 0x99, 0x82]);
    expect(decodeUtf8(Uint8Array.from([0xed, 0x95, 0x9c, 0xea, 0xb8, 0x80]))).toBe("한글");
  });

  it("빈 문자열", () => {
    expect(encodeUtf8("").length).toBe(0);
    expect(decodeUtf8(new Uint8Array(0))).toBe("");
  });
});
