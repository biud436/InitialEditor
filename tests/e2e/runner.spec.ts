// 실행기의 브라우저 판 (docs/plans/e1-scripting.md 마일스톤 3). 메모리 백엔드(?backend=memory)라 엔진을 띄우지는 못한다.
// 실행 버튼이 비활성이고 툴팁에 이유가 있는 것은 smoke.spec.ts 가 본다. 여기서는 상태 바의 엔진 칸, 콘솔의 오류 링크,
// "엔진만" 필터, 브라우저 모드의 수동 리로드를 본다. 진짜 엔진과의 핫 리로드는 scripts/e2e-engine-hotreload.mjs (yarn test:engine).

import { expect, test, type Page } from "@playwright/test";

const LAYOUT_KEY = "initial-editor.layout";

interface DebugWindow {
  initialEditor: { log: { append(level: string, source: string, text: string): void } };
}

async function openSample(page: Page) {
  await page.goto("/?backend=memory");
  await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
}

async function appendLog(page: Page, level: string, source: string, text: string) {
  await page.evaluate(
    ([l, s, t]) => (window as unknown as DebugWindow).initialEditor.log.append(l, s, t),
    [level, source, text],
  );
}

test.describe("실행기 (메모리 모드)", () => {
  test("상태 바의 엔진 칸은 없음이고 이유가 툴팁에 있다", async ({ page }) => {
    await page.goto("/?backend=memory");
    const engine = page.getByTestId("status-engine");
    await expect(engine).toHaveText("엔진: 없음");
    await expect(engine).toHaveAttribute("title", /브라우저 모드에서는 엔진을 띄울 수 없다/);
    // 프로젝트를 열어도 브라우저 모드에서는 그대로다
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("statusbar")).toContainText("memory://sample");
    await expect(engine).toHaveText("엔진: 없음");
    await expect(page.getByTestId("console-list")).toContainText("브라우저 모드에서는 엔진을 띄울 수 없다");
    // 정지와 현재 씬부터 실행도 꺼져 있다
    const toolbar = page.getByTestId("toolbar");
    await expect(toolbar.locator('[data-command="run.stop"]')).toBeDisabled();
    await expect(toolbar.getByTestId("toolbar-running")).toHaveCount(0);
  });

  test("콘솔의 오류 줄을 누르면 그 파일이 열린다", async ({ page }) => {
    await openSample(page);
    await appendLog(page, "error", "engine", "scripts/lua/main.lua:3: attempt to call a nil value");
    const link = page.getByTestId("console-link");
    await expect(link).toHaveText("scripts/lua/main.lua:3");
    await expect(link).toHaveAttribute("data-path", "scripts/lua/main.lua");
    await expect(link).toHaveAttribute("data-line", "3");
    await link.click();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "main.lua" })).toBeVisible();
  });

  test("Ruby 백트레이스와 PANIC 줄도 링크가 되고 오류 색이다", async ({ page }) => {
    await openSample(page);
    await appendLog(page, "error", "engine", "\t[1] scripts/ruby/main.rb:8:in update");
    await appendLog(page, "error", "engine", "PANIC: unprotected error in call to Lua API (./scripts/lua/main.lua:3: attempt to index a nil value (local 't'))");
    const links = page.getByTestId("console-link");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute("data-path", "scripts/ruby/main.rb");
    await expect(links.nth(1)).toHaveText("./scripts/lua/main.lua:3");
    await expect(page.locator(".console-row.level-error.source-engine")).toHaveCount(2);
    await links.nth(0).click();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "main.rb" })).toBeVisible();
  });

  test("엔진만 필터는 엔진과 실행기 줄만 남긴다", async ({ page }) => {
    await openSample(page);
    await appendLog(page, "info", "engine", "HotReload: reloaded with 3 files");
    const list = page.getByTestId("console-list");
    await expect(list).toContainText("프로젝트 열림");
    await page.getByTestId("console-engine-only").check();
    await expect(list).not.toContainText("프로젝트 열림");
    await expect(list).toContainText("HotReload: reloaded with 3 files");
    await page.getByTestId("console-engine-only").uncheck();
    await expect(list).toContainText("프로젝트 열림");
  });

  test("브라우저 모드의 수동 리로드는 백엔드로 push 하고 결과를 콘솔에 적는다", async ({ page }) => {
    await openSample(page);
    const reload = page.getByTestId("toolbar").locator('[data-command="run.reload"]');
    await expect(reload).toBeEnabled();
    await reload.click();
    await expect(page.getByTestId("console-list")).toContainText(/핫 리로드: \d+개 파일을 보냈다/);
  });
});
