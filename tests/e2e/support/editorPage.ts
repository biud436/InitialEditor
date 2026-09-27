// 에디터 페이지를 다루는 Playwright 도우미 (map-view.spec.ts와 같은 방식).
// 맵 뷰의 좌표는 data-zoom, data-pan-x, data-pan-y와 캔버스 상자로 옮긴다 (view.ts).
// window.initialEditor에서 테스트가 읽는 모양은 EditorWindow에 적는다.
// captureRunStarts는 에디터의 러너를 감싸 실행 커맨드가 넘기는 옵션을 모은다 (runCapture.ts).

import type { Locator, Page } from "@playwright/test";
import type { MapObject } from "../../../packages/ext-tilemap/src/model/format";
import type { MapObjectSchema } from "../../../packages/ext-tilemap/src/model/schema";
import { installRunCapture, type RunStartOptions } from "./runCapture";
import { worldToPage, type Box, type Point, type ViewTransform } from "./view";

export const LAYOUT_KEY = "initial-editor.layout";
export const MAP_VIEW_KEY = "initial-editor.mapView";

export interface MapDocumentLike {
  kind: string;
  path: string | null;
  dirty: boolean;
  tool: string;
  selectedIds: string[];
  schema: MapObjectSchema | null;
  brush: { width: number; height: number; gids: number[][] };
  undo: { depth: number };
  model: {
    name: string;
    width: number;
    height: number;
    pixelWidth: number;
    pixelHeight: number;
    layers: ReadonlyArray<{ name: string; data: number[] }>;
    objects: readonly MapObject[];
    findObject(id: string): MapObject | undefined;
  };
}

export interface EditorWindow {
  initialEditor: {
    documents: { active: MapDocumentLike | null };
    mapSupport: { focusObject(id: string): boolean };
    commands: { isEnabled(id: string): boolean };
    log: { entries: ReadonlyArray<{ level: string; source: string; text: string }> };
    runner: object;
  };
}

const RUN_STARTS = "__e2eRunStarts";
const RESTORE_RUNNER = "__e2eRestoreRunner";

/** 에디터의 러너를 감싼다: 엔진을 띄울 수 있다고 답하고, start에 넘긴 옵션을 페이지에 모은다 */
export async function captureRunStarts(page: Page): Promise<void> {
  await page.evaluate(
    `(() => { window.${RUN_STARTS} = []; window.${RESTORE_RUNNER} = (${installRunCapture.toString()})(window.initialEditor, window.${RUN_STARTS}); })()`,
  );
}

/** 지금까지 모은 start 옵션 */
export function runStarts(page: Page): Promise<RunStartOptions[]> {
  return page.evaluate((key) => ((window as unknown as Record<string, RunStartOptions[] | undefined>)[key] ?? []).slice(), RUN_STARTS);
}

/** 원래 러너로 되돌린다 (감싸지 않았으면 아무것도 하지 않는다) */
export async function restoreRunner(page: Page): Promise<void> {
  await page.evaluate((key) => (window as unknown as Record<string, (() => void) | undefined>)[key]?.(), RESTORE_RUNNER);
}

/** 에디터 콘솔의 글 (오래된 것부터) */
export function editorLogTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as EditorWindow).initialEditor.log.entries.map((e) => e.text));
}

export async function openSubmenu(page: Page, branch: string, sub: string, item: string): Promise<void> {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item-wrap").filter({ has: page.locator(".menu-label", { hasText: new RegExp(`^${sub}$`) }) }).hover();
  await page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: new RegExp(`${item}$`) }) }).click();
}

/** 맵 뷰의 월드 → 캔버스 변환 */
export async function readTransform(view: Locator): Promise<ViewTransform> {
  const [zoom, panX, panY] = await Promise.all(["data-zoom", "data-pan-x", "data-pan-y"].map((a) => view.getAttribute(a)));
  const t = { zoom: Number(zoom), panX: Number(panX), panY: Number(panY) };
  if (!(t.zoom > 0) || !Number.isFinite(t.panX) || !Number.isFinite(t.panY)) throw new Error(`맵 뷰의 변환을 읽지 못했다: ${zoom}, ${panX}, ${panY}`);
  return t;
}

export async function canvasBox(view: Locator): Promise<Box> {
  const box = await view.locator("canvas").boundingBox();
  if (!box) throw new Error("맵 뷰에 캔버스가 없다");
  return box;
}

/** 월드 좌표를 페이지 좌표로 (지금의 줌과 팬으로) */
export async function toPage(view: Locator, world: Point): Promise<Point & { zoom: number }> {
  const [box, t] = await Promise.all([canvasBox(view), readTransform(view)]);
  return { ...worldToPage(box, t, world), zoom: t.zoom };
}

/** 누르고, 가운데를 거쳐, 놓는다 */
export async function drag(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}
