// 비주얼 스크립팅 e2e (docs/plans/visual-scripting.md 7절). 메모리 백엔드라 서버가 필요 없다.
//   1. 플래피 bird 그래프(노드 80개)를 열고, 노드의 상수를 바꿔 저장하면 생성 코드(Lua, Ruby)가 바뀌고, 되돌리기가 되고,
//      생성 파일의 줄에서 그 줄을 만든 노드로 간다. 생성 파일은 읽기 전용이고 "그래프 열기"가 있다
//   2. 새 그래프 컴포넌트: 선을 빈 곳에 놓아 노드 추가 목록에서 노드를 더하면 이어지고, 상수, 추가 단추, 포트 끌기 연결,
//      Delete 로 지우기, 저장하면 print("hi") 가 생긴다
//   3. 게임 탭이 도는 중에 그래프를 저장하면 생성 코드도 핫 리로드에 실려 게임이 새 값을 찍는다
//   4. 손으로 쓴 파일은 덮어쓰지 않고, "생성 파일 덮어쓰기"가 확인 뒤 덮어쓴다

import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LAYOUT_KEY = "initial-editor.layout";
const FIXTURES = join(__dirname, "..", "..", "packages", "core", "src", "graph", "fixtures", "flappy");
const BIRD = "scripts/components/flappy/bird.graph.json";
const LIB = "scripts/components/flappy/common.nodes.json";
const LUA = "scripts/lua/components/flappy/bird.lua";
const RUBY = "scripts/ruby/components/flappy/bird.rb";

type GraphDocLike = { path: string; graph: { nodes: { id: string; kind: string; next?: string; in?: Record<string, string>; args?: Record<string, unknown> }[] }; dirty: boolean; selection: Set<string> };
type EditorLike = {
  documents: { active: GraphDocLike | null };
  backend: { readText(p: string): Promise<string>; writeText(p: string, t: string): Promise<void>; exists(p: string): Promise<boolean> };
  openPath(p: string): Promise<void>;
  graphSupport: { revealGenerated(p: string, line?: number): Promise<boolean> };
};

function withEditor<T, A>(page: Page, fn: (e: EditorLike, arg: A) => T | Promise<T>, arg: A): Promise<T> {
  return page.evaluate(
    async ({ src, a }) => {
      const f = new Function("e", "a", `return (${src})(e, a)`) as (e: unknown, a: unknown) => unknown;
      return f((window as unknown as { initialEditor: unknown }).initialEditor, a);
    },
    { src: fn.toString(), a: arg as unknown },
  ) as Promise<T>;
}

async function openSample(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/?backend=memory&sample=meadow");
  await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
}

async function writeBird(page: Page, extra: Record<string, string> = {}) {
  const files = { [BIRD]: readFileSync(join(FIXTURES, "bird.graph.json"), "utf8"), [LIB]: readFileSync(join(FIXTURES, "common.nodes.json"), "utf8"), ...extra };
  await withEditor(page, async (e, fs) => {
    for (const [p, t] of Object.entries(fs)) await e.backend.writeText(p, t);
  }, files);
}

async function primaryKey(page: Page): Promise<string> {
  return (await page.evaluate(() => /Mac/i.test(navigator.platform))) ? "Meta" : "Control";
}

const readFile = (page: Page, path: string) => withEditor(page, (e, p) => e.backend.readText(p), path);

