import { describe, expect, it } from "vitest";
import { buildMonacoTheme, readThemeTokens, THEME_TOKEN_NAMES, toHex, withAlpha, type ThemeTokens } from "./themeColors";

// 이 파일의 색 리터럴은 변환 검사용 입력값이다 (color-literal-ok)

describe("toHex", () => {
  it("짧은 hex 를 늘리고 소문자로 맞춘다", () => {
    expect(toHex("#abc")).toBe("#aabbcc"); // color-literal-ok 검사용 입력
    expect(toHex("#ABCD")).toBe("#aabbccdd"); // color-literal-ok 검사용 입력
    expect(toHex(" #1B1D21 ")).toBe("#1b1d21"); // color-literal-ok 검사용 입력
    expect(toHex("#1b1d2180")).toBe("#1b1d2180"); // color-literal-ok 검사용 입력
  });

  it("rgb 와 rgba 함수 꼴을 받는다", () => {
    expect(toHex("rgb(27, 29, 33)")).toBe("#1b1d21"); // color-literal-ok 검사용 입력
    expect(toHex("rgba(0, 0, 0, 0.5)")).toBe("#00000080"); // color-literal-ok 검사용 입력
    expect(toHex("rgb(255 255 255 / 50%)")).toBe("#ffffff80"); // color-literal-ok 검사용 입력
  });

  it("모르는 꼴은 null", () => {
    expect(toHex("red")).toBeNull();
    expect(toHex("var(--fg)")).toBeNull();
    expect(toHex("#12345")).toBeNull(); // color-literal-ok 검사용 입력
    expect(toHex("#gggggg")).toBeNull();
    expect(toHex("")).toBeNull();
  });
});

describe("withAlpha", () => {
  it("알파를 얹거나 바꾼다", () => {
    expect(withAlpha("#1b1d21", 0.5)).toBe("#1b1d2180"); // color-literal-ok 검사용 입력
    expect(withAlpha("#1b1d21ff", 0)).toBe("#1b1d2100"); // color-literal-ok 검사용 입력
    expect(withAlpha("rgb(255, 255, 255)", 1)).toBe("#ffffffff"); // color-literal-ok 검사용 입력
    expect(withAlpha("nope", 0.5)).toBeNull();
  });
});

describe("readThemeTokens", () => {
  it("토큰 이름마다 읽고 빈 것은 뺀다", () => {
    const values: Record<string, string> = { "--bg-panel": " #22252a ", "--fg": "#e4e7eb", "--accent": "" }; // color-literal-ok 검사용 입력
    const tokens = readThemeTokens({ getPropertyValue: (name) => values[name] ?? "" });
    expect(tokens).toEqual({ "bg-panel": "#22252a", fg: "#e4e7eb" }); // color-literal-ok 검사용 입력
    expect(THEME_TOKEN_NAMES).toContain("bg-selection");
  });
});

describe("buildMonacoTheme", () => {
  const tokens: ThemeTokens = {
    "bg-panel": "#22252a", // color-literal-ok 검사용 입력
    fg: "#e4e7eb", // color-literal-ok 검사용 입력
    accent: "#4a8fe7", // color-literal-ok 검사용 입력
    "bg-selection": "rgb(45, 74, 114)", // color-literal-ok 검사용 입력
    "fg-muted": "#9aa3ad", // color-literal-ok 검사용 입력
  };

  it("배경과 글자와 선택 색을 토큰에서 옮기고, 규칙의 색은 # 없이 적는다", () => {
    const theme = buildMonacoTheme("vs-dark", tokens);
    expect(theme.base).toBe("vs-dark");
    expect(theme.inherit).toBe(true);
    expect(theme.colors["editor.background"]).toBe("#22252a"); // color-literal-ok 검사용 입력
    expect(theme.colors["editor.foreground"]).toBe("#e4e7eb"); // color-literal-ok 검사용 입력
    expect(theme.colors["editor.selectionBackground"]).toBe("#2d4a72"); // color-literal-ok 검사용 입력
    expect(theme.colors["editor.inactiveSelectionBackground"]).toBe("#2d4a7299"); // color-literal-ok 검사용 입력
    expect(theme.colors["editorCursor.foreground"]).toBe("#4a8fe7"); // color-literal-ok 검사용 입력
    const keyword = theme.rules.find((r) => r.token === "keyword")!;
    expect(keyword.foreground).toBe("4a8fe7");
    const comment = theme.rules.find((r) => r.token === "comment")!;
    expect(comment.foreground).toBe("9aa3ad");
    expect(comment.fontStyle).toBe("italic");
  });

  it("없는 토큰의 항목은 빠져서 Monaco 기본값이 남는다", () => {
    const theme = buildMonacoTheme("vs", { fg: "#1f2328" }); // color-literal-ok 검사용 입력
    expect(theme.colors["editor.foreground"]).toBe("#1f2328"); // color-literal-ok 검사용 입력
    expect(theme.colors["editor.background"]).toBeUndefined();
    expect(theme.rules.find((r) => r.token === "keyword")).toBeUndefined();
    expect(theme.rules.find((r) => r.token === "identifier")!.foreground).toBe("1f2328");
    expect(buildMonacoTheme("vs", {}).rules).toEqual([]);
    expect(buildMonacoTheme("vs", {}).colors).toEqual({});
  });

  it("토큰 값이 색이 아니면 그 항목만 뺀다", () => {
    const theme = buildMonacoTheme("vs-dark", { "bg-panel": "var(--x)", fg: "#fff" }); // color-literal-ok 검사용 입력
    expect(theme.colors["editor.background"]).toBeUndefined();
    expect(theme.colors["editor.foreground"]).toBe("#ffffff"); // color-literal-ok 검사용 입력
  });
});
