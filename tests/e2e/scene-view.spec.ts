// 씬 뷰 e2e (docs/plans/e2-scene.md 마일스톤 4). 메모리 백엔드(?backend=memory)라 서버가 필요 없다.
// 흐름: 씬 파일 더블클릭 → PIXI 캔버스 탭 → 클릭 선택 → 끌기 이동 → 편집 메뉴로 되돌리기 → 씬 메뉴로 격자 끄기
//       → 저장하면 파일에 새 좌표 → 상자 선택과 방향키와 Escape → 둘째 씬 탭 열고 닫기.
// 오브젝트 좌표를 캔버스 픽셀로 옮길 때는 씬 뷰가 DOM 에 내보내는 data-zoom, data-pan-x, data-pan-y 를 쓴다
// (screen = world * zoom + pan).

import { expect, test, type Locator, type Page } from "@playwright/test";

const LAYOUT_KEY = "initial-editor.layout";
const VIEW_KEY = "initial-editor.sceneView";
const SCENE_PATH = "resources/scenes/main.json";

interface EditorWindow {
  initialEditor: {
    openPath(path: string): Promise<void>;
    backend: { readText(p: string): Promise<string>; writeText(p: string, t: string): Promise<void> };
    documents: { active: { path: string | null; scene: { find(id: string): { x: number; y: number } | undefined } } | null };
  };
}

async function openMenu(page: Page, branch: string, item: string | RegExp) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item", { hasText: item }).first().click();
}

async function openSample(page: Page) {
  await page.goto("/?backend=memory&sample=meadow");
  await page.evaluate(
    ([layout, view]) => {
      localStorage.removeItem(layout);
      localStorage.removeItem(view);
    },
    [LAYOUT_KEY, VIEW_KEY],
  );
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  const tree = page.getByTestId("project-tree");
  await expect(tree.locator('[data-path="resources"]')).toBeVisible();
  return tree;
}

/** 씬 탭을 열고 캔버스가 준비될 때까지 기다린다 */
async function openMainScene(page: Page) {
  const tree = await openSample(page);
  await tree.locator('[data-path="resources"]').click();
  await tree.locator('[data-path="resources/scenes"]').click();
  await tree.locator('[data-path="resources/scenes/main.json"]').dblclick();
  await expect(page.getByTestId("doc-tab").filter({ hasText: "main.json" })).toBeVisible();
  const view = page.getByTestId("scene-view");
  await expect(view).toBeVisible();
  await expect(view.locator("canvas")).toBeVisible();
  await expect(view).toHaveAttribute("data-ready", "true");
  // Monaco 로 열리지 않았다
  await expect(page.locator(".monaco-editor")).toHaveCount(0);
  return { tree, view };
}

/** 월드 좌표를 페이지 좌표로 (캔버스의 위치 + world * zoom + pan) */
async function toPage(view: Locator, world: { x: number; y: number }) {
  const canvas = view.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("캔버스가 없다");
  const zoom = Number(await view.getAttribute("data-zoom"));
  const panX = Number(await view.getAttribute("data-pan-x"));
  const panY = Number(await view.getAttribute("data-pan-y"));
  return { x: box.x + world.x * zoom + panX, y: box.y + world.y * zoom + panY, zoom };
}

function objectPosition(page: Page, id: string) {
  return page.evaluate((objectId) => {
    const doc = (window as unknown as EditorWindow).initialEditor.documents.active;
    const o = doc?.scene.find(objectId);
    return o ? { x: o.x, y: o.y } : null;
  }, id);
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 });
  await page.mouse.up();
}

