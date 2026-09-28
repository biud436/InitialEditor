// 맵 이동의 대상 고르기 e2e (docs/plans/e5-rpg.md 4절, 마일스톤 5).
//   메모리 모드: support/rpg.ts 의 픽스처에 inn.json 을 더 쓴다. 항구 마을의 inn_door 는 여관(inn)으로 가는 transfer 를 가졌다.
//               본다: 맵에서 고르기가 여관 탭을 열고 띠를 띄우고, 타일을 누르면 항구 마을로 돌아와 x, y 가 한 단계로 바뀐다(여관은
//               칠해지지 않고 도구가 그대로 돈다). 같은 맵에서 고르기(뷰가 그 맵에 머물고 도구가 이어진다). Tab 으로 단추에 가고
//               Enter 로 시작, Esc 와 맵 밖 누름은 바꾼 것 없이 돌아온다. 고르는 동안 원래 탭을 닫으면 바꾸지 않고 끝난다.
//               막는 이유(맵 미지정, 등록되지 않은 맵, 맵 파일 없음, 엔진이 열 수 없는 맵, x, y 미지정, 잠긴 스키마).
//               대상 보기를 막는 x, y 의 이유(2^53을 넘는 정수, 음수, 소수, 여관 크기 밖, 한쪽만 미지정).
//               대상 보기는 여관을 열고 10,12 타일을 뷰 가운데에 둔다 (이미 열린 탭도).
//               1280x600 과 1024x480 에서 띠 아래의 타일도 고를 수 있다 (띠의 글 위 누름이 맵으로 간다. 취소 단추는 취소).
//               고르는 동안 한 글자 도구 단축키(b, c, n)는 도구와 대상을 바꾸지 않고, Esc 뒤에도 이벤트 인스펙터가 남는다.
//   브리지 모드: 엔진 저장소의 사본(resources 에서 rtp 와 zip 빼고, scripts)을 브리지로 열고 여관에서 고른 뒤 저장해 디스크의 글을 본다.

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { startBridge, type Bridge } from "./support/project";
import { cellPoint, ev, FIXTURES, LAYOUT_KEY, openMap, openRpgProject, PORT, primaryKey, waitRpgLoaded } from "./support/rpg";

const INN = "resources/maps/inn.json";
const ROOM = "resources/maps/room.json";
const PROMPT = "타일을 클릭해 이동 위치 지정 (Esc: 취소)";
/** 저장소의 맵 파일 판정: 쓸 수 있으면 null, 이유, 아직 모르면 "unknown" */
const MAP_PROBLEM = "(e, p) => { const v = e.extensions.exportsOf('rpg').store.mapFileProblem(p); return v === undefined ? 'unknown' : v; }";

type Cmd = Record<string, unknown>;

/** 활성 맵의 이벤트 id 의 커맨드 */
function commandsOf(page: Page, id: string): Promise<Cmd[] | null> {
  return ev<Cmd[] | null>(page, "(e, id) => { const s = e.documents.active.layerState('rpg.events'); const i = s.section.indexOfId(id); return i < 0 ? null : (s.section.list[i].commands ?? []); }", id);
}

const activePath = (page: Page) => ev<string | null>(page, "(e) => e.documents.active?.path ?? null");
const depth = (page: Page) => ev<number>(page, "(e) => e.documents.active.undo.depth");
const picking = (page: Page) => ev<boolean>(page, "(e) => e.mapSupport.picker.active !== null");

/** 대상을 이벤트 레이어로 하고 id 의 이벤트를 고른다 */
async function selectEvent(page: Page, id: string): Promise<void> {
  await ev(page, "(e, id) => { const doc = e.documents.active; doc.setTarget({ kind: 'ext', id: 'rpg.events' }); const s = doc.layerState('rpg.events'); s.select([s.section.indexOfId(id)]); }", id);
  await expect(page.getByTestId("rpg-inspector-id")).toHaveText(id);
}

