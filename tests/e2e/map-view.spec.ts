// 맵 뷰 e2e (docs/plans/e3-tilemap.md "맵 뷰", "도구", "팔레트 패널과 레이어 패널"). 메모리 백엔드라 서버가 필요 없다.
// 샘플 프로젝트의 resources/maps/meadow.json (20x12 칸, 16px, 코드로 그린 타일셋 resources/tiles/meadow16.png).
// 흐름: 트리에서 맵 열기 → 타일맵 레이아웃 → 팔레트에서 타일 고르기 → 세 칸 붓질(되돌리기 한 단계) → 편집 메뉴로 되돌리기와
//       다시 실행 → 채우기 → 통행(C, 왼쪽 막힘, 오른쪽 지나감) → 오브젝트(V) 고르기와 끌기, 범위 손잡이 → Ctrl+S는 고정 형식 v2.
// 칸과 오브젝트의 월드 좌표를 화면으로 옮길 때 맵 뷰의 data-zoom, data-pan-x, data-pan-y를 쓴다 (screen = world * zoom + pan).

import { expect, test, type Locator, type Page } from "@playwright/test";

const LAYOUT_KEY = "initial-editor.layout";
const MAP_VIEW_KEY = "initial-editor.mapView";
const MAP_PATH = "resources/maps/meadow.json";
const W = 20;

type MapObjectLike = { id: string; x: number; y: number; props: Record<string, unknown> };
interface EditorWindow {
  initialEditor: {
    backend: { readText(p: string): Promise<string> };
    documents: {
      active: {
        kind: string;
        tool: string;
        brush: { width: number; height: number; gids: number[][] };
        undo: { depth: number };
        model: { layers: Array<{ data: number[] }>; collision: number[] | null; findObject(id: string): MapObjectLike | undefined };
      } | null;
    };
  };
}

async function openMenu(page: Page, branch: string, item: string | RegExp) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item", { hasText: item }).first().click();
}

async function openSubmenu(page: Page, branch: string, sub: string, item: string) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item-wrap").filter({ has: page.locator(".menu-label", { hasText: new RegExp(`^${sub}$`) }) }).hover();
  await page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: new RegExp(`${item}$`) }) }).click();
}

function cells(page: Page, layer: number | "collision", from: number, count: number): Promise<number[]> {
  return page.evaluate(
    ([l, f, n]) => {
      const m = (window as unknown as EditorWindow).initialEditor.documents.active!.model;
      const data = l === "collision" ? m.collision : m.layers[l as number].data;
      return data ? data.slice(f as number, (f as number) + (n as number)) : [];
    },
    [layer, from, count] as const,
  );
}

function active<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate((src) => {
    const doc = (window as unknown as EditorWindow).initialEditor.documents.active;
    return new Function("doc", `return (${src})(doc)`)(doc) as T;
  }, fn);
}

/** 월드 좌표를 페이지 좌표로 */
async function toPage(view: Locator, world: { x: number; y: number }) {
  const box = await view.locator("canvas").boundingBox();
  if (!box) throw new Error("캔버스가 없다");
  const zoom = Number(await view.getAttribute("data-zoom"));
  const panX = Number(await view.getAttribute("data-pan-x"));
  const panY = Number(await view.getAttribute("data-pan-y"));
  return { x: box.x + world.x * zoom + panX, y: box.y + world.y * zoom + panY, zoom };
}

const cellCenter = (cx: number, cy: number) => ({ x: cx * 16 + 8, y: cy * 16 + 8 });

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

