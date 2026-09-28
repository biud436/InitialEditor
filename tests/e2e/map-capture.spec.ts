// 맵 뷰의 타일 뽑기 (MapRenderer.captureTiles, docs/plans/e6-packaging.md 5절). 자가 검사가 게임 프레임과 견줄 때 쓴다.
// 메모리 모드의 샘플 맵(meadow.json)을 열고, 페이지 안에서 타일셋을 캔버스 2D 로 따로 그린 기준과 뽑은 픽셀을 견준다.
// 격자와 오브젝트 표식과 줌은 뽑기에 들지 않고, 한 칸을 칠하면 그 칸만 바뀐다.

import { expect, test, type Page } from "@playwright/test";

const LAYOUT_KEY = "initial-editor.layout";
const MAP_VIEW_KEY = "initial-editor.mapView";
const MAP_PATH = "resources/maps/meadow.json";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CaptureStats {
  width: number;
  height: number;
  /** 기준이 불투명한 픽셀 수 */
  opaque: number;
  /** 그중 뽑은 것과 채널마다 2 안인 수 */
  match: number;
  /** 칸마다 뽑은 픽셀의 합 (칸이 바뀌었는지 보는 지문) */
  cellSums: number[];
}

async function openMeadow(page: Page) {
  await page.goto("/?backend=memory&sample=meadow");
  await page.evaluate((keys) => keys.forEach((k) => localStorage.removeItem(k)), [LAYOUT_KEY, MAP_VIEW_KEY]);
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  const tree = page.getByTestId("project-tree");
  await tree.locator('[data-path="resources"]').click();
  await tree.locator('[data-path="resources/maps"]').click();
  await tree.locator(`[data-path="${MAP_PATH}"]`).dblclick();
  const view = page.getByTestId("map-view");
  await expect(view).toHaveAttribute("data-ready", "true");
  return view;
}

/** 뽑은 타일과 페이지 안의 기준 그림을 견준다 */
function capture(page: Page, rect: Rect): Promise<CaptureStats> {
  return page.evaluate(async (r) => {
    type Doc = { model: { width: number; height: number; tileWidth: number; tileHeight: number; tilesets: Array<{ image: string; firstGid: number; columns: number }>; layers: Array<{ data: number[] }> } };
    type Editor = {
      documents: { active: Doc | null };
      backend: { readBinary(p: string): Promise<Uint8Array> };
      mapSupport: { rendererFor(d: Doc): { captureTiles(r: unknown): { width: number; height: number; pixels: Uint8ClampedArray } | null } | null };
    };
    const editor = (window as unknown as { initialEditor: Editor }).initialEditor;
    const doc = editor.documents.active!;
    const got = editor.mapSupport.rendererFor(doc)!.captureTiles(r)!;
    const m = doc.model;
    const ts = m.tilesets[0];
    const bytes = await editor.backend.readBinary(ts.image);
    const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/png" }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const canvas = new OffscreenCanvas(r.width, r.height);
    const ctx = canvas.getContext("2d")!;
    for (const layer of m.layers) {
      for (let cy = 0; cy < m.height; cy++) {
        for (let cx = 0; cx < m.width; cx++) {
          const gid = layer.data[cy * m.width + cx];
          if (gid <= 0) continue;
          const i = gid - ts.firstGid;
          ctx.drawImage(bitmap, (i % ts.columns) * m.tileWidth, Math.floor(i / ts.columns) * m.tileHeight, m.tileWidth, m.tileHeight, cx * m.tileWidth - r.x, cy * m.tileHeight - r.y, m.tileWidth, m.tileHeight);
        }
      }
    }
    const want = ctx.getImageData(0, 0, r.width, r.height).data;
    let opaque = 0;
    let match = 0;
    const cols = Math.ceil(r.width / m.tileWidth);
    const cellSums = new Array<number>(cols * Math.ceil(r.height / m.tileHeight)).fill(0);
    for (let y = 0; y < got.height; y++) {
      for (let x = 0; x < got.width; x++) {
        const o = (y * got.width + x) * 4;
        cellSums[Math.floor(y / m.tileHeight) * cols + Math.floor(x / m.tileWidth)] += got.pixels[o] + got.pixels[o + 1] * 3 + got.pixels[o + 2] * 7;
        if (want[o + 3] !== 255) continue;
        opaque++;
        if (Math.abs(want[o] - got.pixels[o]) <= 2 && Math.abs(want[o + 1] - got.pixels[o + 1]) <= 2 && Math.abs(want[o + 2] - got.pixels[o + 2]) <= 2 && got.pixels[o + 3] === 255) match++;
      }
    }
    return { width: got.width, height: got.height, opaque, match, cellSums };
  }, rect);
}

test.describe("맵 뷰의 타일 뽑기 (메모리 모드)", () => {
  test("타일 레이어만 월드 좌표 그대로 1배로 뽑고, 격자와 표식과 줌은 들지 않는다. 칠한 칸만 바뀐다", async ({ page }) => {
    const view = await openMeadow(page);
    const whole = { x: 0, y: 0, width: 320, height: 192 };
    const first = await capture(page, whole);
    expect([first.width, first.height]).toEqual([320, 192]);
    // 샘플 타일에는 비치는 픽셀이 없다: 맵 전체가 불투명하고 기준 그림과 같다
    expect(first.opaque).toBe(320 * 192);
    expect(first.match).toBe(first.opaque);

    // 맵 밖에 걸친 사각형도 같은 셈 (맵 밖은 비었다)
    const shifted = await capture(page, { x: 160, y: 96, width: 200, height: 120 });
    expect(shifted.match).toBe(shifted.opaque);
    expect(shifted.opaque).toBe(160 * 96);

    // 격자와 오브젝트 표식을 끄고 켜도, 줌을 바꿔도 뽑기는 같다
    await page.getByTestId("map-toggle-grid").click();
    await page.getByTestId("map-toggle-objects").click();
    await page.getByRole("button", { name: "줌 확대" }).click();
    await expect(view).not.toHaveAttribute("data-zoom", "1");
    const again = await capture(page, whole);
    expect(again.cellSums).toEqual(first.cellSums);

    // 한 칸(4, 5)을 다른 타일로 칠하면 그 칸만 바뀐다
    const cell = { x: 4, y: 5 };
    await page.evaluate((c) => {
      type Doc = { model: { width: number; layers: Array<{ data: number[] }>; paintCells(l: number, ch: Array<{ index: number; value: number }>, k: string): unknown }; apply(cmd: unknown): void };
      const doc = (window as unknown as { initialEditor: { documents: { active: Doc } } }).initialEditor.documents.active;
      const index = c.y * doc.model.width + c.x;
      const now = doc.model.layers[0].data[index];
      doc.apply(doc.model.paintCells(0, [{ index, value: now === 5 ? 3 : 5 }], "e2e"));
    }, cell);
    const painted = await capture(page, whole);
    expect(painted.match).toBe(painted.opaque);
    const changed = painted.cellSums.map((s, i) => (s !== first.cellSums[i] ? i : -1)).filter((i) => i >= 0);
    expect(changed).toEqual([cell.y * 20 + cell.x]);
  });
});
