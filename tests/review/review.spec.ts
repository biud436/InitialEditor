// 화면 검수판 (docs/plans/quality.md 5.2절). yarn build 뒤 yarn review 로 찍는다.
// 화면마다 다크와 라이트, 기본 창(1400x900)과 최소 창(960x600)을 찍어 review/ 에 두고, review/index.html 한 장에 모은다.
// 바뀐 화면의 전후를 PR 에 붙이고, 사진을 직접 보며 5.1절의 기준으로 검사한다.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const REPO = path.resolve(__dirname, "..", "..");
const OUT = path.join(REPO, "review");
const TEMPLATES = path.join(REPO, "packages", "app", "templates");

const SIZES = [
  { name: "1400x900", width: 1400, height: 900 },
  { name: "960x600", width: 960, height: 600 },
] as const;
const THEMES = ["dark", "light"] as const;

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

async function openSample(page: Page, query = "") {
  await page.goto(`/?backend=memory${query}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
}

async function writeFlappy(page: Page) {
  const manifest = JSON.parse(readFileSync(path.join(TEMPLATES, "MANIFEST.json"), "utf8")) as { files: ManifestFile[] };
  const files = manifest.files.filter((f) => (f.groups.includes("common") || f.groups.includes("flappy")) && (f.language === null || f.language === "lua"));
  const texts = files.filter((f) => f.kind === "text").map((f) => [f.to, readFileSync(path.join(TEMPLATES, f.path), "utf8")]);
  const binaries = files.filter((f) => f.kind === "binary").map((f) => [f.to, readFileSync(path.join(TEMPLATES, f.path)).toString("base64")]);
  texts.push(["game.json", JSON.stringify({ name: "flappy", windowWidth: 768, windowHeight: 896, script: "lua", startScene: "flappy" }, null, 2) + "\n"]);
  await ev(
    page,
    `async (e, files) => {
      for (const [p, b64] of files.binaries) await e.backend.writeBinary(p, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      for (const [p, text] of files.texts) await e.backend.writeText(p, text);
    }`,
    { binaries, texts },
  );
}

interface Scenario {
  name: string;
  title: string;
  run: (page: Page) => Promise<void>;
}

const SCENARIOS: Scenario[] = [
  {
    name: "gallery",
    title: "UI 견본",
    run: async (page) => {
      await page.goto("/?ui=gallery");
      await expect(page.getByText("UI 견본")).toBeVisible();
    },
  },
  {
    name: "start",
    title: "시작 (게임 없음)",
    run: async (page) => {
      await page.goto("/?backend=memory");
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await expect(page.getByRole("button", { name: "샘플 프로젝트 열기" })).toBeVisible();
    },
  },
  {
    name: "scene",
    title: "씬 편집 (플래피버드, bird 선택)",
    run: async (page) => {
      await openSample(page, "&sample=meadow");
      await writeFlappy(page);
      await ev(page, "async (e) => { await e.openPath('resources/scenes/flappy.json'); return null; }");
      await expect(page.getByTestId("scene-view")).toBeVisible();
      await page.getByTestId("hierarchy").getByText("bird", { exact: true }).first().click();
    },
  },
  {
    name: "script",
    title: "스크립트 편집",
    run: async (page) => {
      await openSample(page, "&sample=meadow");
      await writeFlappy(page);
      await ev(page, "async (e) => { await e.scripting.openScript('scripts/lua/components/flappy/bird.lua', 1, 1); return null; }");
      await expect(page.locator(".monaco-editor .view-lines")).toBeVisible();
    },
  },
  {
    name: "map",
    title: "맵 편집 (항구 마을, 이벤트 선택)",
    run: async (page) => {
      await openSample(page);
      await ev(page, "async (e) => { await e.openPath('resources/maps/port_town.json'); return null; }");
      await expect(page.getByTestId("map-view")).toHaveAttribute("data-ready", "true");
      await expect.poll(() => ev<boolean>(page, "(e) => { const s = e.extensions.exportsOf('rpg').store; return s.loaded && s.schema !== null; }"), { timeout: 15_000 }).toBe(true);
      await ev(page, "(e, id) => { const doc = e.documents.active; doc.setTarget({ kind: 'ext', id: 'rpg.events' }); const s = doc.layerState('rpg.events'); s.select([s.section.indexOfId(id)]); return null; }", "fishmonger");
    },
  },
  {
    name: "settings",
    title: "설정",
    run: async (page) => {
      await openSample(page);
      await page.getByRole("menubar").getByRole("menuitem", { name: "도구", exact: true }).click();
      await page.locator("[role=menu]").getByText("설정", { exact: true }).click();
      await expect(page.locator("[role=dialog]").first()).toBeVisible();
    },
  },
];

for (const scenario of SCENARIOS) {
  for (const theme of THEMES) {
    for (const size of SIZES) {
      test(`${scenario.name} ${theme} ${size.name}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: theme });
        const page = await context.newPage();
        await scenario.run(page);
        await page.waitForTimeout(700);
        const file = `${scenario.name}-${theme}-${size.name}.png`;
        mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: path.join(OUT, file) });
        await context.close();
      });
    }
  }
}

test.afterAll(() => {
  // 이번에 찍지 않은 장면(--grep 으로 일부만 찍을 때)도 폴더에 사진이 있으면 싣는다
  const sections = SCENARIOS.map((s) => {
    const items = THEMES.flatMap((theme) => SIZES.map((size) => ({ theme, size: size.name, file: `${s.name}-${theme}-${size.name}.png` })))
      .filter((x) => existsSync(path.join(OUT, x.file)))
      .map((x) => `<figure><a href="${x.file}"><img src="${x.file}" loading="lazy" alt=""></a><figcaption>${x.theme}, ${x.size}</figcaption></figure>`)
      .join("\n");
    return items ? `<section><h2>${s.title}</h2><div class="row">${items}</div></section>` : "";
  }).join("\n");
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>화면 검수판</title>
<style>body{margin:24px;font:13px -apple-system,"Apple SD Gothic Neo",sans-serif;background:#1b1d21;color:#e4e7eb}
h1{font-size:20px}h2{font-size:15px;margin:32px 0 12px}.row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}
figure{margin:0}img{width:460px;border:1px solid #383d45;display:block}figcaption{color:#9aa3ad;margin-top:4px}</style></head>
<body><h1>화면 검수판</h1><p>${new Date().toISOString().slice(0, 16).replace("T", " ")} 촬영. 사진을 누르면 원래 크기로 봅니다.</p>${sections}</body></html>`;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "index.html"), html);
});
