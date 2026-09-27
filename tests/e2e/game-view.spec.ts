// 게임 뷰 e2e (docs/plans/e4-embedded-play.md 마일스톤 1 ~ 6, 완료 기준 셋째). 웹 엔진(packages/app/public/engine,
// yarn sync:engine-web)이 에디터의 게임 탭에서 돈다.
//   메모리 모드: 샘플 프로젝트의 main.lua 가 사각형을 칠하고 "sample:frame" 을 한 번 찍는다. F5 → 게임 탭과 canvas →
//               콘솔의 줄 → canvas 의 픽셀 → main.lua 를 고쳐 저장하면 핫 리로드 줄과 두 번째 출력 → Shift+F5 로 정지.
//               스크립트 편집기(Monaco) 안의 F5 와 Shift+F5, 스크립트 옆 그룹에 열리는 게임 탭, 활성 게임 탭 누르기,
//               엔진 밖으로 나온 예외(세션을 종료 코드 1 로 끝내고 읽는 글을 보인다). 다른 그룹으로 끌어 옮긴 게임 탭의
//               초점, IME 조합 중의 F5, 설정 대화상자 안의 F5(아무것도 하지 않는다), 파일을 올리는 중의 저장(엔진이 뜬 뒤
//               다시 올린다), 게임이 끝난 뒤의 저장(메모리 모드는 리로드하지 않는다), 시작 스크립트나 첫 update 의 오류로
//               끝나는 게임이 뜨는 중에 고쳐 저장한 것(올리지 않고 한 줄 남기며 종료 코드 1, F5가 고친 글로 돈다. update 는 Lua 와 Ruby).
//               Lua 오류는 네이티브 엔진과 같다: 실행 중 저장한 문법 오류는 오류 줄을 찍고 스크립트만 멈추며(게임은 돈다)
//               고쳐 저장하면 다시 그린다. Update 의 실행 오류는 오류 줄을 찍고 종료 코드 1 로 끝난다. 오류 줄의 링크는 그 자리로 간다.
//               mruby: 웹 빌드에 mruby 가 있으면(MANIFEST 의 기능) Ruby 판 샘플이 같은 사각형을 그린다. 없는 빌드의 거부는
//               MANIFEST 를 가로채 mruby 를 뺀 가짜로 본다. C 를 거치는 끝없는 재귀(SystemStackError)와 바인딩 안의
//               C++ 예외(RuntimeError)는 네이티브 엔진과 같은 줄 묶음을 찍고 종료 코드 1 로 끝나며, rescue 로 잡으면 게임이 돈다.
//   브리지 모드: 엔진 저장소(INITIAL2D_DIR, 기본 ../Initial2D)의 resources 와 scripts 를 임시 폴더에 복사하고 game.json 을
//               Lua 로 써서 브리지 서버(6073)를 띄운다. F5 → 알데바란 타이틀이 그려지고, Enter 로 숲이 열리고,
//               20 초 안에 Lua 오류가 없다. 언어를 mruby 로 바꾸면 Ruby 판 알데바란이 같은 흐름으로 돈다.
//               게임이 끝난 뒤 저장하면 엔진이 없다는 한 줄만 남기고 토스트는 없다 (포트는 E2E_BRIDGE_PORT 로 바꾼다).
//               GAME_VIEW_SCREENSHOT=<png 경로> 를 주면 게임 탭을 그 파일로 찍는다 (눈으로 보는 검수).
//   네이티브 대조: 엔진의 인수 씬(tests/engine/scenes/aldebaran_scene.lua, INITIAL2D_ALDEBARAN_STOP=title)을 같은 파일로
//               네이티브 엔진(헤드리스, 프로세스 실행과 같은 실행 파일)과 게임 탭에서 돌려 20 프레임째를 견준다.
//               대조 규칙은 엔진의 골든 검사와 같다 (채널 차이 24 초과면 다른 픽셀, 다른 픽셀 2% 까지).
//               네이티브 실행 파일(INITIAL2D_NATIVE, 기본 <엔진>/build/Initial2D)이 없으면 엔진 저장소의 골든
//               (tests/golden/aldebaran_title.png, 같은 씬과 프레임의 네이티브 캡처)과 견준다.

import { expect, test, type Page } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
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

/** 프로젝트 트리에서 scripts/lua/main.lua 를 열고 편집기에 초점을 둔다 */
async function openMainLua(page: Page): Promise<void> {
  const tree = page.getByTestId("project-tree");
  await tree.locator('[data-path="scripts"]').click();
  await tree.locator('[data-path="scripts/lua"]').click();
  await tree.locator('[data-path="scripts/lua/main.lua"]').dblclick();
  await expect(page.locator(CODE)).toContainText("function init()");
  await page.locator(CODE).click();
  await expect(page.locator(".monaco-editor textarea")).toBeFocused();
}

/** 페이지가 새로 고쳐지면 사라지는 표시 */
async function markPage(page: Page): Promise<void> {
  await page.evaluate(() => ((window as unknown as { __notReloaded?: boolean }).__notReloaded = true));
}

async function pageWasNotReloaded(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __notReloaded?: boolean }).__notReloaded === true);
}

type ScriptingLike = { scripting: { activeScript: { text: string; reveal(line: number, column: number): void } } };

/** 활성 스크립트 편집기의 글 */
function scriptText(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { initialEditor: ScriptingLike }).initialEditor.scripting.activeScript.text);
}

/** 활성 스크립트 편집기의 커서를 (줄, 열) 로 */
async function moveCursor(page: Page, line: number, column = 1): Promise<void> {
  await page.evaluate(([l, c]) => (window as unknown as { initialEditor: ScriptingLike }).initialEditor.scripting.activeScript.reveal(l, c), [line, column] as const);
}

/** 편집기의 되돌리기(Ctrl+Z)로 글을 text 로 돌린다. Monaco 는 입력한 글을 단어와 줄바꿈 단위로 나눠 되돌린다 */
async function undoTo(page: Page, text: string): Promise<void> {
  await page.locator(CODE).click();
  for (let i = 0; i < 50 && (await scriptText(page)) !== text; i++) await page.keyboard.press("ControlOrMeta+z");
  expect(await scriptText(page)).toBe(text);
}

/** engine/MANIFEST.json 의 기능 목록 (yarn sync:engine-web 이 쓴다) */
function engineFeatures(): string[] {
  const file = path.resolve("packages/app/public/engine/MANIFEST.json");
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, "utf8")) as { features?: string[] }).features ?? [];
}

/** 콘솔에 온 엔진 줄 (source engine), 온 차례대로 */
function engineLines(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as { initialEditor: { log: { entries: Array<{ source: string; text: string }> } } }).initialEditor.log.entries
      .filter((e) => e.source === "engine")
      .map((e) => e.text),
  );
}

/** lines 에서 first 줄부터 length 줄 (first 가 없으면 빈 배열) */
function blockAt(lines: string[], first: string, length: number): string[] {
  const i = lines.indexOf(first);
  return i < 0 ? [] : lines.slice(i, i + length);
}

/** 메모리 백엔드의 프로젝트에 파일을 쓴다 (열린 문서가 없는 파일) */
async function writeProjectFile(page: Page, rel: string, text: string): Promise<void> {
  await page.evaluate(
    ([p, t]) => (window as unknown as { initialEditor: { backend: { writeText(p: string, t: string): Promise<void> } } }).initialEditor.backend.writeText(p, t),
    [rel, text] as const,
  );
}

// Ruby 오류 e2e 의 main.rb 와, 네이티브 엔진(Initial2D 470074b, 헤드리스)이 같은 파일로 stderr 에 찍는 줄 묶음.
// 기대값에 줄 번호가 들어 있으므로 파일을 고치면 네이티브로 다시 재어 함께 고친다.

/** to_s 가 자기 자신을 문자열에 넣어 C 를 거쳐 끝없이 재귀한다. 세 번째 update 에서 SystemStackError, 서른 번째에 stack:alive */
const RUBY_STACK_MAIN = `# to_s 가 자기 자신을 문자열에 넣어 C 를 거쳐 끝없이 재귀한다
class Loop
  def to_s
    "#{self}x"
  end
end

$n = 0

def init
  puts "stack:init"
end

def update(elapsed)
  $n += 1
  Loop.new.to_s if $n == 3
  puts "stack:alive" if $n == 30
end

def render
end

def destroy
  puts "stack:destroy"
end
`;
const RUBY_STACK_LINE = "  Loop.new.to_s if $n == 3";
/** 같은 재귀를 rescue 로 잡는 줄. 네이티브는 잡고 계속 돈다 */
const RUBY_STACK_RESCUE_LINE = '  begin; Loop.new.to_s; rescue SystemStackError => e; puts "stack:rescued #{e.class}"; end if $n == 3';
/** mruby 의 호출 깊이 한도(512)에서 멈춘 역추적: 맨 위, update, to_s 509 번 */
const RUBY_STACK_BLOCK = [
  "mruby: uncaught exception in update",
  "trace (most recent call last):",
  "\t[511] scripts/ruby/main.rb:23",
  "\t[510] scripts/ruby/main.rb:16:in update",
  ...Array.from({ length: 509 }, (_, i) => `\t[${509 - i}] scripts/ruby/main.rb:4:in to_s`),
  "scripts/ruby/main.rb:4:in to_s: SystemStackError",
];