test.describe("씬 뷰 (메모리 모드)", () => {
  test("열기, 클릭 선택, 끌기, 되돌리기, 격자 토글, 저장, 둘째 탭", async ({ page }) => {
    const { view } = await openMainScene(page);
    const count = page.getByTestId("scene-selection-count");
    await expect(count).toHaveText("0");
    await expect(view).toHaveAttribute("data-grid", "on");
    await expect(view).toHaveAttribute("data-snap", "off");
    await expect(view).toContainText("오브젝트 4");
    await expect(view).toContainText("768 x 896");

    // 첫 스프라이트(bg, 32,32 에 16x16 을 4배 = 64x64) 의 가운데를 클릭
    const start = await toPage(view, { x: 48, y: 48 });
    await page.mouse.click(start.x, start.y);
    await expect(count).toHaveText("1");

    // 40px 끌면 좌표가 40 / zoom 만큼 바뀐다 (기본 줌 1)
    expect(start.zoom).toBe(1);
    await drag(page, start, 40, 40);
    expect(await objectPosition(page, "bg")).toEqual({ x: 72, y: 72 });
    const tab = page.getByTestId("doc-tab").filter({ hasText: "main.json" });
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(1);
    await expect(page.getByTestId("statusbar")).toContainText("저장 안 된 문서 1개");

    // 편집 메뉴의 되돌리기는 끌기 전체를 한 번에 되돌린다
    await openMenu(page, "편집", "되돌리기");
    expect(await objectPosition(page, "bg")).toEqual({ x: 32, y: 32 });
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(0);
    await openMenu(page, "편집", "다시 실행");
    expect(await objectPosition(page, "bg")).toEqual({ x: 72, y: 72 });

    // 씬 메뉴의 격자 토글
    await openMenu(page, "씬", "격자 표시");
    await expect(view).toHaveAttribute("data-grid", "off");
    await openMenu(page, "씬", "격자 표시");
    await expect(view).toHaveAttribute("data-grid", "on");

    // 저장: 파일에 새 좌표가 있고 모르는 키는 남는다
    await view.locator("canvas").click({ position: { x: 4, y: 4 } });
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByTestId("toasts")).toContainText("저장됨: main.json");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(0);
    const saved = await page.evaluate((p) => (window as unknown as EditorWindow).initialEditor.backend.readText(p), SCENE_PATH);
    const parsed = JSON.parse(saved) as { objects: Array<{ id: string; x: number; y: number; editorOnly?: unknown }> };
    expect(parsed.objects[0]).toMatchObject({ id: "bg", x: 72, y: 72 });
    expect(parsed.objects[3].editorOnly).toEqual({ note: "컴포넌트 스크립트 추가용 빈 노드" });

    // 둘째 씬 탭을 열고 닫는다
    await page.evaluate(async (p) => {
      const e = (window as unknown as EditorWindow).initialEditor;
      await e.backend.writeText(p, JSON.stringify({ version: 1, name: "second", objects: [{ id: "n", type: "node", x: 10, y: 10 }] }));
      await e.openPath(p);
    }, "resources/scenes/second.json");
    const second = page.getByTestId("doc-tab").filter({ hasText: "second.json" });
    await expect(second).toBeVisible();
    await expect(page.getByTestId("scene-view").filter({ hasText: "오브젝트 1" })).toBeVisible();
    await expect(page.getByTestId("scene-view").filter({ hasText: "오브젝트 1" })).toHaveAttribute("data-ready", "true");
    await second.hover();
    await second.getByRole("button", { name: /닫기/ }).click();
    await expect(second).toHaveCount(0);
    await expect(page.getByTestId("scene-view").filter({ hasText: "오브젝트 4" })).toBeVisible();
  });

  test("상자 선택, Shift 클릭, 방향키, Escape, 스냅", async ({ page }) => {
    const { view } = await openMainScene(page);
    const count = page.getByTestId("scene-selection-count");

    // 빈 곳에서 상자를 끌어 bg 와 coin 을 함께 고른다 (title 은 y 160 이라 밖)
    const from = await toPage(view, { x: -8, y: -8 });
    const to = await toPage(view, { x: 220, y: 120 });
    await drag(page, from, to.x - from.x, to.y - from.y);
    await expect(count).toHaveText("2");

    // Shift 클릭으로 coin 을 뺀다 (coin: 160,48 에 16x16 을 3배)
    const coin = await toPage(view, { x: 170, y: 60 });
    await page.keyboard.down("Shift");
    await page.mouse.click(coin.x, coin.y);
    await page.keyboard.up("Shift");
    await expect(count).toHaveText("1");

    // 방향키: 1px, Shift 로 10px (캔버스에 초점이 있다)
    await page.keyboard.press("ArrowRight");
    expect(await objectPosition(page, "bg")).toEqual({ x: 33, y: 32 });
    await page.keyboard.press("Shift+ArrowDown");
    expect(await objectPosition(page, "bg")).toEqual({ x: 33, y: 42 });
    await openMenu(page, "편집", "되돌리기");
    expect(await objectPosition(page, "bg")).toEqual({ x: 33, y: 32 });

    // 메뉴를 쓰면 초점이 메뉴로 가므로 선택된 것을 다시 눌러(선택은 그대로) 캔버스에 초점을 주고 Escape 로 선택 해제
    const bgAgain = await toPage(view, { x: 48, y: 48 });
    await page.mouse.click(bgAgain.x, bgAgain.y);
    await expect(count).toHaveText("1");
    await page.keyboard.press("Escape");
    await expect(count).toHaveText("0");

    // 스냅을 켜고 끌면 16 격자에 붙는다
    await openMenu(page, "씬", "스냅");
    await expect(view).toHaveAttribute("data-snap", "on");
    const start = await toPage(view, { x: 48, y: 48 });
    await drag(page, start, 21, 5);
    // 33 + 21 = 54 → 48, 32 + 5 = 37 → 32
    expect(await objectPosition(page, "bg")).toEqual({ x: 48, y: 32 });
    await expect(view.locator("button", { hasText: "스냅" })).toHaveAttribute("aria-pressed", "true");
  });

  test("줌 버튼과 카메라로", async ({ page }) => {
    const { view } = await openMainScene(page);
    const zoom = page.getByTestId("scene-zoom");
    await expect(zoom).toHaveText("100%");
    await view.getByRole("button", { name: "줌 확대" }).click();
    await expect(zoom).toHaveText("150%");
    await expect(view).toHaveAttribute("data-zoom", "1.5");
    await openMenu(page, "씬", "줌 100%");
    await expect(zoom).toHaveText("100%");
    await view.getByRole("button", { name: "카메라에 맞추기" }).click();
    // 캔버스가 896 보다 낮으니 줌은 1 아래로 내려간다
    const fitted = Number(await view.getAttribute("data-zoom"));
    expect(fitted).toBeLessThan(1);
    expect(fitted).toBeGreaterThanOrEqual(0.25);
  });
});
