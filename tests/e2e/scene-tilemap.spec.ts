// 씬의 타일맵 오브젝트 e2e (docs/plans/e3-tilemap.md 마일스톤 5). 메모리 백엔드(?backend=memory)라 서버가 필요 없다.
// 샘플 프로젝트의 resources/maps/meadow.json (20x12 칸, 16px). 칸 (5,1)은 풀(초록), 8행은 흙길(갈색), (0,0)을 6으로 바꾸면 물(파랑).
// 흐름: 새 씬 → 타일맵 추가(검사 오류) → 자리 (64,64) → 맵 고르기 → 씬 뷰의 픽셀이 맵의 타일 → 맵 파일이 바뀌면 다시 그린다
//       → 맵 파일을 지우거나 이름을 바꾸거나 깨뜨리면(JSON이 아님, 맵 형식이 아님) 검사 오류, 되살리면 사라진다
//       → 인스펙터의 맵 열기 → 저장 → 맵 비우기.
// 그리고 맵은 배경 대상이다: 누르고 놓으면 고르고, 끌면 상자 선택, 고른 뒤에만 옮긴다.
// 쌓는 순서는 엔진 씬 로더와 같다: 앞의 groundLayers 개 레이어는 모든 오브젝트 아래, 나머지는 모든 오브젝트 위.
// 픽셀은 페이지 스크린샷의 1x1 조각을 페이지 안에서 풀어 읽는다 (screen = world * zoom + pan).

import { expect, test, type Locator, type Page } from "@playwright/test";
import { encodePng } from "../../packages/app/src/editor/maps/sampleMap";

const LAYOUT_KEY = "initial-editor.layout";
const VIEW_KEY = "initial-editor.sceneView";
const MEADOW = "resources/maps/meadow.json";
const ORIGIN = { x: 64, y: 64 };

type Rgb = [number, number, number];
type Point = { x: number; y: number };

/** 페이지 안에서 src(editor, arg)를 돌리고 결과를 JSON으로 받는다 */
function ev<T>(page: Page, src: string, arg: unknown = null): Promise<T> {
  return page.evaluate(
    ([s, a]) => {
      const e = (window as unknown as { initialEditor: unknown }).initialEditor;
      return Promise.resolve(new Function("e", "a", `return (${s})(e, a)`)(e, a)).then((v) => JSON.parse(JSON.stringify(v ?? null)));
    },
    [src, arg] as const,
  ) as Promise<T>;
}

const selected = (page: Page) => ev<string[]>(page, "(e) => e.documents.active.selectedIds");
const position = (page: Page, id: string) => ev<[number, number]>(page, "(e, id) => { const o = e.documents.active.scene.find(id); return [o.x, o.y]; }", id);
const depth = (page: Page) => ev<number>(page, "(e) => e.documents.active.undo.depth");

async function openMenu(page: Page, branch: string, item: string | RegExp) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item", { hasText: item }).first().click();
}

/** 샘플 프로젝트를 열고 빈 씬(resources/scenes/<name>.json)을 만든다 */
async function newSceneInSample(page: Page, name: string): Promise<Locator> {
  await page.goto("/?backend=memory");
  await page.evaluate((keys) => keys.forEach((k) => localStorage.removeItem(k)), [LAYOUT_KEY, VIEW_KEY]);
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
  await openMenu(page, "씬", "새 씬");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill(name);
  await dialog.getByRole("button", { name: "만들기" }).click();
  await expect(page.getByTestId("doc-tab").filter({ hasText: `${name}.json` })).toBeVisible();
  const view = page.getByTestId("scene-view");
  await expect(view).toHaveAttribute("data-ready", "true");
  return view;
}

/** 오브젝트 추가 대화상자(Ctrl+Shift+A)로 타입 하나를 더한다. 더한 오브젝트가 골라진다 */
async function addObject(page: Page, type: string): Promise<string> {
  await page.getByTestId("scene-view").locator(".scene-view-host").focus();
  await page.keyboard.press("ControlOrMeta+Shift+KeyA");
  await page.locator(`[data-testid="add-object-type"][data-type="${type}"]`).click();
  await expect.poll(() => selected(page).then((ids) => ids.length)).toBe(1);
  return (await selected(page))[0];
}

