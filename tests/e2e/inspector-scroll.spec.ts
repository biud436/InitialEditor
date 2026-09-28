// 낮은 창(1280x600)에서 오른쪽 인스펙터가 패널보다 길 때 패널 위에서 휠을 굴려 끝까지 닿는지 본다. 메모리 모드.
//   씬 인스펙터: 샘플 씬의 coin(스프라이트, 칸 여럿과 미리보기) 에서 맨 위 id 와 맨 끝의 스크립트 붙이기, 검사
//   맵 오브젝트 인스펙터: 샘플 맵에 문제 있는 몬스터를 더 넣고 하나 고르기(마지막 칸 레벨, 검사 줄)와 여럿 고르기(보스, 검사 줄)
//   이벤트 인스펙터: 픽스처 port_town.json 의 kid 에 커맨드를 늘리고 문제 커맨드를 넣은 뒤, 커맨드 폼과 문제 목록을 연 채
//                   맨 위 id, 문제 목록, 폼의 마지막 칸, 트리의 끝 줄
//   이벤트 고르기: 맵을 눌러, 목록 패널에서 골라, 긴 이벤트 둘 사이를 오가도 인스펙터는 맨 위(자리의 scrollTop 0, id 칸이 보인다)에서
//                  열린다. 트리의 키, 문제 목록으로 커서를 옮기면 그 줄이 보이게 민다
//   커맨드 폼의 폭: 1280x600 과 1024x480 에서 모든 커맨드의 폼이 인스펙터 폭 안에 든다 (얼굴 격자의 칸이 자리 안, 트리와 자리에
//                   가로 스크롤이 없다). 가지 안의 얼굴(들여 쓴 폼)과 맵 이동의 막는 이유 줄(긴 맵 이름)도.
//                   <select> 가 있는 위젯마다 긴 값을 둔다: 긴 파일 이름(효과음, 얼굴 파일, 이벤트의 외형 파일), 목록에 없는 긴 방향과
//                   트리거, 프로젝트에 없는 파일. 긴 글(ref, 스칼라 글, 타입이 틀린 값의 알림)도. 고른 값의 온전한 글은 select 의 title
// "닿는다" 는 휠만으로 대상이 모든 잘라 내는 조상 안에 온전히 보이는 것이다. 그다음 초점을 줄 수 있고,
// 초점을 주어도 dockview 그룹(overflow: hidden)이 몰래 밀려 탭 머리가 사라지지 않는다.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { cellPoint, ev, LAYOUT_KEY, nextFrames, openMap, openRpgProject, PORT } from "./support/rpg";

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

    await reachAndFocus(page, page.getByTestId("inspector-attach"), "스크립트 추가");
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

  test("이벤트 고르기: 맵을 눌러, 목록에서, 긴 이벤트 둘 사이를 오가도 맨 위에서 열리고, 키와 문제 목록은 커서 줄을 보인다", async ({ page }) => {
    await openRpgProject(page);
    // 긴 이벤트 둘: kid 와 notice. kid 의 끝에는 문제 커맨드(없는 아이템)
    await ev(
      page,
      `async (e, p) => {
        const map = JSON.parse(await e.backend.readText(p));
        for (const id of ["kid", "notice"]) {
          const ev = map.events.find((x) => x.id === id);
          for (let i = 1; i <= 14; i++) ev.commands.push({ code: "message", text: id + " 긴 목록 " + i });
        }
        map.events.find((x) => x.id === "kid").commands.push({ code: "giveItem", item: "no_such_item" });
        await e.backend.writeText(p, JSON.stringify(map, null, 2) + "\\n");
      }`,
      PORT,
    );
    await openMap(page, PORT, "port_town.json");
    const view = page.getByTestId("map-view");
    await page.getByTestId("map-fit").click();
    await view.locator(".map-view-host").focus();
    await page.keyboard.press("n");
    await expect(view).toHaveAttribute("data-target", "ext:rpg.events");
    const slot = page.getByTestId("map-layer-inspector");
    const tree = page.getByTestId("rpg-cmd-tree");
    const rows = tree.getByTestId("rpg-cmd-row");

    /** 인스펙터가 맨 위에서 열렸다: 몇 프레임 뒤에도 자리의 scrollTop 이 0 이고 id 칸이 휠 없이 보인다 */
    const opensAtTop = async (id: string, what: string) => {
      await expect(page.getByTestId("rpg-inspector-id")).toHaveText(id);
      await nextFrames(page);
      await nextFrames(page);
      expect(await slot.evaluate((el) => el.scrollTop), `${what}: 자리의 scrollTop`).toBe(0);
      expect((await whereIs(page.getByTestId("rpg-field-id"))).shift, `${what}: id 칸`).toBe(0);
      expect((await whereIs(page.getByTestId("rpg-inspector-id"))).shift, `${what}: 머리`).toBe(0);
      expect(await hiddenShifts(page), what).toEqual([]);
    };
    /** 트리에 초점을 두되 스크롤은 하지 않는다 (키가 스스로 줄을 보여야 한다) */
    const focusTreeInPlace = () => tree.evaluate((el: HTMLElement) => el.focus({ preventScroll: true }));
    /** 커서 줄이 휠 없이 온전히 보인다 */
    const cursorVisible = async (what: string) => {
      const cursor = tree.locator(".rpg-row.is-cursor");
      await expect(cursor).toHaveCount(1);
      expect((await whereIs(cursor)).shift, what).toBe(0);
      expect(await hiddenShifts(page), what).toEqual([]);
    };

    // 맵을 눌러 고른다 (kid 는 트리의 끝 줄이 자리 아래에 있을 만큼 길다)
    const kidAt = await cellPoint(view, 14, 20);
    await page.mouse.click(kidAt.x, kidAt.y);
    await opensAtTop("kid", "맵을 눌러 고른 kid");
    expect((await whereIs(rows.last())).shift, "kid 의 끝 줄은 자리 아래에 있다").toBeGreaterThan(0);

    // 키: End 는 끝 줄, Home 은 첫 줄, 아래 화살표는 다음 줄을 보인다
    await focusTreeInPlace();
    await page.keyboard.press("End");
    await cursorVisible("End");
    expect(await slot.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press("Home");
    await cursorVisible("Home");
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    await cursorVisible("아래 화살표 여섯 번");
    await page.keyboard.press("End");
    await cursorVisible("다시 End");

    // 목록 패널에서 notice 를 고른다: 자리가 끝까지 내려가 있어도 맨 위에서 열린다
    await page.getByRole("menubar").getByRole("menuitem", { name: "창", exact: true }).click();
    await page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: /^이벤트$/ }) }).click();
    const list = page.getByTestId("rpg-events-panel");
    await list.locator('[data-testid="rpg-events-row"][data-id="notice"]').click();
    await opensAtTop("notice", "목록에서 고른 notice");

    // notice 에서 키로 끝까지 내린 뒤 맵을 눌러 kid 로 돌아가도 맨 위
    await focusTreeInPlace();
    await page.keyboard.press("End");
    await cursorVisible("notice 의 End");
    await page.mouse.click(kidAt.x, kidAt.y);
    await opensAtTop("kid", "맵을 눌러 돌아온 kid");

    // 목록에서 다시 notice, 그다음 kid (둘 다 긴 이벤트)
    await list.locator('[data-testid="rpg-events-row"][data-id="notice"]').click();
    await opensAtTop("notice", "목록에서 다시 고른 notice");
    await list.locator('[data-testid="rpg-events-row"][data-id="kid"]').click();
    await opensAtTop("kid", "목록에서 고른 kid");

    // 고른 뒤에도 키는 줄을 보인다
    await focusTreeInPlace();
    await page.keyboard.press("End");
    await cursorVisible("돌아온 kid 의 End");
    await page.keyboard.press("Home");
    await cursorVisible("돌아온 kid 의 Home");

    // 문제 목록의 문제를 누르면 그 커맨드 줄(트리의 끝 쪽)로 가서 보인다
    const toggle = page.getByTestId("rpg-cmd-problems");
    await reach(page, toggle, "문제 단추");
    await toggle.click();
    const problem = page.getByTestId("rpg-cmd-problem-list").getByTestId("rpg-cmd-problem").filter({ hasText: "no_such_item" });
    await reach(page, problem, "문제 목록의 없는 아이템");
    await problem.click();
    await expect(tree).toBeFocused();
    await expect(tree.locator(".rpg-row.is-cursor")).toContainText("no_such_item");
    await cursorVisible("문제 목록으로 간 줄");
  });

  for (const size of [
    { width: 1280, height: 600 },
    { width: 1024, height: 480 },
  ]) {
    test(`커맨드 폼의 폭 (${size.width}x${size.height}): 모든 커맨드의 폼과 얼굴 격자가 인스펙터 폭 안에 든다`, async ({ page }) => {
      await page.setViewportSize(size);
      await openRpgProject(page);
      // 긴 이름의 파일: 효과음, 얼굴 시트, 외형 시트 (그림은 픽스처의 플레이스홀더 그대로)
      await ev(
        page,
        `async (e, a) => {
          const store = e.extensions.exportsOf('rpg').store;
          await e.backend.writeBinary(a.se, new Uint8Array([79, 103, 103, 83]));
          for (const [to, from] of [[a.face, 'resources/faces/placeholder.png'], [a.charset, 'resources/charsets/placeholder.png']]) {
            await e.backend.writeBinary(to, await e.backend.readBinary(from));
          }
        }`,
        LONG_FILES,
      );
      await expect.poll(() => ev<string[]>(page, "(e) => e.extensions.exportsOf('rpg').store.fileList()")).toEqual(expect.arrayContaining(Object.values(LONG_FILES)));
      // kid 에 커맨드마다 하나씩, 그리고 조건 분기 안 선택지 가지 안의 대사(들여 쓴 폼의 얼굴 격자),
      // 끝에 등록되지 않은 긴 맵 이름의 맵 이동(맵 위치 단추 아래 막는 이유 줄)과 긴 값의 커맨드.
      // kid 자신은 긴 외형 파일과 목록에 없는 긴 트리거를 가진다 (이벤트 칸의 select)
      await ev(
        page,
        `async (e, a) => {
          const p = a.path;
          const map = JSON.parse(await e.backend.readText(p));
          const kid = map.events.find((x) => x.id === "kid");
          kid.charset = { file: "./" + a.files.charset, index: 3 };
          kid.trigger = a.long.trigger;
          kid.commands = [
            { code: "message", name: "아이", text: "얼굴이 있는 대사", face: { set: "npc", index: 5 } },
            { code: "choice", options: ["배를 탄다", "여관에 간다", "그만둔다"], cancel: 2, branches: [[], [], []] },
            { code: "wait", ms: 300 },
            { code: "transfer", map: "port_town", x: 3, y: 4, dir: "down" },
            { code: "moveRoute", target: "kid", route: ["up", "left", "wait:450", "turn:down"], wait: true },
            { code: "turn", target: "kid", dir: "down" },
            { code: "setFlag", key: "arrived", value: true },
            { code: "setVar", key: "coins", op: "add", value: 12 },
            { code: "giveItem", item: "shell", count: 2 },
            { code: "takeItem", item: "shell", count: 1 },
            { code: "if", cond: { item: "shell", op: ">=", value: 2 }, thenDo: [
              { code: "choice", options: ["예", "아니요"], branches: [[{ code: "message", text: "가지 안의 얼굴", face: { file: "./resources/faces/placeholder.png", index: 9 } }], []] },
            ], elseDo: [] },
            { code: "playSe", file: "./resources/se/bell.ogg" },
            { code: "playBgm", file: "./resources/bgm/port.ogg", volume: 80, fade: 500 },
            { code: "showLocation", text: "항구 마을", seconds: 2 },
            { code: "scene", name: "title", fade: true },
            { code: "script", name: "portGreeting", args: { speaker: "kid", lines: ["하나", "둘"] } },
            { code: "comment", text: "메모 한 줄" },
            { code: "transfer", map: "harbor_district_east_pier_warehouse_second_floor", x: 3, y: 4 },
            { code: "turn", target: "kid", dir: a.long.dir },
            { code: "playSe", file: "./" + a.files.se, id: a.long.word },
            { code: "message", text: a.long.word, face: { file: "./" + a.files.face, index: 9 } },
            { code: "setFlag", key: a.long.word, value: a.long.word },
            { code: "playBgm", file: "./resources/bgm/" + a.long.word + ".ogg", volume: a.long.word },
          ];
          await e.backend.writeText(p, JSON.stringify(map, null, 2) + "\\n");
        }`,
        { path: PORT, files: LONG_FILES, long: LONG_VALUES },
      );
      await openMap(page, PORT, "port_town.json");
      await ev(page, "(e) => { const doc = e.documents.active; doc.setTarget({ kind: 'ext', id: 'rpg.events' }); const s = doc.layerState('rpg.events'); s.select([s.section.indexOfId('kid')]); }");
      await expect(page.getByTestId("rpg-inspector-id")).toHaveText("kid");
      const slot = page.getByTestId("map-layer-inspector");
      const tree = page.getByTestId("rpg-cmd-tree");
      const rows = tree.locator('.rpg-row.is-command[data-testid="rpg-cmd-row"]');
      const count = await rows.count();
      expect(count).toBe(25);

      /** 폼 안의 요소 가운데 자리의 가로 범위를 벗어난 것 (보이는 것만), 트리와 자리의 가로 넘침 */
      const overflow = () =>
        slot.evaluate((s) => {
          const box = s.getBoundingClientRect();
          const out: string[] = [];
          const form = s.querySelector<HTMLElement>('[data-testid="rpg-cmd-form"]');
          for (const el of form ? [form, ...form.querySelectorAll<HTMLElement>("*")] : []) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.left < box.left - 0.5 || r.right > box.right + 0.5) out.push(`${el.dataset.testid ?? el.className} ${Math.round(r.left)}..${Math.round(r.right)} / ${Math.round(box.left)}..${Math.round(box.right)}`);
          }
          const tree = s.querySelector<HTMLElement>('[data-testid="rpg-cmd-tree"]')!;
          if (tree.scrollWidth > tree.clientWidth) out.push(`트리의 가로 넘침 ${tree.scrollWidth} > ${tree.clientWidth}`);
          if (s.scrollWidth > s.clientWidth) out.push(`자리의 가로 넘침 ${s.scrollWidth} > ${s.clientWidth}`);
          return out;
        });

      let faces = 0;
      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const key = await row.getAttribute("data-row-key");
        await row.scrollIntoViewIfNeeded();
        await row.click();
        await expect(page.getByTestId("rpg-cmd-form")).toBeVisible();
        await nextFrames(page);
        expect(await overflow(), `${key} 의 폼`).toEqual([]);
        const cells = page.getByTestId("rpg-cmd-form").locator('[data-testid^="rpg-arg-face-grid-"]');
        const n = await cells.count();
        if (n === 0) continue;
        faces++;
        expect(n, key!).toBe(16);
        const box = (await slot.boundingBox())!;
        for (let c = 0; c < n; c++) {
          const cell = (await cells.nth(c).boundingBox())!;
          expect(cell.x, `${key} 얼굴 ${c} 의 왼쪽`).toBeGreaterThanOrEqual(box.x - 0.5);
          expect(cell.x + cell.width, `${key} 얼굴 ${c} 의 오른쪽`).toBeLessThanOrEqual(box.x + box.width + 0.5);
        }
        // 고른 얼굴 칸은 누를 수 있다 (가려지지 않았다)
        await cells.nth(c0(key!)).click({ trial: true });
      }
      expect(faces, "얼굴 격자가 있는 폼 (위의 대사, 가지 안의 대사, 긴 파일 이름의 얼굴)").toBe(3);

      // 긴 값을 고른 select 는 온전한 글을 title 로 보인다
      await expect(page.getByTestId("rpg-field-charset-file")).toHaveAttribute("title", LONG_FILES.charset);
      await expect(page.getByTestId("rpg-field-trigger")).toHaveAttribute("title", `${LONG_VALUES.trigger} (목록에 없음)`);
      const titled: Array<[number, string, string]> = [
        [12, "rpg-arg-file", "resources/se/bell.ogg (프로젝트에 없음)"],
        [19, "rpg-arg-dir", `${LONG_VALUES.dir} (목록에 없음)`],
        [20, "rpg-arg-file", LONG_FILES.se],
        [21, "rpg-arg-face-file", LONG_FILES.face],
      ];
      for (const [n, testId, title] of titled) {
        await tree.locator(`[data-row-key="c.commands[${n}]"]`).click();
        await expect(page.getByTestId(testId), `c.commands[${n}]`).toHaveAttribute("title", title);
      }
    });
  }
});

/** 긴 이름의 프로젝트 파일 (커맨드 폼의 폭 테스트) */
const LONG_FILES = {
  se: "resources/se/harbor_district_east_pier_warehouse_second_floor_door_creak_at_dawn.ogg",
  face: "resources/faces/harbor_district_east_pier_warehouse_second_floor_keeper_faces.png",
  charset: "resources/charsets/harbor_district_east_pier_warehouse_second_floor_keeper_walk.png",
};

/** 목록에 없는 긴 고르기 값과 끊을 곳이 없는 긴 글 */
const LONG_VALUES = {
  dir: "north_north_east_toward_the_lighthouse_on_the_hill_above_the_harbor",
  trigger: "when_the_evening_ship_leaves_the_harbor_and_the_lighthouse_is_lit",
  word: "harbor_district_east_pier_warehouse_second_floor_" + "x".repeat(80),
};

/** 얼굴 격자에서 눌러 볼 칸 (위의 대사는 5번, 가지 안은 9번) */
function c0(rowKey: string): number {
  return rowKey === "c.commands[1]" ? 5 : 9;
}