/** 고른 이벤트의 커맨드 줄(1부터)을 눌러 폼을 연다 */
async function openCommand(page: Page, n: number): Promise<void> {
  await page.getByTestId("rpg-cmd-tree").locator(`[data-row-key="c.commands[${n}]"]`).click();
  await expect(page.getByTestId("rpg-cmd-form-path")).toHaveText(new RegExp(`\\.commands\\[${n}\\]$`));
}

/** 이벤트 id 의 커맨드 끝에 넣는다 (페이지 안의 모델 명령). 넣은 커맨드의 번호(1부터) */
async function appendCommands(page: Page, id: string, commands: Cmd[]): Promise<number> {
  return ev<number>(
    page,
    `(e, a) => {
      const s = e.documents.active.layerState('rpg.events');
      const i = s.section.indexOfId(a.id);
      const n = (s.section.list[i].commands ?? []).length;
      const r = s.run((ed) => ed.insertCommands(i, [], n, a.commands));
      if (!r.ok) throw new Error(r.reason);
      return n + 1;
    }`,
    { id, commands },
  );
}

/** 뷰 가운데의 타일 (캔버스 상자와 data-zoom, data-pan) */
async function centerCell(view: Locator): Promise<[number, number]> {
  const box = (await view.locator("canvas").boundingBox())!;
  const zoom = Number(await view.getAttribute("data-zoom"));
  const panX = Number(await view.getAttribute("data-pan-x"));
  const panY = Number(await view.getAttribute("data-pan-y"));
  return [Math.floor((box.width / 2 - panX) / zoom / 16), Math.floor((box.height / 2 - panY) / zoom / 16)];
}

/** 메모리 모드의 RPG 프로젝트에 여관 맵을 더하고 저장소의 판정이 끝나기를 기다린다 */
async function openWithInn(page: Page): Promise<void> {
  await openRpgProject(page);
  await ev(page, "(e, a) => e.backend.writeText(a.path, a.text)", { path: INN, text: readFileSync(path.join(FIXTURES, INN), "utf8") });
  await expect.poll(() => ev<string | null>(page, MAP_PROBLEM, INN)).toBe(null);
  await openMap(page, PORT, "port_town.json");
}

