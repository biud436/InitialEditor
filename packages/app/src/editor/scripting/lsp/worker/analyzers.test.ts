import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ByteLines, flattenSymbols, wordAt, type Analyzer } from "./analysis";
import { analyzeLua } from "./luaAnalyzer";
import { createRubyAnalyzer, loadPrism } from "./rubyAnalyzer";

const TEMPLATES = fileURLToPath(new URL("../../../../../templates/", import.meta.url));
const PRISM_WASM = fileURLToPath(new URL("../../../../../../../node_modules/@ruby/prism/src/prism.wasm", import.meta.url));

function filesUnder(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

describe("ByteLines 와 wordAt", () => {
  it("UTF-8 바이트 위치를 줄과 UTF-16 열로 (한글 3바이트, 이모지 4바이트에 UTF-16 두 칸)", () => {
    const text = "a = 1\n한글 = 2 😀 x\n";
    const lines = new ByteLines(text);
    expect(lines.position(0)).toEqual({ line: 0, character: 0 });
    expect(lines.position(6)).toEqual({ line: 1, character: 0 });
    expect(lines.position(6 + 6)).toEqual({ line: 1, character: 2 });
    // "한글 = 2 " 는 11바이트(UTF-16 7칸), 이모지 4바이트(2칸)와 공백 뒤의 x
    expect(lines.position(6 + 11 + 4 + 1)).toEqual({ line: 1, character: 10 });
    expect(lines.range(6, 6)).toEqual({ start: { line: 1, character: 0 }, end: { line: 1, character: 2 } });
  });

  it("낱말과 받는 쪽 (Ruby 의 ? 끝 포함)", () => {
    expect(wordAt("  Util.add(1)", { line: 0, character: 8 })).toMatchObject({ word: "add", receiver: "Util" });
    expect(wordAt("Input.trigger?(:a)", { line: 0, character: 8 })).toMatchObject({ word: "trigger?", receiver: "Input" });
    expect(wordAt("Keys::SPACE", { line: 0, character: 7 })).toMatchObject({ word: "SPACE", receiver: "Keys" });
    expect(wordAt("foo", { line: 0, character: 3 })).toMatchObject({ word: "foo", receiver: null });
    expect(wordAt("  ", { line: 0, character: 1 })).toBeNull();
  });
});

describe("Lua 분석기 (luaparse)", () => {
  it("함수 선언과 함수를 담는 대입을 기호로 (메서드, 블록 안, 중첩)", () => {
    const { diagnostics, symbols } = analyzeLua(
      ["local M = {}", "function M.add(a, b) return a + b end", "function M:draw()", "  local function helper() end", "end", "local f = function() end", "M.g = function() end", "if x then function Init() end end", "return M"].join("\n"),
    );
    expect(diagnostics).toEqual([]);
    expect(symbols.map((s) => [s.name, s.key, s.kind])).toEqual([
      ["M.add", "add", 12],
      ["M:draw", "draw", 6],
      ["f", "f", 12],
      ["M.g", "g", 12],
      ["Init", "Init", 12],
    ]);
    expect(symbols[1].children.map((s) => s.name)).toEqual(["helper"]);
    expect(symbols[0].selectionRange).toEqual({ start: { line: 1, character: 11 }, end: { line: 1, character: 14 } });
  });

  it("구문 오류는 처음 하나를 그 자리의 낱말 범위로", () => {
    const { diagnostics, symbols } = analyzeLua("function Update(elapsed)\n  if elapsed > 1 then\nend\n");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ severity: 1, source: "luaparse" });
    expect(diagnostics[0].message).not.toMatch(/^\[/);
    expect(symbols).toEqual([]);
    const bad = analyzeLua("local x = = 1");
    expect(bad.diagnostics[0].range.start).toEqual({ line: 0, character: 10 });
  });

  it("Lua 5.3 문법이라 5.4 의 <const> 는 오류다", () => {
    expect(analyzeLua("local x <const> = 1").diagnostics).toHaveLength(1);
    expect(analyzeLua("local x = 1 // 2 | 3").diagnostics).toEqual([]);
  });

  it("템플릿의 Lua 스크립트는 전부 오류 없이 읽힌다", () => {
    const files = filesUnder(path.join(TEMPLATES, "scripts", "lua"), ".lua");
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) expect(analyzeLua(fs.readFileSync(f, "utf8")).diagnostics, f).toEqual([]);
  });
});

describe("Ruby 분석기 (Prism)", () => {
  let ruby: Analyzer;
  beforeAll(async () => {
    ruby = createRubyAnalyzer(await loadPrism(fs.readFileSync(PRISM_WASM)));
  });

  it("module, class, def, def self, class << self, 상수를 기호로", () => {
    const { diagnostics, symbols } = ruby.analyze(
      ["module Components", "  LIMIT = 3", "  class Bird", "    def initialize(params = {}); end", "    def self.load(path) = new", "    class << self", "      def make; end", "    end", "  end", "end", "def init; end"].join("\n"),
    );
    expect(diagnostics).toEqual([]);
    expect(symbols.map((s) => [s.name, s.kind])).toEqual([
      ["Components", 2],
      ["init", 6],
    ]);
    const mod = symbols[0];
    expect(mod.children.map((s) => [s.name, s.kind])).toEqual([
      ["LIMIT", 14],
      ["Bird", 5],
    ]);
    expect(mod.children[1].children.map((s) => [s.name, s.key])).toEqual([
      ["initialize", "initialize"],
      ["self.load", "load"],
      ["self.make", "make"],
    ]);
    expect(flattenSymbols(symbols)).toHaveLength(7);
    expect(mod.children[1].children[0].selectionRange).toEqual({ start: { line: 3, character: 8 }, end: { line: 3, character: 18 } });
  });

  it("구문 오류는 여럿이고, 한글 뒤의 위치도 UTF-16 열이다", () => {
    const { diagnostics } = ruby.analyze('puts "한글"; def foo(a\n  puts a\nend\n');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]).toMatchObject({ severity: 1, source: "prism" });
    expect(diagnostics[0].range.start.line).toBeLessThanOrEqual(1);
    const korean = ruby.analyze('x = "한글한글"\nclass\n');
    expect(korean.diagnostics[0].range.start.line).toBe(1);
  });

  it("템플릿의 Ruby 스크립트는 전부 오류 없이 읽힌다", () => {
    const files = filesUnder(path.join(TEMPLATES, "scripts", "ruby"), ".rb");
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) expect(ruby.analyze(fs.readFileSync(f, "utf8")).diagnostics, f).toEqual([]);
  });
});
