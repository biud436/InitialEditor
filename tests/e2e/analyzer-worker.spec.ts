// 분석기 워커 e2e (docs/plans/language-server.md 8절 단계 2). 브라우저판(메모리 모드)에서 Lua 는 luaparse, Ruby 는 Prism 워커가 붙는다.
// 흐름: 상태 표시, 구문 오류 마커와 고친 뒤 사라짐, 다른 파일의 정의로 가기(F12, 프로젝트 색인), 문서 기호(Ctrl+Shift+O),
//       엔진 API 완성은 명세 공급자에서 그대로 오고, 지금 문서의 이름과 다른 파일의 모듈과 클래스 이름이 더해진다.

import { expect, test, type Page } from "@playwright/test";

const CODE = ".monaco-editor .view-lines";

type EditorWindow = {
  initialEditor: {
    backend: { writeText(p: string, t: string): Promise<void> };
    scripting: {
      openScript(p: string, line?: number, column?: number): Promise<unknown>;
      activeScript: { path: string; text: string; reveal(line: number, column: number): void } | null;
      languageServer: { binding: { diagnosticsFor(p: string): Array<{ source?: string; message: string }> } | null };
      rubyServer: { binding: { diagnosticsFor(p: string): Array<{ source?: string; message: string }> } | null };
    };
  };
};

const FILES: Record<string, string> = {
  "scripts/ruby/components/util.rb": ["module Util", "  def self.clamp(v, lo, hi)", "    [[v, lo].max, hi].min", "  end", "end", ""].join("\n"),
  "scripts/ruby/components/mover.rb": ["class Mover", "  def update(elapsed)", "    @x = Util.clamp(@x + elapsed, 0, 100)", "  end", "end", ""].join("\n"),
  "scripts/lua/components/util.lua": ["local M = {}", "function M.clamp(v, lo, hi)", "  return math.min(math.max(v, lo), hi)", "end", "return M", ""].join("\n"),
  "scripts/lua/components/mover.lua": ['local Util = require("scripts/lua/components/util")', "local M = {}", "function M.update(obj, scene, elapsed)", "  obj.x = Util.clamp(obj.x + elapsed, 0, 100)", "end", "local function wrap(v) return v % 100 end", "return M", ""].join("\n"),
};

async function openSample(page: Page) {
  await page.goto("/?backend=memory&sample=meadow");
  await page.evaluate(() => localStorage.removeItem("initial-editor.layout"));
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
  // 워커는 프로젝트를 연 뒤 첫 스크립트에서 작업 공간을 읽으므로 파일을 먼저 쓴다
  await page.evaluate(async (files) => {
    const editor = (window as unknown as EditorWindow).initialEditor;
    for (const [p, t] of Object.entries(files)) await editor.backend.writeText(p, t);
  }, FILES);
}

async function open(page: Page, path: string, line = 1, column = 1) {
  await page.evaluate(([p, l, c]) => (window as unknown as EditorWindow).initialEditor.scripting.openScript(p as string, l as number, c as number), [path, line, column] as const);
  await expect.poll(() => page.evaluate(() => (window as unknown as EditorWindow).initialEditor.scripting.activeScript?.path)).toBe(path);
}

function diagnostics(page: Page, language: "lua" | "ruby", path: string) {
  return page.evaluate(
    ([lang, p]) => {
      const s = (window as unknown as EditorWindow).initialEditor.scripting;
      return (lang === "lua" ? s.languageServer : s.rubyServer).binding?.diagnosticsFor(p).map((d) => d.source ?? "") ?? null;
    },
    [language, path] as const,
  );
}

