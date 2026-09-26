// 스크립트 편집 e2e (docs/plans/e1-scripting.md 마일스톤 1, 4, 5). 메모리 백엔드(?backend=memory)라 서버가 필요 없다.
// 흐름: Monaco 로 열기 → 고치면 점 → 저장하면 점이 사라지고 토스트 → 다시 열면 남아 있다,
//       외부 변경(미수정이면 다시 읽기, 수정 중이면 배너), 프로젝트 찾기, 자동완성, 새 스크립트, 수정한 탭 닫기 확인.

import { expect, test, type Page } from "@playwright/test";

const LAYOUT_KEY = "initial-editor.layout";
const CODE = ".monaco-editor .view-lines";

async function openMenu(page: Page, branch: string, item: string | RegExp) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item", { hasText: item }).first().click();
}

async function openSample(page: Page) {
  await page.goto("/?backend=memory");
  await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  const tree = page.getByTestId("project-tree");
  await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
  return tree;
}

async function openMainLua(page: Page) {
  const tree = await openSample(page);
  await tree.locator('[data-path="scripts"]').click();
  await tree.locator('[data-path="scripts/lua"]').click();
  await tree.locator('[data-path="scripts/lua/main.lua"]').dblclick();
  await expect(page.locator(".monaco-editor").first()).toBeVisible();
  await expect(page.locator(CODE)).toContainText("function init()");
  return tree;
}

/** 활성 스크립트의 커서를 그 줄 그 열로 (Monaco 의 mac 단축키 차이를 피한다) */
async function goTo(page: Page, line: number, column = 1) {
  await page.evaluate(([l, c]) => (window as unknown as { initialEditor: { scripting: { activeScript: { reveal(line: number, column: number): void } } } }).initialEditor.scripting.activeScript.reveal(l, c), [line, column]);
}

function tabOf(page: Page, title: string) {
  return page.getByTestId("doc-tab").filter({ hasText: title });
}