/** 요소의 가운데 (화면 좌표) */
async function center(loc: Locator) {
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function dragTo(page: Page, from: Locator, to: { x: number; y: number }) {
  const a = await center(from);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + to.x) / 2, (a.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

test.describe("비주얼 스크립팅 (메모리 모드)", () => {
  test("플래피 bird 그래프: 상수를 바꿔 저장하면 생성 코드가 바뀌고, 되돌리기, 생성 파일의 줄에서 노드로", async ({ page }) => {
    await openSample(page);
    await writeBird(page);
    const mod = await primaryKey(page);
    await withEditor(page, (e, p) => e.openPath(p), BIRD);
    const view = page.getByTestId("graph-view");
    await expect(view).toBeVisible();
    await expect(view.locator("[data-node]")).toHaveCount(80);
    await expect(page.getByTestId("graph-status")).toHaveText("오류 없음");
    // 상태 필드는 라이브러리(common.nodes.json)가 선언한 것이 보인다
    await page.getByTestId("graph-vars-state").locator("summary").click();
    await expect(page.getByTestId("graph-inherited-state")).toContainText("birdVy");

    // 부유 폭 14 를 20 으로
    const arg = view.locator('[data-node="float_off"] [data-arg="b"]');
    await expect(arg).toHaveValue("14");
    await arg.fill("20");
    expect(await withEditor(page, (e) => e.documents.active?.dirty, null)).toBe(true);
    await page.keyboard.press(`${mod}+s`);
    await expect(page.getByTestId("graph-generation")).toHaveText("생성 코드 저장됨");
    expect(await readFile(page, LUA)).toContain("math.sin(st.readyTime * 4) * 20");
    expect(await readFile(page, RUBY)).toContain("Math.sin(st[:ready_time] * 4) * 20");
    expect(await readFile(page, BIRD)).toContain('{ "id": "float_off", "kind": "math.mul", "in": { "a": "ready_sin" }, "args": { "b": 20 } }');

    // 되돌리기 (캔버스에 초점)
    await view.getByTestId("graph-canvas").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press(`${mod}+z`);
    await expect(arg).toHaveValue("14");

    // 생성 파일의 줄 (콘솔 오류 링크와 같은 길) 에서 그 줄을 만든 노드로
    const lines = (await readFile(page, RUBY)).split("\n");
    const dieLine = lines.findIndex((l) => l.includes("FlappyCommon.die(st)")) + 1;
    expect(await withEditor(page, (e, [p, l]) => e.graphSupport.revealGenerated(p, l), [RUBY, dieLine] as [string, number])).toBe(true);
    await expect(view.locator('[data-node="die"]')).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("graph-node-settings")).toContainText("게임 오버");

    // 생성 파일은 읽기 전용이고 그래프로 돌아가는 단추가 있다
    await view.getByRole("button", { name: "Lua 코드" }).click();
    await expect(page.getByTestId("script-generated")).toContainText(BIRD);
    await page.getByTestId("script-open-graph").click();
    await expect(page.getByTestId("graph-view")).toBeVisible();
  });

  test("새 그래프 컴포넌트: 선을 놓아 노드 추가, 상수, 포트 연결, 삭제, 저장", async ({ page }) => {
    await openSample(page);
    const mod = await primaryKey(page);
    await page.getByRole("menubar").getByRole("menuitem", { name: "파일", exact: true }).click();
    await page.locator(".menu-item", { hasText: "새 그래프 컴포넌트" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("Hello");
    await expect(dialog.getByRole("button", { name: "만들기" })).toBeDisabled();
    await dialog.getByRole("textbox").fill("hello");
    await dialog.getByRole("button", { name: "만들기" }).click();
    const view = page.getByTestId("graph-view");
    await expect(view.locator("[data-node]")).toHaveCount(2);
    await expect.poll(() => withEditor(page, (e) => e.backend.exists("scripts/lua/components/hello.lua"), null)).toBe(true);
    await expect(page.getByTestId("project-tree").locator('[data-path="scripts/components/hello.graph.json"]')).toBeVisible();

    // init 의 실행 출구를 빈 곳에 놓으면 노드 추가 목록이 열리고, 고른 노드가 이어진다
    const canvas = view.getByTestId("graph-canvas");
    const box = (await canvas.boundingBox())!;
    await dragTo(page, view.locator('[data-node="init"] [data-pin="next"]'), { x: box.x + box.width * 0.6, y: box.y + box.height * 0.3 });
    const palette = page.getByTestId("graph-palette");
    await expect(palette).toBeVisible();
    await page.getByTestId("graph-palette-search").fill("콘솔");
    await page.keyboard.press("Enter");
    await expect(palette).toHaveCount(0);
    await expect(view.locator('[data-node="print"]')).toBeVisible();
    expect(await withEditor(page, (e) => e.documents.active?.graph.nodes.find((n) => n.id === "init")?.next, null)).toBe("print");
    await expect(page.getByTestId("graph-status")).toHaveText("오류 1");

    await view.locator('[data-node="print"] [data-arg="value"]').fill("hi");
    await expect(page.getByTestId("graph-status")).toHaveText("오류 없음");

    // 노드 추가 단추로 난수를 더하고, 그 출력을 print 의 값 포트에 끌어 잇는다
    await view.getByTestId("graph-add-node").click();
    await page.getByTestId("graph-palette-search").fill("난수 (0");
    await page.keyboard.press("Enter");
    await expect(view.locator('[data-node="random"]')).toBeVisible();
    await dragTo(page, view.locator('[data-node="random"] [data-pin="out"]'), await center(view.locator('[data-node="print"] [data-pin="value"]')));
    expect(await withEditor(page, (e) => e.documents.active?.graph.nodes.find((n) => n.id === "print")?.in, null)).toEqual({ value: "random" });
    await expect(view.locator('[data-node="print"] [data-arg="value"]')).toHaveCount(0);

    // 난수를 고르고 Delete: 노드와 그 연결이 지워지고 상수 칸이 돌아온다
    await view.locator('[data-node="random"] .graph-node-header').click();
    await page.keyboard.press("Delete");
    await expect(view.locator('[data-node="random"]')).toHaveCount(0);
    await expect(view.locator('[data-node="print"] [data-arg="value"]')).toHaveValue("hi");

    await page.keyboard.press(`${mod}+s`);
    await expect(page.getByTestId("graph-generation")).toHaveText("생성 코드 저장됨");
    expect(await readFile(page, "scripts/lua/components/hello.lua")).toContain('function M.init(obj, scene, params)\n\tprint("hi")\nend');
    expect(await readFile(page, "scripts/ruby/components/hello.rb")).toContain('module Components\n  class Hello\n    def init(obj, scene)\n      puts("hi")\n    end');
  });

  test("게임 탭이 도는 중에 그래프를 저장하면 생성 코드가 다시 올라가 게임에 반영된다", async ({ page }) => {
    await openSample(page);
    const mod = await primaryKey(page);
    const graph = {
      version: 1,
      nodes: [
        { id: "init", kind: "event.init", next: "say" },
        { id: "say", kind: "text.print", args: { value: "graph:v1" } },
      ],
      layout: { init: [0, 0], say: [260, 0] },
    };
    // 샘플의 진입 파일 대신 그래프 컴포넌트의 init 을 부르는 진입 파일
    const main = [
      'local hello = require("scripts/lua/components/hello")',
      "local obj, scene = { x = 0, y = 0, props = {} }, { state = {} }",
      "function Initialize() hello.init(obj, scene, {}) end",
      "function Update(elapsed) end",
      "function Render() end",
      "",
    ].join("\n");
    await withEditor(page, async (e, [g, m]) => {
      await e.backend.writeText("scripts/components/hello.graph.json", g);
      await e.backend.writeText("scripts/lua/main.lua", m);
      await e.openPath("scripts/components/hello.graph.json");
      await (e.documents.active as unknown as { generate(): Promise<unknown> }).generate();
    }, [JSON.stringify(graph), main] as [string, string]);
    expect(await readFile(page, "scripts/lua/components/hello.lua")).toContain('print("graph:v1")');

    await page.keyboard.press("F5");
    await expect(page.getByTestId("game-view")).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect(page.getByTestId("console-list")).toContainText("graph:v1", { timeout: 15_000 });

    await page.getByTestId("doc-tab").filter({ hasText: "hello.graph.json" }).click();
    await page.getByTestId("graph-view").locator('[data-node="say"] [data-arg="value"]').fill("graph:v2");
    await page.keyboard.press(`${mod}+s`);
    await expect(page.getByTestId("console-list")).toContainText("핫 리로드: 웹 엔진에 파일 3개를 다시 복사했습니다", { timeout: 10_000 });
    await expect(page.getByTestId("console-list")).toContainText("graph:v2", { timeout: 10_000 });
  });

  test("메모 상자, 미니맵, 선을 놓아 연 목록은 그 선에 맞는 노드만", async ({ page }) => {
    await openSample(page);
    await writeBird(page);
    await withEditor(page, (e, p) => e.openPath(p), BIRD);
    const view = page.getByTestId("graph-view");
    await expect(view.locator("[data-node]")).toHaveCount(80);
    const focus = (ids: string[]) =>
      withEditor(page, (e, list) => (e.graphSupport as unknown as { focus(d: unknown, n: string[]): void }).focus(e.documents.active, list), ids);
    const layoutOf = (id: string) => withEditor(page, (e, n) => (e.documents.active as unknown as { graph: { layout: Record<string, [number, number]> } }).graph.layout[n], id);

    // 고른 노드를 감싸는 메모, 옆 창에서 글 고치기
    await focus(["fall", "cap_if"]);
    await view.getByTestId("graph-add-comment").click();
    const note = view.locator('[data-comment="note"]');
    await expect(note).toHaveAttribute("data-selected", "true");
    await page.getByTestId("graph-comment-text").fill("중력과 최대 속도");
    await page.getByTestId("graph-comment-text").blur();
    await expect(note.locator(".graph-comment-header")).toHaveText("중력과 최대 속도");

    // 머리를 끌면 안의 노드가 함께 움직인다
    const fall0 = await layoutOf("fall");
    const cap0 = await layoutOf("cap_if");
    await dragTo(page, note.locator(".graph-comment-header"), { x: (await center(note.locator(".graph-comment-header"))).x + 80, y: (await center(note.locator(".graph-comment-header"))).y + 40 });
    const fall1 = await layoutOf("fall");
    const cap1 = await layoutOf("cap_if");
    expect(fall1[0] - fall0[0]).toBeGreaterThan(20);
    expect(fall1[0] - fall0[0]).toBe(cap1[0] - cap0[0]);
    expect(fall1[1] - fall0[1]).toBe(cap1[1] - cap0[1]);

    // Delete 는 고른 메모만 지운다
    await page.keyboard.press("Delete");
    await expect(note).toHaveCount(0);
    await expect(view.locator("[data-node]")).toHaveCount(80);

    // 미니맵을 누르면 그 자리로 옮긴다
    const canvas = view.getByTestId("graph-canvas");
    const panX = await canvas.getAttribute("data-pan-x");
    const map = (await view.getByTestId("graph-minimap").boundingBox())!;
    await page.mouse.click(map.x + 10, map.y + map.height / 2);
    await expect(canvas).not.toHaveAttribute("data-pan-x", panX!);

    // 참과 거짓 출력의 선을 놓으면 그 값을 받는 노드만 보인다
    await focus(["too_fast"]);
    const pin = view.locator('[data-node="too_fast"] [data-pin="out"]');
    const at = await center(pin);
    await dragTo(page, pin, { x: at.x + 60, y: at.y + 160 });
    await expect(page.getByTestId("graph-palette-title")).toHaveText("선에 이을 수 있는 노드");
    const items = page.getByTestId("graph-palette").locator(".graph-palette-item");
    await expect(items.filter({ hasText: "조건 분기" })).toHaveCount(1);
    await expect(items.filter({ hasText: "덧셈" })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("손으로 쓴 파일은 덮어쓰지 않고, 확인 뒤에 덮어쓴다", async ({ page }) => {
    await openSample(page);
    const hand = "-- 손으로 쓴 bird\nreturn {}\n";
    await writeBird(page, { [LUA]: hand });
    const mod = await primaryKey(page);
    await withEditor(page, (e, p) => e.openPath(p), BIRD);
    const view = page.getByTestId("graph-view");
    await view.locator('[data-node="float_off"] [data-arg="b"]').fill("15");
    await page.keyboard.press(`${mod}+s`);
    await expect(page.getByTestId("graph-generation")).toHaveText("손으로 쓴 파일이 있어 일부 생성 안 됨");
    expect(await readFile(page, LUA)).toBe(hand);
    expect(await readFile(page, RUBY)).toContain("* 15");
    await page.getByTestId("graph-overwrite").click();
    await page.getByRole("dialog").getByRole("button", { name: "덮어쓰기" }).click();
    await expect.poll(() => readFile(page, LUA)).toContain("-- 그래프에서 만든 파일: scripts/components/flappy/bird.graph.json");
  });
});
