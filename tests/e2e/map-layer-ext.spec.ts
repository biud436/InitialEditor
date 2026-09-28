// 확장 레이어 자리 e2e (docs/plans/e5-rpg.md 2.1 ~ 2.3, 마일스톤 4). 메모리 백엔드(?backend=memory)라 서버가 필요 없다.
// 테스트에서만 쓰는 확장 하나를 페이지 안에서 켠다: 타일맵의 exportsOf 로 맵 레이어 "표식"(섹션 marks, 단축키 M, 잠김,
// 오류 하나, meadow.json 에만 붙는다)과 패널 "표식 목록"을 등록한다. RPG 없이 앱이 여는 자리만 본다.
// 흐름: 레이어 패널의 줄과 자물쇠 → M 으로 대상 → 인스펙터 자리 → 맵 뷰의 Ctrl+C 는 레이어 도구가 받아 맵 오브젝트를 복사하지 않는다
//       → 포인터와 더블클릭 → 저장 전 질문(취소, 그래도 저장, 섹션이 파일에 쓰인다) → 다른 맵은 줄 없이 힌트 → 확장 패널의 탭
//       → 확장을 끄면 줄과 탭의 내용이 빠진다.

import { expect, test, type Page } from "@playwright/test";

const LAYOUT_KEY = "initial-editor.layout";
const MEADOW = "resources/maps/meadow.json";
const SAMPLE = "resources/maps/sample.json";

interface MarksLog {
  keys: string[];
  pointers: Array<{ x: number; y: number }>;
  doubles: Array<{ x: number; y: number }>;
}

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

const marksLog = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __e2eMarks: MarksLog }).__e2eMarks)) as MarksLog);

/** 테스트 전용 확장을 켠다. 페이지 안의 코드라 import 없이 평범한 객체로 적는다 */
async function activateFakeExtension(page: Page): Promise<void> {
  await page.evaluate(async (meadow) => {
    type Api = {
      exportsOf(id: string): { registerMapLayer(spec: unknown): () => void };
      onDeactivate(fn: () => void): () => void;
      registerPanel(spec: unknown): () => void;
    };
    const w = window as unknown as { initialEditor: { extensions: { activate(ext: unknown): Promise<void> } }; __e2eMarks: MarksLog };
    const log: MarksLog = { keys: [], pointers: [], doubles: [] };
    w.__e2eMarks = log;
    const state = () => ({
      locked: "e2e 잠금 이유",
      serialize: () => [{ id: "m1", x: 2, y: 3 }],
      problems: () => [{ severity: "error", message: "표식 m1 이 틀렸다", location: "marks[1]" }],
      reset() {},
      refresh() {},
      dispose() {},
    });
    await w.initialEditor.extensions.activate({
      id: "e2e.marks",
      name: "e2e 표식",
      dependsOn: ["tilemap"],
      activate(api: Api) {
        const tilemap = api.exportsOf("tilemap");
        api.onDeactivate(
          tilemap.registerMapLayer({
            id: "e2e.marks",
            label: "표식",
            section: "marks",
            toolKey: "M",
            attach: (doc: { path: string | null }) => (doc.path === meadow ? state() : null),
            hint: () => "표식은 meadow 에만 있다",
            createTool: () => ({
              keyDown: (k: { key: string; mod: boolean }) => {
                log.keys.push(`${k.mod ? "Mod+" : ""}${k.key}`);
                return k.mod && k.key.toLowerCase() === "c";
              },
              pointerDown: (p: { cell: { x: number; y: number } }) => void log.pointers.push(p.cell),
              doubleClick: (p: { cell: { x: number; y: number } }) => void log.doubles.push(p.cell),
              cursor: () => "copy",
            }),
            Inspector: () => "표식 인스펙터 자리",
          }),
        );
        api.registerPanel({ id: "e2e.list", title: "표식 목록", Component: () => "표식 목록 본문", defaultDock: "left" });
      },
    });
  }, MEADOW);
}

async function openSample(page: Page) {
  await page.goto("/?backend=memory");
  await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
  await page.reload();
  await activateFakeExtension(page);
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  const tree = page.getByTestId("project-tree");
  await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
  await tree.locator('[data-path="resources"]').click();
  await tree.locator('[data-path="resources/maps"]').click();
}

async function openMap(page: Page, path: string, tab: string) {
  await page.getByTestId("project-tree").locator(`[data-path="${path}"]`).dblclick();
  await expect(page.getByTestId("doc-tab").filter({ hasText: tab })).toBeVisible();
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-ready", "true");
}

async function primaryKey(page: Page): Promise<string> {
  return (await page.evaluate(() => /Mac/i.test(navigator.platform))) ? "Meta" : "Control";
}

