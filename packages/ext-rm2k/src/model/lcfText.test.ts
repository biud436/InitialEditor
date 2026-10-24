// 글 인코딩 짐작: 맵 이름과 ChipSet 이름의 바이트로 코드 페이지를 고른다. 바이트는 Python 의 str.encode 로 만든 것이다.
import { describe, expect, it } from "vitest";
import { ASCII_ENCODING, decodeLcfText, guessEncoding } from "./lcfText";

const b = (bytes: number[]) => new Uint8Array(bytes);
const SJIS = {
  village: b([130, 205, 130, 182, 130, 220, 130, 232, 130, 204, 145, 186]), // はじまりの村
  house: b([131, 113, 131, 141, 131, 67, 131, 147, 130, 204, 137, 198]), // ヒロインの家
  cave: b([142, 110, 130, 220, 130, 232, 130, 204, 147, 180, 140, 65]), // 始まりの洞窟
};
const CP949 = {
  village: b([189, 195, 192, 219, 192, 199, 32, 184, 182, 192, 187]), // 시작의 마을
  house: b([193, 214, 192, 206, 176, 248, 192, 199, 32, 193, 253]), // 주인공의 집
};
const ascii = (s: string) => b([...s].map((c) => c.charCodeAt(0)));

describe("글 인코딩", () => {
  it("일본어 게임은 Shift_JIS, 한국어 게임은 CP949 로 고른다", () => {
    expect(guessEncoding([SJIS.village, SJIS.house, SJIS.cave, ascii("Exterior")])).toBe("shift_jis");
    expect(guessEncoding([CP949.village, CP949.house, ascii("Exterior")])).toBe("euc-kr");
    expect(decodeLcfText(SJIS.village, "shift_jis")).toBe("はじまりの村");
    expect(decodeLcfText(CP949.house, "euc-kr")).toBe("주인공의 집");
  });

  it("중국어 간체, 키릴 문자, 라틴 글자", () => {
    expect(guessEncoding([b([208, 194, 202, 214, 180, 229])])).toBe("gbk"); // 新手村
    expect(guessEncoding([b([196, 229, 240, 229, 226, 237, 255])])).toBe("windows-1251"); // Деревня
    expect(guessEncoding([b([67, 97, 102, 233])])).toBe("windows-1252"); // Café
  });

  it("모두 ASCII 면 windows-1252 다. 빈 글은 보지 않는다", () => {
    expect(guessEncoding([ascii("Town"), ascii("World"), b([])])).toBe(ASCII_ENCODING);
    expect(guessEncoding([])).toBe(ASCII_ENCODING);
  });

  it("RPG_RT.ini 의 Encoding 이 있으면 따른다", () => {
    const ini = ascii("[RPG_RT]\r\nGameTitle=Test\r\n[EasyRPG]\r\nEncoding=949\r\n");
    expect(guessEncoding([SJIS.village], ini)).toBe("euc-kr");
    expect(guessEncoding([SJIS.village], ascii("[RPG_RT]\r\nGameTitle=Test\r\n"))).toBe("shift_jis");
  });
});
