// 프로젝트 뷰 필터 e2e (docs/plans/next-goals.md 1절). 메모리 백엔드(?backend=memory)라 서버가 필요 없다.
// 처음부터 켜져 game.json, scripts/, resources/ 만 보이고 숨긴 수를 단추에 적는다. 끄면 전부 보이고, 상태는 프로젝트의
// .initial-editor/project-view.json 에 남아 다시 열어도 그대로다. 무시 파일(.initial-editorignore)이 더 빼고 찾기도 따른다.

import { expect, test, type Page } from "@playwright/test";

const LAYOUT_KEY = "initial-editor.layout";

function ev<T>(page: Page, src: string, arg: unknown = null): Promise<T> {
  return page.evaluate(
    async ([code, a]) => {
      const e = (window as unknown as { initialEditor: unknown }).initialEditor;
      const f = new Function("e", "a", `return (${code})(e, a)`) as (e: unknown, a: unknown) => unknown;
      return (await f(e, a)) as T;
    },
    [src, arg] as const,
  );
}

async function openSample(page: Page) {
  await page.goto("/?backend=memory&sample=meadow");
  await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  const tree = page.getByTestId("project-tree");
  await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
  return tree;
}

test.describe("프로젝트 뷰 필터 (메모리 모드)", () => {
  test("처음부터 켜져 프로젝트 파일만 보이고, 끄면 전부 보이며, 상태가 프로젝트에 남는다", async ({ page }) => {
    const tree = await openSample(page);
    const filter = page.getByTestId("project-filter");
    await expect(filter).toHaveAttribute("aria-pressed", "true");
    await expect(tree.locator('[data-path="game.json"]')).toBeVisible();
    await expect(tree.locator('[data-path="README.md"]')).toHaveCount(0);
    await expect(filter).toHaveAttribute("data-hidden", "1");
    await expect(filter).toContainText("1");

    await filter.click();
    await expect(filter).toHaveAttribute("aria-pressed", "false");
    await expect(tree.locator('[data-path="README.md"]')).toBeVisible();
    await expect(filter).toHaveAttribute("data-hidden", "0");
    await expect.poll(() => ev<string>(page, "(e) => e.backend.readText('.initial-editor/project-view.json').catch(() => '')")).toContain('"filter": false');

    // 다시 열어도 꺼진 채다
    await ev(page, "(e) => e.openProject('memory://sample')");
    await expect(tree.locator('[data-path="README.md"]')).toBeVisible();
    await expect(filter).toHaveAttribute("aria-pressed", "false");
    await filter.click();
    await expect(tree.locator('[data-path="README.md"]')).toHaveCount(0);
  });

  test("무시 파일이 더 빼고 바뀌면 곧바로 따라간다. 찾기도 같은 범위를 쓴다", async ({ page }) => {
    const tree = await openSample(page);
    await tree.locator('[data-path="resources"]').click();
    await tree.locator('[data-path="resources/images"]').click();
    await expect(tree.locator('[data-path="resources/images/checker.png"]')).toBeVisible();
    await ev(page, "(e) => e.backend.writeText('.initial-editorignore', '# 작업 파일\\n*.png\\n')");
    await expect(tree.locator('[data-path="resources/images/checker.png"]')).toHaveCount(0);
    // README.md, .initial-editorignore 와 png 들이 숨는다
    await expect.poll(async () => Number(await page.getByTestId("project-filter").getAttribute("data-hidden"))).toBeGreaterThanOrEqual(3);

    // 찾기: scripts 를 빼면 scripts 의 결과가 없다
    await ev(page, "(e) => e.backend.writeText('.initial-editorignore', '/scripts/\\n')");
    await expect(tree.locator('[data-path="scripts"]')).toHaveCount(0);
    await expect(tree.locator('[data-path="resources/images/checker.png"]')).toBeVisible();
    const paths = await ev<string[]>(page, "async (e) => { const f = e.scripting.find; f.setQuery('init'); await f.search(); return f.results.map((r) => r.path); }");
    expect(paths.some((p) => p.startsWith("scripts/"))).toBe(false);
  });

  test("필터가 켜진 채 최상위에 새 파일을 만들면 숨었다고 알린다", async ({ page }) => {
    await openSample(page);
    await page.getByTestId("project-tree").click({ button: "right", position: { x: 20, y: 200 } });
    await page.locator(".context-menu").getByText("새 파일").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("notes.txt");
    await dialog.getByRole("button", { name: /만들기|확인/ }).click();
    await expect(page.getByTestId("toasts")).toContainText("프로젝트 뷰 필터로 숨김: notes.txt");
  });
});
