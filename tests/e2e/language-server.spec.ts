// Lua 언어 서버 e2e (docs/plans/language-server.md 7절). 메모리 백엔드의 에디터에 시험 프로세스가 띄운 진짜 LuaLS 를 잇는다:
// 데스크톱 앱의 셸(lsp.rs)이 하는 일(프로세스와 Content-Length 머리)을 시험 쪽이 하고, 에디터는 ServerLauncher 하나만 바뀐다.
// 메모리 프로젝트의 파일을 같은 상대 경로로 디스크의 임시 폴더에도 써서 서버가 작업 공간으로 읽게 한다.
// 흐름: 상태 표시, 진단 마커와 표시 범위, Sprite. 뒤의 완성(서버의 것, 명세 공급자와 겹치지 않음), 씬 계약 스니펫,
//       F12 로 다른 파일의 정의 열기, F2 로 두 파일의 이름 바꾸기, 프로젝트를 닫으면 서버도 끝난다.
// LuaLS 는 yarn luals:fetch 가 받은 src-tauri/luals 또는 INITIAL_EDITOR_LUALS. CI 가 아니면 없을 때 건너뛴다.

import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { LUALS_MISSING, lualsExe, NodeLuals, writeProject } from "../luals/support.ts";

const CODE = ".monaco-editor .view-lines";
const exe = lualsExe();

const UTIL = ["local M = {}", "", "--- 두 수를 더한다", "---@param a number", "---@param b number", "---@return number", "function M.add(a, b)", "  return a + b", "end", "", "return M", ""].join("\n");
const MAIN = [
  'local Util = require("scripts/lua/lsp/util")',
  "",
  "function Initialize()",
  '  DrawTxt(1, 2, "x")',
  "  local total = Util.add(1, 2)",
  "  print(total)",
  "end",
  "",
].join("\n");
const FILES = { "scripts/lua/lsp/util.lua": UTIL, "scripts/lua/lsp/main.lua": MAIN };

type EditorWindow = {
  initialEditor: {
    backend: { writeText(p: string, t: string): Promise<void>; readText(p: string): Promise<string> };
    scripting: {
      openScript(p: string, line?: number, column?: number): Promise<unknown>;
      activeScript: { path: string; text: string; reveal(line: number, column: number): void; dirty: boolean } | null;
      languageServer: { state: string; setLauncher(l: unknown): Promise<void>; binding: { diagnosticsFor(p: string): Array<{ code?: unknown; severity?: number }> } | null };
    };
    settings: { update(patch: Record<string, unknown>): void };
    documents: { findByPath(p: string): { dirty: boolean; text: string } | undefined };
    closeProject(): Promise<boolean>;
  };
  __lspReceive?: (text: string) => void;
  __lspClose?: (reason: string) => void;
};

/** 시험 프로세스의 LuaLS 를 페이지의 ServerLauncher 로 잇는다. 서버의 메시지는 차례대로 넘긴다 */
async function connect(page: Page, root: string): Promise<{ server: () => NodeLuals | null }> {
  let server: NodeLuals | null = null;
  let chain = Promise.resolve();
  await page.exposeFunction("__lspStart", async (library: string | null) => {
    server?.close();
    server = new NodeLuals(exe!, root);
    const s = server;
    s.onMessage((text) => {
      chain = chain.then(() => page.evaluate((t) => (window as unknown as EditorWindow).__lspReceive?.(t), text).catch(() => {}));
    });
    s.onClose((reason) => {
      chain = chain.then(() => page.evaluate((r) => (window as unknown as EditorWindow).__lspClose?.(r), reason).catch(() => {}));
    });
    if (library === null) return null;
    const file = path.join(s.work, "library", "initial2d.lua");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, library);
    return file;
  });
  await page.exposeFunction("__lspSend", (text: string) => server?.send(text));
  await page.exposeFunction("__lspStop", () => server?.close());
  await page.evaluate(async (root) => {
    const w = window as unknown as EditorWindow & { __lspStart(lib: string | null): Promise<string | null>; __lspSend(t: string): void; __lspStop(): void };
    await w.initialEditor.scripting.languageServer.setLauncher({
      available: async () => ({ version: "e2e" }),
      launch: async (_projectRoot: string, library: string | undefined) => {
        const libraryPath = await w.__lspStart(library ?? null);
        const messages = new Set<(t: string) => void>();
        const closes = new Set<(r: string) => void>();
        w.__lspReceive = (t) => messages.forEach((l) => l(t));
        w.__lspClose = (r) => closes.forEach((l) => l(r));
        return {
          root,
          library: libraryPath,
          version: "e2e",
          transport: {
            send: (t: string) => w.__lspSend(t),
            onMessage: (l: (t: string) => void) => (messages.add(l), () => messages.delete(l)),
            onClose: (l: (r: string) => void) => (closes.add(l), () => closes.delete(l)),
            close: () => w.__lspStop(),
          },
        };
      },
    });
  }, root);
  return { server: () => server };
}

async function openSample(page: Page): Promise<string> {
  await page.goto("/?backend=memory&sample=meadow");
  await page.evaluate(() => localStorage.removeItem("initial-editor.layout"));
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
  await page.evaluate(async (files) => {
    const editor = (window as unknown as EditorWindow).initialEditor;
    for (const [p, t] of Object.entries(files)) await editor.backend.writeText(p, t);
  }, FILES);
  return writeProject(FILES);
}

async function goTo(page: Page, line: number, column: number) {
  await page.evaluate(([l, c]) => (window as unknown as EditorWindow).initialEditor.scripting.activeScript?.reveal(l, c), [line, column]);
}

function lspState(page: Page) {
  return page.getByTestId("status-lsp");
}

