// RPG 이벤트 레이어 e2e (docs/plans/e5-rpg.md 3절, 마일스톤 4). 메모리 백엔드(?backend=memory)라 서버가 필요 없다.
// 샘플 프로젝트를 연 뒤 packages/ext-rpg/test/fixtures 의 파일(두 스키마, 아이템 표, port_town.json, 타일셋, 플레이스홀더 CharSet 과 FaceSet)을
// 메모리 백엔드에 쓰고 ext-rpg 가 다시 읽기를 기다린다 (샘플 프로젝트 자체는 늘리지 않는다: 앱 번들에 실린다).
// 본다: 레이어 줄, 17개가 제 칸에 그려진다(눈을 끄고 켠 화면을 칸마다 견준다), N 으로 대상, 클릭 고르기와 인스펙터,
//       끌어 옮기기와 되돌리기, 빈 칸 더블클릭으로 놓고 id 칸에 초점, 맵 뷰의 Ctrl+C 와 Ctrl+V 는 이벤트를 붙이고 맵 오브젝트나
//       씬의 클립보드를 건드리지 않는다, 목록 패널, 저장한 파일의 키 순서, 등록되지 않은 맵은 줄 없이 힌트.

import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { cellPoint, ev, FIXTURES, fixtureEvents, MEADOW, nextFrames, openMap, openRpgProject, PORT, primaryKey } from "./support/rpg";

/** 칸 가운데 둘레를 찍은 그림 */
async function cellShot(page: Page, view: Locator, cx: number, cy: number): Promise<Buffer> {
  const p = await cellPoint(view, cx, cy);
  const half = Math.max(2, Math.floor(p.zoom * 5));
  return page.screenshot({ clip: { x: p.x - half, y: p.y - half, width: half * 2, height: half * 2 } });
}