/** 타입이 틀린 맵(version 이 문자열)은 Tilemap 바인딩 안에서 C++ 예외(Json::LogicError)가 된다 */
const RUBY_CPP_MAP = '{"version": "x", "width": 1}\n';
const RUBY_CPP_MAIN = `# 타입이 틀린 맵(version 이 문자열)을 읽으면 Tilemap 바인딩 안에서 C++ 예외(Json::LogicError)가 난다
BAD_MAP = "resources/maps/bad.json"
$n = 0

def init
  begin
    Tilemap.new(BAD_MAP)
    puts "cpp:not raised"
  rescue => e
    puts "cpp:rescued #{e.class}: #{e.message}"
  end
  puts "cpp:load #{Tilemap.load(BAD_MAP).inspect}"
end

def update(elapsed)
  $n += 1
  puts "cpp:alive" if $n == 30
  Tilemap.new(BAD_MAP) if $n == 40
end

def render
end

def destroy
  puts "cpp:destroy"
end
`;
const RUBY_CPP_BLOCK = [
  "mruby: uncaught exception in update",
  "trace (most recent call last):",
  "\t[2] scripts/ruby/main.rb:24",
  "\t[1] scripts/ruby/main.rb:18:in update",
  "scripts/ruby/main.rb:18:in initialize: Json::LogicError: Value is not convertible to Int. (RuntimeError)",
];

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
    // 스크립트를 고치는 동안에도 게임 탭은 옆 그룹에서 돈다
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

  test("스크립트 편집기 안에서 F5 로 실행하면 게임 탭이 스크립트 옆 그룹에 열리고, 페이지는 새로 고쳐지지 않는다", async ({ page }) => {
    await openMainLua(page);
    await markPage(page);
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    expect(await pageWasNotReloaded(page)).toBe(true);
    await expect(consoleRows(page, "sample:frame")).toHaveCount(1, { timeout: 15_000 });

    // 스크립트와 게임이 함께 보이고, 게임은 스크립트의 오른쪽이다
    const code = page.locator(".monaco-editor").first();
    await expect(code).toBeVisible();
    await expect(page.getByTestId("game-canvas")).toBeVisible();
    const codeBox = (await code.boundingBox())!;
    const viewBox = (await view.boundingBox())!;
    expect(viewBox.x).toBeGreaterThanOrEqual(codeBox.x + codeBox.width - 2);
    // 게임 탭은 제 그룹에 혼자다 (스크립트 탭과 같은 줄에 있지 않다)
    const gameTab = page.getByTestId("doc-tab").filter({ hasText: "게임" });
    const scriptTab = page.getByTestId("doc-tab").filter({ hasText: "main.lua" });
    const gameTabBox = (await gameTab.boundingBox())!;
    const scriptTabBox = (await scriptTab.boundingBox())!;
    expect(gameTabBox.x).toBeGreaterThanOrEqual(codeBox.x + codeBox.width - 2);
    expect(scriptTabBox.x).toBeLessThan(codeBox.x + codeBox.width);

    // 게임이 도는 동안 연 스크립트도 게임 그룹이 아니라 문서 그룹으로 간다
    const tree = page.getByTestId("project-tree");
    await tree.locator('[data-path="scripts/ruby"]').click();
    await tree.locator('[data-path="scripts/ruby/main.rb"]').dblclick();
    const rubyTab = page.getByTestId("doc-tab").filter({ hasText: "main.rb" });
    await expect(rubyTab).toBeVisible();
    expect((await rubyTab.boundingBox())!.x).toBeLessThan(codeBox.x + codeBox.width);
    await expect(page.getByTestId("game-canvas")).toBeVisible();
    expect(await phase(page)).toBe("running");
    await view.getByRole("button", { name: "정지" }).click();
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
  });

  test("스크립트 편집기 안에서 Shift+F5 로 멈춘다", async ({ page }) => {
    await openMainLua(page);
    const original = await scriptText(page);
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    // 편집기로 돌아가 Shift+F5
    await page.locator(CODE).click();
    await expect(page.locator(".monaco-editor textarea")).toBeFocused();
    await markPage(page);
    await page.keyboard.press("Shift+F5");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    await expect(page.getByTestId("game-message")).toContainText("정지했다");
    await expect(page.getByTestId("status-engine")).toHaveText("엔진 (에디터 안): 대기");
    // 편집기의 글은 그대로다 (F5 와 Shift+F5 가 글자를 넣지 않았다). 보이는 줄은 편집기의 스크롤에 따라 달라서 모델의 글로 본다
    expect(await scriptText(page)).toBe(original);
    await expect(page.getByTestId("doc-tab").filter({ hasText: "main.lua" }).locator(".doc-tab-dirty")).toHaveCount(0);
    expect(await pageWasNotReloaded(page)).toBe(true);
  });

  test("이미 활성인 게임 탭을 눌러도 canvas 가 키를 받는다", async ({ page }) => {
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    const canvas = page.getByTestId("game-canvas");
    await expect(canvas).toBeFocused();
    // 초점을 다른 곳(콘솔)에 두면 게임 탭은 여전히 활성 문서다
    await page.getByTestId("console-list").click();
    await expect(canvas).not.toBeFocused();
    const tab = page.getByTestId("doc-tab").filter({ hasText: "게임" });
    await tab.click();
    await expect(canvas).toBeFocused();
    // 한 번 더 눌러도 (이미 활성인 탭) 그대로 canvas
    await tab.click();
    await expect(canvas).toBeFocused();
    await page.keyboard.press("Shift+F5");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
  });

  test("게임 탭을 다른 그룹으로 끌어 옮겨도 canvas 가 키를 받는다", async ({ page }) => {
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    const canvas = page.getByTestId("game-canvas");
    await expect(canvas).toBeFocused();
    const gameTab = page.getByTestId("doc-tab").filter({ hasText: "게임" });
    const startTab = page.getByTestId("doc-tab").filter({ hasText: "시작" });
    const sameStrip = () =>
      page.evaluate(() => {
        const tabs = [...document.querySelectorAll('[data-testid="doc-tab"]')];
        const strip = (text: string) => tabs.find((t) => t.textContent?.includes(text))?.closest(".dv-tabs-container") ?? null;
        return strip("게임") !== null && strip("게임") === strip("시작");
      });
    expect(await sameStrip()).toBe(false);

    // 게임 탭을 시작 탭의 줄 끝으로 끌어다 놓는다
    const from = (await gameTab.boundingBox())!;
    const to = (await startTab.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 - 20, from.y + from.height / 2, { steps: 5 });
    await page.mouse.move(to.x + to.width + 30, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect.poll(sameStrip).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { initialEditor: { documents: { active: { kind: string } | null } } }).initialEditor.documents.active?.kind)).toBe("game");
    await expect(canvas).toBeFocused();
    expect(await phase(page)).toBe("running");
    await page.keyboard.press("Shift+F5");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
  });

  test("IME 조합 중에 누른 F5 도 실행하고 페이지를 새로 고치지 않는다", async ({ page }) => {
    await openMainLua(page);
    await markPage(page);
    await page.evaluate(() => {
      const w = window as unknown as { __f5: Array<{ composing: boolean; prevented: boolean }> };
      w.__f5 = [];
      // 모든 처리기가 끝난 뒤의 결과를 본다
      window.addEventListener("keydown", (ev) => {
        if (ev.key === "F5") setTimeout(() => w.__f5.push({ composing: ev.isComposing, prevented: ev.defaultPrevented }), 0);
      });
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", { text: "한", selectionStart: 1, selectionEnd: 1 });
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "F5", code: "F5", windowsVirtualKeyCode: 116, nativeVirtualKeyCode: 116 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "F5", code: "F5", windowsVirtualKeyCode: 116, nativeVirtualKeyCode: 116 });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __f5: unknown[] }).__f5)).toEqual([{ composing: true, prevented: true }]);
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    expect(await pageWasNotReloaded(page)).toBe(true);
    await view.getByRole("button", { name: "정지" }).click();
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
  });

  test("설정 대화상자 안의 F5 는 아무것도 하지 않는다 (게임을 띄우지 않고 초점도 대화상자에 남는다)", async ({ page }) => {
    await markPage(page);
    await page.evaluate(() => void (window as unknown as { initialEditor: { commands: { execute(id: string): Promise<boolean> } } }).initialEditor.commands.execute("tools.settings"));
    const dialog = page.locator("[role=dialog]");
    await expect(dialog).toBeVisible();
    const input = dialog.locator("input[type=text], input:not([type])").first();
    await input.focus();
    await page.evaluate(() => {
      const w = window as unknown as { __f5: boolean[] };
      w.__f5 = [];
      window.addEventListener("keydown", (ev) => {
        if (ev.key === "F5") setTimeout(() => w.__f5.push(ev.defaultPrevented), 0);
      });
    });
    await page.keyboard.press("F5");
    await page.keyboard.press("Shift+F5");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __f5: boolean[] }).__f5)).toEqual([true, true]);
    await page.waitForTimeout(500);
    const runner = await page.evaluate(() => (window as unknown as { initialEditor: { runner: { state: string } } }).initialEditor.runner.state);
    expect(runner).toBe("idle");
    await expect(page.getByTestId("doc-tab").filter({ hasText: "게임" })).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(input).toBeFocused();
    expect(await pageWasNotReloaded(page)).toBe(true);
    // 대화상자를 닫으면 F5 가 다시 통한다
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await page.keyboard.press("Shift+F5");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
  });

  test("파일을 올리는 중에 저장한 스크립트는 게임 밖으로 보내지 않고 엔진이 뜬 뒤 다시 올린다", async ({ page }) => {
    await openMainLua(page);
    // main.lua 를 읽은 뒤의 다른 파일은 풀어 줄 때까지 멈춘다 (큰 프로젝트의 긴 스테이징). main.lua 는 막지 않는다:
    // 저장이 쓰기 전에 디스크의 글을 다시 읽어 밖에서 바뀌었는지 보기 때문이다 (저장 충돌 검사)
    await page.evaluate(() => {
      const w = window as unknown as { initialEditor: { backend: { readBinary(p: string): Promise<Uint8Array> } }; __reads: string[]; __release: () => void };
      const backend = w.initialEditor.backend;
      const read = backend.readBinary.bind(backend);
      const held = new Promise<void>((r) => (w.__release = r));
      w.__reads = [];
      backend.readBinary = async (p: string) => {
        const data = await read(p);
        const late = w.__reads.includes("scripts/lua/main.lua") && p !== "scripts/lua/main.lua";
        w.__reads.push(p);
        if (late) await held;
        return data;
      };
    });
    await moveCursor(page, 1);
    await page.keyboard.insertText('print("marker:v2")\n');
    await page.keyboard.press("F5");
    await page.waitForFunction(() => (window as unknown as { __reads: string[] }).__reads.includes("scripts/lua/main.lua"));
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "staging");

    // 스테이징 중에 저장한다 (main.lua 는 이미 옛 글로 읽혔다)
    const scriptTab = page.getByTestId("doc-tab").filter({ hasText: "main.lua" });
    await scriptTab.click();
    await page.locator(CODE).click();
    await page.keyboard.press("ControlOrMeta+s");
    await expect(scriptTab.locator(".doc-tab-dirty")).toHaveCount(0);
    await expect(consoleRows(page, "핫 리로드: 에디터 안 엔진이 뜨는 중이다")).toHaveCount(1);
    await expect(view).toHaveAttribute("data-phase", "staging");

    await page.evaluate(() => (window as unknown as { __release: () => void }).__release());
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    // 뜬 뒤 저장한 파일만 다시 올려 새 글이 돈다
    await expect(consoleRows(page, "핫 리로드: 에디터 안 엔진, 1개 파일을 다시 올렸다")).toHaveCount(1, { timeout: 10_000 });
    await expect(consoleRows(page, "marker:v2")).toHaveCount(1, { timeout: 10_000 });
    await expect(page.getByTestId("console-list")).not.toContainText("개 파일을 보냈다");
    await view.getByRole("button", { name: "정지" }).click();
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
  });

  test("게임이 끝난 뒤 저장해도 메모리 모드는 리로드하지 않고 리로드했다고 적지 않는다", async ({ page }) => {
    await openMainLua(page);
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await view.getByRole("button", { name: "정지" }).click();
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    const rowsBefore = await page.getByTestId("console-list").locator(".console-row").count();

    const scriptTab = page.getByTestId("doc-tab").filter({ hasText: "main.lua" });
    await scriptTab.click();
    await page.locator(CODE).click();
    await moveCursor(page, 1);
    await page.keyboard.insertText("-- edit\n");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(scriptTab.locator(".doc-tab-dirty")).toHaveCount(0);
    await page.waitForTimeout(1000); // 저장 리로드의 디바운스(300ms)보다 길게
    const after = await page.getByTestId("console-list").locator(".console-row").allInnerTexts();
    expect(after.slice(rowsBefore).filter((t) => t.includes("리로드"))).toEqual([]);
    await expect(page.getByTestId("toasts")).not.toContainText("리로드");
    // 수동 리로드도 게임이 돌 때만이다
    await expect(page.getByTestId("toolbar").locator('[data-command="run.reload"]')).toBeDisabled();
  });

  test("시작 스크립트의 오류로 끝나는 게임이 뜨는 중에 고쳐 저장한 것은 올리지 않고 한 줄 남기며, F5는 고친 글로 돈다", async ({ page }) => {
    type EditorWindow = {
      initialEditor: {
        backend: { readText(p: string): Promise<string> };
        documents: { findByPath(p: string): { model: { setValue(t: string): void } } };
      };
    };
    const original = await page.evaluate(() => (window as unknown as EditorWindow).initialEditor.backend.readText("scripts/lua/main.lua"));
    const broken = original.replace("function init()", 'function init()\n  error("boom in init")');
    expect(broken).not.toBe(original);
    await writeProjectFile(page, "scripts/lua/main.lua", broken);
    await openMainLua(page);
    await expect(page.locator(CODE)).toContainText("boom in init");
    // 엔진이 뜨는 중(부팅)에 멈춰 둔다: wasm 인스턴스는 풀어 줄 때까지 만들지 않는다
    await page.evaluate(() => {
      const w = window as unknown as { __releaseBoot?: () => void; __restoreBoot: () => void };
      const wasm = WebAssembly as unknown as { instantiateStreaming: (...args: unknown[]) => Promise<unknown> };
      const orig = wasm.instantiateStreaming;
      wasm.instantiateStreaming = async (...args: unknown[]) => {
        await new Promise<void>((r) => (w.__releaseBoot = r));
        return orig.apply(WebAssembly, args);
      };
      w.__restoreBoot = () => (wasm.instantiateStreaming = orig);
    });
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await page.waitForFunction(() => typeof (window as unknown as { __releaseBoot?: () => void }).__releaseBoot === "function");
    await expect(view).toHaveAttribute("data-phase", "booting");

    // 뜨는 중에 고쳐 저장한다
    const scriptTab = page.getByTestId("doc-tab").filter({ hasText: "main.lua" });
    await scriptTab.click();
    await page.evaluate((text) => (window as unknown as EditorWindow).initialEditor.documents.findByPath("scripts/lua/main.lua").model.setValue(text), original);
    await page.locator(CODE).click();
    await page.keyboard.press("ControlOrMeta+s");
    await expect(scriptTab.locator(".doc-tab-dirty")).toHaveCount(0);
    await expect(consoleRows(page, "핫 리로드: 에디터 안 엔진이 뜨는 중이다")).toHaveCount(1);

    await page.evaluate(() => {
      const w = window as unknown as { __releaseBoot: () => void; __restoreBoot: () => void };
      w.__restoreBoot();
      w.__releaseBoot();
    });
    // 시작 때의 오류가 종료를 요청해 두어서 게임은 첫 프레임에 끝난다. 고침은 올리지 않고 그렇다고 한 줄 남긴다
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 30_000 });
    await expect(page.getByTestId("game-state")).toHaveText("오류로 끝남 (종료 코드 1)");
    await expect(consoleRows(page, "boom in init")).toHaveCount(1);
    await expect(consoleRows(page, "핫 리로드: 게임이 뜨는 중에 끝나서 저장한 파일을 올리지 않았다. F5로 다시 실행하면 저장한 내용으로 돈다")).toHaveCount(1);
    const list = page.getByTestId("console-list");
    await expect(list).not.toContainText("다시 올렸다");
    await expect(list).not.toContainText("HotReload: reloaded");
    await expect(consoleRows(page, "sample:frame")).toHaveCount(0);

    // F5는 저장한 글을 처음부터 올려 돈다
    await page.keyboard.press("F5");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect(consoleRows(page, "sample:frame")).toHaveCount(1, { timeout: 15_000 });
    await expect(consoleRows(page, "boom in init")).toHaveCount(1);
    await view.getByRole("button", { name: "정지" }).click();
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
  });

  for (const lang of ["lua", "ruby"] as const) {
    test(`첫 update 의 오류로 끝나는 게임이 뜨는 중에 고쳐 저장한 것은 첫 프레임 뒤에도 올리지 않고 한 줄 남기며 종료 코드 1, F5는 고친 글로 돈다 (${lang})`, async ({ page }) => {
      test.skip(lang === "ruby" && !engineFeatures().includes("mruby"), "public/engine 의 웹 빌드에 mruby 가 없다 (MANIFEST 의 기능)");
      type EditorWindow = {
        initialEditor: {
          backend: { readText(p: string): Promise<string> };
          documents: { findByPath(p: string): { model: { getValue(): string; setValue(t: string): void } } | undefined };
        };
      };
      const dir = lang === "lua" ? "scripts/lua" : "scripts/ruby";
      const file = lang === "lua" ? "main.lua" : "main.rb";
      const main = `${dir}/${file}`;
      if (lang === "ruby") await setLanguage(page, "mruby");
      const original = await page.evaluate((p) => (window as unknown as EditorWindow).initialEditor.backend.readText(p), main);
      const broken =
        lang === "lua"
          ? original.replace("function update(elapsed)", 'function update(elapsed)\n  error("boom in update")')
          : original.replace("def update(elapsed)\n", 'def update(elapsed)\n  raise "boom in update"\n');
      const fixed = lang === "lua" ? original.replace("function init()", 'function init()\n  print("fixed:init")') : original.replace("def init\n", 'def init\n  puts "fixed:init"\n');
      expect(broken).not.toBe(original);
      expect(fixed).not.toBe(original);
      await writeProjectFile(page, main, broken);
      const tree = page.getByTestId("project-tree");
      await tree.locator('[data-path="scripts"]').click();
      await tree.locator(`[data-path="${dir}"]`).click();
      await tree.locator(`[data-path="${main}"]`).dblclick();
      // 오류 줄은 편집기의 보이는 줄 밖일 수 있어 문서의 글로 본다
      await page.waitForFunction((p) => (window as unknown as EditorWindow).initialEditor.documents.findByPath(p)?.model.getValue().includes("boom in update") === true, main);
      // 엔진이 뜨는 중(부팅)에 멈춰 둔다: wasm 인스턴스는 풀어 줄 때까지 만들지 않는다
      await page.evaluate(() => {
        const w = window as unknown as { __releaseBoot?: () => void; __restoreBoot: () => void };
        const wasm = WebAssembly as unknown as { instantiateStreaming: (...args: unknown[]) => Promise<unknown> };
        const orig = wasm.instantiateStreaming;
        wasm.instantiateStreaming = async (...args: unknown[]) => {
          await new Promise<void>((r) => (w.__releaseBoot = r));
          return orig.apply(WebAssembly, args);
        };
        w.__restoreBoot = () => (wasm.instantiateStreaming = orig);
      });
      await page.keyboard.press("F5");
      const view = page.getByTestId("game-view");
      await page.waitForFunction(() => typeof (window as unknown as { __releaseBoot?: () => void }).__releaseBoot === "function");
      await expect(view).toHaveAttribute("data-phase", "booting");

      // 뜨는 중에 고쳐 저장한다
      const scriptTab = page.getByTestId("doc-tab").filter({ hasText: file });
      await scriptTab.click();
      await page.evaluate(([p, t]) => (window as unknown as EditorWindow).initialEditor.documents.findByPath(p)?.model.setValue(t), [main, fixed] as const);
      await page.locator(CODE).click();
      await page.keyboard.press("ControlOrMeta+s");
      await expect(scriptTab.locator(".doc-tab-dirty")).toHaveCount(0);
      await expect(consoleRows(page, "핫 리로드: 에디터 안 엔진이 뜨는 중이다")).toHaveCount(1);

      // 프레임 사이를 늘린다: 오류를 찍은 첫 프레임과 루프를 내리는 다음 프레임 사이에 첫 프레임 확인(16ms 간격)이 반드시 든다
      await page.evaluate(() => {
        const w = window as unknown as { __releaseBoot: () => void; __restoreBoot: () => void; __restoreFrames: () => void };
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = (cb) => raf.call(window, () => setTimeout(() => cb(performance.now()), 150));
        w.__restoreFrames = () => (window.requestAnimationFrame = raf);
        w.__restoreBoot();
        w.__releaseBoot();
      });
      // 첫 update 의 오류가 종료를 요청해 두어서 게임은 다음 프레임에 끝난다. 첫 프레임은 돌았지만 고침은 올리지 않는다
      await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 30_000 });
      await page.evaluate(() => (window as unknown as { __restoreFrames: () => void }).__restoreFrames());
      await expect(page.getByTestId("game-state")).toHaveText("오류로 끝남 (종료 코드 1)");
      await expect(page.getByTestId("status-engine")).toHaveText("엔진 (에디터 안): 종료 코드 1");
      const errorHead = lang === "lua" ? "Lua error in update" : "mruby: uncaught exception in update";
      await expect(consoleRows(page, errorHead)).toHaveCount(1);
      await expect(consoleRows(page, "boom in update").first()).toBeVisible();
      await expect(consoleRows(page, "핫 리로드: 게임이 뜨는 중에 끝나서 저장한 파일을 올리지 않았다. F5로 다시 실행하면 저장한 내용으로 돈다")).toHaveCount(1);
      const list = page.getByTestId("console-list");
      await expect(list).toContainText("엔진 종료 코드 1");
      await expect(list).not.toContainText("다시 올렸다");
      await expect(list).not.toContainText("HotReload: reloaded");
      await expect(list).not.toContainText("핫 리로드 실패");
      await expect(list).not.toContainText("엔진 종료 (코드 0");
      await expect(consoleRows(page, "fixed:init")).toHaveCount(0);
      await expect(page.getByTestId("toasts")).not.toContainText("리로드");

      // F5는 저장한 글을 처음부터 올려 돈다
      await page.keyboard.press("F5");
      await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
      await expect(consoleRows(page, "fixed:init")).toHaveCount(1, { timeout: 15_000 });
      await expect(consoleRows(page, errorHead)).toHaveCount(1);
      await view.getByRole("button", { name: "정지" }).click();
      await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    });
  }

  test("엔진 밖으로 나온 예외는 세션을 종료 코드 1 로 끝내고 콘솔과 상태 띠에 읽는 글을 남긴다", async ({ page }) => {
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect(consoleRows(page, "sample:frame")).toHaveCount(1, { timeout: 15_000 });
    // 엔진의 프레임 콜백에서 C++ 예외가 빠져나온 것과 같은 값 (message 가 없다)
    await page.evaluate(() => {
      const wasm = WebAssembly as unknown as { Tag: new (t: { parameters: string[] }) => object; Exception: new (tag: object, payload: unknown[]) => object };
      requestAnimationFrame(() => {
        throw new wasm.Exception(new wasm.Tag({ parameters: [] }), []);
      });
    });
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    await expect(page.getByTestId("game-state")).toHaveText("오류로 끝남 (종료 코드 1)");
    await expect(page.getByTestId("game-message")).toContainText("엔진이 예외로 멈췄다 (종료 코드 1): C++ 예외");
    await expect(consoleRows(page, "fatal: C++ 예외")).toHaveCount(1);
    await expect(page.getByTestId("status-engine")).toHaveText("엔진 (에디터 안): 종료 코드 1");
    await expect(page.getByTestId("console-list")).not.toContainText("undefined");
    await expect(page.getByTestId("game-message")).not.toContainText("undefined");
    // 죽은 엔진은 기다리지 않고 다시 띄운다
    await page.keyboard.press("F5");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await page.keyboard.press("Shift+F5");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
  });

  test("실행 중 저장한 Lua 문법 오류는 네이티브처럼 오류 줄을 찍고 스크립트만 멈추며, 고쳐 저장하면 다시 그린다", async ({ page }) => {
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect(consoleRows(page, "sample:frame")).toHaveCount(1, { timeout: 15_000 });
    await expect.poll(async () => (await capture(page))?.nonBackground ?? 0, { timeout: 10_000 }).toBeGreaterThanOrEqual(64 * 48);

    await openMainLua(page);
    const original = await scriptText(page);
    await moveCursor(page, 1);
    await page.keyboard.insertText("local = = =\n");
    expect((await scriptText(page)).split("\n")[0]).toBe("local = = =");
    await page.keyboard.press("ControlOrMeta+s");

    // 네이티브의 hot reload 와 같은 줄: "Lua error in scripts/lua/main.lua: ./scripts/lua/main.lua:1: ..."
    const errorRow = consoleRows(page, "Lua error in scripts/lua/main.lua").filter({ hasText: "scripts/lua/main.lua:1:" }).first();
    await expect(errorRow).toBeVisible({ timeout: 10_000 });
    await expect(errorRow).toHaveClass(/level-error/);
    await expect(page.getByTestId("console-list")).toContainText("스크립트 오류로 VM 이 다시 뜨지 못했다");
    await expect(page.getByTestId("toasts")).toContainText("핫 리로드: 스크립트 오류");
    // 게임은 돌고 스크립트만 멈췄다: 사각형이 사라진다. 예외나 읽을 수 없는 글은 없다
    expect(await phase(page)).toBe("running");
    await expect.poll(async () => (await capture(page))?.nonBackground ?? -1, { timeout: 10_000 }).toBeLessThan(64 * 48);
    for (const id of ["console-list", "toasts", "game-view"]) {
      await expect(page.getByTestId(id)).not.toContainText("undefined");
      await expect(page.getByTestId(id)).not.toContainText("fatal:");
      await expect(page.getByTestId(id)).not.toContainText("[object");
    }

    // 오류 줄의 링크는 그 파일 그 줄로 간다
    await moveCursor(page, 5);
    await expect(page.getByTestId("script-cursor")).toHaveText(/^줄 5, /);
    const link = errorRow.getByTestId("console-link").first();
    await expect(link).toHaveAttribute("data-path", "scripts/lua/main.lua");
    await expect(link).toHaveAttribute("data-line", "1");
    await link.click();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "main.lua" })).toBeVisible();
    await expect(page.getByTestId("script-cursor")).toHaveText(/^줄 1, /);

    // 되돌려 저장하면 VM 이 다시 떠서 그린다 (reload 가 true)
    await undoTo(page, original);
    await page.keyboard.press("ControlOrMeta+s");
    await expect(consoleRows(page, "다시 올렸다. VM 을 다시 시작한다")).toHaveCount(1, { timeout: 10_000 });
    await expect(consoleRows(page, "sample:frame")).toHaveCount(2, { timeout: 10_000 });
    await expect.poll(async () => (await capture(page))?.nonBackground ?? 0, { timeout: 10_000 }).toBeGreaterThanOrEqual(64 * 48);
    expect(await phase(page)).toBe("running");

    await view.getByRole("button", { name: "정지" }).click();
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    await expect(page.getByTestId("game-message")).toContainText("정지했다");
  });

  test("Update 의 Lua 실행 오류는 네이티브처럼 오류 줄을 찍고 종료 코드 1 로 끝나며, 그 줄을 누르면 그 자리로 간다", async ({ page }) => {
    await openMainLua(page);
    const original = await scriptText(page);
    const updateLine = original.split("\n").findIndex((l) => l.startsWith("function update(elapsed)")) + 1;
    expect(updateLine).toBeGreaterThan(0);
    const boomLine = updateLine + 1;
    await moveCursor(page, boomLine);
    await page.keyboard.insertText("local boom = nil; boom.x = elapsed\n");
    expect((await scriptText(page)).split("\n")[boomLine - 1]).toContain("boom.x = elapsed");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByTestId("doc-tab").filter({ hasText: "main.lua" }).locator(".doc-tab-dirty")).toHaveCount(0);

    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    // 네이티브: "Lua error in update: ./scripts/lua/main.lua:N: attempt to index a nil value (local 'boom')", destroy 없이 종료 코드 1
    const errorRow = consoleRows(page, "Lua error in update").filter({ hasText: `scripts/lua/main.lua:${boomLine}:` }).first();
    await expect(errorRow).toBeVisible({ timeout: 30_000 });
    await expect(errorRow).toContainText("attempt to index a nil value");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    await expect(page.getByTestId("game-state")).toHaveText("오류로 끝남 (종료 코드 1)");
    await expect(page.getByTestId("game-message")).toContainText("게임이 오류로 끝났다 (종료 코드 1)");
    await expect(page.getByTestId("status-engine")).toHaveText("엔진 (에디터 안): 종료 코드 1");
    await expect(page.getByTestId("console-list")).toContainText("엔진 종료 코드 1");
    await expect(page.getByTestId("toasts")).toContainText("엔진이 종료 코드 1 로 끝났다");
    await expect(page.getByTestId("game-canvas")).toHaveCount(0);
    for (const id of ["console-list", "toasts", "game-view"]) {
      await expect(page.getByTestId(id)).not.toContainText("undefined");
      await expect(page.getByTestId(id)).not.toContainText("fatal:");
      await expect(page.getByTestId(id)).not.toContainText("C++ 예외");
    }

    const link = errorRow.getByTestId("console-link").first();
    await expect(link).toHaveAttribute("data-path", "scripts/lua/main.lua");
    await expect(link).toHaveAttribute("data-line", String(boomLine));
    await link.click();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "main.lua" })).toBeVisible();
    await expect(page.getByTestId("script-cursor")).toHaveText(new RegExp(`^줄 ${boomLine}, `));

    // 고쳐 저장하고 다시 실행하면 돈다 (첫 프레임의 Render 가 이미 한 번 찍었을 수 있어 늘어난 것을 본다)
    await undoTo(page, original);
    await page.keyboard.press("ControlOrMeta+s");
    const framesBefore = await consoleRows(page, "sample:frame").count();
    const errorsBefore = await consoleRows(page, "Lua error").count();
    await page.keyboard.press("F5");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect.poll(() => consoleRows(page, "sample:frame").count(), { timeout: 15_000 }).toBeGreaterThan(framesBefore);
    await expect.poll(async () => (await capture(page))?.nonBackground ?? 0, { timeout: 10_000 }).toBeGreaterThanOrEqual(64 * 48);
    expect(await consoleRows(page, "Lua error").count()).toBe(errorsBefore);
    expect(await phase(page)).toBe("running");
    await page.keyboard.press("Shift+F5");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
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
    await expect(page.getByTestId("console-list")).toContainText(/엔진 시작: 에디터 안 \(웹 엔진, lua (?:mruby )?wasm\), 언어 lua \(INITIAL2D_SCENE=main INITIAL2D_SAMPLE_MAP=\S+ INITIAL2D_SAMPLE_AT=\d+,\d+\)/);
    await expect(consoleRows(page, "sample:frame")).toHaveCount(1, { timeout: 15_000 });
    await view.getByRole("button", { name: "정지" }).click();
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
  });

  test("game.json 이 mruby 면 Ruby 판이 게임 탭에서 같은 사각형을 그린다", async ({ page }) => {
    test.skip(!engineFeatures().includes("mruby"), "public/engine 의 웹 빌드에 mruby 가 없다 (MANIFEST 의 기능)");
    await page.evaluate(() =>
      (window as unknown as { initialEditor: { commands: { execute(id: string): Promise<boolean> } } }).initialEditor.commands.execute("run.language.mruby"),
    );
    await expect(page.getByTestId("language-select")).toHaveValue("mruby");
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect(page.getByTestId("console-list")).toContainText(/엔진 시작: 에디터 안 \(웹 엔진, lua mruby wasm\), 언어 mruby/);
    await expect(consoleRows(page, "sample:frame")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId("console-list")).toContainText("샘플 프로젝트 시작");
    await expect.poll(async () => (await capture(page))?.nonBackground ?? 0, { timeout: 10_000 }).toBeGreaterThanOrEqual(64 * 48);
    await expect(page.getByTestId("console-list")).not.toContainText("mruby: uncaught exception");
    await expect(page.getByTestId("console-list")).not.toContainText("이 웹 엔진 빌드에는 mruby 가 없다");
    await page.keyboard.press("Shift+F5");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    await expect(page.getByTestId("game-message")).toContainText("정지했다");
  });

  test("Ruby 의 C 를 거치는 끝없는 재귀는 네이티브처럼 SystemStackError 와 역추적을 찍고 종료 코드 1 로 끝나며, rescue 로 잡으면 게임이 돈다", async ({ page }) => {
    test.skip(!engineFeatures().includes("mruby"), "public/engine 의 웹 빌드에 mruby 가 없다 (MANIFEST 의 기능)");
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await writeProjectFile(page, "scripts/ruby/main.rb", RUBY_STACK_MAIN);
    await setLanguage(page, "mruby");
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");

    // 네이티브와 같은 줄 묶음 (역추적 511 줄), destroy 없이 종료 코드 1
    const errorRow = consoleRows(page, "scripts/ruby/main.rb:4:in to_s: SystemStackError").first();
    await expect(errorRow).toBeVisible({ timeout: 30_000 });
    await expect(errorRow).toHaveClass(/level-error/);
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    const lines = await engineLines(page);
    expect(blockAt(lines, RUBY_STACK_BLOCK[0], RUBY_STACK_BLOCK.length)).toEqual(RUBY_STACK_BLOCK);
    expect(lines.filter((l) => l.startsWith("mruby: uncaught exception"))).toHaveLength(1);
    expect(lines).toContain("stack:init");
    expect(lines).not.toContain("stack:alive");
    expect(lines).not.toContain("stack:destroy");
    await expect(page.getByTestId("game-state")).toHaveText("오류로 끝남 (종료 코드 1)");
    await expect(page.getByTestId("game-message")).toContainText("게임이 오류로 끝났다 (종료 코드 1)");
    await expect(page.getByTestId("status-engine")).toHaveText("엔진 (에디터 안): 종료 코드 1");
    await expect(page.getByTestId("game-canvas")).toHaveCount(0);
    // 메모리가 깨진 흔적(엔진 밖 예외, 읽을 수 없는 글)이 없다
    for (const id of ["console-list", "toasts", "game-view"]) {
      await expect(page.getByTestId(id)).not.toContainText("fatal:");
      await expect(page.getByTestId(id)).not.toContainText("undefined");
      await expect(page.getByTestId(id)).not.toContainText("out of bounds");
    }
    expect(pageErrors).toEqual([]);

    // 오류 줄의 링크는 to_s 의 줄로 간다
    const link = errorRow.getByTestId("console-link").first();
    await expect(link).toHaveAttribute("data-path", "scripts/ruby/main.rb");
    await expect(link).toHaveAttribute("data-line", "4");
    await link.click();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "main.rb" })).toBeVisible();
    await expect(page.getByTestId("script-cursor")).toHaveText(/^줄 4, /);

    // update 의 그 줄을 rescue 로 감싸 저장하고 다시 실행하면 잡고 계속 돈다 (네이티브는 stack:alive 를 찍고 종료 코드 0)
    const stackLine = RUBY_STACK_MAIN.split("\n").indexOf(RUBY_STACK_LINE) + 1;
    await moveCursor(page, stackLine);
    await page.keyboard.press("Shift+End");
    await page.keyboard.insertText(RUBY_STACK_RESCUE_LINE);
    expect(await scriptText(page)).toBe(RUBY_STACK_MAIN.replace(RUBY_STACK_LINE, RUBY_STACK_RESCUE_LINE));
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByTestId("doc-tab").filter({ hasText: "main.rb" }).locator(".doc-tab-dirty")).toHaveCount(0);
    await page.keyboard.press("F5");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect(consoleRows(page, "stack:rescued SystemStackError")).toHaveCount(1, { timeout: 15_000 });
    await expect(consoleRows(page, "stack:alive")).toHaveCount(1, { timeout: 15_000 });
    expect(await phase(page)).toBe("running");
    expect((await engineLines(page)).filter((l) => l.startsWith("mruby: uncaught exception"))).toHaveLength(1);
    expect(pageErrors).toEqual([]);
    await page.keyboard.press("Shift+F5");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    await expect(page.getByTestId("game-message")).toContainText("정지했다");
    await expect(consoleRows(page, "stack:destroy")).toHaveCount(1);
  });

  test("Ruby 바인딩 안의 C++ 예외는 RuntimeError 라서 rescue 로 잡히고 게임이 돌며, 잡지 않으면 네이티브처럼 오류 줄을 찍고 종료 코드 1 로 끝난다", async ({ page }) => {
    test.skip(!engineFeatures().includes("mruby"), "public/engine 의 웹 빌드에 mruby 가 없다 (MANIFEST 의 기능)");
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await writeProjectFile(page, "resources/maps/bad.json", RUBY_CPP_MAP);
    await writeProjectFile(page, "scripts/ruby/main.rb", RUBY_CPP_MAIN);
    await setLanguage(page, "mruby");
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");

    // init 의 rescue 가 잡고 Tilemap.load 는 nil, 그 뒤로도 update 가 돈다
    await expect(consoleRows(page, "cpp:rescued RuntimeError: Json::LogicError: Value is not convertible to Int.")).toHaveCount(1, { timeout: 30_000 });
    await expect(consoleRows(page, "cpp:load nil")).toHaveCount(1);
    await expect(consoleRows(page, "cpp:alive")).toHaveCount(1, { timeout: 15_000 });
    await expect(consoleRows(page, "cpp:not raised")).toHaveCount(0);

    // 잡지 않은 40 번째 update: 네이티브와 같은 줄 묶음, destroy 없이 종료 코드 1 (엔진 밖 예외가 아니다)
    const errorRow = consoleRows(page, "scripts/ruby/main.rb:18:in initialize: Json::LogicError").first();
    await expect(errorRow).toBeVisible({ timeout: 15_000 });
    await expect(errorRow).toHaveClass(/level-error/);
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    const lines = await engineLines(page);
    expect(blockAt(lines, RUBY_CPP_BLOCK[0], RUBY_CPP_BLOCK.length)).toEqual(RUBY_CPP_BLOCK);
    expect(lines.filter((l) => l.startsWith("mruby: uncaught exception"))).toHaveLength(1);
    expect(lines).not.toContain("cpp:destroy");
    await expect(page.getByTestId("game-state")).toHaveText("오류로 끝남 (종료 코드 1)");
    await expect(page.getByTestId("game-message")).toContainText("게임이 오류로 끝났다 (종료 코드 1)");
    await expect(page.getByTestId("status-engine")).toHaveText("엔진 (에디터 안): 종료 코드 1");
    for (const id of ["console-list", "toasts", "game-view"]) {
      await expect(page.getByTestId(id)).not.toContainText("fatal:");
      await expect(page.getByTestId(id)).not.toContainText("C++ 예외");
      await expect(page.getByTestId(id)).not.toContainText("Aborted");
      await expect(page.getByTestId(id)).not.toContainText("undefined");
    }
    expect(pageErrors).toEqual([]);

    const link = errorRow.getByTestId("console-link").first();
    await expect(link).toHaveAttribute("data-path", "scripts/ruby/main.rb");
    await expect(link).toHaveAttribute("data-line", "18");
    await link.click();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "main.rb" })).toBeVisible();
    await expect(page.getByTestId("script-cursor")).toHaveText(/^줄 18, /);
  });

  test("mruby 가 없는 웹 빌드면 game.json 이 mruby 인 프로젝트는 띄우지 않고 이유를 알린다 (가짜 MANIFEST)", async ({ page }) => {
    // MANIFEST 의 기능에서 mruby 를 뺀다. 엔진 파일은 그대로다
    await page.route("**/engine/MANIFEST.json", async (route) => {
      const res = await route.fetch();
      const manifest = (await res.json()) as { features: string[] };
      manifest.features = manifest.features.filter((f) => f !== "mruby");
      await route.fulfill({ response: res, json: manifest });
    });
    await page.reload();
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
    await page.evaluate(() =>
      (window as unknown as { initialEditor: { commands: { execute(id: string): Promise<boolean> } } }).initialEditor.commands.execute("run.language.mruby"),
    );
    await expect(page.getByTestId("language-select")).toHaveValue("mruby");
    await page.keyboard.press("F5");
    await expect(page.getByTestId("toasts")).toContainText("이 웹 엔진 빌드에는 mruby 가 없다");
    await expect(page.getByTestId("console-list")).toContainText("game.json 의 script 를 lua 로 바꾸거나");
    await expect(page.getByTestId("doc-tab").filter({ hasText: "게임" })).toHaveCount(0);
    await expect(page.getByTestId("status-engine")).toHaveText("엔진 (에디터 안): 대기");
  });
});