test.describe("Lua 언어 서버", () => {
  test.skip(!exe && !process.env.CI, LUALS_MISSING);
  test.setTimeout(120_000);

  test("진단, 완성, 정의로 이동, 이름 바꾸기를 서버가 처리한다", async ({ page }) => {
    expect(exe, LUALS_MISSING).toBeTruthy();
    const root = await openSample(page);
    const link = await connect(page, root);
    try {
      await expect(lspState(page)).toHaveAttribute("data-state", "idle");
      await page.evaluate(() => (window as unknown as EditorWindow).initialEditor.scripting.openScript("scripts/lua/lsp/main.lua"));
      await expect(page.locator(CODE)).toContainText("Util.add");
      await expect(lspState(page)).toHaveAttribute("data-state", "running", { timeout: 60_000 });
      await expect(lspState(page)).toHaveText("LuaLS e2e");

      // 진단: DrawTxt 는 정의되지 않은 전역 (프로젝트에 스텁이 없어 앱에 든 스텁을 library 로 준다. DrawText 와 Util 은 안다)
      const diagnostics = () =>
        page.evaluate(() => (window as unknown as EditorWindow).initialEditor.scripting.languageServer.binding?.diagnosticsFor("scripts/lua/lsp/main.lua").map((d) => `${String(d.code)}:${d.severity}`) ?? []);
      await expect.poll(diagnostics, { timeout: 60_000 }).toContain("undefined-global:2");
      await expect(page.locator(".monaco-editor .squiggly-warning").first()).toBeVisible();
      // 표시 범위: 구문 오류만이면 경고 마커가 사라지고, 다시 규칙 전체로
      await page.evaluate(() => (window as unknown as EditorWindow).initialEditor.settings.update({ scriptDiagnostics: "syntax" }));
      await expect(page.locator(".monaco-editor .squiggly-warning")).toHaveCount(0);
      await page.evaluate(() => (window as unknown as EditorWindow).initialEditor.settings.update({ scriptDiagnostics: "rules" }));
      await expect(page.locator(".monaco-editor .squiggly-warning").first()).toBeVisible();

      // 완성: 서버의 Sprite 멤버. 명세 공급자는 씬 계약 스니펫만 남아 같은 이름이 두 번 나오지 않는다
      await page.locator(CODE).click();
      await goTo(page, 6, 15);
      await page.keyboard.type("\nSprite.");
      const suggest = page.locator(".monaco-editor .suggest-widget");
      await expect(suggest).toBeVisible({ timeout: 30_000 });
      await page.keyboard.type("SetPo");
      // LuaLS 의 항목은 인자까지 적힌 이름이고 핸들을 첫 인자로 받는다. 명세 공급자의 SetPosition 은 없다
      await expect(suggest.locator(".monaco-list-row").filter({ hasText: /^SetPosition/ })).toHaveText([/^SetPosition\(handle, x, y\)/]);
      await page.keyboard.press("Escape");
      for (let i = 0; i < "Sprite.SetPo".length; i++) await page.keyboard.press("Backspace");
      await page.keyboard.press("Shift+Home");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      await expect.poll(() => page.evaluate(() => (window as unknown as EditorWindow).initialEditor.scripting.activeScript?.text)).toBe(MAIN);

      // 씬 계약 스니펫은 남는다 (Update 는 아직 정의하지 않았다)
      await goTo(page, 8, 1);
      await page.keyboard.type("Upda");
      await expect(page.locator(".monaco-editor .suggest-widget .monaco-list-row", { has: page.locator(".codicon-symbol-snippet") }).filter({ hasText: /^Update\b/ })).toHaveCount(1);
      await page.keyboard.press("Escape");
      for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");

      // 정의로 이동: Util.add 의 add 에서 F12 를 누르면 util.lua 탭이 열리고 그 함수에 간다
      await goTo(page, 5, 22);
      await page.keyboard.press("F12");
      await expect(page.getByTestId("doc-tab").filter({ hasText: "util.lua" })).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => page.evaluate(() => (window as unknown as EditorWindow).initialEditor.scripting.activeScript?.path)).toBe("scripts/lua/lsp/util.lua");

      // 이름 바꾸기: 다시 main.lua 에서 F2 로 add 를 sum 으로. 두 파일이 바뀌고 저장하지 않은 상태다
      await page.evaluate(() => (window as unknown as EditorWindow).initialEditor.scripting.openScript("scripts/lua/lsp/main.lua", 5, 22));
      await page.keyboard.press("F2");
      const rename = page.locator(".monaco-editor .rename-box input");
      await expect(rename).toBeVisible({ timeout: 30_000 });
      await rename.fill("sum");
      await rename.press("Enter");
      const texts = () =>
        page.evaluate(() => {
          const docs = (window as unknown as EditorWindow).initialEditor.documents;
          const main = docs.findByPath("scripts/lua/lsp/main.lua");
          const util = docs.findByPath("scripts/lua/lsp/util.lua");
          return [main?.text.includes("Util.sum(1, 2)"), util?.text.includes("function M.sum(a, b)"), main?.dirty, util?.dirty];
        });
      await expect.poll(texts, { timeout: 30_000 }).toEqual([true, true, true, true]);

      // 프로젝트를 닫으면 서버도 끝나고 상태는 대기로 돌아간다 (저장하지 않은 두 문서는 확인 뒤 버린다)
      const closing = page.evaluate(() => (window as unknown as EditorWindow).initialEditor.closeProject());
      await page.getByRole("dialog").getByRole("button", { name: "닫기", exact: true }).click();
      expect(await closing).toBe(true);
      await expect(lspState(page)).toHaveAttribute("data-state", "idle");
      await expect.poll(() => link.server()?.child.exitCode !== null || link.server()?.child.signalCode !== null, { timeout: 10_000 }).toBe(true);
    } finally {
      link.server()?.cleanup();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
