// 새 게임 대화상자의 템플릿 미리보기를 찍는다 (yarn review:previews, docs/plans/quality.md Q1).
// 템플릿을 메모리 프로젝트에 쓰고 게임 탭(웹 엔진)에서 실제로 돌린 화면을 packages/app/src/components/launcher/previews/ 에 둔다.
// 빈 게임은 실행 화면이 검은 바탕뿐이라 찍지 않는다 (카드는 아이콘을 쓴다). 템플릿이 바뀌면 다시 찍는다. 먼저 yarn build.

import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const REPO = path.resolve(__dirname, "..", "..");
const TEMPLATES = path.join(REPO, "packages", "app", "templates");
const OUT = path.join(REPO, "packages", "app", "src", "components", "launcher", "previews");

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

async function writeTemplate(page: Page, template: string, startScene: string | undefined) {
  const manifest = JSON.parse(readFileSync(path.join(TEMPLATES, "MANIFEST.json"), "utf8")) as { files: ManifestFile[] };
  const files = manifest.files.filter((f) => (f.groups.includes("common") || f.groups.includes(template)) && (f.language === null || f.language === "lua"));
  const texts = files.filter((f) => f.kind === "text").map((f) => [f.to, readFileSync(path.join(TEMPLATES, f.path), "utf8")]);
  const binaries = files.filter((f) => f.kind === "binary").map((f) => [f.to, readFileSync(path.join(TEMPLATES, f.path)).toString("base64")]);
  const game: Record<string, unknown> = { name: template, windowWidth: 768, windowHeight: 896, script: "lua" };
  if (startScene) game.startScene = startScene;
  texts.push(["game.json", JSON.stringify(game, null, 2) + "\n"]);
  await ev(
    page,
    `async (e, files) => {
      for (const [p, b64] of files.binaries) await e.backend.writeBinary(p, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      for (const [p, text] of files.texts) await e.backend.writeText(p, text);
    }`,
    { binaries, texts },
  );
}

const CASES = [
  { template: "flappy", startScene: "flappy", wait: 2500 },
  { template: "tilemap", startScene: "main", wait: 2500 },
  { template: "rpg", startScene: undefined, wait: 4000 },
];

for (const c of CASES) {
  test(`미리보기: ${c.template}`, async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/?backend=memory&sample=meadow");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
    await writeTemplate(page, c.template, c.startScene);
    await page.keyboard.press("F5");
    const canvas = page.getByTestId("game-view").locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(c.wait);
    mkdirSync(OUT, { recursive: true });
    await canvas.screenshot({ path: path.join(OUT, `${c.template}.png`) });
  });
}