test.describe("스크립트 편집 (메모리 모드)", () => {
  test("Monaco 로 열고, 고치면 점이 붙고, 저장하면 사라지고 토스트가 뜨고, 다시 열면 남아 있다", async ({ page }) => {
    const tree = await openMainLua(page);
    const tab = tabOf(page, "main.lua");
    await expect(page.getByTestId("script-editor")).toHaveAttribute("data-language", "lua");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(0);

    await page.locator(CODE).click();
    await goTo(page, 1, 1);
    await page.keyboard.type("-- e2e 수정\n");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(1);
    await expect(page.locator(CODE)).toContainText("e2e 수정");
    await expect(page.getByTestId("statusbar")).toContainText("저장 안 됨 1");

    await openMenu(page, "파일", "저장");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(0);
    await expect(page.getByTestId("toasts")).toContainText("저장했다: main.lua");
    const saved = await page.evaluate(() => (window as unknown as { initialEditor: { backend: { readText(p: string): Promise<string> } } }).initialEditor.backend.readText("scripts/lua/main.lua"));
    expect(saved.startsWith("-- e2e 수정\n-- 샘플 프로젝트의 Lua 진입점")).toBe(true);
    expect(saved).not.toContain("\r");

    await tab.getByRole("button", { name: /닫기/ }).click();
    await expect(tab).toHaveCount(0);
    await tree.locator('[data-path="scripts/lua/main.lua"]').dblclick();
    await expect(page.locator(CODE)).toContainText("e2e 수정");
  });

  test("밖에서 바뀐 파일: 미수정이면 조용히 다시 읽고 토스트, 수정 중이면 배너", async ({ page }) => {
    await openMainLua(page);
    const change = (text: string) =>
      page.evaluate(
        ([p, t]) => (window as unknown as { initialEditor: { backend: { simulateExternalChange(p: string, k: string, d: string): void } } }).initialEditor.backend.simulateExternalChange(p, "modify", t),
        ["scripts/lua/main.lua", text],
      );
    await change("-- 밖에서 바꿈\nfunction init()\nend\n");
    await expect(page.locator(CODE)).toContainText("밖에서 바꿈");
    await expect(page.getByTestId("toasts")).toContainText("밖에서 바뀌어 다시 읽었다: main.lua");
    await expect(page.getByTestId("external-change-banner")).toHaveCount(0);

    await page.locator(CODE).click();
    await goTo(page, 1, 1);
    await page.keyboard.type("-- 내 수정\n");
    const tab = tabOf(page, "main.lua");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(1);
    await change("-- 두 번째 외부 변경\n");
    const banner = page.getByTestId("external-change-banner");
    await expect(banner).toBeVisible();
    await expect(page.locator(CODE)).toContainText("내 수정");
    await banner.getByRole("button", { name: "다시 읽기" }).click();
    await expect(banner).toHaveCount(0);
    await expect(page.locator(CODE)).toContainText("두 번째 외부 변경");
    await expect(page.locator(CODE)).not.toContainText("내 수정");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(0);
  });

  test("프로젝트에서 찾기: init 이 Lua 와 Ruby 진입점에서 나오고 누르면 그 파일 그 줄로 간다", async ({ page }) => {
    await openSample(page);
    await openMenu(page, "편집", "프로젝트에서 찾기");
    await expect(page.getByTestId("find-panel")).toBeVisible();
    const input = page.getByTestId("find-input");
    await expect(input).toBeFocused();
    await input.fill("init");
    await input.press("Enter");
    const files = page.getByTestId("find-file");
    await expect(files.filter({ hasText: "scripts/lua/main.lua" })).toHaveCount(1);
    await expect(files.filter({ hasText: "scripts/ruby/main.rb" })).toHaveCount(1);
    await expect(page.getByTestId("find-summary")).toContainText("2개 파일");

    const rubyMatch = files.filter({ hasText: "scripts/ruby/main.rb" }).getByTestId("find-match").first();
    const line = await rubyMatch.getAttribute("data-line");
    await rubyMatch.click();
    await expect(tabOf(page, "main.rb")).toBeVisible();
    await expect(page.getByTestId("script-editor")).toHaveAttribute("data-language", "ruby");
    await expect(page.getByTestId("script-cursor")).toHaveText(new RegExp(`^줄 ${line}, `));

    // 대소문자 구분을 켜면 소문자 init 만
    await page.getByTestId("find-case").check();
    await input.fill("INIT");
    await input.press("Enter");
    await expect(page.getByTestId("find-summary")).toContainText("0개 파일");
    await expect(page.getByTestId("find-results")).toContainText("찾지 못했다");
  });

  test("자동완성: Inpu 를 치면 Input 이 뜨고, Input. 뒤에는 멤버가 뜬다", async ({ page }) => {
    await openMainLua(page);
    await expect(page.getByTestId("console-list")).toContainText(/API 명세/);
    await page.locator(CODE).click();
    await goTo(page, 1, 1);
    await page.keyboard.type("Inpu");
    const suggest = page.locator(".monaco-editor .suggest-widget");
    await expect(suggest).toBeVisible();
    await expect(suggest).toContainText("Input");
    await page.keyboard.press("Escape");
    await page.keyboard.type("t.");
    await expect(suggest).toBeVisible();
    await expect(suggest).toContainText("IsKeyDown");
    await page.keyboard.press("Escape");
    // 시그니처 도움말: 여는 괄호 뒤에 인자 목록
    await page.keyboard.type("IsKeyDown(");
    const hints = page.locator(".monaco-editor .parameter-hints-widget");
    await expect(hints).toBeVisible();
    await expect(hints).toContainText("IsKeyDown(key)");
    await page.keyboard.press("Escape");
  });

  test("편집 메뉴의 되돌리기와 다시 실행이 Monaco 의 스택을 쓴다", async ({ page }) => {
    await openMainLua(page);
    const tab = tabOf(page, "main.lua");
    await page.locator(CODE).click();
    await goTo(page, 1, 1);
    await page.keyboard.type("undone");
    await expect(page.locator(CODE)).toContainText("undone");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(1);
    await openMenu(page, "편집", "되돌리기");
    await expect(page.locator(CODE)).not.toContainText("undone");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(0);
    await openMenu(page, "편집", "다시 실행");
    await expect(page.locator(CODE)).toContainText("undone");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(1);
  });

  test("새 스크립트: 컴포넌트 템플릿이 트리와 탭에 생긴다", async ({ page }) => {
    const tree = await openSample(page);
    await openMenu(page, "파일", "새 스크립트");
    const dialog = page.getByTestId("new-script-dialog");
    await expect(dialog).toBeVisible();
    await page.getByTestId("new-script-kind").selectOption("component");
    await page.getByTestId("new-script-name").fill("player");
    await expect(dialog).toContainText("scripts/lua/player.lua");
    await dialog.getByRole("button", { name: "만들기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(tree.locator('[data-path="scripts/lua/player.lua"]')).toBeVisible();
    await expect(tabOf(page, "player.lua")).toBeVisible();
    await expect(page.locator(CODE)).toContainText("function Player.init(obj, scene)");
    await expect(page.getByTestId("console-list")).toContainText("스크립트를 만들었다: scripts/lua/player.lua");

    // 같은 이름은 경고
    await openMenu(page, "파일", "새 스크립트");
    await page.getByTestId("new-script-kind").selectOption("component");
    await page.getByTestId("new-script-name").fill("player");
    await page.getByTestId("new-script-dialog").getByRole("button", { name: "만들기" }).click();
    await expect(page.getByTestId("toasts")).toContainText("이미 있다: scripts/lua/player.lua");
    await page.getByTestId("new-script-dialog").getByRole("button", { name: "취소" }).click();
  });

  test("수정한 탭을 닫으면 묻고, 취소하면 남는다", async ({ page }) => {
    await openMainLua(page);
    await page.locator(CODE).click();
    await goTo(page, 1, 1);
    await page.keyboard.type("-- x\n");
    const tab = tabOf(page, "main.lua");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(1);
    await tab.hover();
    await tab.getByRole("button", { name: /닫기/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("저장하지 않은");
    await dialog.getByRole("button", { name: "취소" }).click();
    await expect(tab).toHaveCount(1);
    await tab.hover();
    await tab.getByRole("button", { name: /닫기/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(tab).toHaveCount(0);
  });

  test("설정의 편집기 글꼴 크기와 테마가 Monaco 에 반영된다", async ({ page }) => {
    await openMainLua(page);
    const monaco = page.locator(".monaco-editor").first();
    await openMenu(page, "도구", "설정");
    await page.getByTestId("settings-font-size").fill("20");
    await expect(page.locator(".monaco-editor .view-line").first()).toHaveCSS("font-size", "20px");
    // 테마를 바꾸면 Monaco 테마도 그 테마의 토큰 --bg-panel 로 다시 정의된다 (다크 #22252a, 라이트 #f7f7f8).
    // 시작 테마는 OS 설정(Playwright 는 라이트)을 따르므로 둘 다 명시적으로 고른다
    await page.getByTestId("settings-theme").selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(monaco).toHaveCSS("background-color", "rgb(34, 37, 42)");
    await page.getByTestId("settings-theme").selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(monaco).toHaveCSS("background-color", "rgb(247, 247, 248)");
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  });
});
