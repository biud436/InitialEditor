// 브라우저 모드 스모크 (docs/plans/e0-foundation.md 마일스톤 6). 메모리 백엔드(?backend=memory)라 서버가 필요 없다.
// 흐름: 시작 탭 → 샘플 프로젝트 열기 → 파일 트리 → 편집기 탭(Monaco, E1) → 테마 전환 → 콘솔 패널 닫기가 새로 고침 뒤에도 남는가.
// 메모리 프로젝트에 저장한 것은 페이지에만 있으므로 떠나기 전에 묻는다 (레이아웃만 바뀌었으면 묻지 않는다).

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
    await expect(page.getByText("활성 씬 탭 없음")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // 다시 켜면 돌아온다
    await openMenu(page, "창", "콘솔");
    await expect(page.getByTestId("console")).toBeVisible();
  });

  test("실행 버튼은 프로젝트를 열면 켜지고, 에디터 안에서 돈다는 것이 툴팁에 있다", async ({ page }) => {
    const run = page.getByTestId("toolbar").locator('[data-command="run.start"]');
    const tip = page.getByTestId("toolbar").locator(".toolbar-tip").first();
    await expect(run).toBeDisabled();
    await expect(tip).toHaveAttribute("title", /열린 프로젝트 없음/);
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    // 브라우저 모드의 F5 는 웹 엔진을 게임 탭에서 돌린다 (E4, game-view.spec.ts)
    await expect(run).toBeEnabled();
    await expect(tip).toHaveAttribute("title", /^실행 \(F5\) ?: 게임 탭에서 실행 \(웹 엔진\)$/);
  });

  test("오른쪽 클릭 메뉴는 누른 자리에 뜬다", async ({ page }) => {
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    const row = page.getByTestId("project-tree").locator('[data-path="scripts"]');
    await expect(row).toBeVisible();
    const box = (await row.boundingBox())!;
    const x = Math.round(box.x + 30);
    const y = Math.round(box.y + box.height / 2);
    await page.mouse.click(x, y, { button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const m = (await menu.boundingBox())!;
    // 도킹 영역은 메뉴 바와 툴바만큼 아래에서 시작한다. 그만큼 밀려 뜨면 안 된다
    expect(Math.abs(m.x - x)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.y - y)).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("메모리 프로젝트에 저장한 것이 있으면 새로 고치기 전에 묻고, 문서를 열어 레이아웃만 바뀌었으면 묻지 않는다", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.type());
      void dialog.dismiss();
    });
    const openMain = async () => {
      await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
      const tree = page.getByTestId("project-tree");
      await tree.locator('[data-path="scripts"]').click();
      await tree.locator('[data-path="scripts/lua"]').click();
      await tree.locator('[data-path="scripts/lua/main.lua"]').dblclick();
      await expect(page.locator(CODE)).toContainText("function init()");
    };
    type BackendWindow = { initialEditor: { backend: { exists(p: string): Promise<boolean>; volatileWrites?: number } } };

    // 문서를 열면 레이아웃(.initial-editor/layout.json)만 쓴다. 저장한 것이 없어 묻지 않고 새로 고쳐진다
    await openMain();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as BackendWindow).initialEditor.backend.exists(".initial-editor/layout.json")))
      .toBe(true);
    await page.reload();
    await expect(page.getByTestId("welcome")).toBeVisible();
    expect(dialogs).toEqual([]);

    // 고쳐 저장하면 문서는 깨끗해도 저장한 것이 페이지에만 있다. 새로 고치려 하면 묻고, 머무르면 프로젝트가 그대로다
    await openMain();
    await page.locator(CODE).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n-- 저장한 것");
    await page.keyboard.press("ControlOrMeta+s");
    const tab = page.getByTestId("doc-tab").filter({ hasText: "main.lua" });
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(0);
    await page.reload({ timeout: 3000 }).catch(() => {});
    expect(dialogs).toEqual(["beforeunload"]);
    await expect(page.getByTestId("statusbar")).toContainText("memory://sample");
    await expect(page.locator(CODE)).toContainText("-- 저장한 것");
    expect(await page.evaluate(() => (window as unknown as BackendWindow).initialEditor.backend.volatileWrites)).toBeGreaterThan(0);
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
    await expect(page.getByTestId("toasts")).toContainText("미리보기를 지원하지 않는 파일 형식");
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
    await expect(dialog).toContainText("game.json 생성");
    const tree = page.getByTestId("project-tree");
    await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
    await expect(tree.locator('[data-path="game.json"]')).toHaveCount(0);

    await dialog.getByRole("button", { name: "만들기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(tree.locator('[data-path="game.json"]')).toBeVisible();
    await expect(page.getByTestId("console-list")).toContainText("game.json 생성됨");

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