const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? "../Initial2D");
const serverScript = path.join(engineDir, "tools", "bridge", "server.js");
// 게임 뷰의 브리지 테스트가 쓰는 고정 포트. 두 describe 가 차례로 쓴다. E2E_BRIDGE_PORT 로 바꾼다
const BRIDGE_PORT = Number(process.env.E2E_BRIDGE_PORT ?? 6073);
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}`;
const hasEngineRepo = existsSync(serverScript) && existsSync(path.join(engineDir, "scripts", "lua", "main.lua"));

async function isHealthy(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function waitForHealth(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHealthy(url)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`브리지 서버가 뜨지 않았다: ${url}`);
}

/** 엔진 저장소의 resources 와 scripts 를 임시 폴더에 복사하고 Lua 로 도는 game.json 을 쓴다 (엔진 저장소를 직접 가리키지 않는다) */
function copyEngineProject(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  const skip = (src: string) => {
    const rel = path.relative(engineDir, src).split(path.sep).join("/");
    return rel === "resources/rtp" || rel.startsWith("resources/rtp/") || /\.(zip|psd)$/i.test(rel) || path.basename(src).startsWith(".");
  };
  for (const sub of ["resources", "scripts"]) {
    cpSync(path.join(engineDir, sub), path.join(dir, sub), { recursive: true, filter: (src) => !skip(src) });
  }
  mkdirSync(path.join(dir, ".initial-editor"), { recursive: true });
  writeFileSync(path.join(dir, "game.json"), JSON.stringify({ name: "Initial2D", windowWidth: 768, windowHeight: 896, renderScale: 1, script: "lua" }, null, 2) + "\n");
  return dir;
}

/** projectDir 로 브리지 서버를 띄운다. 그 포트에 이미 다른 서버가 있으면 그 프로젝트를 볼 수 있으므로 멈춘다 */
async function startBridge(projectDir: string): Promise<ChildProcess> {
  if (await isHealthy(`${BRIDGE_URL}/api/health`)) throw new Error(`포트 ${BRIDGE_PORT} 에 이미 브리지 서버가 있다`);
  const proc = spawn(process.execPath, [serverScript, "--project", projectDir, "--port", String(BRIDGE_PORT), "--quiet"], { stdio: ["ignore", "pipe", "pipe"] });
  proc.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[bridge] ${chunk}`));
  await waitForHealth(`${BRIDGE_URL}/api/health`);
  return proc;
}

