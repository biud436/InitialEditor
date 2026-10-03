// 사용자 가이드의 화면 (docs/guide/images/*.png). yarn build 뒤 yarn guide:screenshots 로 다시 찍는다.
// 웹판의 메모리 모드에서 찍고, 모드가 드러나는 아래 상태 바는 잘라 낸다 (화면은 데스크톱 앱과 같다).
//   RPG 데모(기본 샘플): 맵 편집, 이벤트, 게임 탭
//   플래피버드 템플릿을 메모리 프로젝트에 써서: 씬 편집, 스크립트 편집, 그래프 편집

import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const REPO = path.resolve(__dirname, "..", "..");
const OUT = path.join(REPO, "docs", "guide", "images");
const TEMPLATES = path.join(REPO, "packages", "app", "templates");
const GRAPH_FIXTURES = path.join(REPO, "packages", "core", "src", "graph", "fixtures", "flappy");
const STATUS_BAR = 24;

type ManifestFile = { path: string; to: string; groups: string[]; language: string | null; kind: "text" | "binary" };

function ev<T>(page: Page, src: string, arg: unknown = null): Promise<T> {
  return page.evaluate(
    ([s, a]) => {
      const e = (window as unknown as { initialEditor: unknown }).initialEditor;
      return Promise.resolve(new Function("e", "a", `return (${s})(e, a)`)(e, a)).then((v) => JSON.parse(JSON.stringify(v ?? null)));
    },
    [src, arg] as const,
  ) as Promise<T>;
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400);
  const vp = page.viewportSize()!;
  await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: vp.width, height: vp.height - STATUS_BAR } });
}

async function openSample(page: Page, query: string) {
  await page.goto(`/?backend=memory${query}`);
  await page.evaluate(() => localStorage.removeItem("initial-editor.layout"));
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
}

async function openMap(page: Page, p: string) {
  await ev(page, "async (e, p) => { await e.openPath(p); return null; }", p);
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-path", p);
  await expect(page.getByTestId("map-view")).toHaveAttribute("data-ready", "true");
}

test("RPG 데모: 맵 편집, 이벤트, 게임 탭", async ({ page }) => {
  await openSample(page, "");
  await expect.poll(() => ev<boolean>(page, "(e) => { const s = e.extensions.exportsOf('rpg').store; return s.loaded && s.schema !== null && s.game !== null; }"), { timeout: 15_000 }).toBe(true);
  await page.getByRole("menubar").getByRole("menuitem", { name: "창", exact: true }).click();
  await page.locator(".menu-item", { hasText: "레이아웃" }).first().hover();
  await page.locator(".menu-item", { hasText: "타일맵" }).first().click();
  await openMap(page, "resources/maps/port_town.json");
  await shot(page, "map-editor.png");

  // 이벤트 하나(물고기 장수)를 골라 인스펙터에 커맨드 목록이 보이게 한다
  await ev(page, "(e, id) => { const doc = e.documents.active; doc.setTarget({ kind: 'ext', id: 'rpg.events' }); const s = doc.layerState('rpg.events'); s.select([s.section.indexOfId(id)]); }", "fishmonger");
  await expect(page.getByText("fishmonger").first()).toBeVisible();
  await shot(page, "rpg-events.png");

  await page.keyboard.press("F5");
  await expect(page.getByTestId("game-view")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(4000);
  await shot(page, "game-tab.png");
});

test("플래피버드: 씬, 스크립트, 그래프", async ({ page }) => {
  await openSample(page, "&sample=meadow");
  const manifest = JSON.parse(readFileSync(path.join(TEMPLATES, "MANIFEST.json"), "utf8")) as { files: ManifestFile[] };
  const files = manifest.files.filter((f) => (f.groups.includes("common") || f.groups.includes("flappy")) && (f.language === null || f.language === "lua"));
  const texts = files.filter((f) => f.kind === "text").map((f) => [f.to, readFileSync(path.join(TEMPLATES, f.path), "utf8")]);
  const binaries = files.filter((f) => f.kind === "binary").map((f) => [f.to, readFileSync(path.join(TEMPLATES, f.path)).toString("base64")]);
  texts.push(["scripts/components/flappy/bird.graph.json", readFileSync(path.join(GRAPH_FIXTURES, "bird.graph.json"), "utf8")]);
  texts.push(["scripts/components/flappy/common.nodes.json", readFileSync(path.join(GRAPH_FIXTURES, "common.nodes.json"), "utf8")]);
  texts.push(["game.json", JSON.stringify({ name: "flappy", windowWidth: 768, windowHeight: 896, script: "lua", startScene: "flappy" }, null, 2) + "\n"]);
  await ev(
    page,
    `async (e, files) => {
      for (const [p, b64] of files.binaries) await e.backend.writeBinary(p, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      for (const [p, text] of files.texts) await e.backend.writeText(p, text);
    }`,
    { binaries, texts },
  );

  // 씬: 새를 골라 인스펙터에 컴포넌트가 보이게 한다
  await ev(page, "async (e) => { await e.openPath('resources/scenes/flappy.json'); return null; }");
  await expect(page.getByTestId("scene-view")).toBeVisible();
  await page.getByTestId("hierarchy").getByText("bird", { exact: true }).first().click();
  await expect(page.getByTestId("inspector-scripts")).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "scene-editor.png");

  // 스크립트: 새의 컴포넌트를 열고 Input. 뒤의 완성 목록을 띄운다
  await ev(page, "async (e) => { await e.scripting.openScript('scripts/lua/components/flappy/bird.lua', 1, 1); return null; }");
  await expect(page.locator(".monaco-editor .view-lines")).toBeVisible();
  await page.locator(".monaco-editor .view-lines").click();
  // update 의 첫 줄 뒤에서 입력해 완성 목록이 편집기 안에 보이게 한다
  const line = await ev<number>(page, "(e) => e.scripting.activeScript.text.split('\\n').findIndex((l) => /function M\\.update/.test(l)) + 1");
  await ev(page, "(e, l) => { e.scripting.activeScript.reveal(l, 9999); return null; }", line);
  await page.keyboard.type("\n  if Input.");
  await expect(page.locator(".monaco-editor .suggest-widget")).toBeVisible();
  await page.keyboard.type("Key");
  await page.waitForTimeout(600);
  await shot(page, "script-editor.png");
  await page.keyboard.press("Escape");

  // 그래프: 같은 새를 노드로 적은 그래프
  await ev(page, "async (e) => { await e.openPath('scripts/components/flappy/bird.graph.json'); return null; }");
  const canvas = page.getByTestId("graph-canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(800);
  // 전체 보기는 노드가 작아 글이 읽히지 않는다. 왼쪽 위 줄기를 확대한다
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.22, box.y + box.height * 0.18);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(600);
  await shot(page, "graph-editor.png");
});