/** 인스펙터의 x, y 칸으로 고른 오브젝트를 옮긴다 */
async function placeSelected(page: Page, at: Point) {
  for (const [axis, value] of [["x", at.x], ["y", at.y]] as const) {
    const field = page.getByTestId(`inspector-${axis}`);
    await field.fill(String(value));
    await field.press("Enter");
  }
}

/** 월드 좌표를 페이지 좌표로 (캔버스 안이어야 한다) */
async function toPage(view: Locator, world: Point) {
  const box = await view.locator("canvas").boundingBox();
  if (!box) throw new Error("캔버스가 없다");
  const zoom = Number(await view.getAttribute("data-zoom"));
  const x = box.x + world.x * zoom + Number(await view.getAttribute("data-pan-x"));
  const y = box.y + world.y * zoom + Number(await view.getAttribute("data-pan-y"));
  expect(x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height, `캔버스 밖: ${world.x}, ${world.y}`).toBe(true);
  return { x, y, zoom };
}

/** 월드 좌표 한 점의 화면 색 */
async function pixel(page: Page, view: Locator, world: Point): Promise<Rgb> {
  const p = await toPage(view, world);
  const png = await page.screenshot({ clip: { x: Math.floor(p.x), y: Math.floor(p.y), width: 1, height: 1 } });
  return page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const ctx = new OffscreenCanvas(1, 1).getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as Rgb;
  }, png.toString("base64"));
}

const at = (dx: number, dy: number): Point => ({ x: ORIGIN.x + dx, y: ORIGIN.y + dy });
const isGrass = ([r, g, b]: Rgb) => g > r + 30 && g > b + 30;
const isDirt = ([r, g, b]: Rgb) => r > b + 40 && r > g;
const isWater = ([r, g, b]: Rgb) => b > g && b > r + 40;
const isMagenta = ([r, g, b]: Rgb) => r > 200 && b > 200 && g < 80;

/** 16x16 자홍 그림 (타일셋에 없는 색이라 스프라이트가 보이는지 픽셀로 가린다) */
const MARK = "resources/images/mark.png";
function markPng(): number[] {
  const rgba = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 16 * 16; i++) rgba.set([255, 0, 255, 255], i * 4);
  return Array.from(encodePng(16, 16, rgba));
}

async function drag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