/** 서버가 끝나기(포트를 놓기)까지 기다린다. 다음 describe 가 같은 포트를 쓴다 */
async function stopBridge(proc: ChildProcess | null): Promise<void> {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => proc.once("exit", () => resolve()));
  proc.kill();
  await exited;
}

async function openBridgeProject(page: Page): Promise<void> {
  await page.goto(`/?backend=bridge&url=${encodeURIComponent(BRIDGE_URL)}`);
  await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
  await page.reload();
  await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("toolbar").locator('[data-command="run.start"]')).toBeEnabled();
}

/** 아무도 듣지 않는 포트 (연결하면 거부된다) */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

async function setLanguage(page: Page, language: "lua" | "mruby"): Promise<void> {
  await page.evaluate(
    (id) => (window as unknown as { initialEditor: { commands: { execute(id: string): Promise<boolean> } } }).initialEditor.commands.execute(id),
    `run.language.${language}`,
  );
  await expect(page.getByTestId("language-select")).toHaveValue(language);
}

test.describe("게임 뷰 (브리지 모드, 알데바란)", () => {
  test.skip(!hasEngineRepo, `엔진 저장소가 없다: ${engineDir} (INITIAL2D_DIR 로 위치를 준다)`);

  let proc: ChildProcess | null = null;
  let projectDir = "";

  test.beforeAll(async () => {
    projectDir = copyEngineProject("initial-editor-game-view-");
    proc = await startBridge(projectDir);
  });

  test.afterAll(async () => {
    await stopBridge(proc);
    proc = null;
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  /** F5 → 타이틀(색이 많고 한 색이 화면을 덮지 않는다) → Enter 로 숲(칸 밝기가 크게 바뀐다). 스크립트 오류 없이 until 까지 돈다 */
  async function playTitleToForest(page: Page, opts: { until: number; errors: RegExp; shot?: string }): Promise<void> {
    const started = Date.now();
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 60_000 });
    await expect
      .poll(async () => {
        const s = await capture(page);
        return s ? s.distinctColors >= 64 && s.dominantShare < 0.9 : false;
      }, { timeout: 20_000 })
      .toBe(true);
    if (opts.shot) {
      mkdirSync(path.dirname(opts.shot), { recursive: true });
      await view.screenshot({ path: opts.shot });
    }
    // 키는 canvas 가 받는다. 시작(Enter)을 누르면 숲이 열려 화면이 크게 바뀐다 (타이틀끼리는 1 아래, 숲은 18 안팎)
    const title = (await capture(page))!;
    await page.getByTestId("game-canvas").focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => gridDifference(title, (await capture(page))!), { timeout: 10_000 }).toBeGreaterThan(8);
    if (opts.shot) await view.screenshot({ path: opts.shot.replace(/\.png$/, "-forest.png") });
    const rest = opts.until - (Date.now() - started);
    if (rest > 0) await page.waitForTimeout(rest);
    await expect(view).toHaveAttribute("data-phase", "running");
    await expect(page.getByTestId("console-list")).not.toContainText(opts.errors);
    await expect(page.getByTestId("console-list")).toContainText("Initial2D web: renderer=");

    await page.getByTestId("doc-tab").filter({ hasText: "게임" }).click();
    await page.keyboard.press("Shift+F5");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
  }

  test("F5 로 알데바란 타이틀이 게임 탭에 그려지고, Enter 로 숲이 열리고, Lua 오류가 없다", async ({ page }) => {
    test.setTimeout(90_000);
    await openBridgeProject(page);
    await expect(page.getByTestId("language-select")).toHaveValue("lua");
    // F5 뒤 20 초까지 Lua 오류가 없다
    await playTitleToForest(page, { until: 20_000, errors: /Lua error|fatal:/, shot: process.env.GAME_VIEW_SCREENSHOT });
  });

  test("game.json 이 mruby 면 Ruby 판 알데바란이 같은 흐름으로 돈다", async ({ page }) => {
    test.skip(!engineFeatures().includes("mruby"), "public/engine 의 웹 빌드에 mruby 가 없다 (MANIFEST 의 기능)");
    test.skip(!existsSync(path.join(projectDir, "scripts", "ruby", "main.rb")), "엔진 저장소에 scripts/ruby/main.rb 가 없다");
    test.setTimeout(90_000);
    await openBridgeProject(page);
    // 언어를 바꾸면 사본의 game.json 에 쓰인다
    await setLanguage(page, "mruby");
    await expect.poll(() => (JSON.parse(readFileSync(path.join(projectDir, "game.json"), "utf8")) as { script?: string }).script).toBe("mruby");
    try {
      await playTitleToForest(page, { until: 15_000, errors: /mruby: uncaught exception|\(SyntaxError\)|Lua error|fatal:/ });
      await expect(page.getByTestId("console-list")).toContainText(/엔진 시작: 에디터 안 \(웹 엔진, lua mruby wasm\), 언어 mruby/);
    } finally {
      await setLanguage(page, "lua");
    }
  });

  test("게임이 끝난 뒤 고쳐 저장하면 엔진이 없다는 한 줄만 남기고 오류 토스트는 없다 (수동 리로드는 알린다)", async ({ page }) => {
    test.setTimeout(90_000);
    // 브리지가 엔진의 핫 리로드 포트로 보내는 곳을 아무도 듣지 않는 포트로 돌린다 (5959 에 떠 있는 다른 엔진을 건드리지 않는다)
    const port = await freePort();
    await page.route("**/api/reload", (route) =>
      route.request().method() === "POST" ? route.continue({ postData: JSON.stringify({ host: "127.0.0.1", port }) }) : route.continue(),
    );
    await openBridgeProject(page);
    const tree = page.getByTestId("project-tree");
    await tree.locator('[data-path="scripts"]').click();
    await tree.locator('[data-path="scripts/lua"]').click();
    await tree.locator('[data-path="scripts/lua/main.lua"]').dblclick();
    await expect(page.locator(CODE)).toContainText("Initial2D");
    const original = await scriptText(page);
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 60_000 });
    await view.getByRole("button", { name: "정지" }).click();
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });

    const scriptTab = page.getByTestId("doc-tab").filter({ hasText: "main.lua" });
    await scriptTab.click();
    await page.locator(CODE).click();
    await moveCursor(page, 1);
    await page.keyboard.insertText("-- edit\n");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(scriptTab.locator(".doc-tab-dirty")).toHaveCount(0);
    await expect(consoleRows(page, "엔진이 떠 있지 않아 리로드를 건너뛰었다")).toHaveCount(1, { timeout: 10_000 });
    await expect(page.getByTestId("console-list")).not.toContainText("ECONNREFUSED");
    await expect(page.getByTestId("toasts")).not.toContainText("핫 리로드");

    // 수동 리로드는 사용자가 누른 것이라 그대로 알린다
    await page.getByTestId("toolbar").locator('[data-command="run.reload"]').click();
    await expect(page.getByTestId("toasts")).toContainText("핫 리로드 실패: 게임이 INITIAL2D_HMR=1 로 실행 중인지 확인");

    // 사본을 되돌린다
    await undoTo(page, original);
    await page.keyboard.press("ControlOrMeta+s");
    await expect(scriptTab.locator(".doc-tab-dirty")).toHaveCount(0);
  });
});