test.describe("맵 이동의 대상 고르기 (메모리 모드)", () => {
  test("다른 맵에서 고르기: 여관 탭과 띠, 타일을 누르면 항구 마을로 돌아와 x, y 가 한 단계로 바뀌고 여관의 도구는 그대로다", async ({ page }) => {
    await openWithInn(page);
    await selectEvent(page, "inn_door");
    await openCommand(page, 2);
    const d0 = await depth(page);
    await expect(page.getByTestId("rpg-location-pick")).toBeEnabled();
    await expect(page.getByTestId("rpg-location-note")).toHaveCount(0);
    await page.getByTestId("rpg-location-pick").click();

    const view = page.getByTestId("map-view");
    await expect.poll(() => activePath(page)).toBe(INN);
    await expect(view).toHaveAttribute("data-ready", "true");
    await expect(view).toHaveAttribute("data-picking", "true");
    await expect(page.getByTestId("map-pick-prompt")).toHaveText(PROMPT);
    await expect(view.locator(".map-view-host")).toBeFocused();
    const innDepth = await depth(page);
    const tile = await cellPoint(view, 3, 4);
    await page.mouse.click(tile.x, tile.y);

    await expect.poll(() => activePath(page)).toBe(PORT);
    await expect(page.getByTestId("map-pick-banner")).toHaveCount(0);
    expect(await picking(page)).toBe(false);
    expect((await commandsOf(page, "inn_door"))![1]).toEqual({ code: "transfer", map: "inn", x: 3, y: 4, dir: "up" });
    expect(await depth(page)).toBe(d0 + 1);
    // 돌아오면 그 커맨드의 폼이 열려 있고 새 값을 보인다
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("inn_door");
    await expect(page.getByTestId("rpg-arg-x")).toHaveValue("3");
    await expect(page.getByTestId("rpg-arg-y")).toHaveValue("4");
    await page.keyboard.press(`${await primaryKey(page)}+z`);
    await expect.poll(async () => (await commandsOf(page, "inn_door"))![1]).toEqual({ code: "transfer", map: "inn", x: 10, y: 12, dir: "up" });

    // 여관: 고른 누름은 칠하지 않았고, 도구는 그대로 돈다 (이벤트 도구로 빈 타일을 두 번 누르면 이벤트가 생긴다)
    await openMap(page, INN, "inn.json");
    expect(await depth(page)).toBe(innDepth);
    await expect(view).toHaveAttribute("data-picking", "false");
    await view.locator(".map-view-host").focus();
    await page.keyboard.press("n");
    const empty = await cellPoint(view, 5, 8);
    await page.mouse.dblclick(empty.x, empty.y);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("event_1");
    expect(await depth(page)).toBe(innDepth + 1);
  });

  test("같은 맵에서 고르기: 뷰가 그 맵에 머물고, 끝나면 이벤트 도구가 다시 누름을 받는다", async ({ page }) => {
    await openWithInn(page);
    await page.getByTestId("map-fit").click();
    await selectEvent(page, "notice");
    const n = await appendCommands(page, "notice", [{ code: "transfer", map: "port_town", x: 1, y: 1 }]);
    await openCommand(page, n);
    const d0 = await depth(page);
    const view = page.getByTestId("map-view");
    const box = await view.locator("canvas").boundingBox();
    await page.getByTestId("rpg-location-pick").click();
    await expect(view).toHaveAttribute("data-picking", "true");
    expect(await activePath(page)).toBe(PORT);
    await expect(page.getByTestId("map-pick-prompt")).toHaveText(PROMPT);
    // 띠는 캔버스 위에 겹쳐 그려 캔버스를 밀지 않는다
    expect(await view.locator("canvas").boundingBox()).toEqual(box);
    // kid(14,20) 의 타일을 누르면 고르기이지 이벤트 고르기가 아니다
    const kid = await cellPoint(view, 14, 20);
    await page.mouse.click(kid.x, kid.y);
    await expect(view).toHaveAttribute("data-picking", "false");
    expect(await activePath(page)).toBe(PORT);
    expect((await commandsOf(page, "notice"))!.at(-1)).toEqual({ code: "transfer", map: "port_town", x: 14, y: 20 });
    expect(await depth(page)).toBe(d0 + 1);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("notice");
    // 도구가 이어진다: 같은 자리를 누르면 이제 kid 를 고른다
    await page.mouse.click(kid.x, kid.y);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("kid");
    expect(await depth(page)).toBe(d0 + 1);
  });

  test("키보드: Tab 으로 단추에 가고 Enter 로 시작, Esc 는 바꾸지 않고 돌아온다. 맵 밖 누름도 취소다", async ({ page, browserName }) => {
    // WebKit(Safari, macOS 앱의 WKWebView)의 Tab 은 입력 칸만 돌고 단추까지는 Option+Tab 이다
    const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
    await openWithInn(page);
    await selectEvent(page, "inn_door");
    await openCommand(page, 2);
    const d0 = await depth(page);
    await page.getByTestId("rpg-arg-dir").focus();
    await page.keyboard.press(tab);
    await expect(page.getByTestId("rpg-location-pick")).toBeFocused();
    await page.keyboard.press(tab);
    await expect(page.getByTestId("rpg-location-reveal")).toBeFocused();
    await page.keyboard.press(`Shift+${tab}`);
    await page.keyboard.press("Enter");
    const view = page.getByTestId("map-view");
    await expect.poll(() => activePath(page)).toBe(INN);
    await expect(view).toHaveAttribute("data-picking", "true");
    await page.keyboard.press("Escape");
    await expect.poll(() => activePath(page)).toBe(PORT);
    expect(await picking(page)).toBe(false);
    expect((await commandsOf(page, "inn_door"))![1]).toEqual({ code: "transfer", map: "inn", x: 10, y: 12, dir: "up" });
    expect(await depth(page)).toBe(d0);
    // 돌아오면 트리가 그 커맨드에 있다
    await expect(page.getByTestId("rpg-cmd-tree")).toBeFocused();
    await expect(page.getByTestId("rpg-cmd-form-path")).toHaveText(/\.commands\[2\]$/);

    // 맵 밖(뷰의 여백)을 누르면 취소
    await page.getByTestId("rpg-location-pick").click();
    await expect.poll(() => activePath(page)).toBe(INN);
    await expect(view).toHaveAttribute("data-ready", "true");
    const outside = await cellPoint(view, -1, -1);
    await page.mouse.click(outside.x, outside.y);
    await expect.poll(() => activePath(page)).toBe(PORT);
    expect(await picking(page)).toBe(false);
    expect((await commandsOf(page, "inn_door"))![1]).toMatchObject({ x: 10, y: 12 });

    // 뷰 밖(띠의 취소 단추)도 취소
    await page.getByTestId("rpg-location-pick").click();
    await expect.poll(() => activePath(page)).toBe(INN);
    await page.getByTestId("map-pick-cancel").click();
    await expect.poll(() => activePath(page)).toBe(PORT);
    expect(await picking(page)).toBe(false);
    expect(await depth(page)).toBe(d0);
  });

  test("고르는 동안 원래 탭을 닫으면 바꾸지 않고 끝나고 여관에 머문다", async ({ page }) => {
    await openWithInn(page);
    await selectEvent(page, "inn_door");
    await openCommand(page, 2);
    await page.getByTestId("rpg-location-pick").click();
    const view = page.getByTestId("map-view");
    await expect.poll(() => activePath(page)).toBe(INN);
    await expect(view).toHaveAttribute("data-picking", "true");
    // 탭 닫기 단추의 누름은 뷰 밖 누름이라 먼저 취소가 된다. 문서를 바로 닫아 원래 문서가 닫히는 길을 본다
    await ev(page, "(e, p) => e.documents.close(e.documents.findByPath(p))", PORT);
    await expect(page.getByTestId("doc-tab").filter({ hasText: "port_town.json" })).toHaveCount(0);
    expect(await ev<string>(page, "(e) => e.mapSupport.picker.lastEnd")).toBe("sourceClosed");
    await expect(view).toHaveAttribute("data-picking", "false");
    await expect(page.getByTestId("map-pick-banner")).toHaveCount(0);
    expect(await activePath(page)).toBe(INN);
    expect(await picking(page)).toBe(false);
    // 여관의 타일을 눌러도 아무것도 넣지 않는다
    await expect(view).toHaveAttribute("data-ready", "true");
    const tile = await cellPoint(view, 3, 4);
    await page.mouse.click(tile.x, tile.y);
    await openMap(page, PORT, "port_town.json");
    expect((await commandsOf(page, "inn_door"))![1]).toEqual({ code: "transfer", map: "inn", x: 10, y: 12, dir: "up" });
    expect(await ev<boolean>(page, "(e) => e.documents.active.dirty")).toBe(false);
  });

  test("막는 이유: 맵 미지정, 등록되지 않은 맵, 맵 파일 없음, 엔진이 열 수 없는 맵, x, y 미지정, 잠긴 스키마", async ({ page }) => {
    await openWithInn(page);
    await ev(page, "(e, a) => e.backend.writeText(a.path, a.text)", { path: ROOM, text: JSON.stringify({ ...JSON.parse(readFileSync(path.join(FIXTURES, INN), "utf8")), version: 9 }) });
    await expect.poll(() => ev<string | null>(page, MAP_PROBLEM, ROOM)).toMatch(/^엔진이 열 수 없는 맵/);
    await selectEvent(page, "notice");
    const first = await appendCommands(page, "notice", [
      { code: "transfer", map: "" },
      { code: "transfer", map: "forest", x: 1, y: 1 },
      { code: "transfer", map: "village", x: 1, y: 1 },
      { code: "transfer", map: "room", x: 1, y: 1 },
      { code: "transfer", map: "inn" },
    ]);
    const pick = page.getByTestId("rpg-location-pick");
    const reveal = page.getByTestId("rpg-location-reveal");
    const notes = page.getByTestId("rpg-location-note");
    const cases: Array<[string, boolean, boolean]> = [
      ["맵 미지정", true, true],
      ["rpg-game.json 에 등록되지 않은 맵: forest", true, true],
      ["맵 파일 없음: resources/maps/village.json", true, true],
      ["엔진이 열 수 없는 맵: 모르는 맵 버전이다: 9 (지원: 1, 2)", true, true],
      ["대상 보기: x, y 미지정", false, true],
    ];
    for (const [k, [note, pickOff, revealOff]] of cases.entries()) {
      await openCommand(page, first + k);
      await expect(notes).toHaveText([note]);
      if (pickOff) await expect(pick).toBeDisabled();
      else await expect(pick).toBeEnabled();
      if (revealOff) await expect(reveal).toBeDisabled();
      else await expect(reveal).toBeEnabled();
    }
    await expect(pick).toHaveAttribute("title", /./);

    // 스키마를 잠그면 고르기만 막는다 (대상 보기는 고치지 않는다)
    await openCommand(page, first + 4);
    await ev(page, `async (e) => { const p = 'resources/schema/event-commands.json'; const s = JSON.parse(await e.backend.readText(p)); s.version = 2; await e.backend.writeText(p, JSON.stringify(s)); }`);
    await expect(page.getByTestId("rpg-cmd-locked")).toBeVisible();
    await selectEvent(page, "inn_door");
    await openCommand(page, 2);
    await expect(pick).toBeDisabled();
    await expect(reveal).toBeEnabled();
    await expect(notes).toHaveText([/^맵에서 고르기: 읽기 전용: event-commands\.json 의 버전 2/]);
  });

  test("대상 보기를 막는 x, y 의 이유: 2^53을 넘는 정수, 음수, 소수, 여관(20x14) 밖, 한쪽만 미지정", async ({ page }) => {
    await openRpgProject(page);
    await ev(page, "(e, a) => e.backend.writeText(a.path, a.text)", { path: INN, text: readFileSync(path.join(FIXTURES, INN), "utf8") });
    await expect.poll(() => ev<string | null>(page, MAP_PROBLEM, INN)).toBe(null);
    // 2^53을 넘는 정수는 JSON 글에 숫자 그대로 넣는다 (맵 문서가 표식 글로 읽는다)
    const cases: Array<[Cmd, string]> = [
      [{ code: "transfer", map: "inn", x: "BIG_X", y: 3 }, "x 값이 맵 범위 밖: 12345678901234567890 (너비 20)"],
      [{ code: "transfer", map: "inn", x: 2, y: -1 }, "y 값이 음수: -1"],
      [{ code: "transfer", map: "inn", x: 1.5, y: 3 }, "x 값이 정수가 아님: 1.5"],
      [{ code: "transfer", map: "inn", x: 20, y: 3 }, "x 값이 맵 범위 밖: 20 (너비 20)"],
      [{ code: "transfer", map: "inn", x: 3, y: 14 }, "y 값이 맵 범위 밖: 14 (높이 14)"],
      [{ code: "transfer", map: "inn", y: 3 }, "x 미지정"],
      [{ code: "transfer", map: "inn" }, "x, y 미지정"],
      [{ code: "transfer", map: "inn", x: 19, y: 13 }, ""],
    ];
    const first = await ev<number>(
      page,
      `async (e, a) => {
        const map = JSON.parse(await e.backend.readText(a.path));
        const notice = map.events.find((x) => x.id === "notice");
        const first = notice.commands.length + 1;
        notice.commands.push(...a.commands);
        await e.backend.writeText(a.path, (JSON.stringify(map, null, 2) + "\\n").replace('"BIG_X"', "12345678901234567890"));
        return first;
      }`,
      { path: PORT, commands: cases.map(([c]) => c) },
    );
    await openMap(page, PORT, "port_town.json");
    await selectEvent(page, "notice");
    const pick = page.getByTestId("rpg-location-pick");
    const reveal = page.getByTestId("rpg-location-reveal");
    const notes = page.getByTestId("rpg-location-note");
    for (const [k, [, reason]] of cases.entries()) {
      await openCommand(page, first + k);
      await expect(pick).toBeEnabled();
      if (reason === "") {
        await expect(notes).toHaveCount(0);
        await expect(reveal).toBeEnabled();
        continue;
      }
      await expect(notes).toHaveText([`대상 보기: ${reason}`]);
      await expect(reveal).toBeDisabled();
      await expect(reveal).toHaveAttribute("title", reason);
    }
  });

  for (const size of [
    { width: 1280, height: 600 },
    { width: 1024, height: 480 },
  ]) {
    test(`띠 아래의 타일 (${size.width}x${size.height}): 띠의 글 위 누름은 그 아래 타일을 고르고, 취소 단추는 취소다`, async ({ page }) => {
      await page.setViewportSize(size);
      await openWithInn(page);
      await selectEvent(page, "inn_door");
      await openCommand(page, 2);
      const view = page.getByTestId("map-view");
      const start = async () => {
        await page.getByTestId("rpg-location-pick").click();
        await expect.poll(() => activePath(page)).toBe(INN);
        await expect(view).toHaveAttribute("data-ready", "true");
        await expect(view).toHaveAttribute("data-picking", "true");
        await expect(page.getByTestId("map-pick-prompt")).toHaveText(PROMPT);
      };
      await start();
      // 여관(20x14)이 캔버스를 덮게 확대하고 가운데 타일을 뷰 가운데에 둔다: 띠 아래에 여관의 타일이 있다
      await ev(page, "(e) => { const r = [...e.mapSupport.renderers.get(e.documents.active)][0]; r.setZoom(3); r.centerOn({ x: 160, y: 112 }); }");
      await expect(view).toHaveAttribute("data-zoom", "3");
      const prompt = (await page.getByTestId("map-pick-prompt").boundingBox())!;
      const at = { x: prompt.x + prompt.width / 2, y: prompt.y + prompt.height / 2 };
      const canvas = (await view.locator("canvas").boundingBox())!;
      const zoom = Number(await view.getAttribute("data-zoom"));
      const panX = Number(await view.getAttribute("data-pan-x"));
      const panY = Number(await view.getAttribute("data-pan-y"));
      const cell = { x: Math.floor((at.x - canvas.x - panX) / zoom / 16), y: Math.floor((at.y - canvas.y - panY) / zoom / 16) };
      expect(cell.x >= 0 && cell.x < 20 && cell.y >= 0 && cell.y < 14, `띠 아래의 타일 ${cell.x},${cell.y} 은 여관 안`).toBe(true);
      expect(cell).not.toEqual({ x: 10, y: 12 });
      // 누른 점은 띠 안이고 캔버스 안이다 (띠가 그 타일을 가린다)
      const banner = (await page.getByTestId("map-pick-banner").boundingBox())!;
      expect(at.y).toBeGreaterThan(canvas.y);
      expect(at.y).toBeLessThan(banner.y + banner.height);
      await page.mouse.click(at.x, at.y);
      await expect.poll(() => activePath(page)).toBe(PORT);
      expect(await ev<string | null>(page, "(e) => e.mapSupport.picker.lastEnd")).toBe("picked");
      expect((await commandsOf(page, "inn_door"))![1]).toEqual({ code: "transfer", map: "inn", x: cell.x, y: cell.y, dir: "up" });

      // 취소 단추는 누름을 받아 취소한다
      await start();
      await page.getByTestId("map-pick-cancel").click();
      await expect.poll(() => activePath(page)).toBe(PORT);
      expect(await ev<string | null>(page, "(e) => e.mapSupport.picker.lastEnd")).toBe("cancel");
      expect((await commandsOf(page, "inn_door"))![1]).toEqual({ code: "transfer", map: "inn", x: cell.x, y: cell.y, dir: "up" });
    });
  }

  test("고르는 동안 한 글자 도구 단축키는 도구와 대상을 바꾸지 않고, Esc 뒤에도 이벤트 인스펙터가 남는다", async ({ page }) => {
    await openWithInn(page);
    const view = page.getByTestId("map-view");
    const toolAndTarget = async () => [await view.getAttribute("data-tool"), await view.getAttribute("data-target")];

    // 같은 맵에서 고르기: 항구 마을의 대상은 이벤트 레이어다
    await selectEvent(page, "notice");
    const n = await appendCommands(page, "notice", [{ code: "transfer", map: "port_town", x: 1, y: 1 }]);
    await openCommand(page, n);
    const before = await toolAndTarget();
    expect(before[1]).toBe("ext:rpg.events");
    await page.getByTestId("rpg-location-pick").click();
    await expect(view).toHaveAttribute("data-picking", "true");
    await expect(view.locator(".map-view-host")).toBeFocused();
    for (const key of ["b", "c", "v", "n"]) {
      await page.keyboard.press(key);
      expect(await toolAndTarget(), key).toEqual(before);
    }
    await expect(view).toHaveAttribute("data-picking", "true");
    await page.keyboard.press("Escape");
    await expect(view).toHaveAttribute("data-picking", "false");
    expect(await toolAndTarget()).toEqual(before);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("notice");
    await expect(page.getByTestId("rpg-cmd-form-path")).toHaveText(new RegExp(`\\.commands\\[${n}\\]$`));
    expect((await commandsOf(page, "notice"))!.at(-1)).toEqual({ code: "transfer", map: "port_town", x: 1, y: 1 });

    // 다른 맵에서 고르기: 여관의 도구와 대상도 그대로다
    await selectEvent(page, "inn_door");
    await openCommand(page, 2);
    await page.getByTestId("rpg-location-pick").click();
    await expect.poll(() => activePath(page)).toBe(INN);
    await expect(view).toHaveAttribute("data-picking", "true");
    const innBefore = await toolAndTarget();
    for (const key of ["b", "c", "n", "r"]) {
      await page.keyboard.press(key);
      expect(await toolAndTarget(), key).toEqual(innBefore);
    }
    await page.keyboard.press("Escape");
    await expect.poll(() => activePath(page)).toBe(PORT);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("inn_door");
    expect(await view.getAttribute("data-target")).toBe("ext:rpg.events");
    // 고르기가 끝나면 단축키가 다시 돈다
    await view.locator(".map-view-host").focus();
    await page.keyboard.press("b");
    await expect(view).toHaveAttribute("data-tool", "pen");
  });

  test("대상 보기: 여관을 열고 10,12 타일을 뷰 가운데에 둔다. 이미 열린 탭도 다시 옮긴다", async ({ page }) => {
    await openWithInn(page);
    await selectEvent(page, "inn_door");
    await openCommand(page, 2);
    await page.getByTestId("rpg-location-reveal").click();
    const view = page.getByTestId("map-view");
    await expect.poll(() => activePath(page)).toBe(INN);
    await expect(view).toHaveAttribute("data-ready", "true");
    await expect.poll(() => centerCell(view)).toEqual([10, 12]);
    expect(await picking(page)).toBe(false);
    // 뷰를 옮겨 두고 돌아가 다시 누른다
    await ev(page, "(e) => { const r = [...e.mapSupport.renderers.get(e.documents.active)][0]; r.centerOn({ x: 0, y: 0 }); }");
    await expect.poll(() => centerCell(view)).not.toEqual([10, 12]);
    await page.getByTestId("doc-tab").filter({ hasText: "port_town.json" }).click();
    await expect.poll(() => activePath(page)).toBe(PORT);
    await openCommand(page, 2);
    await page.getByTestId("rpg-location-reveal").click();
    await expect.poll(() => activePath(page)).toBe(INN);
    await expect.poll(() => centerCell(view)).toEqual([10, 12]);
  });
});

