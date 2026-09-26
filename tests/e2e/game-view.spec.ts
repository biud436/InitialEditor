// 게임 뷰 e2e (docs/plans/e4-embedded-play.md 마일스톤 1 ~ 4). 웹 엔진(packages/app/public/engine, yarn sync:engine-web)이
// 에디터의 게임 탭에서 돈다.
//   메모리 모드: 샘플 프로젝트의 main.lua 가 사각형을 칠하고 "sample:frame" 을 한 번 찍는다. F5 → 게임 탭과 canvas →
//               콘솔의 줄 → canvas 의 픽셀 → main.lua 를 고쳐 저장하면 핫 리로드 줄과 두 번째 출력 → Shift+F5 로 정지.
//   브리지 모드: 엔진 저장소(INITIAL2D_DIR, 기본 ../Initial2D)의 resources 와 scripts 를 임시 폴더에 복사하고 game.json 을
//               Lua 로 써서 브리지 서버(5973)를 띄운다. F5 → 알데바란 타이틀이 그려지고, Enter 로 숲이 열리고,
//               20 초 안에 Lua 오류가 없다.
//               GAME_VIEW_SCREENSHOT=<png 경로> 를 주면 게임 탭을 그 파일로 찍는다 (눈으로 보는 검수).

import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const LAYOUT_KEY = "initial-editor.layout";
const CODE = ".monaco-editor .view-lines";

type CanvasStats = { width: number; height: number; nonBackground: number; distinctColors: number; dominantShare: number; grid: number[] };
type GameViewLike = { phase: string; capture(): Promise<CanvasStats | null> };

function capture(page: Page): Promise<CanvasStats | null> {
  return page.evaluate(() => (window as unknown as { initialEditor: { gameView: GameViewLike } }).initialEditor.gameView.capture());
}

/** 칸별 밝기 차이 평균 (0 ~ 255). 같은 화면이면 0 에 가깝다 */
function gridDifference(a: CanvasStats, b: CanvasStats): number {
  return a.grid.reduce((n, v, i) => n + Math.abs(v - b.grid[i]), 0) / a.grid.length;
}

function phase(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { initialEditor: { gameView: GameViewLike } }).initialEditor.gameView.phase);
}

function consoleRows(page: Page, text: string) {
  return page.getByTestId("console-list").locator(".console-row", { hasText: text });
}

