// 저장 충돌 e2e (03-project-and-runtime.md 파일 규칙 4). 브리지 모드: 엔진 저장소(INITIAL2D_DIR, 기본 ../Initial2D)의
// tools/bridge/server.js를 임시 프로젝트로 띄우고, 파일은 테스트가 디스크에서 직접 고친다 (밖에서 바뀐 파일).
// 흐름: 수정 중인 문서가 밖에서 바뀐 뒤 Ctrl+S → 모달(덮어쓰기, 다시 읽기, 취소) → 고른 대로 디스크와 문서가 바뀐다.
//   맵: 취소는 둘 다 두고, 덮어쓰기는 내 것을 쓴다. 지워진 파일은 다시 읽기 없이 묻고 덮어쓰면 다시 만든다.
//   JSON(스크립트 편집기): 배너에서 내 것 유지를 골라도 저장 직전 디스크와 견주어 묻고, 다시 읽기는 한 번 더 묻는다.
//   모두 저장: 문서마다 묻고, 취소한 것은 두고 나머지를 저장한다.
// 브리지 포트는 E2E_BRIDGE_PORT가 있으면 그것, 없으면 OS가 준 빈 포트다.

import { expect, test, type Page } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { freePort, startBridge, type Bridge } from "./support/project";

const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? "../Initial2D");
const serverScript = path.join(engineDir, "tools", "bridge", "server.js");
const tileset = path.join(engineDir, "resources", "tiles", "village16.png");
const LAYOUT_KEY = "initial-editor.layout";

const MAP_PATH = "resources/maps/field.json";
const SCENE_PATH = "resources/scenes/main.json";
const JSON_PATH = "resources/data/items.json";
const LUA_PATH = "scripts/lua/main.lua";

const W = 6;
const H = 4;
const mapJson = (first: number) =>
  JSON.stringify(
    {
      version: 2,
      name: "field",
      width: W,
      height: H,
      tileWidth: 16,
      tileHeight: 16,
      layers: [{ name: "ground", data: [first, ...new Array(W * H - 1).fill(1)] }],
      tilesets: [{ image: "resources/tiles/village16.png", firstGid: 1, columns: 8 }],
    },
    null,
    2,
  ) + "\n";
const sceneJson = (x: number) => JSON.stringify({ version: 1, name: "main", objects: [{ id: "hero", type: "node", x, y: 16 }] }, null, 2) + "\n";
const LUA = "function init() end\nfunction update(elapsed) end\nfunction render() end\nfunction destroy() end\n";

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

async function primaryKey(page: Page): Promise<string> {
  return (await page.evaluate(() => /Mac/i.test(navigator.platform))) ? "Meta" : "Control";
}

const docTab = (page: Page, name: string) => page.getByTestId("doc-tab").filter({ hasText: name });
const docState = (page: Page, path: string) =>
  ev<{ dirty: boolean; externallyChanged: boolean } | null>(page, "(e, p) => { const d = e.documents.findByPath(p); return d && { dirty: d.dirty, externallyChanged: d.externallyChanged }; }", path);