// ---- 네이티브 엔진과 게임 탭의 같은 씬 대조 (완료 기준 셋째) ----

/**
 * 엔진의 인수 씬을 타이틀에 세운다 (시작 때 update(16) 서른 번, 그 뒤는 update(0)). RTP 는 쓰지 않는다.
 * 메뉴 커서의 깜빡임만 움직인다. 깜빡임은 엔진의 고정 스텝 update(실시간 60 Hz) 수로 세고 프레임 번호로 세지 않아서,
 * 프레임이 빠른 헤드리스 네이티브와 60 fps 인 브라우저는 같은 프레임 번호에서 커서 칸(약 1.4%)이 다를 수 있다
 */
const TITLE_SCENE_ENV = { INITIAL2D_ALDEBARAN_STOP: "title", INITIAL2D_NO_RTP: "1" } as const;
const COMPARE_FRAME = 20;
/** 엔진의 골든 검사(tests/run_engine_tests.py)와 같은 규칙: 채널 차이가 이 값을 넘으면 다른 픽셀 */
const PIXEL_TOLERANCE = 24;
/** 다른 픽셀의 비율이 이 값까지면 같은 화면 */
const MAX_DIFF_RATIO = 0.02;
const LOGICAL_SIZE = { width: 768, height: 896 };
const WEB_FRAME_PATH = "/tmp/game-view-compare.bmp";