test.describe("분석기 워커 (브라우저판)", () => {
  test("Ruby: Prism 구문 오류, 다른 파일의 모듈 이름 완성과 정의, 문서 기호", async ({ page }) => {
    await openSample(page);
    await open(page, "scripts/ruby/components/mover.rb");
    const status = page.getByTestId("status-lsp-ruby");
    await expect(status).toHaveAttribute("data-state", "running", { timeout: 30_000 });
    await expect(status).toHaveText("Ruby 분석기 1.9.0");
    await expect.poll(() => diagnostics(page, "ruby", "scripts/ruby/components/mover.rb")).toEqual([]);

    // 구문 오류: end 를 지우면 prism 마커가 뜨고, 되돌리면 사라진다
    await page.locator(CODE).click();
    await page.evaluate(() => (window as unknown as EditorWindow).initialEditor.scripting.activeScript?.reveal(5, 1));
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("Backspace");
    await expect.poll(() => diagnostics(page, "ruby", "scripts/ruby/components/mover.rb"), { timeout: 10_000 }).toContain("prism");
    await expect(page.locator(".monaco-editor .squiggly-error").first()).toBeVisible();
    await page.keyboard.type("end");
    await expect.poll(() => diagnostics(page, "ruby", "scripts/ruby/components/mover.rb"), { timeout: 10_000 }).toEqual([]);

    // 완성: 다른 파일의 모듈 이름(Util)
    await page.keyboard.type("\nUti");
    const suggest = page.locator(".monaco-editor .suggest-widget");
    await expect(suggest.locator(".monaco-list-row", { hasText: /^Util/ })).toHaveCount(1, { timeout: 10_000 });
    await page.keyboard.press("Escape");
    for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");

    // 정의로 가기: Util.clamp 의 clamp 에서 F12 → util.rb
    await page.evaluate(() => (window as unknown as EditorWindow).initialEditor.scripting.activeScript?.reveal(3, 18));
    await page.keyboard.press("F12");
    await expect.poll(() => page.evaluate(() => (window as unknown as EditorWindow).initialEditor.scripting.activeScript?.path), { timeout: 10_000 }).toBe("scripts/ruby/components/util.rb");

    // 문서 기호: 기호로 이동(맥은 Cmd+Shift+O, 그 밖은 Ctrl+Shift+O)에 module 과 self 메서드. 헤드리스 브라우저는 Monaco 가 맥으로 보지 않아
    // 키가 실행 환경마다 달라서 액션을 직접 부른다
    await page.evaluate(() => (window as unknown as { initialEditor: { scripting: { activeScript: { runAction(id: string): boolean } } } }).initialEditor.scripting.activeScript.runAction("editor.action.quickOutline"));
    const quick = page.locator(".quick-input-widget");
    await expect(quick).toBeVisible();
    await expect(quick.locator(".monaco-list-row")).toHaveText([/Util/, /self\.clamp/]);
    await page.keyboard.press("Escape");
  });

  test("Lua: luaparse 구문 오류, 다른 파일의 정의, 명세 완성과 문서의 이름", async ({ page }) => {
    await openSample(page);
    await open(page, "scripts/lua/components/mover.lua");
    const status = page.getByTestId("status-lsp-lua");
    await expect(status).toHaveAttribute("data-state", "running", { timeout: 30_000 });
    await expect(status).toHaveText("Lua 분석기 0.3.1");

    await page.locator(CODE).click();
    await page.evaluate(() => (window as unknown as EditorWindow).initialEditor.scripting.activeScript?.reveal(5, 1));
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("Backspace");
    await expect.poll(() => diagnostics(page, "lua", "scripts/lua/components/mover.lua"), { timeout: 10_000 }).toEqual(["luaparse"]);
    await page.keyboard.type("end");
    await expect.poll(() => diagnostics(page, "lua", "scripts/lua/components/mover.lua"), { timeout: 10_000 }).toEqual([]);

    // 완성: 엔진 API(명세 공급자)와 지금 문서의 이름(워커)이 한 목록에
    await page.evaluate(() => (window as unknown as EditorWindow).initialEditor.scripting.activeScript?.reveal(4, 46));
    await page.keyboard.type("\n  ");
    await page.keyboard.type("Inpu");
    const suggest = page.locator(".monaco-editor .suggest-widget");
    await expect(suggest).toBeVisible();
    await expect(suggest).toContainText("Input");
    await page.keyboard.press("Escape");
    for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
    await page.keyboard.type("wra");
    await expect(suggest.locator(".monaco-list-row", { hasText: /^wrap/ })).toHaveCount(1, { timeout: 10_000 });
    await page.keyboard.press("Escape");
    for (let i = 0; i < 3 + 3; i++) await page.keyboard.press("Backspace");

    // 정의로 가기: Util.clamp → util.lua
    await page.evaluate(() => (window as unknown as EditorWindow).initialEditor.scripting.activeScript?.reveal(4, 19));
    await page.keyboard.press("F12");
    await expect.poll(() => page.evaluate(() => (window as unknown as EditorWindow).initialEditor.scripting.activeScript?.path), { timeout: 10_000 }).toBe("scripts/lua/components/util.lua");
  });
});
