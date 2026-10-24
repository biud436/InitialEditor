// RPG Maker 2000 타일맵 e2e (docs/plans/rm2k-tilemap.md). 메모리 백엔드(?backend=memory)의 샘플 게임에 검사용 ChipSet
// (packages/ext-rm2k/src/model/testChipset.ts)을 써 두고, 사람이 하는 길로 간다:
//   새 맵 대화상자에서 그 그림을 고르면 형식이 RPG Maker 2000 ChipSet 으로 골라진다 → 물결 빠르기를 바꿔 만든다 → 맵 파일의
//   타일셋 항목과 구운 아틀라스 → 팔레트의 하층과 상층 → 땅 오토타일을 사각형으로 칠하면 칸마다 모양이 맞고 되돌리기 한 번에
//   돌아간다 → 물을 칠하고 가운데에 깊은 물 → 물 영역 채우기는 모양이 다른 물 칸을 한 영역으로 본다 → 물이 맵 뷰에서 움직이고
//   애니메이션 토글로 멈춘다
// 아틀라스 번호는 packages/ext-rm2k/src/model/atlas.ts 의 배치(판 1)다: D 는 289 + 종류*48 + 모양, 물 A1 은 913 + 물 칸.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { encodePng } from "../../packages/core/src/png";
import { codedChipset } from "../../packages/ext-rm2k/src/model/testChipset";

const LAYOUT_KEY = "initial-editor.layout";
const CHIPSET = "resources/ChipSet/Coded.png";
const ATLAS = "resources/tiles/Coded.rm2k.png";
const MAP = "resources/maps/field.json";

/** firstGid 1 의 아틀라스 gid (atlas.ts) */
const D1 = (variant: number) => 1 + 288 + variant;
const A1 = (tuple: number) => 1 + 912 + tuple;
const A2 = (tuple: number) => 1 + 912 + 306 + tuple;
const DEEP_FIRST = 1 + 912 + 2 * 306;

function ev<T>(page: Page, src: string, arg: unknown = null): Promise<T> {
  return page.evaluate(
    ([s, a]) => {
      const e = (window as unknown as { initialEditor: unknown }).initialEditor;
      return Promise.resolve(new Function("e", "a", `return (${s})(e, a)`)(e, a)).then((v) => JSON.parse(JSON.stringify(v ?? null)));
    },
    [src, arg] as const,
  ) as Promise<T>;
}

async function primaryKey(page: Page): Promise<string> {
  return (await page.evaluate(() => /Mac/i.test(navigator.platform))) ? "Meta" : "Control";
}

async function openSubmenu(page: Page, branch: string, sub: string, item: string) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item-wrap").filter({ has: page.locator(".menu-label", { hasText: new RegExp(`^${sub}$`) }) }).hover();
  await page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: new RegExp(`${item}$`) }) }).click();
}

/** 맵 칸의 가운데를 페이지 좌표로 */
async function cellOnPage(view: Locator, cx: number, cy: number) {
  const box = await view.locator("canvas").boundingBox();
  if (!box) throw new Error("맵 캔버스가 없다");
  const zoom = Number(await view.getAttribute("data-zoom"));
  const panX = Number(await view.getAttribute("data-pan-x"));
  const panY = Number(await view.getAttribute("data-pan-y"));
  return { x: box.x + (cx * 16 + 8) * zoom + panX, y: box.y + (cy * 16 + 8) * zoom + panY };
}