test.describe("RPG 이벤트 레이어 (메모리 모드)", () => {
  test("레이어 줄, 17개의 표식, 고르기와 인스펙터, 끌기와 되돌리기, 놓기, 뷰의 복사와 붙여넣기, 목록 패널, 저장, 힌트", async ({ page }) => {
    await openRpgProject(page);
    await openMap(page, PORT, "port_town.json");
    const mod = await primaryKey(page);
    const view = page.getByTestId("map-view");
    const host = view.locator(".map-view-host");
    const layers = page.getByTestId("layers");
    const extRow = layers.locator('[data-target="ext:rpg.events"]');
    await page.getByTestId("map-fit").click();

    // 레이어 패널: 이벤트 줄이 오브젝트 위에 있다
    await expect(extRow).toBeVisible();
    await expect(extRow).toContainText("이벤트");
    const order = await layers.getByTestId("layer-row").evaluateAll((els) => els.map((el) => el.getAttribute("data-target")));
    expect(order.indexOf("ext:rpg.events")).toBeLessThan(order.indexOf("objects"));

    // 17개가 제 칸에 그려진다: 레이어 눈을 끄면 그 칸의 그림이 바뀌고, 이벤트 없는 칸은 그대로다
    const events = fixtureEvents();
    expect(events).toHaveLength(17);
    await nextFrames(page);
    const shown: Buffer[] = [];
    for (const e of events) shown.push(await cellShot(page, view, e.x, e.y));
    const emptyShown = await cellShot(page, view, 2, 2);
    await extRow.getByTestId("layer-eye").click();
    await nextFrames(page);
    const differs: string[] = [];
    for (let i = 0; i < events.length; i++) if (!shown[i].equals(await cellShot(page, view, events[i].x, events[i].y))) differs.push(events[i].id);
    expect(differs).toEqual(events.map((e) => e.id));
    expect(emptyShown.equals(await cellShot(page, view, 2, 2))).toBe(true);
    await extRow.getByTestId("layer-eye").click();

    // N 으로 대상을 이벤트 레이어로: 인스펙터는 이벤트 요약
    await host.focus();
    await page.keyboard.press("n");
    await expect(view).toHaveAttribute("data-target", "ext:rpg.events");
    await expect(page.getByTestId("map-layer-inspector")).toHaveAttribute("data-layer", "rpg.events");
    await expect(page.getByTestId("rpg-inspector-count")).toHaveText("이벤트 17개");

    // 클릭으로 고르면 인스펙터에 칸과 커맨드
    const bench = await cellPoint(view, 19, 34);
    await page.mouse.click(bench.x, bench.y);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("bench");
    await expect(page.getByTestId("rpg-field-x")).toHaveValue("19");
    await expect(page.getByTestId("rpg-cmd-tree")).toBeVisible();

    // 끌어 한 칸 왼쪽으로: 한 단계, 되돌리면 제자리
    const left = await cellPoint(view, 18, 34);
    await page.mouse.move(bench.x, bench.y);
    await page.mouse.down();
    await page.mouse.move((bench.x + left.x) / 2, bench.y, { steps: 3 });
    await page.mouse.move(left.x, left.y, { steps: 3 });
    await page.mouse.up();
    const benchCell = () => ev<number[]>(page, "(e) => { const s = e.documents.active.layerState('rpg.events'); const ev = s.section.list[s.section.indexOfId('bench')]; return [ev.x, ev.y]; }");
    await expect.poll(benchCell).toEqual([18, 34]);
    await expect(page.getByTestId("rpg-field-x")).toHaveValue("18");
    await host.focus();
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(benchCell).toEqual([19, 34]);

    // 빈 칸을 더블클릭하면 새 이벤트, id 칸에 초점. 타이핑은 한 단계
    const empty = await cellPoint(view, 2, 44);
    await page.mouse.dblclick(empty.x, empty.y);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("event_1");
    await expect(page.getByTestId("rpg-field-id")).toBeFocused();
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type("sign");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("sign");
    const depth = () => ev<number>(page, "(e) => e.documents.active.undo.depth");
    expect(await depth()).toBe(2);

    // 맵 뷰의 Ctrl+C, Ctrl+V: 확장의 클립보드로 커서 칸에 붙인다. 맵 오브젝트와 씬의 클립보드는 그대로다
    const captain = await cellPoint(view, 16, 44);
    await page.mouse.click(captain.x, captain.y);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("captain");
    await host.focus();
    await page.keyboard.press(`${mod}+c`);
    const target = await cellPoint(view, 3, 44);
    await page.mouse.move(target.x, target.y);
    await host.focus();
    await page.keyboard.press(`${mod}+v`);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("captain_2");
    expect(await ev<number>(page, "(e) => e.mapSupport.clipboard.size")).toBe(0);
    expect(await ev<number>(page, "(e) => e.sceneTools.clipboard.length")).toBe(0);
    expect(await depth()).toBe(3);

    // 목록 패널: 창 메뉴로 열면 이 맵의 이벤트 19개, 줄을 누르면 고른다
    await page.getByRole("menubar").getByRole("menuitem", { name: "창", exact: true }).click();
    await page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: /^이벤트$/ }) }).click();
    const panel = page.getByTestId("rpg-events-panel");
    await expect(panel.getByTestId("rpg-events-count")).toHaveText("19개");
    await panel.locator('[data-testid="rpg-events-row"][data-id="kid"]').click();
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("kid");
    // RPG_LAYER_SCREENSHOT=<폴더> 면 맵 뷰를 두 배로 확대해 찍어 둔다 (눈으로 확인할 때)
    const shots = process.env.RPG_LAYER_SCREENSHOT;
    if (shots) {
      await page.getByTestId("doc-tab").filter({ hasText: "port_town.json" }).click();
      await view.screenshot({ path: path.join(shots, "rpg-layer-fit.png") });
      await host.focus();
      await page.keyboard.press("ControlOrMeta+0");
      await page.keyboard.press("ControlOrMeta+=");
      await nextFrames(page);
      await view.screenshot({ path: path.join(shots, "rpg-layer-zoom.png") });
    }

    // 저장: 새 이벤트는 정해진 키 순서, 손대지 않은 이벤트는 그대로
    await page.getByTestId("doc-tab").filter({ hasText: "port_town.json" }).click();
    await host.focus();
    await page.keyboard.press(`${mod}+s`);
    await expect(page.getByTestId("toasts")).toContainText("저장했다: port_town.json");
    const saved = JSON.parse(await ev<string>(page, "(e, p) => e.backend.readText(p)", PORT)) as { events: Array<Record<string, unknown>> };
    const sign = saved.events.find((e) => e.id === "sign")!;
    expect(Object.keys(sign)).toEqual(["id", "x", "y", "trigger", "commands"]);
    expect(sign).toEqual({ id: "sign", x: 2, y: 44, trigger: "action", commands: [] });
    expect(saved.events.find((e) => e.id === "captain_2")).toMatchObject({ x: 3, y: 44, charset: { set: "npc", index: 6 } });
    expect(saved.events.slice(0, 17)).toEqual(JSON.parse(readFileSync(path.join(FIXTURES, PORT), "utf8")).events);

    // 등록되지 않은 맵: 줄은 없고 힌트 한 줄
    await openMap(page, MEADOW, "meadow.json");
    await expect(layers.locator('[data-target="ext:rpg.events"]')).toHaveCount(0);
    await expect(layers.getByTestId("layer-hint")).toHaveText("이벤트 레이어는 rpg-game.json 에 등록된 맵에만 있다");
    await expect(panel.getByTestId("rpg-events-hint")).toHaveText("이벤트 레이어는 rpg-game.json 에 등록된 맵에만 있다");
  });
});