interface ImageDiff {
  width: number;
  height: number;
  /** 채널 차이가 PIXEL_TOLERANCE 를 넘는 픽셀 수와 비율 */
  bad: number;
  ratio: number;
  /** 채널 차이의 평균과 최대 (0 ~ 255) */
  mean: number;
  max: number;
  /** 다른 픽셀을 모두 담는 사각형 [x0, y0, x1, y1] (없으면 null) */
  box: [number, number, number, number] | null;
}

type CompareSource = { kind: "bytes"; base64: string; type: string } | { kind: "frame"; path: string } | { kind: "canvas" };

/**
 * 페이지 안에서 그림들을 같은 논리 크기의 RGBA 로 풀어 기준(첫째)과 나머지를 견준다.
 * bytes 는 BMP 나 PNG 파일, frame 은 게임 탭 엔진의 MEMFS 에 쓴 프레임 덤프, canvas 는 게임 탭 canvas 의 다음 프레임이다.
 */
function compareInPage(page: Page, reference: CompareSource, others: CompareSource[]): Promise<ImageDiff[]> {
  return page.evaluate(
    async ({ reference, others, tolerance, size }) => {
      type Game = { module: { FS: { readFile(p: string): Uint8Array } } };
      const gameView = (window as unknown as { initialEditor: { gameView: { canvas: HTMLCanvasElement | null; session: { game: Game | null } | null } } }).initialEditor.gameView;
      const normalize = (img: CanvasImageSource, w: number, h: number): Uint8ClampedArray => {
        const c = document.createElement("canvas");
        c.width = size.width;
        c.height = size.height;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.imageSmoothingEnabled = w !== size.width || h !== size.height;
        ctx.drawImage(img, 0, 0, w, h, 0, 0, size.width, size.height);
        return ctx.getImageData(0, 0, size.width, size.height).data;
      };
      const decode = async (bytes: Uint8Array, type: string) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
        return normalize(bitmap, bitmap.width, bitmap.height);
      };
      const load = async (src: CompareSource): Promise<Uint8ClampedArray> => {
        if (src.kind === "bytes") return decode(Uint8Array.from(atob(src.base64), (ch) => ch.charCodeAt(0)), src.type);
        if (src.kind === "frame") {
          const game = gameView.session?.game;
          if (!game) throw new Error("게임 탭의 엔진이 돌고 있지 않다");
          return decode(game.module.FS.readFile(src.path), "image/bmp");
        }
        const canvas = gameView.canvas;
        if (!canvas) throw new Error("게임 탭의 canvas 가 없다");
        // 엔진의 프레임 콜백 바로 뒤 (WebGL 버퍼가 남아 있다)
        return new Promise((resolve, reject) =>
          requestAnimationFrame(() => {
            try {
              resolve(normalize(canvas, canvas.width, canvas.height));
            } catch (e) {
              reject(e);
            }
          }),
        );
      };
      const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
        let bad = 0;
        let sum = 0;
        let max = 0;
        let box: [number, number, number, number] | null = null;
        for (let i = 0; i < a.length; i += 4) {
          const dr = Math.abs(a[i] - b[i]);
          const dg = Math.abs(a[i + 1] - b[i + 1]);
          const db = Math.abs(a[i + 2] - b[i + 2]);
          const m = Math.max(dr, dg, db);
          if (m > tolerance) {
            bad++;
            const x = (i / 4) % size.width;
            const y = Math.floor(i / 4 / size.width);
            box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y];
          }
          if (m > max) max = m;
          sum += dr + dg + db;
        }
        const n = a.length / 4;
        return { width: size.width, height: size.height, bad, ratio: bad / n, mean: sum / (n * 3), max, box };
      };
      const base = await load(reference);
      const out = [];
      for (const src of others) out.push(diff(base, await load(src)));
      return out;
    },
    { reference, others, tolerance: PIXEL_TOLERANCE, size: LOGICAL_SIZE },
  );
}