/** 팔레트 쪽의 칸 하나를 누른다 (6열) */
async function pickPaletteCell(page: Page, index: number) {
  const canvas = page.getByTestId("palette-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("팔레트 캔버스가 없다");
  const size = 16 * Number(await canvas.getAttribute("data-zoom"));
  await page.mouse.click(box.x + (index % 6) * size + size / 2, box.y + Math.floor(index / 6) * size + size / 2);
}

async function dragCells(page: Page, view: Locator, from: [number, number], to: [number, number]) {
  const a = await cellOnPage(view, ...from);
  const b = await cellOnPage(view, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

const layer0 = (page: Page) => ev<number[]>(page, "(e) => e.documents.active.model.layers[0].data.slice()");
const at = (data: number[], x: number, y: number) => data[y * 10 + x];

test.describe("RPG Maker 2000 타일맵", () => {
  test("ChipSet 으로 새 맵을 만들고 팔레트로 땅과 물을 칠한다", async ({ page }) => {
    await page.goto("/?backend=memory&sample=meadow");
    await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
    await page.reload();
    // 시작 화면의 단추 이름은 Q1(시작 창)에서 "샘플 게임 열기"로 바뀐다. 어느 판에서도 돈다
    await page.getByRole("button", { name: /^샘플 (프로젝트|게임) 열기$/ }).click();
    await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
    const png = await encodePng(codedChipset());
    await ev(page, "(e, a) => e.backend.writeBinary(a.path, new Uint8Array(a.bytes))", { path: CHIPSET, bytes: [...png] });
    const mod = await primaryKey(page);

    // 새 맵: ChipSet 그림을 고르면 형식 줄이 나오고 RPG Maker 2000 ChipSet 이 골라진다
    await page.keyboard.press(`${mod}+Alt+KeyM`);
    const dialog = page.getByTestId("new-map-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("new-map-kind")).toHaveCount(0);
    await page.getByTestId("new-map-tileset").selectOption(CHIPSET);
    await expect(page.getByTestId("new-map-kind")).toHaveValue("rm2k");
    await expect(page.getByTestId("new-map-columns")).toHaveCount(0);
    await expect(page.getByTestId("new-map-option-water")).toHaveValue("pingpong");
    // 형식 아래에 사용자 가이드의 따라 하기와 설명서로 가는 링크가 있다
    await expect(page.getByTestId("new-map-kind-guides").getByRole("button")).toHaveText(["따라 하기", "설명서"]);
    await page.getByTestId("new-map-option-waterSpeed").selectOption("fast");
    // 타일 크기가 16 이 아니면 형식 줄이 사라진다
    await page.getByTestId("new-map-tile").fill("32");
    await expect(page.getByTestId("new-map-kind")).toHaveCount(0);
    await page.getByTestId("new-map-tile").fill("16");
    await expect(page.getByTestId("new-map-kind")).toHaveValue("rm2k");
    await page.getByTestId("new-map-name").fill("field");
    await page.getByTestId("new-map-width").fill("10");
    await page.getByTestId("new-map-height").fill("8");
    await page.getByTestId("new-map-ok").click();
    await expect(page.getByTestId("modal")).toHaveCount(0);
    await expect(page.getByTestId("doc-tab").filter({ hasText: "field.json" })).toBeVisible();

    // 맵 파일의 타일셋 항목과 구운 아틀라스 (768x1264)
    const data = JSON.parse(await ev<string>(page, `(e) => e.backend.readText(${JSON.stringify(MAP)})`));
    expect(data.tilesets).toHaveLength(1);
    expect(data.tilesets[0]).toMatchObject({ image: ATLAS, firstGid: 1, columns: 48, rm2k: { version: 1, chipset: CHIPSET, water: "pingpong", waterSpeed: "fast" } });
    expect(data.tilesets[0].animations).toEqual([
      { tile: 864, count: 3, frames: [864, 867, 870, 873], duration: 100 },
      { tile: 912, count: 918, frames: [912, 1872, 2832, 1872], duration: 200 },
    ]);
    const head = await ev<number[]>(page, `(e) => e.backend.readBinary(${JSON.stringify(ATLAS)}).then((b) => [...b.slice(16, 24)])`);
    const u32 = (o: number) => ((head[o] << 24) | (head[o + 1] << 16) | (head[o + 2] << 8) | head[o + 3]) >>> 0;
    expect([u32(0), u32(4)]).toEqual([768, 1264]);

    // 타일맵 레이아웃: 팔레트는 하층과 상층 두 쪽이고 하층은 6열 27줄이다
    await openSubmenu(page, "창", "레이아웃", "타일맵");
    const view = page.getByTestId("map-view");
    await expect(view).toHaveAttribute("data-ready", "true");
    await expect(page.getByTestId("palette-page-tab")).toHaveText(["하층", "상층"]);
    const palette = page.getByTestId("palette-canvas");
    await expect(palette).toHaveAttribute("data-page", "lower");
    await expect(palette).toHaveAttribute("data-columns", "6");
    await expect(palette).toHaveAttribute("data-rows", "27");
    await expect(palette).toHaveAttribute("data-ready", "true");
    await expect(page.getByTestId("palette-guide")).toHaveText(["따라 하기", "설명서"]);
    await expect(page.getByTestId("palette-guide").last()).toHaveAttribute("href", /docs\/guide\/rm2k\.md$/);
    await page.getByTestId("palette-page-tab").filter({ hasText: "상층" }).click();
    await expect(palette).toHaveAttribute("data-rows", "24");
    await page.getByTestId("palette-page-tab").filter({ hasText: "하층" }).click();

    // 땅 오토타일 D1 (하층 칸 6) 을 사각형으로 3x3 칠하면 칸마다 이웃에 맞는 모양이다
    await pickPaletteCell(page, 6);
    await expect(page.getByTestId("palette-brush")).toHaveText("브러시: 오토타일 D1");
    await page.getByTestId("map-tool-rect").click();
    await dragCells(page, view, [1, 1], [3, 3]);
    let cells = await layer0(page);
    expect([at(cells, 1, 1), at(cells, 2, 1), at(cells, 3, 1)]).toEqual([D1(34), D1(20), D1(36)]);
    expect([at(cells, 1, 2), at(cells, 2, 2), at(cells, 3, 2)]).toEqual([D1(16), D1(0), D1(24)]);
    expect([at(cells, 1, 3), at(cells, 2, 3), at(cells, 3, 3)]).toEqual([D1(40), D1(28), D1(38)]);
    // 되돌리기 한 번에 아홉 칸이 모두 돌아간다
    await view.locator("canvas").hover();
    await page.keyboard.press(`${mod}+KeyZ`);
    cells = await layer0(page);
    expect([1, 2, 3].flatMap((y) => [1, 2, 3].map((x) => at(cells, x, y)))).toEqual(new Array(9).fill(0));
    await page.keyboard.press(`${mod}+Shift+KeyZ`);
    expect(at(await layer0(page), 2, 2)).toBe(D1(0));

    // 물 A1 (칸 0) 을 4x4 칠한다: 맵 가운데 쪽 모서리는 물가, 안쪽은 몸통
    await pickPaletteCell(page, 0);
    await expect(page.getByTestId("palette-brush")).toHaveText("브러시: 물 A1");
    await dragCells(page, view, [5, 1], [8, 4]);
    cells = await layer0(page);
    expect(at(cells, 6, 2)).toBe(A1(0));
    expect(at(cells, 5, 1)).toBe(A1(34));
    // 깊은 물 (칸 2) 을 펜으로 가운데에: 사방이 얕은 물이라 깊은 물이고, 둘레의 얕은 물은 곧은 경계라 모양이 그대로다
    await pickPaletteCell(page, 2);
    await page.getByTestId("map-tool-pen").click();
    const deepAt = await cellOnPage(view, 6, 2);
    await page.mouse.click(deepAt.x, deepAt.y);
    cells = await layer0(page);
    expect(at(cells, 6, 2)).toBeGreaterThanOrEqual(DEEP_FIRST);
    expect(at(cells, 6, 2)).toBeLessThan(DEEP_FIRST + 306);
    expect(at(cells, 7, 2)).toBe(A1(0));

    // 물 A2 (칸 1) 로 얕은 물을 채우면 모양이 다른 얕은 물 칸 열다섯이 한 영역이다 (깊은 물은 다른 지형이라 남는다)
    await pickPaletteCell(page, 1);
    await page.getByTestId("map-tool-fill").click();
    const fillAt = await cellOnPage(view, 8, 4);
    await page.mouse.click(fillAt.x, fillAt.y);
    cells = await layer0(page);
    expect(at(cells, 5, 1)).toBe(A2(34));
    expect(at(cells, 8, 4)).toBe(A2(38));
    expect(at(cells, 6, 2)).toBeGreaterThanOrEqual(DEEP_FIRST);
    const shallow = [5, 6, 7, 8].flatMap((x) => [1, 2, 3, 4].map((y) => at(cells, x, y))).filter((g) => g >= A2(0) && g < A2(306));
    expect(shallow).toHaveLength(15);
    // 땅 오토타일은 그대로다
    expect(at(cells, 2, 2)).toBe(D1(0));

    // 물은 맵 뷰에서 움직인다 (빠르게: 200ms 마다 물이 든 덩어리를 다시 그린다). 끄면 멈춘다
    const toggle = page.getByTestId("map-toggle-animation");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const renders = async () => Number(await view.getAttribute("data-chunk-renders"));
    const before = await renders();
    await expect.poll(renders, { timeout: 3000 }).toBeGreaterThan(before + 2);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    const stopped = await renders();
    await page.waitForTimeout(800);
    expect(await renders()).toBe(stopped);
  });
});
