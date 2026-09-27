// 낮은 창(1280x600)에서 오른쪽 인스펙터가 패널보다 길 때 패널 위에서 휠을 굴려 끝까지 닿는지 본다. 메모리 모드.
//   씬 인스펙터: 샘플 씬의 coin(스프라이트, 칸 여럿과 미리보기) 에서 맨 위 id 와 맨 끝의 스크립트 붙이기, 검사
//   맵 오브젝트 인스펙터: 샘플 맵에 문제 있는 몬스터를 더 넣고 하나 고르기(마지막 칸 레벨, 검사 줄)와 여럿 고르기(보스, 검사 줄)
//   이벤트 인스펙터: 픽스처 port_town.json 의 kid 에 커맨드를 늘리고 문제 커맨드를 넣은 뒤, 커맨드 폼과 문제 목록을 연 채
//                   맨 위 id, 문제 목록, 폼의 마지막 칸, 트리의 끝 줄
// "닿는다" 는 휠만으로 대상이 모든 잘라 내는 조상 안에 온전히 보이는 것이다. 그다음 초점을 줄 수 있고,
// 초점을 주어도 dockview 그룹(overflow: hidden)이 몰래 밀려 탭 머리가 사라지지 않는다.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { ev, LAYOUT_KEY, openMap, openRpgProject, PORT } from "./support/rpg";

test.use({ viewport: { width: 1280, height: 600 } });

const MAP_PATH = "resources/maps/sample.json";
const SCENE_PATH = "resources/scenes/main.json";
const MAX_WHEELS = 12;
/** 이만큼 굴려도 대상이 그대로면 휠로는 움직이지 않는 것이다 */
const STUCK_WHEELS = 3;

/** shift 는 대상을 온전히 보이려면 더 내려야(양수) 또는 올려야(음수) 하는 픽셀. 0 이면 이미 보인다 */
type Where = { shift: number; top: number };

