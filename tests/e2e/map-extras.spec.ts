// 맵 편집 부가 기능 e2e (docs/plans/e3-tilemap.md). 메모리 백엔드(?backend=memory)라 서버가 필요 없다.
// 샘플 프로젝트: resources/maps/meadow.json (20x12 칸, 16px, 타일셋 resources/tiles/meadow16.png 8열, 오브젝트 start,
// slime_1, bat_1, sign_1)과 resources/maps/sample.json (4x4 칸).
// 흐름: 새 맵(단축키, 이미 있는 이름, 만들기, 파일 형식, 취소) → 크기 바꾸기(기준점, 되돌리기, 저장, 줄이기의 미리 보기와 알림)
//       → 맵 오브젝트 클립보드(복사, 붙여넣기, 복제, 잘라내기, 삭제, 되돌리기, 씬과 따로, 잘라내고 붙이면 옮기기)
//       → 맵을 열면 맵 패널이 붙는다.

import { expect, test, type Page } from "@playwright/test";

const LAYOUT_KEY = "initial-editor.layout";
const MEADOW = "resources/maps/meadow.json";

type ObjectLike = { id: string; x: number; y: number; width?: number; props: Record<string, unknown> };

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

const obj = (page: Page, id: string) => ev<ObjectLike | null>(page, "(e, id) => e.documents.active.model.findObject(id)", id);
const depth = (page: Page) => ev<number>(page, "(e) => e.documents.active.undo.depth");
const objectCount = (page: Page) => ev<number>(page, "(e) => e.documents.active.model.objects.length");
const sceneCount = (page: Page) => ev<number>(page, "(e) => e.documents.active.scene.objects.length");

async function primaryKey(page: Page): Promise<string> {
  return (await page.evaluate(() => /Mac/i.test(navigator.platform))) ? "Meta" : "Control";
}

async function openMenu(page: Page, branch: string, item: string | RegExp) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item", { hasText: item }).first().click();
}

/** 메뉴 항목을 라벨 전체로 고른다 (체크 표시가 붙은 항목도) */
function menuItem(page: Page, label: string) {
  return page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: new RegExp(`^${label}$`) }) });
}

async function openMenuLabel(page: Page, branch: string, label: string) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await menuItem(page, label).click();
}

async function openSubmenu(page: Page, branch: string, sub: string, item: string) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item-wrap").filter({ has: page.locator(".menu-label", { hasText: new RegExp(`^${sub}$`) }) }).hover();
  await page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: new RegExp(`${item}$`) }) }).click();
}

async function openSample(page: Page) {
  await page.goto("/?backend=memory");
  await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  const tree = page.getByTestId("project-tree");
  await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
  await tree.locator('[data-path="resources"]').click();
  await tree.locator('[data-path="resources/maps"]').click();
  return tree;
}

async function openFile(page: Page, path: string, tab: string) {
  await page.getByTestId("project-tree").locator(`[data-path="${path}"]`).dblclick();
  await expect(page.getByTestId("doc-tab").filter({ hasText: tab })).toBeVisible();
}

async function openMeadow(page: Page) {
  await openSample(page);
  await openFile(page, MEADOW, "meadow.json");
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-ready", "true");
}

const docTab = (page: Page, name: string) => page.getByTestId("doc-tab").filter({ hasText: name });
const dockTab = (page: Page, title: string) => page.locator(".dv-tab", { hasText: title });