async function openMeadow(page: Page) {
  await page.goto("/?backend=memory");
  await page.evaluate((keys) => keys.forEach((k) => localStorage.removeItem(k)), [LAYOUT_KEY, MAP_VIEW_KEY]);
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  const tree = page.getByTestId("project-tree");
  await tree.locator('[data-path="resources"]').click();
  await tree.locator('[data-path="resources/maps"]').click();
  await tree.locator(`[data-path="${MAP_PATH}"]`).dblclick();
  await expect(page.getByTestId("doc-tab").filter({ hasText: "meadow.json" })).toBeVisible();
  const view = page.getByTestId("map-view");
  await expect(view.locator("canvas")).toBeVisible();
  await expect(view).toHaveAttribute("data-ready", "true");
  await expect(page.locator(".monaco-editor")).toHaveCount(0);
  // 맵 편집 레이아웃: 팔레트(왼쪽 아래)와 레이어(오른쪽). 뷰가 다시 붙으므로 다시 기다린다
  await openSubmenu(page, "창", "레이아웃", "타일맵");
  // 레이아웃을 바꿔도 활성 문서는 맵 그대로다
  await expect.poll(() => page.evaluate(() => (window as unknown as { initialEditor: { documents: { active: { path: string } | null } } }).initialEditor.documents.active?.path)).toBe("resources/maps/meadow.json");
  await expect(page.getByTestId("palette")).toBeVisible();
  await expect(page.getByTestId("layers")).toBeVisible();
  await expect(view).toHaveAttribute("data-ready", "true");
  return view;
}

