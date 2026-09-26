// 브라우저 모드 스모크 (docs/plans/e0-foundation.md 마일스톤 6). 메모리 백엔드(?backend=memory)라 서버가 필요 없다.
// 흐름: 시작 탭 → 샘플 프로젝트 열기 → 파일 트리 → 편집기 탭(Monaco, E1) → 테마 전환 → 콘솔 패널 닫기가 새로 고침 뒤에도 남는가.

import { expect, test, type Page } from "@playwright/test";

const LAYOUT_KEY = "initial-editor.layout";
/** 스크립트 탭의 Monaco 가 그린 줄들 (E1 부터 텍스트 파일은 Monaco 로 열린다) */
const CODE = ".monaco-editor .view-lines";

async function openMenu(page: Page, branch: string, item: string | RegExp) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item", { hasText: item }).first().click();
}

test.describe("메모리 모드 스모크", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?backend=memory");
    // 이전 실행의 레이아웃이 남아 있으면 지우고 다시 연다
    await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
    await page.reload();
  });

  test("시작 탭, 샘플 프로젝트, 파일 트리, 미리보기, 테마, 레이아웃 저장", async ({ page }) => {
    // 시작 탭
    await expect(page.getByTestId("welcome")).toBeVisible();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "시작" })).toBeVisible();

    // 콘솔에 시작 줄
    await expect(page.getByTestId("console-list")).toContainText(/InitialEditor .* 시작/);
    await expect(page.getByTestId("console-list")).toContainText("모드: 메모리");

    // 샘플 프로젝트 열기 (메모리 모드는 버튼 하나)
    const openButton = page.getByRole("button", { name: "샘플 프로젝트 열기" });
    await expect(openButton).toBeVisible();
    await expect(page.getByRole("button", { name: "프로젝트 열기", exact: true })).toHaveCount(0);
    await openButton.click();

    // 프로젝트 패널
    const tree = page.getByTestId("project-tree");
    await expect(tree.locator('[data-path="resources"]')).toBeVisible();
    await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
    await expect(tree.locator('[data-path="game.json"]')).toBeVisible();
    await expect(page.getByTestId("statusbar")).toContainText("memory://sample");

    // 폴더를 펼치면 그때 읽는다
    await tree.locator('[data-path="scripts"]').click();
    await expect(tree.locator('[data-path="scripts/lua"]')).toBeVisible();
    await tree.locator('[data-path="scripts/lua"]').click();
    const mainLua = tree.locator('[data-path="scripts/lua/main.lua"]');
    await expect(mainLua).toBeVisible();

    // 더블클릭으로 편집기 탭 (Monaco)
    await mainLua.dblclick();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "main.lua" })).toBeVisible();
    await expect(page.locator(".monaco-editor").first()).toBeVisible();
    await expect(page.locator(CODE)).toContainText("function init()");
    await expect(page.locator(CODE)).toContainText("샘플 프로젝트 시작");

    // 이미지 미리보기
    await tree.locator('[data-path="resources"]').click();
    await tree.locator('[data-path="resources/images"]').click();
    await tree.locator('[data-path="resources/images/checker.png"]').dblclick();
    await expect(page.getByTestId("image-preview")).toBeVisible();
    await expect(page.getByTestId("image-dimensions")).toHaveText("16 x 16");

    // 설정에서 테마 전환
    await openMenu(page, "도구", "설정");
    await expect(page.getByTestId("settings-dialog")).toBeVisible();
    await page.getByTestId("settings-theme").selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByTestId("status-theme")).toHaveText("라이트");
    await page.getByTestId("settings-theme").selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // 창 메뉴로 콘솔 닫기
    await expect(page.getByTestId("console")).toBeVisible();
    await openMenu(page, "창", "콘솔");
    await expect(page.getByTestId("console")).toHaveCount(0);

    // 레이아웃이 localStorage 에 저장될 때까지 (디바운스)
    await page.waitForFunction((key) => {
      const raw = localStorage.getItem(key);
      return !!raw && !raw.includes('"console"');
    }, LAYOUT_KEY);

    // 새로 고침 뒤에도 콘솔은 닫혀 있고 다른 패널은 그대로다
    await page.reload();
    await expect(page.getByTestId("welcome")).toBeVisible();
    await expect(page.getByTestId("console")).toHaveCount(0);
    await expect(page.getByText("씬을 열면 여기에 오브젝트가 보인다")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // 다시 켜면 돌아온다
    await openMenu(page, "창", "콘솔");
    await expect(page.getByTestId("console")).toBeVisible();
  });

  test("실행 버튼은 비활성이고 이유가 툴팁에 있다", async ({ page }) => {
    const run = page.getByTestId("toolbar").locator('[data-command="run.start"]');
    await expect(run).toBeDisabled();
    await expect(page.getByTestId("toolbar").locator(".toolbar-tip").first()).toHaveAttribute("title", /브라우저 모드에서는 엔진을 띄울 수 없다/);
  });

  test("미리보기가 없는 파일은 토스트로 알린다", async ({ page }) => {
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    const tree = page.getByTestId("project-tree");
    await tree.locator('[data-path="resources"]').click();
    await tree.locator('[data-path="resources/maps"]').click();
    // 맵 파일은 맵 뷰로 열린다 (E3)
    await tree.locator('[data-path="resources/maps/sample.json"]').dblclick();
    await expect(page.getByTestId("map-view")).toBeVisible();
    // 오른쪽 클릭 메뉴로 새 파일 (확장자 없음) 을 만들고 열면 미리보기가 없다
    await tree.locator('[data-path="resources/maps"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "새 파일" }).click();
    await page.getByRole("dialog").getByRole("textbox").fill("notes.bin");
    await page.getByRole("dialog").getByRole("button", { name: "확인" }).click();
    const created = tree.locator('[data-path="resources/maps/notes.bin"]');
    await expect(created).toBeVisible();
    await created.dblclick();
    await expect(page.getByTestId("toasts")).toContainText("미리보기가 없는 파일이다");
  });
});

// game.json 이 없는 폴더를 열면 프로젝트로 등록할 것인지 묻고, 만들기를 누르면 game.json 이 생긴다
// (docs/plans/e0-foundation.md 완료 기준 첫 항목의 브라우저 판. Tauri 창은 같은 코드 경로를 탄다).
test.describe("game.json 없는 프로젝트 등록", () => {
  test("묻고, 만들기를 누르면 game.json 이 생긴다", async ({ page }) => {
    await page.goto("/?backend=memory&sample=nogame");
    await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
    await page.reload();
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("game.json 을 만듭니다");
    const tree = page.getByTestId("project-tree");
    await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
    await expect(tree.locator('[data-path="game.json"]')).toHaveCount(0);

    await dialog.getByRole("button", { name: "만들기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(tree.locator('[data-path="game.json"]')).toBeVisible();
    await expect(page.getByTestId("console-list")).toContainText("game.json 을 만들었다");

    // 만든 파일은 엔진 기본값이다
    await tree.locator('[data-path="game.json"]').dblclick();
    await expect(page.locator(CODE)).toContainText('"windowWidth": 768');
    await expect(page.locator(CODE)).toContainText('"script": "lua"');
  });

  test("나중에를 누르면 만들지 않는다", async ({ page }) => {
    await page.goto("/?backend=memory&sample=nogame");
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "나중에" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
    await expect(page.getByTestId("project-tree").locator('[data-path="game.json"]')).toHaveCount(0);
  });
});