test.describe("게임 뷰 (메모리 모드)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?backend=memory");
    await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
    await page.reload();
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
  });

  test("F5 로 게임 탭에서 돌고, 저장하면 다시 읽고, Shift+F5 로 멈춘다", async ({ page }) => {
    const run = page.getByTestId("toolbar").locator('[data-command="run.start"]');
    await expect(run).toBeEnabled();
    await expect(page.getByTestId("status-engine")).toHaveText("엔진 (에디터 안): 대기");

    await page.keyboard.press("F5");
    await expect(page.getByTestId("doc-tab").filter({ hasText: "게임" })).toBeVisible();
    const view = page.getByTestId("game-view");
    await expect(page.getByTestId("game-canvas")).toBeVisible();
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect(page.getByTestId("status-engine")).toContainText("엔진 (에디터 안): 실행 중");
    await expect(page.getByTestId("toolbar-running")).toContainText("에디터 안");

    // 엔진 출력이 콘솔(source engine)에 온다
    await expect(consoleRows(page, "sample:frame")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId("console-list")).toContainText("Initial2D web: renderer=");
    await expect(page.getByTestId("console-list")).toContainText(/에디터 안 엔진: \d+개 파일/);

    // 사각형(64 x 48)이 그려졌다
    await expect
      .poll(async () => (await capture(page))?.nonBackground ?? 0, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(64 * 48);
    const stats = (await capture(page))!;
    expect(stats.width).toBeGreaterThanOrEqual(768);
    expect(stats.distinctColors).toBeGreaterThanOrEqual(2);

    // main.lua 를 고쳐 저장하면 그 파일만 다시 올리고 VM 을 다시 시작한다
    const tree = page.getByTestId("project-tree");
    await tree.locator('[data-path="scripts"]').click();
    await tree.locator('[data-path="scripts/lua"]').click();
    await tree.locator('[data-path="scripts/lua/main.lua"]').dblclick();
    await expect(page.locator(CODE)).toContainText("function init()");
    await page.locator(CODE).click();
    await page.evaluate(() =>
      (window as unknown as { initialEditor: { scripting: { activeScript: { reveal(line: number, column: number): void } } } }).initialEditor.scripting.activeScript.reveal(1, 1),
    );
    await page.keyboard.type('print("sample:reloaded")\n');
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByTestId("console-list")).toContainText("핫 리로드: 에디터 안 엔진", { timeout: 10_000 });
    await expect(consoleRows(page, "sample:reloaded")).toHaveCount(1, { timeout: 10_000 });
    await expect(consoleRows(page, "sample:frame")).toHaveCount(2, { timeout: 10_000 });
    // 게임 탭은 뒤에 있어도(문서에서 떨어져 있어도) 돈다
    expect(await phase(page)).toBe("running");

    // 게임 탭을 누르면 canvas 가 키를 받는다. Shift+F5 는 게임보다 먼저 에디터가 받아 멈춘다
    await page.getByTestId("doc-tab").filter({ hasText: "게임" }).click();
    await expect(page.getByTestId("game-canvas")).toBeFocused();
    await page.keyboard.press("Shift+F5");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    await expect(page.getByTestId("game-canvas")).toHaveCount(0);
    await expect(page.getByTestId("game-message")).toContainText("정지했다");
    await expect(page.getByTestId("status-engine")).toHaveText("엔진 (에디터 안): 대기");
    await expect(page.getByTestId("console-list")).toContainText("엔진 정지");
    await expect(page.getByTestId("console-list")).not.toContainText("Lua error");

    // 다시 실행하면 새 canvas 와 새 인스턴스다
    await page.getByTestId("game-view").getByRole("button", { name: "실행" }).click();
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect(consoleRows(page, "sample:reloaded")).toHaveCount(2, { timeout: 15_000 });
    // 게임 탭을 닫으면 멈춘다
    const tab = page.getByTestId("doc-tab").filter({ hasText: "게임" });
    await tab.hover();
    await tab.getByRole("button", { name: /닫기/ }).click();
    await expect(page.getByTestId("status-engine")).toHaveText("엔진 (에디터 안): 대기", { timeout: 10_000 });
  });

  test("맵의 여기서 실행(Ctrl+F5)도 게임 탭에서 돌고 스키마의 환경 변수를 넘긴다", async ({ page }) => {
    const tree = page.getByTestId("project-tree");
    await tree.locator('[data-path="resources"]').click();
    await tree.locator('[data-path="resources/maps"]').click();
    await tree.locator('[data-path="resources/maps/sample.json"]').dblclick();
    await expect(page.getByTestId("map-view")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect(page.getByTestId("console-list")).toContainText(/엔진 시작: 에디터 안 \(웹 엔진, lua wasm\), 언어 lua \(INITIAL2D_SCENE=main INITIAL2D_SAMPLE_MAP=\S+ INITIAL2D_SAMPLE_AT=\d+,\d+\)/);
    await expect(consoleRows(page, "sample:frame")).toHaveCount(1, { timeout: 15_000 });
    await view.getByRole("button", { name: "정지" }).click();
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
  });

  test("game.json 이 mruby 면 띄우지 않고 이유를 알린다", async ({ page }) => {
    await page.evaluate(() =>
      (window as unknown as { initialEditor: { commands: { execute(id: string): Promise<boolean> } } }).initialEditor.commands.execute("run.language.mruby"),
    );
    await expect(page.getByTestId("language-select")).toHaveValue("mruby");
    await page.keyboard.press("F5");
    await expect(page.getByTestId("toasts")).toContainText("웹 엔진은 Lua 만 돈다");
    await expect(page.getByTestId("console-list")).toContainText("game.json 의 script 를 lua 로 바꾸거나");
    await expect(page.getByTestId("doc-tab").filter({ hasText: "게임" })).toHaveCount(0);
    await expect(page.getByTestId("status-engine")).toHaveText("엔진 (에디터 안): 대기");
  });
});