test.describe("저장 충돌 (브리지 모드)", () => {
  test.skip(!existsSync(serverScript) || !existsSync(tileset), `엔진 저장소가 없다: ${serverScript} (INITIAL2D_DIR로 위치를 준다)`);

  let bridge: Bridge | null = null;
  let root = "";
  let project = "";
  const disk = (rel: string) => readFileSync(path.join(project, rel), "utf8");
  const writeOutside = (rel: string, text: string) => writeFileSync(path.join(project, rel), text);

  test.beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), "initial-editor-save-conflict-"));
    project = path.join(root, "project");
    for (const dir of ["scripts/lua", "resources/maps", "resources/scenes", "resources/data", "resources/tiles"]) mkdirSync(path.join(project, dir), { recursive: true });
    writeFileSync(path.join(project, "game.json"), JSON.stringify({ windowWidth: 768, windowHeight: 896, renderScale: 1, script: "lua" }, null, 2) + "\n");
    writeFileSync(path.join(project, LUA_PATH), LUA);
    writeFileSync(path.join(project, MAP_PATH), mapJson(1));
    writeFileSync(path.join(project, SCENE_PATH), sceneJson(16));
    writeFileSync(path.join(project, JSON_PATH), '{\n  "potion": 1\n}\n');
    copyFileSync(tileset, path.join(project, "resources/tiles/village16.png"));
    const port = process.env.E2E_BRIDGE_PORT ? Number(process.env.E2E_BRIDGE_PORT) : await freePort();
    bridge = await startBridge({ serverScript, project, port });
  });

  test.afterEach(async () => {
    await bridge?.stop();
    bridge = null;
    if (root) rmSync(root, { recursive: true, force: true });
  });

  async function openProject(page: Page) {
    await page.goto(`/?backend=bridge&url=${encodeURIComponent(bridge!.url)}`);
    await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
    await page.reload();
    const tree = page.getByTestId("project-tree");
    await expect(tree.locator('[data-path="resources"]')).toBeVisible({ timeout: 15_000 });
    // 밖의 변경을 놓치지 않게 감시가 붙을 때까지 기다린다
    await ev(page, "(e) => e.backend.whenWatching?.(10000)");
    return tree;
  }

  async function openPath(page: Page, rel: string, tab: string) {
    await ev(page, "(e, p) => e.openPath(p)", rel);
    await expect(docTab(page, tab)).toBeVisible();
  }

  const modal = (page: Page) => page.getByTestId("modal");
  const conflict = (page: Page) => modal(page).getByTestId("save-conflict");

  test("맵: 수정 중 밖에서 바뀐 파일을 Ctrl+S로 저장하면 묻고, 취소는 둘 다 두고, 덮어쓰기는 내 것을 쓴다. 지워진 파일은 다시 만든다", async ({ page }) => {
    await openProject(page);
    const mod = await primaryKey(page);
    await openPath(page, MAP_PATH, "field.json");
    await expect(page.getByTestId("map-view")).toHaveAttribute("data-ready", "true");

    // 내 수정: 칸 (1,0)을 gid 9로
    await ev(page, "(e) => e.documents.active.apply(e.documents.active.model.paintCells(0, [{ index: 1, value: 9 }]))");
    expect((await docState(page, MAP_PATH))?.dirty).toBe(true);

    // 밖의 수정: 맵 생성기가 칸 (0,0)을 gid 5로 다시 썼다
    const outside = mapJson(5);
    writeOutside(MAP_PATH, outside);
    const banner = page.getByTestId("external-change-banner");
    await expect(banner).toBeVisible();

    // 취소: 디스크는 밖의 것, 문서는 내 수정, 배너는 그대로
    await docTab(page, "field.json").click();
    await page.keyboard.press(`${mod}+KeyS`);
    await expect(conflict(page)).toHaveAttribute("data-kind", "changed");
    await expect(modal(page)).toContainText("밖에서 바뀐 파일");
    await expect(modal(page).getByRole("button", { name: "다시 읽기" })).toBeVisible();
    await modal(page).getByRole("button", { name: "취소" }).click();
    await expect(modal(page)).toHaveCount(0);
    expect(disk(MAP_PATH)).toBe(outside);
    expect(await docState(page, MAP_PATH)).toEqual({ dirty: true, externallyChanged: true });
    await expect(banner).toBeVisible();

    // 덮어쓰기: 디스크는 내 것 (칸 0은 원래 1, 칸 1은 9), 배너가 걷히고 깨끗하다
    await page.keyboard.press(`${mod}+KeyS`);
    await modal(page).getByRole("button", { name: "덮어쓰기" }).click();
    await expect(page.getByTestId("toasts")).toContainText("저장했다: field.json");
    expect(JSON.parse(disk(MAP_PATH)).layers[0].data.slice(0, 3)).toEqual([1, 9, 1]);
    await expect(banner).toHaveCount(0);
    expect(await docState(page, MAP_PATH)).toEqual({ dirty: false, externallyChanged: false });

    // 지워진 파일: 다시 읽기가 없고, 덮어쓰면 내 것으로 다시 만든다
    await ev(page, "(e) => e.documents.active.apply(e.documents.active.model.paintCells(0, [{ index: 2, value: 7 }]))");
    unlinkSync(path.join(project, MAP_PATH));
    await expect.poll(async () => (await docState(page, MAP_PATH))?.externallyChanged).toBe(true);
    await page.keyboard.press(`${mod}+KeyS`);
    await expect(conflict(page)).toHaveAttribute("data-kind", "missing");
    await expect(modal(page)).toContainText("지워진 파일");
    await expect(modal(page).getByRole("button", { name: "다시 읽기" })).toHaveCount(0);
    await modal(page).getByRole("button", { name: "덮어쓰기" }).click();
    await expect.poll(() => docState(page, MAP_PATH)).toEqual({ dirty: false, externallyChanged: false });
    expect(JSON.parse(disk(MAP_PATH)).layers[0].data.slice(0, 3)).toEqual([1, 9, 7]);
  });

  test("JSON: 내 것 유지를 골라도 저장 직전 디스크와 견주어 묻고, 다시 읽기는 한 번 더 물은 뒤 디스크 내용으로 바꾼다", async ({ page }) => {
    await openProject(page);
    const mod = await primaryKey(page);
    await openPath(page, JSON_PATH, "items.json");
    const code = page.locator(".monaco-editor .view-lines");
    await expect(code).toContainText("potion");

    await code.click();
    await ev(page, "(e) => e.scripting.activeScript.reveal(2, 1)");
    await page.keyboard.type('  "mine": 2,\n');
    await expect(code).toContainText("mine");
    const outside = '{\n  "potion": 1,\n  "outside": 3\n}\n';
    writeOutside(JSON_PATH, outside);
    const banner = page.getByTestId("external-change-banner");
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "내 것 유지" }).click();
    await expect(banner).toHaveCount(0);

    // 배너를 거두었어도 디스크가 연 때와 다르므로 묻는다. 다시 읽기의 두 번째 확인에서 취소하면 그대로다
    await page.keyboard.press(`${mod}+KeyS`);
    await expect(conflict(page)).toHaveAttribute("data-kind", "changed");
    await modal(page).getByRole("button", { name: "다시 읽기" }).click();
    await expect(modal(page)).toContainText("items.json의 저장하지 않은 수정을 버리고");
    await modal(page).getByRole("button", { name: "취소" }).click();
    await expect(modal(page)).toHaveCount(0);
    expect(disk(JSON_PATH)).toBe(outside);
    await expect(code).toContainText("mine");
    expect((await docState(page, JSON_PATH))?.dirty).toBe(true);

    // 다시 읽기, 버리고 다시 읽기: 편집기가 디스크 내용이 되고 깨끗하다
    await code.click();
    await page.keyboard.press(`${mod}+KeyS`);
    await modal(page).getByRole("button", { name: "다시 읽기" }).click();
    await modal(page).getByRole("button", { name: "버리고 다시 읽기" }).click();
    await expect(modal(page)).toHaveCount(0);
    await expect(page.getByTestId("toasts")).toContainText("저장하지 않고 디스크 내용으로 다시 읽었다: items.json");
    await expect(code).toContainText("outside");
    await expect(code).not.toContainText("mine");
    expect(disk(JSON_PATH)).toBe(outside);
    expect((await docState(page, JSON_PATH))?.dirty).toBe(false);
    await expect(docTab(page, "items.json").locator(".doc-tab-dirty")).toHaveCount(0);
  });

  test("모두 저장: 밖에서 바뀐 씬과 스크립트를 문서마다 묻고, 취소한 것은 두고 나머지를 저장한다", async ({ page }) => {
    await openProject(page);
    const mod = await primaryKey(page);
    await openPath(page, SCENE_PATH, "main.json");
    await ev(page, "(e) => e.documents.active.apply(e.documents.active.scene.moveObjects([{ id: 'hero', x: 40, y: 16 }]))");
    await openPath(page, LUA_PATH, "main.lua");
    const code = page.locator(".monaco-editor .view-lines");
    await expect(code).toContainText("function init()");
    await code.click();
    await ev(page, "(e) => e.scripting.activeScript.reveal(1, 1)");
    await page.keyboard.type("-- mine\n");
    expect((await docState(page, SCENE_PATH))?.dirty).toBe(true);
    expect((await docState(page, LUA_PATH))?.dirty).toBe(true);

    const outsideScene = sceneJson(99);
    const outsideLua = "-- outside\n" + LUA;
    writeOutside(SCENE_PATH, outsideScene);
    writeOutside(LUA_PATH, outsideLua);
    await expect.poll(async () => [(await docState(page, SCENE_PATH))?.externallyChanged, (await docState(page, LUA_PATH))?.externallyChanged]).toEqual([true, true]);

    // 문서 탭에 초점을 두고 모두 저장 (편집기 안의 키는 Monaco가 먼저 받는다)
    await docTab(page, "main.lua").click();
    await page.keyboard.press(`${mod}+Shift+KeyS`);
    await expect(conflict(page)).toBeVisible();
    await expect(modal(page)).toContainText("main.json이(가) 밖에서 바뀌었다");
    await modal(page).getByRole("button", { name: "덮어쓰기" }).click();
    await expect(modal(page)).toContainText("main.lua이(가) 밖에서 바뀌었다");
    await modal(page).getByRole("button", { name: "취소" }).click();
    await expect(modal(page)).toHaveCount(0);
    await expect(page.getByTestId("toasts")).toContainText("1개 문서를 저장했다. 저장하지 않은 것: main.lua");

    expect(JSON.parse(disk(SCENE_PATH)).objects[0]).toMatchObject({ id: "hero", x: 40 });
    expect(disk(LUA_PATH)).toBe(outsideLua);
    expect(await docState(page, SCENE_PATH)).toEqual({ dirty: false, externallyChanged: false });
    expect(await docState(page, LUA_PATH)).toEqual({ dirty: true, externallyChanged: true });
    await expect(code).toContainText("mine");
  });
});
