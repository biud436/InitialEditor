// 실행기의 브라우저 판 (docs/plans/e1-scripting.md 마일스톤 3). 메모리 백엔드(?backend=memory)라 엔진 프로세스는 못 띄우고
// F5 는 에디터 안 게임 탭에서 웹 엔진으로 돈다 (그 흐름은 game-view.spec.ts, 실행 버튼의 툴팁은 smoke.spec.ts).
// 여기서는 상태 바의 엔진 칸, 콘솔의 오류 링크, "엔진만" 필터, 메모리 모드의 수동 리로드(게임 탭이 돌 때만)를 본다.
// 진짜 엔진 프로세스와의 핫 리로드는 scripts/e2e-engine-hotreload.mjs (yarn test:engine).

import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

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
  test("상태 바의 엔진 칸은 에디터 안 대기이고 웹 엔진이 툴팁에 있다", async ({ page }) => {
    await page.goto("/?backend=memory");
    const engine = page.getByTestId("status-engine");
    await expect(engine).toHaveText("엔진 (에디터 안): 대기");
    await expect(engine).toHaveAttribute("title", /에디터 안 게임 탭에서 돈다 \(웹 엔진\)/);
    // 프로젝트를 열면 웹 엔진의 MANIFEST 를 읽어 기능과 커밋을 툴팁에 더한다
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("statusbar")).toContainText("memory://sample");
    await expect(engine).toHaveText("엔진 (에디터 안): 대기");
    const manifest = JSON.parse(readFileSync(path.resolve("packages/app/public/engine/MANIFEST.json"), "utf8")) as { features: string[]; engineCommit: string };
    await expect(engine).toHaveAttribute("title", new RegExp(`기능 ${manifest.features.join(" ")}, 엔진 커밋 ${manifest.engineCommit.slice(0, 7)}`));
    await expect(page.getByTestId("console-list")).toContainText("실행(F5)은 에디터 안 게임 탭에서 웹 엔진으로 돈다");
    // 실행 전이라 정지는 꺼져 있고 실행 표시도 없다
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

  test("메모리 모드의 수동 리로드는 게임 탭이 돌 때만 켜지고 에디터 안 엔진을 다시 읽는다 (밖에 엔진이 없다)", async ({ page }) => {
    await openSample(page);
    const reload = page.getByTestId("toolbar").locator('[data-command="run.reload"]');
    await expect(reload).toBeDisabled();
    await expect(page.getByTestId("toolbar").locator('span.toolbar-tip:has([data-command="run.reload"])')).toHaveAttribute("title", /게임 탭에서 실행 중일 때 다시 읽는다/);
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect(reload).toBeEnabled();
    await reload.click();
    await expect(page.getByTestId("console-list")).toContainText(/핫 리로드: 에디터 안 엔진, \d+개 파일을 다시 올렸다/);
    await expect(page.getByTestId("console-list")).not.toContainText("개 파일을 보냈다");
    await view.getByRole("button", { name: "정지" }).click();
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    await expect(reload).toBeDisabled();
  });
});
