// 안드로이드로 스테이징의 브라우저 판 (docs/plans/e6-packaging.md 6.4). 메모리 백엔드(?backend=memory)는 프로세스를 띄우지
// 못하므로 실행 메뉴의 구분선 아래에 명령이 있되 꺼져 있고, 이유("데스크톱 앱에서만 된다")가 툴팁에 있다.
// 진짜 스크립트와의 교차 검사는 scripts/e2e-android-stage.mjs (yarn test:android-stage).

import { expect, test, type Page } from "@playwright/test";

const LAYOUT_KEY = "initial-editor.layout";

async function openRunMenu(page: Page) {
  await page.getByRole("menubar").getByRole("menuitem", { name: "실행", exact: true }).click();
}

test.describe("안드로이드로 스테이징 (메모리 모드)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?backend=memory&sample=meadow");
    await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
    await page.reload();
  });

  test("실행 메뉴에 있고 꺼져 있으며 이유가 보인다 (프로젝트를 연 뒤에도)", async ({ page }) => {
    await openRunMenu(page);
    const item = page.locator(".menu-item", { hasText: "안드로이드로 스테이징" });
    await expect(item).toBeVisible();
    await expect(item).toBeDisabled();
    await expect(item).toHaveAttribute("title", "데스크톱 앱 전용");
    // 구분선 아래 (바로 앞에 구분선이 있다)
    await expect(page.locator(".menu-item-wrap", { has: item }).locator(".menu-separator")).toHaveCount(1);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("statusbar")).toContainText("memory://sample");
    await openRunMenu(page);
    await expect(item).toBeDisabled();
    await expect(item).toHaveAttribute("title", "데스크톱 앱 전용");
  });

  test("설정에 엔진 저장소 칸이 없다 (프로세스를 띄울 수 있는 앱에서만)", async ({ page }) => {
    await page.getByRole("menubar").getByRole("menuitem", { name: "도구", exact: true }).click();
    await page.locator(".menu-item", { hasText: "설정" }).first().click();
    await expect(page.getByTestId("settings-dialog")).toBeVisible();
    await expect(page.getByTestId("settings-engine-repo")).toHaveCount(0);
  });
});