test.describe("확장 레이어 자리", () => {
  test("레이어 줄과 자물쇠, 단축키 대상, 인스펙터 자리, 뷰의 Ctrl+C, 포인터, 저장 전 질문, 힌트, 패널 탭", async ({ page }) => {
    await openSample(page);
    await openMap(page, MEADOW, "meadow.json");
    const mod = await primaryKey(page);
    const layers = page.getByTestId("layers");
    const rows = () => layers.getByTestId("layer-row").evaluateAll((els) => els.map((el) => el.getAttribute("data-target")));

    // 레이어 패널: 확장 레이어 줄이 오브젝트 위에 있고, 잠겨 있어 자물쇠와 이유가 보인다
    await expect(layers.locator('[data-target="ext:e2e.marks"]')).toBeVisible();
    expect((await rows()).slice(0, 2)).toEqual(["ext:e2e.marks", "objects"]);
    await expect(layers.getByTestId("layer-lock")).toHaveAttribute("title", "e2e 잠금 이유");
    await expect(layers.getByTestId("layer-lock-reason")).toHaveText("e2e 잠금 이유");
    await expect(layers.getByTestId("layer-errors")).toHaveText("오류 1");

    // 맵 오브젝트 하나를 고른 채 M: 대상이 표식 레이어다 (도구 단추도 켜진다). 인스펙터는 레이어의 자리를 그린다
    await ev(page, "(e) => e.documents.active.select(['slime_1'])");
    const view = page.getByTestId("map-view");
    await view.locator(".map-view-host").focus();
    await page.keyboard.press("m");
    await expect(view).toHaveAttribute("data-target", "ext:e2e.marks");
    await expect(view).toHaveAttribute("data-tool", "ext");
    await expect(page.getByTestId("map-target")).toHaveText("표식");
    await expect(page.getByTestId("map-tool-ext-e2e.marks")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("map-layer-inspector")).toHaveText("표식 인스펙터 자리");

    // 맵 뷰의 Ctrl+C 는 레이어 도구가 받는다: 고른 맵 오브젝트를 복사하지 않는다. 받지 않은 Ctrl+V 는 편집 메뉴로 간다
    await view.locator(".map-view-host").focus();
    await page.keyboard.press(`${mod}+c`);
    await page.keyboard.press(`${mod}+v`);
    expect((await marksLog(page)).keys).toEqual(["Mod+c", "Mod+v"]);
    expect(await ev<number>(page, "(e) => e.mapSupport.clipboard.size")).toBe(0);
    await expect(page.getByTestId("toasts")).not.toContainText("복사됨");
    expect(await ev<number>(page, "(e) => e.documents.active.model.objects.length")).toBe(4);

    // 포인터와 더블클릭은 칸 좌표와 함께 레이어 도구로 간다
    const canvas = view.locator("canvas");
    await canvas.click({ position: { x: 60, y: 60 } });
    await canvas.dblclick({ position: { x: 60, y: 60 } });
    const log = await marksLog(page);
    expect(log.pointers.length).toBeGreaterThanOrEqual(1);
    expect(log.doubles).toHaveLength(1);
    expect(log.doubles[0]).toEqual(log.pointers[0]);
    await expect(view.locator(".map-view-host")).toHaveCSS("cursor", "copy");

    // 저장 전 질문: 레이어에 오류가 있으면 목록을 보이고 묻는다. 취소하면 파일이 그대로다 (저장은 고친 맵만 되므로 칸 하나를 칠한다)
    const modal = page.getByTestId("modal");
    const disk = () => ev<string>(page, "(e, p) => e.backend.readText(p)", MEADOW);
    const before = await disk();
    await ev(page, "(e) => { const d = e.documents.active; d.apply(d.model.paintCells(0, [{ index: 0, value: 2 }])); }");
    await view.locator(".map-view-host").focus();
    await page.keyboard.press(`${mod}+s`);
    await expect(modal).toContainText("오류가 있는 맵 저장");
    await expect(modal).toContainText("- marks[1]: 표식 m1 이 틀렸다");
    await modal.getByRole("button", { name: "취소" }).click();
    await expect(modal).toHaveCount(0);
    expect(await disk()).toBe(before);
    // 그래도 저장: 섹션의 값이 파일에 쓰인다
    await page.keyboard.press(`${mod}+s`);
    await modal.getByRole("button", { name: "그래도 저장" }).click();
    await expect(page.getByTestId("toasts")).toContainText("저장됨: meadow.json");
    const saved = JSON.parse(await disk()) as { marks?: unknown; layers: Array<{ data: number[] }> };
    expect(saved.marks).toEqual([{ id: "m1", x: 2, y: 3 }]);
    expect(saved.layers[0].data[0]).toBe(2);

    // 다른 맵: 줄은 없고 힌트 한 줄
    await openMap(page, SAMPLE, "sample.json");
    await expect(layers.locator('[data-target="ext:e2e.marks"]')).toHaveCount(0);
    await expect(layers.getByTestId("layer-hint")).toHaveText("표식은 meadow 에만 있다");
    await expect(page.getByTestId("map-tool-ext-e2e.marks")).toHaveCount(0);

    // 확장 패널은 제 탭이다: 창 메뉴로 연다
    await page.getByRole("menubar").getByRole("menuitem", { name: "창", exact: true }).click();
    await page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: /^표식 목록$/ }) }).click();
    await expect(page.locator(".dv-tab", { hasText: "표식 목록" })).toBeVisible();
    await expect(page.getByTestId("extension-panel")).toHaveText("표식 목록 본문");

    // 확장을 끄면 레이어가 빠지고, 남은 탭은 확장이 없다고 알린다
    await page.getByTestId("doc-tab").filter({ hasText: "meadow.json" }).click();
    await expect(layers.locator('[data-target="ext:e2e.marks"]')).toBeVisible();
    await page.evaluate(() => (window as unknown as { initialEditor: { extensions: { deactivate(id: string): Promise<void> } } }).initialEditor.extensions.deactivate("e2e.marks"));
    await expect(layers.locator('[data-target="ext:e2e.marks"]')).toHaveCount(0);
    await expect(page.getByTestId("map-view")).toHaveAttribute("data-target", "objects");
    await expect(page.getByTestId("extension-panel-missing")).toBeVisible();
  });
});
