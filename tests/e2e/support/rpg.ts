// RPG 이벤트 e2e 의 도우미 (rpg-layer.spec.ts, rpg-events.spec.ts).
//   openRpgProject  메모리 모드의 샘플 프로젝트를 열고 packages/ext-rpg/test/fixtures 의 파일(두 스키마, 아이템 표, port_town.json,
//                   타일셋, 플레이스홀더 CharSet 과 FaceSet)을 메모리 백엔드에 쓴 뒤 ext-rpg 가 다 읽기를 기다린다.
//                   샘플 프로젝트 자체는 늘리지 않는다 (앱 번들에 실린다)
//   waitRpgLoaded   ext-rpg 의 저장소가 스키마, 설정, 아이템 표를 다 읽었다
//   ev              페이지 안에서 src(editor, arg)를 돌리고 결과를 JSON 으로 받는다
//   cellPoint       맵 뷰의 칸 가운데의 페이지 좌표 (타일 16px)

import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

export const LAYOUT_KEY = "initial-editor.layout";
export const PORT = "resources/maps/port_town.json";
export const MEADOW = "resources/maps/meadow.json";
export const FIXTURES = path.resolve(__dirname, "..", "..", "..", "packages", "ext-rpg", "test", "fixtures");
const TEXT_FILES = ["resources/data/items.json", "resources/schema/event-commands.json", "resources/maps/port_town.json", "resources/data/rpg-game.json"];
const BINARY_FILES = ["resources/tiles/port16.png", "resources/charsets/placeholder.png", "resources/faces/placeholder.png"];

export interface PortEvent {
  id: string;
  x: number;
  y: number;
  trigger?: string;
  charset?: unknown;
}

/** 픽스처의 port_town.json 이벤트 (파일 순서) */
export function fixtureEvents(): PortEvent[] {
  return (JSON.parse(readFileSync(path.join(FIXTURES, PORT), "utf8")) as { events: PortEvent[] }).events;
}

/** 페이지 안에서 src(editor, arg)를 돌리고 결과를 JSON으로 받는다 */
export function ev<T>(page: Page, src: string, arg: unknown = null): Promise<T> {
  return page.evaluate(
    ([s, a]) => {
      const e = (window as unknown as { initialEditor: unknown }).initialEditor;
      return Promise.resolve(new Function("e", "a", `return (${s})(e, a)`)(e, a)).then((v) => JSON.parse(JSON.stringify(v ?? null)));
    },
    [src, arg] as const,
  ) as Promise<T>;
}

export async function primaryKey(page: Page): Promise<string> {
  return (await page.evaluate(() => /Mac/i.test(navigator.platform))) ? "Meta" : "Control";
}

/** ext-rpg 의 저장소가 스키마, 설정, 아이템 표를 다 읽었다 */
export async function waitRpgLoaded(page: Page, timeout = 15_000): Promise<void> {
  await expect
    .poll(() => ev<boolean>(page, "(e) => { const s = e.extensions.exportsOf('rpg').store; return s.loaded && s.schema !== null && s.game !== null && s.items !== null; }"), { timeout })
    .toBe(true);
}

export async function openRpgProject(page: Page): Promise<void> {
  await page.goto("/?backend=memory");
  await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
  // 바이너리 먼저, 설정(rpg-game.json)은 마지막: 설정을 읽을 때 아이템 표와 맵 파일이 이미 있다
  const binaries = BINARY_FILES.map((p) => [p, readFileSync(path.join(FIXTURES, p)).toString("base64")]);
  const texts = TEXT_FILES.map((p) => [p, readFileSync(path.join(FIXTURES, p), "utf8")]);
  await ev(
    page,
    `async (e, files) => {
      for (const [p, b64] of files.binaries) await e.backend.writeBinary(p, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      for (const [p, text] of files.texts) await e.backend.writeText(p, text);
    }`,
    { binaries, texts },
  );
  await waitRpgLoaded(page);
}

export async function openMap(page: Page, p: string, tab: string): Promise<void> {
  await ev(page, "(e, p) => e.openPath(p)", p);
  await expect(page.getByTestId("doc-tab").filter({ hasText: tab })).toBeVisible();
  // 탭이 이미 열려 있으면 앞으로 오기 전에도 위 두 조건이 참이다. 보이는 맵 뷰가 그 경로일 때까지 기다린다
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-path", p);
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-ready", "true");
}

/** 칸 가운데의 페이지 좌표 */
export async function cellPoint(view: Locator, cx: number, cy: number): Promise<{ x: number; y: number; zoom: number }> {
  const box = (await view.locator("canvas").boundingBox())!;
  const zoom = Number(await view.getAttribute("data-zoom"));
  const panX = Number(await view.getAttribute("data-pan-x"));
  const panY = Number(await view.getAttribute("data-pan-y"));
  return { x: box.x + (cx * 16 + 8) * zoom + panX, y: box.y + (cy * 16 + 8) * zoom + panY, zoom };
}

export async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
}