const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? "../Initial2D");
const serverScript = path.join(engineDir, "tools", "bridge", "server.js");
const BRIDGE_PORT = Number(process.env.E2E_BRIDGE_PORT ?? 6073);
const hasEngineRepo = existsSync(serverScript) && existsSync(path.join(engineDir, "resources", "data", "rpg-game.json"));

/** 엔진 저장소의 resources(rtp 와 zip 빼고)와 scripts 를 임시 폴더에 복사하고 game.json 을 쓴다 (엔진 저장소는 읽기만 한다) */
function copyEngineProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "initial-editor-rpg-pick-"));
  const skip = (src: string) => {
    const rel = path.relative(engineDir, src).split(path.sep).join("/");
    return rel === "resources/rtp" || rel.startsWith("resources/rtp/") || /\.(zip|psd)$/i.test(rel) || path.basename(src).startsWith(".");
  };
  for (const sub of ["resources", "scripts"]) cpSync(path.join(engineDir, sub), path.join(dir, sub), { recursive: true, filter: (src) => !skip(src) });
  writeFileSync(path.join(dir, "game.json"), JSON.stringify({ name: "Initial2D", windowWidth: 768, windowHeight: 896, renderScale: 1, script: "lua" }, null, 2) + "\n");
  return dir;
}

