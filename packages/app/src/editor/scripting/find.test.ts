import { MemoryBackend } from "@initial-editor/core";
import { describe, expect, it } from "vitest";
import { compileQuery, escapeRegExp, FindStore, isSearchableEntry, looksBinary, matchLines } from "./find";

describe("compileQuery 와 matchLines", () => {
  it("글자 그대로 찾고 특수 문자를 이스케이프한다", () => {
    expect(escapeRegExp("a.b*(c)")).toBe("a\\.b\\*\\(c\\)");
    const re = compileQuery("draw(", { caseSensitive: false, regex: false });
    expect(matchLines("x = draw(1)\ndraw(2) draw(3)", re)).toEqual([
      { line: 1, column: 5, length: 5, text: "x = draw(1)" },
      { line: 2, column: 1, length: 5, text: "draw(2) draw(3)" },
      { line: 2, column: 9, length: 5, text: "draw(2) draw(3)" },
    ]);
  });

  it("대소문자 옵션", () => {
    const text = "Init\ninit\nINIT";
    expect(matchLines(text, compileQuery("init", { caseSensitive: false, regex: false })).map((m) => m.line)).toEqual([1, 2, 3]);
    expect(matchLines(text, compileQuery("init", { caseSensitive: true, regex: false })).map((m) => m.line)).toEqual([2]);
  });

  it("정규식 옵션과 잘못된 정규식", () => {
    const re = compileQuery("function\\s+(\\w+)", { caseSensitive: true, regex: true });
    const matches = matchLines("function init()\nlocal function update(e)\n-- function", re);
    expect(matches.map((m) => [m.line, m.column, m.length])).toEqual([
      [1, 1, 13],
      [2, 7, 15],
    ]);
    expect(() => compileQuery("(", { caseSensitive: false, regex: true })).toThrow();
  });

  it("빈 매치는 무한 루프 없이 건너뛰고, CRLF 도 줄로 나눈다", () => {
    const re = compileQuery("a*", { caseSensitive: false, regex: true });
    expect(matchLines("b\r\naa\r\nc", re)).toEqual([{ line: 2, column: 1, length: 2, text: "aa" }]);
  });

  it("파일당 한도가 있다", () => {
    const re = compileQuery("x", { caseSensitive: false, regex: false });
    expect(matchLines("x".repeat(1000), re, 10)).toHaveLength(10);
  });
});

describe("isSearchableEntry 와 looksBinary", () => {
  it("폴더와 바이너리 확장자와 큰 파일은 거른다", () => {
    expect(isSearchableEntry({ name: "a.lua", path: "scripts/lua/a.lua", kind: "file", size: 10 })).toBe(true);
    expect(isSearchableEntry({ name: "lua", path: "scripts/lua", kind: "dir" })).toBe(false);
    expect(isSearchableEntry({ name: "a.png", path: "resources/images/a.png", kind: "file", size: 10 })).toBe(false);
    expect(isSearchableEntry({ name: "big.txt", path: "resources/big.txt", kind: "file", size: 3 * 1024 * 1024 })).toBe(false);
    expect(isSearchableEntry({ name: "noext", path: "resources/noext", kind: "file" })).toBe(true);
  });

  it("NUL 이 있으면 바이너리로 본다", () => {
    expect(looksBinary("hello\0world")).toBe(true);
    expect(looksBinary("한글 텍스트\n")).toBe(false);
  });
});

describe("FindStore", () => {
  async function store() {
    const backend = new MemoryBackend({
      "game.json": '{ "script": "lua" }',
      "scripts/lua/main.lua": "-- 진입점\nfunction init()\nend\n",
      "scripts/lua/games/flappy.lua": "function init()\n  print('init')\nend\n",
      "scripts/ruby/main.rb": "def init\nend\n",
      "resources/maps/sample.json": '{ "init": 1 }',
      "resources/images/init.png": new Uint8Array([0, 1, 2]),
      "README.md": "init 은 루트라 안 찾는다",
    });
    await backend.open("memory://t");
    return { backend, find: new FindStore({ backend: () => backend, isOpen: () => true }) };
  }

  it("scripts/ 와 resources/ 의 텍스트 파일에서 찾고 파일별로 묶는다 (바이너리와 루트 파일은 뺀다)", async () => {
    const { find } = await store();
    find.setQuery("init");
    await find.search();
    expect(find.running).toBe(false);
    expect(find.error).toBeNull();
    expect(find.results.map((f) => f.path)).toEqual(["scripts/lua/games/flappy.lua", "scripts/lua/main.lua", "scripts/ruby/main.rb", "resources/maps/sample.json"]);
    expect(find.matchCount).toBe(2 + 1 + 1 + 1);
    expect(find.results[1].matches[0]).toEqual({ line: 2, column: 10, length: 4, text: "function init()" });
    expect(find.lastQuery).toBe("init");
    expect(find.scanned).toBe(4);
  });

  it("빈 질의는 아무것도 하지 않고, 잘못된 정규식은 오류를 남긴다", async () => {
    const { find } = await store();
    find.setQuery("");
    await find.search();
    expect(find.results).toEqual([]);
    find.setQuery("(");
    find.setRegex(true);
    await find.search();
    expect(find.error).toMatch(/정규식/);
    expect(find.results).toEqual([]);
  });

  it("clear 는 결과를 비운다", async () => {
    const { find } = await store();
    find.setQuery("init");
    await find.search();
    expect(find.results.length).toBeGreaterThan(0);
    find.clear();
    expect(find.results).toEqual([]);
    expect(find.lastQuery).toBe("");
  });

  it("프로젝트가 닫혀 있으면 찾지 않는다", async () => {
    const { backend } = await store();
    const find = new FindStore({ backend: () => backend, isOpen: () => false });
    find.setQuery("init");
    await find.search();
    expect(find.results).toEqual([]);
    expect(find.running).toBe(false);
  });
});