function describeDiff(d: ImageDiff): string {
  const where = d.box ? `, 다른 곳 (${d.box[0]},${d.box[1]}) ~ (${d.box[2]},${d.box[3]})` : "";
  return `다른 픽셀 ${d.bad} / ${d.width * d.height} (${(d.ratio * 100).toFixed(2)}%), 채널 차이 평균 ${d.mean.toFixed(2)} 최대 ${d.max}${where}`;
}

test.describe("게임 뷰와 네이티브 엔진 (같은 씬, 같은 프레임)", () => {
  const nativeExe = path.resolve(process.env.INITIAL2D_NATIVE ?? path.join(engineDir, "build", "Initial2D"));
  const golden = path.join(engineDir, "tests", "golden", "aldebaran_title.png");
  const scene = path.join(engineDir, "tests", "engine", "scenes", "aldebaran_scene.lua");
  const replay = path.join(engineDir, "tests", "lua", "input_replay.lua");
  test.skip(!hasEngineRepo || !existsSync(scene) || !existsSync(replay), `엔진 저장소의 인수 씬이 없다: ${scene}`);
  test.skip(!existsSync(nativeExe) && !existsSync(golden), `네이티브 실행 파일(${nativeExe})도 골든(${golden})도 없다`);

  let proc: ChildProcess | null = null;
  let projectDir = "";
  let nativeDir = "";

  test.beforeAll(async () => {
    // 엔진의 테스트 러너(make_workdir)와 같은 배치: 인수 씬이 scripts/lua/main.lua, 입력 재생기가 luatests/ 에
    projectDir = copyEngineProject("initial-editor-native-compare-");
    cpSync(scene, path.join(projectDir, "scripts", "lua", "main.lua"));
    mkdirSync(path.join(projectDir, "scripts", "lua", "luatests"), { recursive: true });
    cpSync(replay, path.join(projectDir, "scripts", "lua", "luatests", "input_replay.lua"));
    nativeDir = mkdtempSync(path.join(tmpdir(), "initial-editor-native-shot-"));
    proc = await startBridge(projectDir);
  });

  test.afterAll(async () => {
    await stopBridge(proc);
    proc = null;
    for (const dir of [projectDir, nativeDir]) if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("알데바란 타이틀의 20 프레임째가 네이티브 엔진과 게임 탭에서 같다 (골든 검사와 같은 허용 오차)", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    // 1. 네이티브: 프로세스 실행과 같은 실행 파일을 같은 프로젝트 폴더에서 헤드리스로, 유한하게
    let native: CompareSource | null = null;
    if (existsSync(nativeExe)) {
      const shot = path.join(nativeDir, "native.bmp");
      const run = spawnSync(nativeExe, [], {
        cwd: projectDir,
        env: {
          ...process.env,
          SDL_VIDEODRIVER: "dummy",
          SDL_AUDIODRIVER: "dummy",
          ...TITLE_SCENE_ENV,
          INITIAL2D_SCREENSHOT: shot,
          INITIAL2D_SCREENSHOT_FRAME: String(COMPARE_FRAME),
          INITIAL2D_EXIT_AFTER: String(COMPARE_FRAME + 10),
        },
        encoding: "utf8",
        timeout: 60_000,
      });
      expect(run.status, `${nativeExe} 종료 코드 ${run.status}\n${run.stdout}\n${run.stderr}`).toBe(0);
      expect(`${run.stdout}${run.stderr}`).not.toMatch(/Lua error|PANIC/);
      expect(existsSync(shot), `네이티브가 ${COMPARE_FRAME} 프레임을 찍지 않았다`).toBe(true);
      native = { kind: "bytes", base64: readFileSync(shot).toString("base64"), type: "image/bmp" };
    }
    const goldenSource: CompareSource | null = existsSync(golden) ? { kind: "bytes", base64: readFileSync(golden).toString("base64"), type: "image/png" } : null;
    const reference = native ?? goldenSource!;
    const referenceName = native ? `네이티브 ${path.relative(engineDir, nativeExe)}` : `골든 ${path.relative(engineDir, golden)}`;

    // 2. 게임 탭: 같은 설정으로 띄우고 엔진이 MEMFS 에 쓴 20 프레임째와 canvas 를 읽는다
    await openBridgeProject(page);
    await page.evaluate(
      (env) => (window as unknown as { initialEditor: { runner: { start(o: { env: Record<string, string> }): Promise<void> } } }).initialEditor.runner.start({ env }),
      { ...TITLE_SCENE_ENV, INITIAL2D_SCREENSHOT: WEB_FRAME_PATH, INITIAL2D_SCREENSHOT_FRAME: String(COMPARE_FRAME) },
    );
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 60_000 });
    await page.waitForFunction(
      (p) => {
        const game = (window as unknown as { initialEditor: { gameView: { session: { game: { module: { FS: { analyzePath(p: string): { exists: boolean } } } } | null } | null } } }).initialEditor.gameView.session?.game;
        return !!game && game.module.FS.analyzePath(p).exists;
      },
      WEB_FRAME_PATH,
      { timeout: 20_000 },
    );
    const sources: CompareSource[] = [{ kind: "frame", path: WEB_FRAME_PATH }, { kind: "canvas" }];
    const [frameDiff, canvasDiff] = await compareInPage(page, reference, sources);
    const lines = [`기준: ${referenceName} (${COMPARE_FRAME} 프레임, ${JSON.stringify(TITLE_SCENE_ENV)})`, `게임 탭 엔진의 ${COMPARE_FRAME} 프레임: ${describeDiff(frameDiff)}`, `게임 탭 canvas: ${describeDiff(canvasDiff)}`];
    if (native && goldenSource) {
      const [goldenFrame] = await compareInPage(page, goldenSource, [{ kind: "frame", path: WEB_FRAME_PATH }]);
      lines.push(`참고, 골든과 게임 탭 엔진의 ${COMPARE_FRAME} 프레임: ${describeDiff(goldenFrame)}`);
    }
    await testInfo.attach("native-compare.txt", { body: lines.join("\n"), contentType: "text/plain" });
    console.log(lines.join("\n"));
    expect(frameDiff.ratio, lines.join("\n")).toBeLessThanOrEqual(MAX_DIFF_RATIO);
    expect(canvasDiff.ratio, lines.join("\n")).toBeLessThanOrEqual(MAX_DIFF_RATIO);
    await expect(page.getByTestId("console-list")).not.toContainText(/Lua error|fatal:/);

    await view.getByRole("button", { name: "정지" }).click();
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
  });
});