test.describe("맵 이동의 대상 고르기 (브리지 모드, 엔진 저장소의 사본)", () => {
  test.skip(!hasEngineRepo, `엔진 저장소가 없거나 M2 전이다: ${engineDir} (INITIAL2D_DIR 로 위치를 준다)`);

  let bridge: Bridge | null = null;
  let projectDir = "";

  test.beforeAll(async () => {
    projectDir = copyEngineProject();
    bridge = await startBridge({ serverScript, project: projectDir, port: BRIDGE_PORT });
  });

  test.afterAll(async () => {
    await bridge?.stop();
    bridge = null;
    if (projectDir && process.env.KEEP_WORKDIR !== "1") rmSync(projectDir, { recursive: true, force: true });
  });

  test("inn_door 의 transfer 를 여관에서 고르고 저장하면 디스크의 port_town.json 에 x, y 가 있다", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?backend=bridge&url=${encodeURIComponent(bridge!.url)}`);
    await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
    await page.reload();
    await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible({ timeout: 15_000 });
    await waitRpgLoaded(page);
    await expect.poll(() => ev<string | null>(page, MAP_PROBLEM, INN)).toBe(null);
    await openMap(page, PORT, "port_town.json");
    await selectEvent(page, "inn_door");
    const n = await ev<number>(page, "(e) => { const s = e.documents.active.layerState('rpg.events'); const c = s.section.list[s.section.indexOfId('inn_door')].commands; return c.findIndex((x) => x.code === 'transfer') + 1; }");
    expect(n).toBeGreaterThan(0);
    await openCommand(page, n);
    const before = (await commandsOf(page, "inn_door"))![n - 1];
    const target: [number, number] = before.x === 9 && before.y === 8 ? [8, 9] : [9, 8];
    await page.getByTestId("rpg-location-pick").click();
    const view = page.getByTestId("map-view");
    await expect.poll(() => activePath(page)).toBe(INN);
    await expect(view).toHaveAttribute("data-ready", "true");
    await expect(view).toHaveAttribute("data-picking", "true");
    const tile = await cellPoint(view, target[0], target[1]);
    await page.mouse.click(tile.x, tile.y);
    await expect.poll(() => activePath(page)).toBe(PORT);
    await expect.poll(async () => (await commandsOf(page, "inn_door"))![n - 1]).toEqual({ ...before, x: target[0], y: target[1] });

    await view.locator(".map-view-host").focus();
    await page.keyboard.press(`${await primaryKey(page)}+s`);
    await expect(page.getByTestId("toasts")).toContainText("저장했다: port_town.json");
    const saved = JSON.parse(readFileSync(path.join(projectDir, PORT), "utf8")) as { events: Array<{ id: string; commands: Cmd[] }> };
    const door = saved.events.find((e) => e.id === "inn_door")!;
    expect(door.commands[n - 1]).toEqual({ ...before, x: target[0], y: target[1] });
    expect(Object.keys(door.commands[n - 1])).toEqual(Object.keys({ code: 0, map: 0, x: 0, y: 0, ...(before.dir !== undefined ? { dir: 0 } : {}) }));
    // 여관 파일은 그대로다
    expect(readFileSync(path.join(projectDir, INN), "utf8")).toBe(readFileSync(path.join(engineDir, INN), "utf8"));
  });
});