const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? "../Initial2D");
const serverScript = path.join(engineDir, "tools", "bridge", "server.js");
const BRIDGE_PORT = 5973;
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;

async function waitForHealth(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // 아직 안 떴다
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`브리지 서버가 뜨지 않았다: ${url}`);
}

test.describe("게임 뷰 (브리지 모드, 알데바란)", () => {
  test.skip(!existsSync(serverScript) || !existsSync(path.join(engineDir, "scripts", "lua", "main.lua")), `엔진 저장소가 없다: ${engineDir} (INITIAL2D_DIR 로 위치를 준다)`);

  let proc: ChildProcess | null = null;
  let projectDir = "";

  test.beforeAll(async () => {
    // 엔진 저장소를 직접 가리키지 않는다. 임시 사본에 Lua 로 도는 game.json 을 쓴다
    projectDir = mkdtempSync(path.join(tmpdir(), "initial-editor-game-view-"));
    const skip = (src: string) => {
      const rel = path.relative(engineDir, src).split(path.sep).join("/");
      return rel === "resources/rtp" || rel.startsWith("resources/rtp/") || /\.(zip|psd)$/i.test(rel) || path.basename(src).startsWith(".");
    };
    for (const dir of ["resources", "scripts"]) {
      cpSync(path.join(engineDir, dir), path.join(projectDir, dir), { recursive: true, filter: (src) => !skip(src) });
    }
    mkdirSync(path.join(projectDir, ".initial-editor"), { recursive: true });
    writeFileSync(path.join(projectDir, "game.json"), JSON.stringify({ name: "Initial2D", windowWidth: 768, windowHeight: 896, renderScale: 1, script: "lua" }, null, 2) + "\n");
    proc = spawn(process.execPath, [serverScript, "--project", projectDir, "--port", String(BRIDGE_PORT), "--quiet"], { stdio: ["ignore", "pipe", "pipe"] });
    proc.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[bridge] ${chunk}`));
    await waitForHealth(`${BRIDGE_URL}/api/health`);
  });

  test.afterAll(async () => {
    proc?.kill();
    proc = null;
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  test("F5 로 알데바란 타이틀이 게임 탭에 그려지고, Enter 로 숲이 열리고, Lua 오류가 없다", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`/?backend=bridge&url=${encodeURIComponent(BRIDGE_URL)}`);
    await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
    await page.reload();
    await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("toolbar").locator('[data-command="run.start"]')).toBeEnabled();

    const started = Date.now();
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 60_000 });
    // 타이틀: 배경 그림과 글자로 색이 많고 한 색이 화면을 덮지 않는다
    await expect
      .poll(async () => {
        const s = await capture(page);
        return s ? s.distinctColors >= 64 && s.dominantShare < 0.9 : false;
      }, { timeout: 20_000 })
      .toBe(true);
    const shot = process.env.GAME_VIEW_SCREENSHOT;
    if (shot) {
      mkdirSync(path.dirname(shot), { recursive: true });
      await view.screenshot({ path: shot });
    }
    // 키는 canvas 가 받는다. 시작(Enter)을 누르면 숲이 열려 화면이 크게 바뀐다 (타이틀끼리는 1 아래, 숲은 18 안팎)
    const title = (await capture(page))!;
    await page.getByTestId("game-canvas").focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => gridDifference(title, (await capture(page))!), { timeout: 10_000 }).toBeGreaterThan(8);
    if (shot) await view.screenshot({ path: shot.replace(/\.png$/, "-forest.png") });
    // F5 뒤 20 초까지 Lua 오류가 없다
    const rest = 20_000 - (Date.now() - started);
    if (rest > 0) await page.waitForTimeout(rest);
    await expect(view).toHaveAttribute("data-phase", "running");
    await expect(page.getByTestId("console-list")).not.toContainText("Lua error");
    await expect(page.getByTestId("console-list")).toContainText("Initial2D web: renderer=");

    await page.getByTestId("doc-tab").filter({ hasText: "게임" }).click();
    await page.keyboard.press("Shift+F5");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
  });
});