/** 스크롤이 멈춘 뒤(세 프레임 내리 같은 자리) 대상이 창과 잘라 내는 모든 조상(overflow 가 visible 이 아닌 것) 안에 온전히 보이는가 */
function whereIs(target: Locator): Promise<Where> {
  return target.evaluate(
    (el) =>
      new Promise<Where>((resolve) => {
        let last = Number.NaN;
        let same = 0;
        let frames = 0;
        const tick = () => {
          const r = el.getBoundingClientRect();
          same = r.top === last ? same + 1 : 0;
          last = r.top;
          if (same < 3 && ++frames < 120) {
            requestAnimationFrame(tick);
            return;
          }
          const clips = [{ top: 0, bottom: window.innerHeight }];
          for (let a = el.parentElement; a; a = a.parentElement) if (getComputedStyle(a).overflowY !== "visible") clips.push(a.getBoundingClientRect());
          let shift = 0;
          for (const b of clips) {
            if (r.top < b.top - 0.5) shift = Math.min(shift, r.top - b.top - 4);
            else if (r.bottom > b.bottom + 0.5) shift = Math.max(shift, r.bottom - b.bottom + 4);
          }
          resolve({ shift: Math.round(shift), top: Math.round(r.top) });
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** 인스펙터 탭이 든 dockview 그룹 */
function inspectorGroup(page: Page): Locator {
  return page.locator(".dv-groupview").filter({ has: page.locator(".dv-tab.dv-active-tab", { hasText: "인스펙터" }) });
}

/** dockview 의 틀 가운데 scrollTop 이 0 이 아닌 것. overflow: hidden 이라 사용자가 휠로 되돌릴 수 없다 */
function hiddenShifts(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".dv-groupview, .dv-view, .dv-split-view-container, .dv-content-container")].filter((el) => el.scrollTop !== 0).map((el) => `${el.className.split(" ")[0]}:${el.scrollTop}`),
  );
}

/** 인스펙터 그룹의 라벨 줄 위에 마우스를 두고, 대상이 가린 만큼 휠을 굴려 온전히 보일 때까지 */
async function wheelTo(page: Page, target: Locator): Promise<boolean> {
  await expect(target).toHaveCount(1);
  const box = await inspectorGroup(page).boundingBox();
  if (!box) throw new Error("인스펙터 탭이 없다");
  await page.mouse.move(box.x + 24, box.y + box.height * 0.6);
  let lastTop = Number.NaN;
  let still = 0;
  for (let i = 0; i < MAX_WHEELS; i++) {
    const w = await whereIs(target);
    if (w.shift === 0) return true;
    still = w.top === lastTop ? still + 1 : 0;
    if (still >= STUCK_WHEELS) return false;
    lastTop = w.top;
    await page.mouse.wheel(0, w.shift);
  }
  return (await whereIs(target)).shift === 0;
}

/** 휠로 닿는다 */
async function reach(page: Page, target: Locator, what: string): Promise<void> {
  expect(await wheelTo(page, target), `${what}: 휠로 닿지 않는다`).toBe(true);
}

/** 휠로 닿고, 초점을 받고, 초점을 주어도 dockview 의 틀이 몰래 밀리지 않아 인스펙터 탭 머리가 그대로 보인다 */
async function reachAndFocus(page: Page, target: Locator, what: string): Promise<void> {
  await reach(page, target, what);
  await target.focus();
  await expect(target, what).toBeFocused();
  expect(await hiddenShifts(page), what).toEqual([]);
  expect((await whereIs(inspectorGroup(page).locator(".dv-tab.dv-active-tab"))).shift, `${what}: 인스펙터 탭 머리`).toBe(0);
}

/** 패널의 세로 스크롤 자리(스크롤이 실제로 생긴 요소)들. 인스펙터 본문에 하나여야 한다 */
function verticalScrollers(root: Locator): Promise<string[]> {
  return root.evaluate((el) => {
    const out: string[] = [];
    for (const n of [el, ...el.querySelectorAll<HTMLElement>("*")]) {
      const s = getComputedStyle(n).overflowY;
      if ((s === "auto" || s === "scroll") && n.scrollHeight > n.clientHeight + 1) out.push(String(n.className).split(" ")[0] || n.tagName);
    }
    return out;
  });
}

async function openSample(page: Page): Promise<void> {
  await page.goto("/?backend=memory");
  await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
}

test.describe("인스펙터 스크롤 (낮은 창, 메모리 모드)", () => {
  // 휠마다 스크롤이 멈추기를 기다리므로 느린 기계에서는 기본 60초가 모자랄 수 있다
  test.describe.configure({ timeout: 120_000 });

  test("씬 인스펙터: 스프라이트의 맨 위 id 와 맨 끝 스크립트 붙이기, 검사", async ({ page }) => {
    await openSample(page);
    await ev(page, "(e, p) => e.openPath(p)", SCENE_PATH);
    await expect(page.getByTestId("scene-view")).toBeVisible();
    await ev(page, "(e) => e.documents.active.select(['coin'])");
    const inspector = page.getByTestId("inspector");
    await expect(inspector).toHaveAttribute("data-selection", "1");
    await expect(page.getByTestId("prop-image-preview")).toBeVisible();

    // 패널보다 길고, 세로 스크롤은 본문 하나
    expect(await verticalScrollers(inspector)).toEqual(["inspector-body"]);

    await reachAndFocus(page, page.getByTestId("inspector-attach"), "스크립트 붙이기");
    await reach(page, page.getByTestId("inspector-problems").locator(".inspector-subtitle"), "검사");
    await reachAndFocus(page, page.getByTestId("inspector-id"), "id");
  });

  test("맵 오브젝트 인스펙터: 몬스터 하나(레벨, 검사 줄)와 여럿(보스, 검사 줄)", async ({ page }) => {
    await openSample(page);
    // 문제 있는 몬스터 둘을 더 넣는다: 모르는 종, 뒤집힌 순찰 범위
    await ev(
      page,
      `async (e, p) => {
        const map = JSON.parse(await e.backend.readText(p));
        map.objects.push(
          { id: "slime_2", type: "spawn", x: 24, y: 24, props: { species: "dragon", minX: 56, maxX: 8, level: 3 } },
          { id: "slime_3", type: "spawn", x: 32, y: 24, props: { species: "ghost", minX: 60, maxX: 4, boss: true } },
        );
        await e.backend.writeText(p, JSON.stringify(map, null, 2) + "\\n");
      }`,
      MAP_PATH,
    );
    await openMap(page, MAP_PATH, "sample.json");
    await ev(page, "(e) => { const d = e.documents.active; d.setTarget({ kind: 'objects' }); d.select(['slime_2']); }");
    const inspector = page.getByTestId("map-object-inspector");
    await expect(inspector).toHaveAttribute("data-object", "slime_2");
    const problems = page.getByTestId("map-inspector-problems").getByTestId("map-inspector-problem");
    await expect(problems).not.toHaveCount(0);
    expect(await verticalScrollers(inspector)).toEqual(["inspector-body"]);

    await reachAndFocus(page, page.getByTestId("map-field-level"), "레벨");
    await reach(page, problems.last(), "검사 줄의 끝");
    await reachAndFocus(page, page.getByTestId("map-inspector-id"), "id");

    // 여럿: 함께 고칠 칸(종, 보스)과 검사 줄
    await ev(page, "(e) => e.documents.active.select(['slime_1', 'slime_2', 'slime_3'])");
    await expect(inspector).toHaveAttribute("data-selection", "3");
    await expect(problems).not.toHaveCount(0);
    await reachAndFocus(page, page.getByTestId("map-field-boss"), "여럿의 보스");
    await reach(page, problems.last(), "여럿의 검사 줄의 끝");
    await reachAndFocus(page, page.getByTestId("map-field-species"), "여럿의 종");
  });

  test("이벤트 인스펙터: 긴 커맨드 목록, 커맨드 폼과 문제 목록을 연 채 맨 위부터 트리 끝까지", async ({ page }) => {
    await openRpgProject(page);
    // kid 의 커맨드를 늘리고 문제 커맨드(없는 아이템, 모르는 커맨드)를 넣는다
    await ev(
      page,
      `async (e, p) => {
        const map = JSON.parse(await e.backend.readText(p));
        const kid = map.events.find((ev) => ev.id === "kid");
        for (let i = 1; i <= 12; i++) kid.commands.push({ code: "message", text: "긴 목록 " + i });
        kid.commands.push({ code: "giveItem", item: "no_such_item" }, { code: "no_such_command" });
        await e.backend.writeText(p, JSON.stringify(map, null, 2) + "\\n");
      }`,
      PORT,
    );
    await openMap(page, PORT, "port_town.json");
    await ev(page, "(e) => { const doc = e.documents.active; doc.setTarget({ kind: 'ext', id: 'rpg.events' }); const s = doc.layerState('rpg.events'); s.select([s.section.indexOfId('kid')]); }");
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("kid");
    const slot = page.getByTestId("map-layer-inspector");
    const tree = page.getByTestId("rpg-cmd-tree");

    // 커맨드 폼: 첫 대사 줄을 누른다
    await tree.getByTestId("rpg-cmd-row").filter({ hasText: "긴 목록 1" }).first().click();
    const form = page.getByTestId("rpg-cmd-form");
    await expect(form).toBeVisible();
    // 문제 목록을 편다
    const toggle = page.getByTestId("rpg-cmd-problems");
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const problemList = page.getByTestId("rpg-cmd-problem-list");
    await expect(problemList.getByTestId("rpg-cmd-problem")).not.toHaveCount(0);

    await reachAndFocus(page, page.getByTestId("rpg-field-id"), "이벤트 id");
    await reachAndFocus(page, problemList.locator("button:enabled").first(), "문제 목록");
    await reachAndFocus(page, form.locator("input:not([type=hidden]), textarea, select").last(), "폼의 마지막 칸");
    await reach(page, tree.getByTestId("rpg-cmd-row").last(), "트리의 끝 줄");
    await tree.focus();
    await expect(tree).toBeFocused();
    expect(await hiddenShifts(page)).toEqual([]);

    // 세로 스크롤은 인스펙터 자리 하나 (트리는 줄 수만큼 자란다). 문제 목록은 제 최대 높이 안에서만 스크롤할 수 있다
    expect((await verticalScrollers(slot)).filter((s) => s !== "rpg-problem-list")).toEqual(["map-layer-inspector"]);
  });
});
