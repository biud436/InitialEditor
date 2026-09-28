// 메모리 모드의 기본 샘플: 엔진의 RPG 데모 「떠나기 전에」 (번들 템플릿 rpg). 웹판의 "샘플 프로젝트 열기"가 여는 것과 같다.
// 템플릿을 메모리에 풀어 열고, 항구 마을 맵과 이벤트 레이어가 보이고, F5 로 타이틀이 게임 탭에서 오류 없이 돌며,
// 이 맵에서 실행(Ctrl+F5)이 항구 마을로 바로 들어가는지 본다. 샘플을 연 것은 저장하지 않은 변경으로 세지 않는다.

import { expect, test } from "@playwright/test";
import { ev, LAYOUT_KEY, openMap, PORT, primaryKey, waitRpgLoaded } from "./support/rpg";

function engineLines(page: import("@playwright/test").Page): Promise<string[]> {
  return ev<string[]>(page, "(e) => e.log.entries.filter((x) => x.source === 'engine').map((x) => x.text)");
}

test.describe("RPG 데모 샘플 (메모리 모드)", () => {
  test("샘플을 열면 항구 마을과 이벤트가 보이고, F5 는 타이틀을, 이 맵에서 실행은 마을을 오류 없이 연다", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/?backend=memory");
    await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
    await page.reload();
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    const tree = page.getByTestId("project-tree");
    await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
    expect(await ev<string>(page, "(e) => e.project.gameJson.name")).toBe("떠나기 전에");
    expect(await ev<number>(page, "(e) => e.backend.volatileWrites")).toBe(0);
    for (const p of ["scripts/lua/main.lua", "scripts/lua/rpg/interpreter.lua", "resources/data/rpg-game.json", "resources/tiles/port16.png"]) {
      expect(await ev<boolean>(page, "(e, p) => e.backend.exists(p)", p), p).toBe(true);
    }
    await waitRpgLoaded(page);

    // 항구 마을: 이벤트 레이어와 이벤트 17개
    await openMap(page, PORT, "port_town.json");
    await expect(page.getByTestId("map-view")).toHaveAttribute("data-path", PORT);
    expect(await ev<number>(page, "(e) => e.extensions.exportsOf('rpg').store.game.maps.length")).toBe(2);

    // F5: 타이틀이 게임 탭에서 돈다 (오류 줄 없이 3초)
    await page.keyboard.press("F5");
    const game = page.getByTestId("game-view");
    await expect(game).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await page.waitForTimeout(3000);
    await expect(game).toHaveAttribute("data-phase", "running");
    // 엔진이 창을 만들며 바꾼 페이지 제목은 에디터 것으로 돌아온다
    await expect(page).toHaveTitle("InitialEditor");
    const titleLines = await engineLines(page);
    expect(titleLines.filter((l) => /error|scene: |uncaught/i.test(l)), titleLines.join("\n")).toEqual([]);
    await page.keyboard.press("Shift+F5");
    await expect(game).not.toHaveAttribute("data-phase", "running", { timeout: 15_000 });

    // 이 맵에서 실행: 항구 마을로 바로 들어간다 (rpg-game.json 의 play 가 trace 를 켠다)
    await page.getByTestId("doc-tab").filter({ hasText: "port_town.json" }).click();
    await expect(page.getByTestId("map-view")).toHaveAttribute("data-ready", "true");
    await page.keyboard.press(`${await primaryKey(page)}+F5`);
    await expect(game).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect.poll(async () => (await engineLines(page)).some((l) => l.startsWith("rpg:map:port_town")), { timeout: 30_000 }).toBe(true);
    const townLines = await engineLines(page);
    expect(townLines.filter((l) => /error|scene: |uncaught/i.test(l)), townLines.join("\n")).toEqual([]);
    await page.keyboard.press("Shift+F5");
  });

  test("웹판(브라우저 폴더 모드)에서 샘플 단추를 두 번 눌러도 한 번만 열고 오류가 없다", async ({ page }) => {
    await page.goto("/?backend=browser");
    const button = page.getByTestId("welcome").getByRole("button", { name: "샘플 프로젝트 열기" });
    await button.dblclick();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "port_town.json" })).toBeVisible({ timeout: 30_000 });
    const logs = await ev<string[]>(page, "(e) => e.log.entries.map((x) => x.text)");
    expect(logs.filter((l) => l.startsWith("프로젝트 여는 중: memory://sample")), logs.join("\n")).toHaveLength(1);
    expect(logs.filter((l) => l.includes("프로젝트 열기 실패")), logs.join("\n")).toEqual([]);
    await expect(page.getByTestId("toasts")).not.toContainText("프로젝트 열기 실패");
  });
});