test.describe("맵 뷰 (메모리 모드)", () => {
  test("팔레트, 붓질과 되돌리기, 채우기, 통행, 오브젝트 끌기, 저장", async ({ page }) => {
    const view = await openMeadow(page);
    await expect(view).toContainText("20x12 타일 (320x192 px)");
    await expect(view).toHaveAttribute("data-tool", "pen");
    await expect(view).toHaveAttribute("data-target", "layer:0");
    // 샘플 스키마의 타입이라 경고가 없고, 타일셋 밖의 gid도 없다
    await expect(page.getByTestId("map-view-warning")).toHaveCount(0);

    // 레이어 패널: 오브젝트, 통행, deco, ground 순서
    const rows = page.getByTestId("layers").getByTestId("layer-row");
    await expect(rows).toHaveCount(4);
    expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-target")))).toEqual(["objects", "collision", "layer:1", "layer:0"]);

    // 팔레트에서 3열 1행(gid 3, 흙길)을 고른다
    const palette = page.getByTestId("palette-canvas");
    await expect(palette).toHaveAttribute("data-ready", "true");
    await expect(palette).toHaveAttribute("data-columns", "8");
    await expect(palette).toHaveAttribute("data-rows", "4");
    const pz = Number(await palette.getAttribute("data-zoom"));
    await palette.click({ position: { x: 2.5 * 16 * pz, y: 0.5 * 16 * pz } });
    await expect(page.getByTestId("palette-brush")).toHaveText("브러시 gid 3");
    expect(await active(page, "(d) => d.brush")).toEqual({ width: 1, height: 1, gids: [[3]] });

    // 세 칸 붓질: (2,1)에서 (4,1)까지. 되돌리기 한 단계
    const row1 = 1 * W;
    expect(await cells(page, 0, row1 + 2, 3)).toEqual([1, 1, 1]);
    await drag(page, await toPage(view, cellCenter(2, 1)), await toPage(view, cellCenter(4, 1)));
    expect(await cells(page, 0, row1 + 2, 3)).toEqual([3, 3, 3]);
    expect(await active(page, "(d) => d.undo.depth")).toBe(1);
    const tab = page.getByTestId("doc-tab").filter({ hasText: "meadow.json" });
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(1);
    await openMenu(page, "편집", "되돌리기");
    expect(await cells(page, 0, row1 + 2, 3)).toEqual([1, 1, 1]);
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(0);
    await openMenu(page, "편집", "다시 실행");
    expect(await cells(page, 0, row1 + 2, 3)).toEqual([3, 3, 3]);

    // 채우기: 연못(6)의 이어진 다섯 칸이 흙길이 되고, 깊은 물(7) 한 칸은 남는다
    await page.getByTestId("map-tool-fill").click();
    await expect(view).toHaveAttribute("data-tool", "fill");
    const pond = await toPage(view, cellCenter(13, 2));
    await page.mouse.click(pond.x, pond.y);
    expect(await cells(page, 0, 2 * W + 13, 3)).toEqual([3, 3, 3]);
    expect(await cells(page, 0, 3 * W + 13, 3)).toEqual([3, 7, 3]);

    // 통행: 뷰에 초점을 두고 C. 왼쪽 클릭은 막힘, 오른쪽 클릭은 지나감
    await view.locator(".map-view-host").focus();
    await page.keyboard.press("c");
    await expect(view).toHaveAttribute("data-tool", "collision");
    await expect(view).toHaveAttribute("data-target", "collision");
    await expect(page.getByTestId("map-toggle-collision")).toHaveAttribute("aria-pressed", "true");
    const c55 = await toPage(view, cellCenter(5, 5));
    expect(await cells(page, "collision", 5 * W + 5, 1)).toEqual([0]);
    await page.mouse.click(c55.x, c55.y);
    expect(await cells(page, "collision", 5 * W + 5, 1)).toEqual([1]);
    await expect(page.getByTestId("map-cursor")).toHaveText(/타일 5, 5/);
    await page.mouse.click(c55.x, c55.y, { button: "right" });
    expect(await cells(page, "collision", 5 * W + 5, 1)).toEqual([0]);
    await page.mouse.click(c55.x, c55.y);
    expect(await cells(page, "collision", 5 * W + 5, 1)).toEqual([1]);

    // 오브젝트: V. 시작 지점(24,136)을 골라 20px 끌면 x가 44
    await page.keyboard.press("v");
    await expect(view).toHaveAttribute("data-tool", "object");
    await expect(view).toHaveAttribute("data-target", "objects");
    const start = await toPage(view, { x: 24, y: 136 });
    await page.mouse.click(start.x, start.y);
    await expect(page.getByTestId("map-selection-count")).toHaveText("1");
    await drag(page, start, { x: start.x + 20 * start.zoom, y: start.y });
    expect(await active(page, "(d) => { const o = d.model.findObject('start'); return [o.x, o.y]; }")).toEqual([44, 136]);
    // 몬스터의 순찰 왼끝 손잡이(176,136)를 160으로
    const handle = await toPage(view, { x: 176, y: 136 });
    await drag(page, handle, { x: handle.x - 16 * handle.zoom, y: handle.y });
    expect(await active(page, "(d) => d.model.findObject('slime_1').props")).toMatchObject({ species: "slime", minX: 160, maxX: 248 });
    // 방향키 1px (순찰 범위도 같이 움직인다), Escape는 선택 풀기
    await page.keyboard.press("ArrowRight");
    expect(await active(page, "(d) => d.model.findObject('slime_1').x")).toBe(201);
    expect(await active(page, "(d) => d.model.findObject('slime_1').props")).toMatchObject({ minX: 161, maxX: 249 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("map-selection-count")).toHaveText("0");

    // 저장: 고정 형식 v2, 새 값, 타일 배열은 맵 한 줄이 한 줄
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByTestId("toasts")).toContainText("저장됨: meadow.json");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(0);
    const text = await page.evaluate((p) => (window as unknown as EditorWindow).initialEditor.backend.readText(p), MAP_PATH);
    const saved = JSON.parse(text) as { version: number; layers: Array<{ data: number[] }>; collision: number[]; objects: MapObjectLike[] };
    expect(saved.version).toBe(2);
    expect(saved.layers[0].data.slice(row1 + 2, row1 + 5)).toEqual([3, 3, 3]);
    expect(saved.layers[0].data.slice(3 * W + 13, 3 * W + 16)).toEqual([3, 7, 3]);
    expect(saved.collision[5 * W + 5]).toBe(1);
    expect(saved.objects.find((o) => o.id === "start")).toMatchObject({ x: 44, y: 136 });
    expect(saved.objects.find((o) => o.id === "slime_1")).toMatchObject({ x: 201, props: { minX: 161, maxX: 249 } });
    const groundRow1 = saved.layers[0].data.slice(row1, row1 + W).join(",");
    expect(text).toContain(`\n        ${groundRow1},\n`);
    expect(text).toMatch(/"collision": \[\n {4}(\d+,){19}\d+,\n/);
  });

  test("레이어 패널, 보기 토글, 줌과 맵 전체 보기", async ({ page }) => {
    const view = await openMeadow(page);
    const layers = page.getByTestId("layers");
    const row = (target: string) => layers.locator(`[data-testid="layer-row"][data-target="${target}"]`);

    // 대상 바꾸기: deco 줄을 누르면 대상이 layer:1이고 머리 띠에 이름이 보인다
    await row("layer:1").click();
    await expect(view).toHaveAttribute("data-target", "layer:1");
    await expect(page.getByTestId("map-target")).toHaveText("deco");
    // 이름 바꾸기 (더블클릭, Enter)는 되돌릴 수 있다
    await row("layer:1").dblclick();
    await page.getByTestId("layer-rename").fill("장식");
    await page.getByTestId("layer-rename").press("Enter");
    await expect(row("layer:1")).toContainText("장식");
    // 추가는 대상 위에, 삭제는 되돌릴 수 있다
    await page.getByTestId("layer-add").click();
    await expect(layers.getByTestId("layer-row")).toHaveCount(5);
    await expect(view).toHaveAttribute("data-target", "layer:2");
    await page.getByTestId("layer-remove").click();
    await expect(layers.getByTestId("layer-row")).toHaveCount(4);
    await openMenu(page, "편집", "되돌리기");
    await expect(layers.getByTestId("layer-row")).toHaveCount(5);
    // 되돌리면 대상도 삭제 전의 새 레이어(layer:2)로 돌아온다
    await expect(view).toHaveAttribute("data-target", "layer:2");
    // 눈: 레이어 숨기기
    await row("layer:0").getByTestId("layer-eye").click();
    await expect(row("layer:0").getByTestId("layer-eye")).toHaveAttribute("aria-pressed", "false");
    // 통행 줄을 누르면 통행 도구
    await row("collision").click();
    await expect(view).toHaveAttribute("data-tool", "collision");
    // 펜(B)으로 돌아오면 마지막 타일 레이어(되돌린 뒤 대상이던 layer:2)가 대상
    await view.locator(".map-view-host").focus();
    await page.keyboard.press("b");
    await expect(view).toHaveAttribute("data-tool", "pen");
    await expect(view).toHaveAttribute("data-target", "layer:2");

    // 보기 토글: 격자와 오브젝트 (맵 메뉴)
    await expect(page.getByTestId("map-toggle-grid")).toHaveAttribute("aria-pressed", "true");
    await openMenu(page, "맵", "격자 표시");
    await expect(page.getByTestId("map-toggle-grid")).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId("map-toggle-objects").click();
    await expect(page.getByTestId("map-toggle-objects")).toHaveAttribute("aria-pressed", "false");

    // 줌: 처음은 정수 배율, Ctrl+= 는 한 단계, 맵 전체 보기는 맵이 뷰에 들어간다
    const z0 = Number(await view.getAttribute("data-zoom"));
    expect(Number.isInteger(z0)).toBe(true);
    await view.locator(".map-view-host").focus();
    await page.keyboard.press("ControlOrMeta+=");
    await expect.poll(async () => Number(await view.getAttribute("data-zoom"))).toBeGreaterThan(z0);
    await page.keyboard.press("ControlOrMeta+0");
    await expect(view).toHaveAttribute("data-zoom", "1");
    await page.getByTestId("map-fit").click();
    const box = (await view.locator("canvas").boundingBox())!;
    const topLeft = await toPage(view, { x: 0, y: 0 });
    const bottomRight = await toPage(view, { x: 320, y: 192 });
    expect(topLeft.x).toBeGreaterThanOrEqual(box.x);
    expect(topLeft.y).toBeGreaterThanOrEqual(box.y);
    expect(bottomRight.x).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(bottomRight.y).toBeLessThanOrEqual(box.y + box.height + 1);
  });
});

test.describe("맵 뷰: 밖에서 바뀐 파일", () => {
  test("타일셋 이미지가 바뀌면 다시 그리고, 맵 파일이 바뀌면 미수정은 다시 읽고 수정 중이면 배너, 맵이 아닌 파일은 텍스트로", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?backend=memory");
    await page.evaluate((keys) => keys.forEach((k) => localStorage.removeItem(k)), [LAYOUT_KEY, MAP_VIEW_KEY]);
    await page.reload();
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await page.evaluate((p) => (window as unknown as { initialEditor: { openPath(p: string): Promise<void> } }).initialEditor.openPath(p), MAP_PATH);
    const view = page.getByTestId("map-view");
    await expect(view).toHaveAttribute("data-ready", "true");
    const renders = async () => Number(await view.getAttribute("data-chunk-renders"));
    const before = await renders();
    expect(before).toBeGreaterThan(0);
    const external = (path: string, text?: string) =>
      page.evaluate(
        ([p, t]) =>
          (window as unknown as { initialEditor: { backend: { simulateExternalChange(p: string, k: string, d?: string): void } } }).initialEditor.backend.simulateExternalChange(
            p as string,
            "modify",
            t ?? undefined,
          ),
        [path, text ?? null] as const,
      );

    // 타일셋 이미지: 텍스처를 버리고 다시 읽어 덩어리를 전부 다시 그린다
    await external("resources/tiles/meadow16.png");
    await expect.poll(renders).toBeGreaterThan(before);
    await expect(view).toHaveAttribute("data-ready", "true");

    // 미수정 맵: 다시 읽는다
    const edited = async (mutate: string) => {
      const text = await page.evaluate((p) => (window as unknown as EditorWindow).initialEditor.backend.readText(p), MAP_PATH);
      const data = JSON.parse(text) as { layers: Array<{ data: number[] }>; objects: Array<{ id: string }> };
      new Function("m", mutate)(data);
      return JSON.stringify(data, null, 2);
    };
    await external(MAP_PATH, await edited("m.layers[0].data[0] = 5; m.objects = m.objects.filter((o) => o.id !== 'bat_1');"));
    await expect.poll(() => cells(page, 0, 0, 1)).toEqual([5]);
    expect(await active(page, "(d) => d.model.objects.length")).toBe(3);
    await expect(page.getByTestId("external-change-banner")).toHaveCount(0);

    // 수정 중인 맵: 배너, 다시 읽기를 누르면 파일 내용으로. 기본 붓(gid 1)으로 돌바닥 칸(3,3)을 칠해 수정 중으로 만든다
    await page.getByTestId("map-tool-pen").click();
    const at = await toPage(view, cellCenter(3, 3));
    await page.mouse.click(at.x, at.y);
    expect(await active(page, "(d) => d.dirty")).toBe(true);
    await external(MAP_PATH, await edited("m.layers[0].data[0] = 6;"));
    const banner = page.getByTestId("external-change-banner");
    await expect(banner).toBeVisible();
    expect(await cells(page, 0, 0, 1)).toEqual([5]);
    await banner.getByRole("button", { name: "다시 읽기" }).click();
    await expect(banner).toHaveCount(0);
    expect(await cells(page, 0, 0, 1)).toEqual([6]);
    expect(await active(page, "(d) => d.dirty")).toBe(false);
    await expect(view).toHaveAttribute("data-ready", "true");

    // 맵 형식이 아닌 파일은 알리고 텍스트 편집기로 연다
    await page.evaluate(async (p) => {
      const e = (window as unknown as { initialEditor: { backend: { writeText(p: string, t: string): Promise<void> }; openPath(p: string): Promise<void> } }).initialEditor;
      await e.backend.writeText(p, '{ "version": 9 }\n');
      await e.openPath(p);
    }, "resources/maps/broken.json");
    await expect(page.getByTestId("toasts")).toContainText("맵 형식이 아니어서 텍스트 에디터로 열었습니다");
    await expect(page.locator(".monaco-editor")).toBeVisible();
    expect(await active(page, "(d) => d.kind")).not.toBe("map");
    expect(errors).toEqual([]);
  });
});