test.describe("맵 편집 부가 기능 (메모리 모드)", () => {
  test("새 맵: 단축키, 이미 있는 이름, 만들기, 파일 형식, 취소", async ({ page }) => {
    const tree = await openSample(page);
    const mod = await primaryKey(page);

    // Ctrl+Alt+M: 첫 PNG가 타일셋으로 골라지고 이름이 비어 있으면 만들기가 꺼져 있다
    await page.keyboard.press(`${mod}+Alt+KeyM`);
    await expect(page.getByTestId("modal").getByTestId("new-map-dialog")).toBeVisible();
    await expect(page.getByTestId("new-map-columns")).toHaveAttribute("data-columns", "8");
    await expect(page.getByTestId("new-map-tileset")).toHaveValue("resources/tiles/meadow16.png");
    await expect(page.getByTestId("new-map-ok")).toBeDisabled();
    await expect(page.getByTestId("new-map-problem")).toHaveCount(0);

    // 이미 있는 이름은 거부
    await page.getByTestId("new-map-name").fill("meadow");
    await expect(page.getByTestId("new-map-problem")).toHaveText("이미 있는 맵: resources/maps/meadow.json");
    await expect(page.getByTestId("new-map-ok")).toBeDisabled();

    // 6x5, 레이어 셋, 통행 켬으로 만들면 맵 탭이 열린다
    await page.getByTestId("new-map-name").fill("stage1");
    await page.getByTestId("new-map-width").fill("6");
    await page.getByTestId("new-map-height").fill("5");
    await page.getByTestId("new-map-layers").fill("ground, deco, over");
    await expect(page.getByTestId("new-map-collision")).toBeChecked();
    await page.getByTestId("new-map-ok").click();
    await expect(page.getByTestId("modal")).toHaveCount(0);
    await expect(docTab(page, "stage1.json")).toBeVisible();
    expect(await ev<string>(page, "(e) => e.documents.active?.kind")).toBe("map");
    await expect(page.getByTestId("map-view")).toContainText("6x5 타일 (96x80 px)");
    await expect(tree.locator('[data-path="resources/maps/stage1.json"]')).toBeVisible();

    // 파일: v2, 빈 레이어 셋과 통행, 타일셋 하나, id는 있는 맵보다 크다, 고정 형식(맵 한 줄이 한 줄)
    const text = await ev<string>(page, "(e) => e.backend.readText('resources/maps/stage1.json')");
    const data = JSON.parse(text);
    expect(data).toMatchObject({ version: 2, name: "stage1", width: 6, height: 5, tileWidth: 16, tileHeight: 16 });
    expect(data.id).toBeGreaterThan(2);
    expect(data.layers.map((l: { name: string; data: number[] }) => [l.name, l.data.length, l.data.every((v) => v === 0)])).toEqual([
      ["ground", 30, true],
      ["deco", 30, true],
      ["over", 30, true],
    ]);
    expect(data.collision).toEqual(new Array(30).fill(0));
    expect(data.tilesets).toEqual([{ image: "resources/tiles/meadow16.png", firstGid: 1, columns: 8 }]);
    // 레이어 셋과 통행이 다섯 줄씩
    expect(text.split("\n").filter((l) => /^\s+0,0,0,0,0,0,?$/.test(l))).toHaveLength(20);

    // 맵 > 새 맵으로 열고 취소하면 아무것도 쓰지 않는다
    const listing = "(e) => e.backend.list('resources/maps').then((l) => l.map((x) => x.path))";
    const before = await ev<string[]>(page, listing);
    await openMenu(page, "맵", "새 맵");
    await expect(page.getByTestId("new-map-dialog")).toBeVisible();
    await page.getByTestId("new-map-name").fill("stage2");
    await page.getByTestId("new-map-dialog").getByRole("button", { name: "취소" }).click();
    await expect(page.getByTestId("modal")).toHaveCount(0);
    expect(await ev<string[]>(page, listing)).toEqual(before);
  });

  test("크기 바꾸기: 기준점, 되돌리기와 다시 실행, 저장, 줄이기의 미리 보기와 알림", async ({ page }) => {
    await openMeadow(page);
    const mod = await primaryKey(page);
    const view = page.getByTestId("map-view");
    const tab = docTab(page, "meadow.json");
    const ground0 = await ev<number>(page, "(e) => e.documents.active.model.layers[0].data[0]");

    // 머리 띠의 크기를 누르면 대화상자. 크기가 같으면 확인이 꺼져 있다
    await page.getByTestId("map-size").click();
    await expect(page.getByTestId("resize-current")).toHaveText("20x12 타일 (320x192 px)");
    await expect(page.getByTestId("resize-ok")).toBeDisabled();

    // 24x14, 오른쪽 아래 기준: 내용이 x +4칸, y +2칸 옮겨진다
    await page.getByTestId("resize-width").fill("24");
    await page.getByTestId("resize-height").fill("14");
    const bottomRight = page.locator('[data-testid="resize-anchor-cell"][data-anchor="bottom-right"]');
    await bottomRight.click();
    await expect(bottomRight).toHaveAttribute("aria-checked", "true");
    const summary = page.getByTestId("resize-summary");
    await expect(summary).toHaveAttribute("data-dx", "4");
    await expect(summary).toHaveAttribute("data-dy", "2");
    await expect(summary).toHaveText("내용 이동 x +4, y +2 (타일)");
    await page.getByTestId("resize-ok").click();
    await expect(view).toContainText("24x14 타일 (384x224 px)");
    await expect(view).toHaveAttribute("data-ready", "true");
    expect(await ev<number>(page, "(e) => e.documents.active.model.layers[0].data[2 * 24 + 4]")).toBe(ground0);
    expect(await obj(page, "start")).toMatchObject({ x: 88, y: 168 });
    expect((await obj(page, "slime_1"))?.props).toMatchObject({ minX: 240, maxX: 312 });
    expect(await obj(page, "sign_1")).toMatchObject({ x: 160, y: 0 });
    expect(await depth(page)).toBe(1);
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(1);

    // 되돌리기 한 단계로 원래 크기와 자리, 저장 상태까지
    await openMenu(page, "편집", "되돌리기");
    await expect(view).toContainText("20x12 타일");
    expect(await obj(page, "start")).toMatchObject({ x: 24, y: 136 });
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(0);
    await openMenu(page, "편집", "다시 실행");
    await expect(view).toContainText("24x14 타일");

    // 저장한 파일의 레이어와 통행 길이가 새 크기다
    await view.locator(".map-view-host").focus();
    await page.keyboard.press(`${mod}+s`);
    await expect(page.getByTestId("toasts")).toContainText("저장됨: meadow.json");
    const saved = JSON.parse(await ev<string>(page, `(e) => e.backend.readText('${MEADOW}')`));
    expect([saved.width, saved.height]).toEqual([24, 14]);
    expect([...saved.layers.map((l: { data: number[] }) => l.data.length), saved.collision.length]).toEqual([336, 336, 336]);

    // 20x12로 되돌린 뒤 줄이기. 폭 13: bat_1이 밖이고 slime_1은 순찰 범위만 밖까지 간다
    await openMenu(page, "편집", "되돌리기");
    await expect(view).toContainText("20x12 타일");
    await openMenu(page, "맵", "크기 바꾸기");
    await page.getByTestId("resize-width").fill("13");
    await expect(page.getByTestId("resize-outside")).toHaveAttribute("data-count", "1");
    await expect(page.getByTestId("resize-outside")).toContainText("bat_1");
    await expect(page.getByTestId("resize-partly")).toHaveAttribute("data-count", "1");
    await expect(page.getByTestId("resize-partly")).toHaveText("영역이나 범위가 맵 밖으로 일부 나가는 오브젝트 1개: slime_1");

    // 폭 10: slime_1과 bat_1이 밖이다. 지우지 않고 알린다
    await page.getByTestId("resize-width").fill("10");
    await expect(page.getByTestId("resize-outside")).toHaveAttribute("data-count", "2");
    await expect(page.getByTestId("resize-outside")).toContainText("slime_1, bat_1");
    await expect(page.getByTestId("resize-partly")).toHaveCount(0);
    await page.getByTestId("resize-ok").click();
    await expect(page.getByTestId("toasts")).toContainText("맵 밖으로 나간 오브젝트 2개: slime_1, bat_1");
    await expect(view).toContainText("10x12 타일");
    await expect(page.getByTestId("map-objects-count")).toHaveText("4개");
  });

  test("맵 오브젝트 클립보드: 복사, 붙여넣기, 복제, 잘라내기, 삭제, 되돌리기, 하나만 두는 타입, 씬과 따로, 잘라내고 붙이면 옮기기, 다른 맵, 입력 칸", async ({ page }) => {
    await openMeadow(page);
    const mod = await primaryKey(page);
    const panel = page.getByTestId("map-objects");
    const row = (id: string) => panel.locator(`[data-testid="map-objects-row"][data-id="${id}"]`);

    // 복사와 붙여넣기: 원래 id가 맵에 있으니 새 id, x로만 한 칸 오른쪽(y는 그대로라 바닥에 선 채), 순찰 범위도 같이 옮긴다.
    // 되돌리기 한 단계
    await row("slime_1").click();
    await page.keyboard.press(`${mod}+c`);
    await expect(page.getByTestId("toasts")).toContainText("맵 오브젝트 1개 복사됨");
    await page.keyboard.press(`${mod}+v`);
    await expect(row("slime_2")).toHaveAttribute("aria-selected", "true");
    expect(await obj(page, "slime_2")).toMatchObject({ x: 216, y: 136, props: { minX: 192, maxX: 264 } });
    await expect(page.getByTestId("map-selection-count")).toHaveText("1");
    expect(await depth(page)).toBe(1);
    await page.keyboard.press(`${mod}+v`);
    await expect(row("slime_3")).toHaveAttribute("aria-selected", "true");
    expect(await obj(page, "slime_3")).toMatchObject({ x: 232, y: 136 });

    // 복제: 한 칸 오른쪽, y는 그대로, 순찰 범위도
    await page.keyboard.press(`${mod}+d`);
    await expect(row("slime_4")).toHaveAttribute("aria-selected", "true");
    expect(await obj(page, "slime_4")).toMatchObject({ x: 248, y: 136, props: { minX: 224, maxX: 296 } });

    // 잘라내기는 되돌리기 한 단계이고 되돌리면 둘 다 돌아온다
    await row("sign_1").click();
    await row("slime_1").click({ modifiers: ["Shift"] });
    const d0 = await depth(page);
    await page.keyboard.press(`${mod}+x`);
    await expect(row("sign_1")).toHaveCount(0);
    await expect(row("slime_1")).toHaveCount(0);
    expect(await depth(page)).toBe(d0 + 1);
    await openMenu(page, "편집", "되돌리기");
    await expect(row("sign_1")).toHaveCount(1);
    await expect(row("slime_1")).toHaveCount(1);

    // 편집 > 삭제
    await row("bat_1").click();
    await openMenu(page, "편집", "삭제");
    await expect(row("bat_1")).toHaveCount(0);

    // 씬과 맵의 클립보드는 따로다. 맵 클립보드에는 잘라낸 둘(slime_1, sign_1)이 남아 있다
    await page.getByTestId("project-tree").locator('[data-path="resources/scenes"]').click();
    await openFile(page, "resources/scenes/main.json", "main.json");
    await dockTab(page, "계층").click();
    const hierarchy = page.getByTestId("hierarchy");
    const scene0 = await sceneCount(page);
    await hierarchy.locator('[data-testid="hierarchy-row"]').first().click();
    await page.keyboard.press(`${mod}+c`);
    await expect(page.getByTestId("toasts")).toContainText("오브젝트 1개 복사됨");
    await docTab(page, "meadow.json").click();
    const map0 = await objectCount(page);
    await dockTab(page, "맵 오브젝트").click();
    await panel.locator('[data-testid="map-objects-row"]').first().click();
    await page.keyboard.press(`${mod}+v`);
    await expect.poll(() => objectCount(page)).toBe(map0 + 2);
    await docTab(page, "main.json").click();
    expect(await sceneCount(page)).toBe(scene0);
    await dockTab(page, "계층").click();
    await hierarchy.locator('[data-testid="hierarchy-row"]').first().click();
    await page.keyboard.press(`${mod}+v`);
    await expect.poll(() => sceneCount(page)).toBe(scene0 + 1);

    // 하나만 두는 타입(시작 지점)은 붙이지 않는다
    await docTab(page, "meadow.json").click();
    await dockTab(page, "맵 오브젝트").click();
    await row("start").click();
    await page.keyboard.press(`${mod}+c`);
    const withStart = await objectCount(page);
    await page.keyboard.press(`${mod}+v`);
    await expect(page.getByTestId("toasts")).toContainText("맵당 1개만 허용되는 타입이라 붙여넣기 제외: start");
    expect(await objectCount(page)).toBe(withStart);

    // 잘라내고 붙이면 옮기기다: 원래 id 그대로(시작 지점은 start), x로 한 칸, y는 그대로
    expect(await obj(page, "start")).toMatchObject({ x: 24, y: 136 });
    await row("start").click();
    await page.keyboard.press(`${mod}+x`);
    await expect(row("start")).toHaveCount(0);
    await page.keyboard.press(`${mod}+v`);
    await expect(row("start")).toHaveAttribute("aria-selected", "true");
    expect(await obj(page, "start")).toMatchObject({ x: 40, y: 136 });
    expect(await objectCount(page)).toBe(withStart);
    await row("slime_1").click();
    const slime = await obj(page, "slime_1");
    await page.keyboard.press(`${mod}+x`);
    await expect(row("slime_1")).toHaveCount(0);
    await page.keyboard.press(`${mod}+v`);
    await expect(row("slime_1")).toHaveAttribute("aria-selected", "true");
    expect(await obj(page, "slime_1")).toMatchObject({ x: slime!.x + 16, y: slime!.y, props: { minX: (slime!.props.minX as number) + 16, maxX: (slime!.props.maxX as number) + 16 } });
    expect(await objectCount(page)).toBe(withStart);
    // id가 겹치지 않고 시작 지점도 하나다 (검사 결과가 비었다)
    await expect(page.getByTestId("map-objects-problems")).toHaveAttribute("data-count", "0");

    // 다른 맵(64x64 px)에 붙이면 맵 안으로 당긴다
    await row("slime_1").click();
    await page.keyboard.press(`${mod}+c`);
    await openFile(page, "resources/maps/sample.json", "sample.json");
    await dockTab(page, "맵 오브젝트").click();
    await panel.locator('[data-testid="map-objects-row"]').first().click();
    await page.keyboard.press(`${mod}+v`);
    await expect.poll(() => ev<string[]>(page, "(e) => e.documents.active.selectedIds")).toEqual(["slime_2"]);
    expect(await obj(page, "slime_2")).toMatchObject({ x: 63, y: 63 });

    // 입력 칸 안의 Ctrl+A, Ctrl+C는 글자 편집이다 (오브젝트를 건드리지 않는다)
    const d1 = await depth(page);
    // 앞의 토스트는 시간이 지나 사라질 수 있어 개수가 아니라 id로 새 토스트를 찾는다
    const lastToast = await ev<number>(page, "(e) => Math.max(0, ...e.toasts.toasts.map((t) => t.id))");
    await row("slime_2").click();
    await page.keyboard.press("F2");
    const rename = panel.getByTestId("map-objects-rename");
    await expect(rename).toBeFocused();
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.press(`${mod}+c`);
    await page.keyboard.press("Escape");
    expect(await depth(page)).toBe(d1);
    expect(await ev<string[]>(page, "(e, last) => e.toasts.toasts.filter((t) => t.id > last).map((t) => t.text)", lastToast)).toEqual([]);
  });

  test("맵 패널: 맵을 열면 붙고, 사용자가 닫은 것은 두고, 레이아웃 프리셋 뒤에는 맵 탭을 다시 고를 때 붙는다", async ({ page }) => {
    await openMeadow(page);

    // 창 메뉴를 건드리지 않아도 팔레트, 레이어, 맵 오브젝트가 있고 활성 문서는 맵 그대로다
    for (const id of ["palette", "layers", "map-objects"]) await expect(page.getByTestId(id)).toBeVisible();
    expect(await ev<string>(page, "(e) => e.documents.active.path")).toBe(MEADOW);
    // 맵 오브젝트는 계층과 같은 탭 묶음
    const group = page.locator(".dv-tabs-container").filter({ has: dockTab(page, "맵 오브젝트") });
    await expect(group.locator(".dv-tab", { hasText: "계층" })).toHaveCount(1);
    await page.getByRole("menubar").getByRole("menuitem", { name: "창", exact: true }).click();
    for (const label of ["팔레트", "레이어", "맵 오브젝트"]) await expect(menuItem(page, label).locator(".menu-check")).toHaveText("✓");
    await page.keyboard.press("Escape");

    // 창 > 팔레트로 닫으면 다른 탭을 갔다 와도 다시 붙지 않는다
    await openMenuLabel(page, "창", "팔레트");
    await expect(page.getByTestId("palette")).toHaveCount(0);
    await page.getByTestId("project-tree").locator('[data-path="resources/scenes"]').click();
    await openFile(page, "resources/scenes/main.json", "main.json");
    await docTab(page, "meadow.json").click();
    await expect(page.getByTestId("layers")).toBeVisible();
    await expect(page.getByTestId("palette")).toHaveCount(0);

    // 씬 프리셋은 고른 그대로 둔다. 다른 탭을 갔다가 맵 탭을 고르면 레이어와 맵 오브젝트만 돌아온다
    await openSubmenu(page, "창", "레이아웃", "씬");
    await expect(page.getByTestId("layers")).toHaveCount(0);
    await expect(page.getByTestId("map-objects")).toHaveCount(0);
    await docTab(page, "main.json").click();
    await docTab(page, "meadow.json").click();
    await expect(page.getByTestId("layers")).toBeVisible();
    await expect(dockTab(page, "맵 오브젝트")).toHaveCount(1);
    await expect(page.getByTestId("palette")).toHaveCount(0);

    // 창 > 팔레트로 다시 연다
    await openMenuLabel(page, "창", "팔레트");
    await expect(page.getByTestId("palette")).toBeVisible();
  });
});