test.describe("씬의 타일맵 오브젝트 (메모리 모드)", () => {
  // 픽셀을 100% 줌으로 본다 (1 아래로 줄이면 타일 가장자리가 섞인다). 맵 탭이 맵 패널을 더해도 보는 점이
  // 씬 뷰 캔버스 안에 남도록 창을 넉넉히 쓴다
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("추가와 검사, 맵 고르기, 씬 뷰에 맵의 타일, 파일이 바뀌면 다시 그리기, 인스펙터로 맵 열기, 저장, 맵 비우기", async ({ page }) => {
    const view = await newSceneInSample(page, "tiles");
    const grassAt = at(88, 24); // 칸 (5,1)
    const dirtAt = at(88, 136); // 칸 (5,8)
    const firstCell = at(8, 8); // 칸 (0,0)

    // 추가: 골라지고 인스펙터가 보이며, 맵이 없어 검사 오류가 하나다
    await addObject(page, "tilemap");
    await expect(page.locator('[data-testid="hierarchy-row"][data-id="tilemap"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("inspector-tilemap")).toBeVisible();
    expect(await ev(page, "(e) => e.documents.active.scene.find('tilemap').props")).toEqual({ map: "", groundLayers: 1 });
    await expect(page.getByTestId("tilemap-open-map")).toBeDisabled();
    const problems = page.getByTestId("inspector-problems");
    await expect(problems).toHaveAttribute("data-count", "1");
    await expect(problems).toContainText("맵 파일(props.map) 비어 있음");

    // 자리 (64,64). 맵을 고르기 전에는 그 자리가 풀색이 아니다
    await placeSelected(page, ORIGIN);
    expect(await position(page, "tilemap")).toEqual([64, 64]);
    expect(isGrass(await pixel(page, view, grassAt))).toBe(false);

    // 맵 고르기: 요약이 보이고 검사 오류가 사라진다
    const mapSelect = page.getByTestId("prop-map");
    await expect(mapSelect.locator(`option[value="${MEADOW}"]`)).toHaveCount(1);
    await mapSelect.selectOption(MEADOW);
    await expect(page.getByTestId("tilemap-map-info")).toHaveText("크기 20x12 타일, 타일 16x16px, 레이어 2개");
    await expect(problems).toHaveAttribute("data-count", "0");
    expect(await ev(page, "(e) => e.documents.active.scene.find('tilemap').props.map")).toBe(MEADOW);

    // 씬 뷰의 픽셀: 풀 칸과 흙길 칸
    await expect.poll(async () => isGrass(await pixel(page, view, grassAt))).toBe(true);
    await expect.poll(async () => isDirt(await pixel(page, view, dirtAt))).toBe(true);
    expect(isWater(await pixel(page, view, firstCell))).toBe(false);

    // 맵 파일이 밖에서 바뀌면 다시 그린다: (0,0)을 물로
    const text = await ev<string>(page, `(e) => e.backend.readText('${MEADOW}')`);
    const data = JSON.parse(text) as { layers: Array<{ data: number[] }> };
    expect(data.layers[0].data[0]).toBe(1);
    data.layers[0].data[0] = 6;
    await ev(page, "(e, a) => e.backend.simulateExternalChange(a.path, 'modify', a.text)", { path: MEADOW, text: JSON.stringify(data, null, 2) });
    await expect.poll(async () => isWater(await pixel(page, view, firstCell))).toBe(true);
    expect(isGrass(await pixel(page, view, grassAt))).toBe(true);

    // 맵 파일이 없어지면 검사 오류 (엔진이 씬을 거부한다): 지우기, 이름 바꾸기. 되살리면 사라진다
    const changedText = JSON.stringify(data, null, 2);
    const external = (path: string, kind: "create" | "delete", body?: string) =>
      ev(page, "(e, a) => e.backend.simulateExternalChange(a.path, a.kind, a.body ?? undefined)", { path, kind, body: body ?? null });
    const missingText = `타일맵 tilemap의 맵 파일 없음: ${MEADOW}. 실행하면 엔진에서 씬 로드 실패`;
    await external(MEADOW, "delete");
    await expect(problems).toHaveAttribute("data-count", "1");
    await expect(problems).toContainText(missingText);
    await external(MEADOW, "create", changedText);
    await expect(problems).toHaveAttribute("data-count", "0");
    await external(MEADOW, "delete");
    await external("resources/maps/meadow_old.json", "create", changedText);
    await expect(problems).toHaveAttribute("data-count", "1");
    await expect(problems).toContainText(missingText);
    await external(MEADOW, "create", changedText);
    await expect(problems).toHaveAttribute("data-count", "0");
    await expect.poll(async () => isWater(await pixel(page, view, firstCell))).toBe(true);

    // 파일이 있어도 JSON이 아니거나 맵 형식이 아니면 검사 오류다 (엔진이 씬을 거부한다). 고치면 사라진다
    const modify = (body: string) => ev(page, "(e, a) => e.backend.simulateExternalChange(a.path, 'modify', a.body)", { path: MEADOW, body });
    const unreadable = `타일맵 tilemap의 맵 파일 형식 오류: ${MEADOW} (`;
    await modify("{ not json");
    await expect(problems).toHaveAttribute("data-count", "1");
    await expect(problems).toContainText(`${unreadable}JSON 구문 오류: `);
    await expect(problems).toContainText("실행하면 엔진에서 씬 로드 실패");
    await modify('{ "version": 9 }');
    await expect(problems).toContainText(`${unreadable}지원하지 않는 맵 버전: 9 (지원: 1, 2)). 실행하면 엔진에서 씬 로드 실패`);
    await expect(problems).toHaveAttribute("data-count", "1");
    await modify(changedText);
    await expect(problems).toHaveAttribute("data-count", "0");
    await expect.poll(async () => isWater(await pixel(page, view, firstCell))).toBe(true);

    // 인스펙터의 맵 열기: 맵 탭이 열리고 바뀐 파일을 읽는다
    const open = page.getByTestId("tilemap-open-map");
    await expect(open).toBeEnabled();
    await open.click();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "meadow.json" })).toBeVisible();
    await expect.poll(() => ev<string>(page, "(e) => e.documents.active?.path")).toBe(MEADOW);
    await expect(page.getByTestId("map-view")).toHaveAttribute("data-ready", "true");
    expect(await ev<number>(page, "(e) => e.documents.active.model.layers[0].data[0]")).toBe(6);

    // 씬 탭으로 돌아와도 맵이 그려져 있다. 맵 탭이 처음 열리면 맵 패널(팔레트 등)이 더해지며 탭 줄이 다시 놓이므로,
    // 그 패널이 보인 뒤에 누르고 씬이 정말 활성이 되었는지 본다 (느린 기계에서 누르기가 다시 놓이는 중에 빠지지 않게)
    await expect(page.locator(".dv-tab", { hasText: "팔레트" }).first()).toBeVisible();
    await page.getByTestId("doc-tab").filter({ hasText: "tiles.json" }).click();
    await expect.poll(() => ev<string>(page, "(e) => e.documents.active?.path")).toBe("resources/scenes/tiles.json");
    await expect(view).toHaveAttribute("data-ready", "true");
    // 맵 탭을 열면 맵 패널이 더해져 씬 뷰가 좁아진다 (그래서 이 파일은 창을 크게 쓴다)
    await expect.poll(async () => isGrass(await pixel(page, view, grassAt))).toBe(true);

    // 저장: 씬 파일에 타일맵 오브젝트와 props
    await view.locator(".scene-view-host").focus();
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByTestId("toasts")).toContainText("저장됨: tiles.json");
    const saved = JSON.parse(await ev<string>(page, "(e) => e.backend.readText('resources/scenes/tiles.json')")) as {
      objects: Array<{ id: string; type: string; x: number; y: number; props: Record<string, unknown> }>;
    };
    expect(saved.objects.find((o) => o.type === "tilemap")).toMatchObject({ id: "tilemap", x: 64, y: 64, props: { map: MEADOW, groundLayers: 1 } });

    // 맵 비우기: 자리표시로 돌아가고 맵 열기가 꺼지며 검사 오류가 다시 나온다
    if (!(await page.getByTestId("inspector-tilemap").isVisible())) {
      await page.locator(".dv-tab", { hasText: "계층" }).click();
      await page.locator('[data-testid="hierarchy-row"][data-id="tilemap"]').click();
    }
    await mapSelect.selectOption("");
    await expect(open).toBeDisabled();
    await expect(problems).toHaveAttribute("data-count", "1");
    await expect.poll(async () => isGrass(await pixel(page, view, grassAt))).toBe(false);
  });

  test("쌓는 순서는 엔진과 같다: 바닥 레이어는 모든 오브젝트 아래, 나머지 레이어는 모든 오브젝트 위", async ({ page }) => {
    const view = await newSceneInSample(page, "stack");
    await ev(page, "(e, a) => e.backend.writeBinary(a.path, Uint8Array.from(a.bytes))", { path: MARK, bytes: markPng() });
    const imageOf = async (at: Point) => {
      const image = page.getByTestId("prop-image");
      await expect(image.locator(`option[value="${MARK}"]`)).toHaveCount(1);
      await image.selectOption(MARK);
      await placeSelected(page, at);
    };
    // 목록 순서: 스프라이트(타일맵 앞), 타일맵, 스프라이트(타일맵 뒤)
    // 앞의 것은 풀만 있는 칸 (5,1)에, 뒤의 것은 장식(나무 꼭대기)이 있는 칸 (1,0)에 16x16으로 겹친다
    const beforeMap = await addObject(page, "sprite");
    await imageOf(at(80, 16));
    await addObject(page, "tilemap");
    await placeSelected(page, ORIGIN);
    const mapSelect = page.getByTestId("prop-map");
    await expect(mapSelect.locator(`option[value="${MEADOW}"]`)).toHaveCount(1);
    await mapSelect.selectOption(MEADOW);
    await expect(page.getByTestId("tilemap-map-info")).toHaveText("크기 20x12 타일, 타일 16x16px, 레이어 2개");
    const afterMap = await addObject(page, "sprite");
    await imageOf(at(16, 0));
    expect(await ev(page, "(e) => e.documents.active.scene.objects.map((o) => o.id)")).toEqual([beforeMap, "tilemap", afterMap]);
    await view.locator(".scene-view-host").focus();
    await page.keyboard.press("Escape");
    const onGround = at(88, 24);
    const onDeco = at(24, 8);

    // groundLayers 1: 바닥은 모든 오브젝트 아래라 앞의 스프라이트가 보이고, 장식은 모든 오브젝트 위라 뒤의 스프라이트를 덮는다
    await expect.poll(async () => isMagenta(await pixel(page, view, onGround))).toBe(true);
    await expect.poll(async () => isGrass(await pixel(page, view, onDeco))).toBe(true);

    const setGround = async (n: number) => {
      await ev(page, "(e) => e.documents.active.select(['tilemap'])");
      const field = page.getByTestId("prop-groundLayers");
      await field.fill(String(n));
      await field.press("Enter");
      expect(await ev(page, "(e) => e.documents.active.scene.find('tilemap').props.groundLayers")).toBe(n);
      await view.locator(".scene-view-host").focus();
      await page.keyboard.press("Escape");
    };
    // groundLayers 0: 맵 전체가 모든 오브젝트 위
    await setGround(0);
    await expect.poll(async () => isGrass(await pixel(page, view, onGround))).toBe(true);
    await expect.poll(async () => isGrass(await pixel(page, view, onDeco))).toBe(true);
    // groundLayers 2: 맵 전체가 모든 오브젝트 아래
    await setGround(2);
    await expect.poll(async () => isMagenta(await pixel(page, view, onGround))).toBe(true);
    await expect.poll(async () => isMagenta(await pixel(page, view, onDeco))).toBe(true);
  });

  test("맵은 배경 대상: 누르고 놓으면 고르고, 그 위에서 끌면 상자 선택, 고른 뒤에만 끌어 옮긴다", async ({ page }) => {
    const view = await newSceneInSample(page, "picking");
    const host = view.locator(".scene-view-host");

    // 타일맵 (0,0)에 meadow, 그 위에 노드 (100,100)
    await addObject(page, "tilemap");
    await placeSelected(page, { x: 0, y: 0 });
    const mapSelect = page.getByTestId("prop-map");
    await expect(mapSelect.locator(`option[value="${MEADOW}"]`)).toHaveCount(1);
    await mapSelect.selectOption(MEADOW);
    await expect(page.getByTestId("tilemap-map-info")).toHaveText("크기 20x12 타일, 타일 16x16px, 레이어 2개");
    await expect.poll(async () => isGrass(await pixel(page, view, { x: 88, y: 24 }))).toBe(true);
    const node = await addObject(page, "node");
    await placeSelected(page, { x: 100, y: 100 });
    expect(await position(page, node)).toEqual([100, 100]);
    await host.focus();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("scene-selection-count")).toHaveText("0");
    const undo0 = await depth(page);

    // 맵 위를 누르고 놓으면 맵을 고른다
    const onMap = await toPage(view, { x: 150, y: 60 });
    await page.mouse.click(onMap.x, onMap.y);
    expect(await selected(page)).toEqual(["tilemap"]);
    await host.focus();
    await page.keyboard.press("Escape");

    // 고르지 않은 맵 위에서 끌면 상자 선택이다: 노드만 골라지고 맵은 그대로, 되돌리기 단계도 그대로
    await drag(page, await toPage(view, { x: 90, y: 90 }), await toPage(view, { x: 130, y: 130 }));
    expect(await selected(page)).toEqual([node]);
    expect(await position(page, "tilemap")).toEqual([0, 0]);
    expect(await depth(page)).toBe(undo0);

    // 맵 위의 다른 오브젝트가 먼저 잡힌다
    const onNode = await toPage(view, { x: 100, y: 100 });
    await host.focus();
    await page.keyboard.press("Escape");
    await page.mouse.click(onNode.x, onNode.y);
    expect(await selected(page)).toEqual([node]);

    // Shift를 누르고 맵을 누르면 더한다
    await page.keyboard.down("Shift");
    await page.mouse.click(onMap.x, onMap.y);
    await page.keyboard.up("Shift");
    expect((await selected(page)).sort()).toEqual([node, "tilemap"].sort());

    // 맵 전체를 감싸는 상자는 맵도 고른다
    await host.focus();
    await page.keyboard.press("Escape");
    await drag(page, await toPage(view, { x: -8, y: -8 }), await toPage(view, { x: 328, y: 200 }));
    expect((await selected(page)).sort()).toEqual([node, "tilemap"].sort());

    // 맵만 고른 뒤 끌면 옮긴다 (되돌리기 한 단계)
    await host.focus();
    await page.keyboard.press("Escape");
    await page.mouse.click(onMap.x, onMap.y);
    expect(await selected(page)).toEqual(["tilemap"]);
    await drag(page, onMap, { x: onMap.x + 32 * onMap.zoom, y: onMap.y });
    expect(await position(page, "tilemap")).toEqual([32, 0]);
    expect(await depth(page)).toBe(undo0 + 1);
    expect(await position(page, node)).toEqual([100, 100]);
  });
});
