// RPG 이벤트 편집과 실행 e2e (docs/plans/e5-rpg.md 마일스톤 6).
//   메모리 모드: 샘플 프로젝트를 연 뒤 packages/ext-rpg/test/fixtures 의 파일을 메모리 백엔드에 쓴다 (support/rpg.ts, 샘플 프로젝트는 늘리지 않는다).
//               본다: 등록되지 않은 meadow.json 은 이벤트 줄 없이 힌트, port_town.json 의 표식 17개(뷰가 그린 자리), 빈 칸 더블클릭으로
//               놓기, 끌기, 인스펙터의 id, 커맨드 트리에 대사 넣기와 타이핑(줄바꿈, 따옴표, 한글)과 되돌리기와 다시 실행,
//               맵 뷰의 Ctrl+C 는 확장의 클립보드로 가고 씬과 맵 오브젝트의 복사를 부르지 않는다(Ctrl+V 는 커서 칸에 이벤트를 붙인다),
//               저장한 파일의 내용과 키 순서.
//               그리고 실행 명령: 목록 패널의 시작 상태, 인스펙터의 자동 재생 단추, 맵 메뉴의 이 이벤트 앞에서 실행, 목록 줄의
//               우클릭 메뉴, 여기서 실행(Ctrl+F5). 메모리 모드는 엔진 스크립트가 없어 러너만 감싸 넘긴 변수를 받는다 (support/runCapture.ts)
//   브리지 모드: 엔진 저장소(INITIAL2D_DIR, 기본 ../Initial2D)의 resources(rtp 빼고)와 scripts 를 임시 폴더에 복사하고 game.json 을 mruby 로
//               써서 브리지 서버를 띄운다 (포트는 E2E_BRIDGE_PORT, 기본 6073. 다른 브리지 테스트와 같다). port_town.json 에서 아이(kid)를 고르고 시작 상태를 적은 뒤
//               "자동 재생"을 누르면 내장 게임 뷰(웹 엔진)가 뜨고, 콘솔에 rpg:player(이벤트 앞 칸과 방향), rpg:event:kid,
//               시작 상태가 고른 가지의 rpg:message 줄, rpg:route:done 이 차례로 나오고 게임이 스스로 끝난다.
//               game.json 이 mruby 여도 RPG 실행은 play.env 의 INITIAL2D_SCRIPT=lua 로 뜬다 (언어 검사는 덧씌운 값으로 한다).

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { captureRunStarts, editorLogTexts, runStarts } from "./support/editorPage";
import { startBridge, type Bridge } from "./support/project";
import { cellPoint, ev, fixtureEvents, LAYOUT_KEY, MEADOW, openMap, openRpgProject, PORT, primaryKey, waitRpgLoaded } from "./support/rpg";

interface Drawn {
  index: number;
  kind: "sprite" | "badge";
  x: number;
  y: number;
}

type SavedEvent = Record<string, unknown> & { id: string };

/** 활성 맵 문서의 이벤트 레이어 상태에서 id 의 [x, y] */
function eventCell(page: Page, id: string): Promise<number[] | null> {
  return ev<number[] | null>(page, "(e, id) => { const s = e.documents.active.layerState('rpg.events'); const i = s.section.indexOfId(id); return i < 0 ? null : [s.section.list[i].x, s.section.list[i].y]; }", id);
}

function eventOf(page: Page, id: string): Promise<SavedEvent | null> {
  return ev<SavedEvent | null>(page, "(e, id) => { const s = e.documents.active.layerState('rpg.events'); const i = s.section.indexOfId(id); return i < 0 ? null : s.section.list[i]; }", id);
}

const depth = (page: Page) => ev<number>(page, "(e) => e.documents.active.undo.depth");

/** 맵 뷰의 이벤트 레이어가 그린 표식 (MapRenderer 의 확장 레이어 뷰) */
function drawnMarkers(page: Page): Promise<Drawn[]> {
  return ev<Drawn[]>(page, "(e) => { const doc = e.documents.active; const r = [...e.mapSupport.renderers.get(doc)][0]; return r.extNodes.get('rpg.events').view.drawn.map((d) => ({ index: d.index, kind: d.kind, x: d.x, y: d.y })); }");
}

const SIGN_TEXT = '어서 오세요.\n"항구 마을" 입니다.';

test.describe("RPG 이벤트 (메모리 모드)", () => {
  test("힌트, 표식 17개, 놓기와 끌기와 인스펙터, 커맨드 넣기와 되돌리기, 맵 뷰의 Ctrl+C, 저장 글과 키 순서", async ({ page }) => {
    await openRpgProject(page);
    const mod = await primaryKey(page);
    const layers = page.getByTestId("layers");

    // 등록되지 않은 맵: 이벤트 줄은 없고 힌트 한 줄
    await openMap(page, MEADOW, "meadow.json");
    await expect(layers.getByTestId("layer-hint")).toHaveText("이벤트 레이어는 rpg-game.json 에 등록된 맵에만 있다");
    await expect(layers.locator('[data-target="ext:rpg.events"]')).toHaveCount(0);

    await openMap(page, PORT, "port_town.json");
    const view = page.getByTestId("map-view");
    const host = view.locator(".map-view-host");
    await page.getByTestId("map-fit").click();
    await expect(layers.locator('[data-target="ext:rpg.events"]')).toBeVisible();
    await expect(layers.getByTestId("layer-hint")).toHaveCount(0);

    // 표식 17개: 외형이 있으면 CharSet 프레임(24x32, 가로 가운데와 발이 칸 아래 변), 없으면 칸 크기의 트리거 표식
    const events = fixtureEvents();
    expect(events).toHaveLength(17);
    const expected = events
      .map((e, index) => (e.charset ? { index, kind: "sprite", x: e.x * 16 - 4, y: e.y * 16 - 16 } : { index, kind: "badge", x: e.x * 16, y: e.y * 16 }))
      .sort((a, b) => a.index - b.index);
    await expect.poll(async () => (await drawnMarkers(page)).sort((a, b) => a.index - b.index)).toEqual(expected);

    // 놓기: N 으로 대상을 이벤트 레이어로, 빈 칸 더블클릭, id 칸에 초점
    await host.focus();
    await page.keyboard.press("n");
    await expect(view).toHaveAttribute("data-target", "ext:rpg.events");
    const d0 = await depth(page);
    const empty = await cellPoint(view, 2, 44);
    await page.mouse.dblclick(empty.x, empty.y);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("event_1");
    await expect(page.getByTestId("rpg-field-id")).toBeFocused();
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type("sign");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("sign");
    expect(await depth(page)).toBe(d0 + 2);

    // 끌기: 한 칸 오른쪽, 한 단계. 인스펙터의 x 가 따라온다
    const to = await cellPoint(view, 3, 44);
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await page.mouse.move((empty.x + to.x) / 2, empty.y, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 3 });
    await page.mouse.up();
    await expect.poll(() => eventCell(page, "sign")).toEqual([3, 44]);
    await expect(page.getByTestId("rpg-field-x")).toHaveValue("3");
    expect(await depth(page)).toBe(d0 + 3);

    // 커맨드 넣기: 트리의 끝 줄에서 Enter 로 팔레트, 대사를 고르면 인자 폼, 타이핑(줄바꿈과 따옴표와 한글)은 한 단계
    const tree = page.getByTestId("rpg-cmd-tree");
    await tree.getByTestId("rpg-cmd-row").last().click();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("rpg-cmd-palette")).toBeVisible();
    await page.getByTestId("rpg-palette-item-message").click();
    await expect(page.getByTestId("rpg-cmd-palette")).toHaveCount(0);
    expect(await depth(page)).toBe(d0 + 4);
    const text = page.getByTestId("rpg-arg-text");
    await expect(text).toBeFocused();
    const [first, second] = SIGN_TEXT.split("\n");
    await page.keyboard.type(first);
    await page.keyboard.press("Enter");
    await page.keyboard.type(second);
    await page.keyboard.press("Escape");
    await expect(tree).toBeFocused();
    await expect.poll(async () => (await eventOf(page, "sign"))?.commands).toEqual([{ code: "message", text: SIGN_TEXT }]);
    expect(await depth(page)).toBe(d0 + 5);
    await expect(tree.getByTestId("rpg-cmd-row").first()).toContainText("어서 오세요.");

    // 되돌리기: 타이핑 한 단계, 넣기 한 단계. 다시 실행으로 그대로 돌아온다
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(async () => (await eventOf(page, "sign"))?.commands).toEqual([{ code: "message", text: "" }]);
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(async () => (await eventOf(page, "sign"))?.commands).toEqual([]);
    expect(await depth(page)).toBe(d0 + 3);
    await page.keyboard.press(`${mod}+Shift+z`);
    await page.keyboard.press(`${mod}+Shift+z`);
    await expect.poll(async () => (await eventOf(page, "sign"))?.commands).toEqual([{ code: "message", text: SIGN_TEXT }]);
    expect(await depth(page)).toBe(d0 + 5);

    // 맵 뷰의 Ctrl+C: 레이어 도구가 받아 확장의 클립보드에 이벤트를 둔다. 씬의 복사(edit.copy)와 맵 오브젝트의 클립보드는 그대로
    const captain = await cellPoint(view, 16, 44);
    await page.mouse.click(captain.x, captain.y);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("captain");
    await host.focus();
    await page.keyboard.press(`${mod}+c`);
    await expect.poll(() => ev<string[]>(page, "(e) => (e.extensions.exportsOf('rpg').services.clipboard.read() ?? []).map((x) => x.id)")).toEqual(["captain"]);
    expect(await ev<number>(page, "(e) => e.sceneTools.clipboard.length")).toBe(0);
    expect(await ev<number>(page, "(e) => e.mapSupport.clipboard.size")).toBe(0);
    expect(await depth(page)).toBe(d0 + 5);
    // Ctrl+V 는 커서 칸에 이벤트를 붙인다 (id 는 겹치지 않게, 한 단계)
    const pasteAt = await cellPoint(view, 5, 44);
    await page.mouse.move(pasteAt.x, pasteAt.y);
    await host.focus();
    await page.keyboard.press(`${mod}+v`);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("captain_2");
    expect(await eventCell(page, "captain_2")).toEqual([5, 44]);
    expect(await depth(page)).toBe(d0 + 6);
    expect(await ev<number>(page, "(e) => e.sceneTools.clipboard.length")).toBe(0);

    // 저장: 새 이벤트는 정해진 키 순서(id, x, y, trigger, commands)와 커맨드의 키 순서(code, text), 나머지 17개는 그대로
    await host.focus();
    await page.keyboard.press(`${mod}+s`);
    await expect(page.getByTestId("toasts")).toContainText("저장했다: port_town.json");
    const savedText = await ev<string>(page, "(e, p) => e.backend.readText(p)", PORT);
    const saved = JSON.parse(savedText) as { events: SavedEvent[] };
    const sign = saved.events.find((e) => e.id === "sign")!;
    expect(Object.keys(sign)).toEqual(["id", "x", "y", "trigger", "commands"]);
    expect(sign).toEqual({ id: "sign", x: 3, y: 44, trigger: "action", commands: [{ code: "message", text: SIGN_TEXT }] });
    expect(Object.keys((sign.commands as object[])[0])).toEqual(["code", "text"]);
    expect(savedText).toContain(JSON.stringify(SIGN_TEXT));
    expect(saved.events.slice(0, 17)).toEqual(events);
    expect(saved.events.find((e) => e.id === "captain_2")).toEqual({ ...events.find((e) => e.id === "captain")!, id: "captain_2", x: 5, y: 44 });
    expect(saved.events).toHaveLength(19);
  });

  test("실행 명령: 시작 상태, 인스펙터의 자동 재생, 맵 메뉴의 이 이벤트 앞에서 실행, 목록의 우클릭, 여기서 실행이 넘기는 변수", async ({ page }) => {
    await openRpgProject(page);
    await openMap(page, PORT, "port_town.json");
    const mod = await primaryKey(page);
    const view = page.getByTestId("map-view");
    const host = view.locator(".map-view-host");
    await page.getByTestId("map-fit").click();
    await captureRunStarts(page);

    // 목록 패널(창 메뉴)의 시작 상태: 맵마다 .initial-editor/rpg-play.json 에 기억한다
    await page.getByRole("menubar").getByRole("menuitem", { name: "창", exact: true }).click();
    await page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: /^이벤트$/ }) }).click();
    const panel = page.getByTestId("rpg-events-panel");
    const stateField = panel.getByTestId("rpg-start-state-input");
    await stateField.fill("arrived,heardAltar");
    await stateField.press("Enter");
    await expect
      .poll(() => ev<string | null>(page, "async (e) => (await e.backend.exists('.initial-editor/rpg-play.json')) ? e.backend.readText('.initial-editor/rpg-play.json') : null"))
      .toContain('"resources/maps/port_town.json": "arrived,heardAltar"');

    // 인스펙터: 아이를 고르고 자동 재생
    await host.focus();
    await page.keyboard.press("n");
    const kid = await cellPoint(view, 14, 20);
    await page.mouse.click(kid.x, kid.y);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("kid");
    await page.getByTestId("rpg-inspector-probe").click();
    const base = { INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "rpg", INITIAL2D_MAP: "port_town", INITIAL2D_RPG_TRACE: "1", INITIAL2D_RPG_STATE: "arrived,heardAltar" };
    const probe = { INITIAL2D_AUTOPLAY: "1" };
    await expect.poll(() => runStarts(page)).toEqual([{ env: { ...base, ...probe, INITIAL2D_RPG_AT: "14,21,up", INITIAL2D_RPG_ROUTE: "talk" } }]);
    const logs = await editorLogTexts(page);
    expect(logs.some((l) => l.startsWith("이 이벤트 자동 재생: 항구 마을 x 14, y 21 (이벤트 kid 앞에서 말 걸기, 시작 상태 arrived,heardAltar) INITIAL2D_SCRIPT=lua"))).toBe(true);

    // 맵 메뉴: 이 이벤트 앞에서 실행 (자동 재생 변수 없이)
    await page.getByRole("menubar").getByRole("menuitem", { name: "맵", exact: true }).click();
    await page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: /^이 이벤트 앞에서 실행$/ }) }).click();
    await expect.poll(async () => (await runStarts(page)).length).toBe(2);
    expect((await runStarts(page))[1]).toEqual({ env: { ...base, INITIAL2D_RPG_AT: "14,21,up" } });

    // 목록 줄의 우클릭: 그 줄을 고르고 메뉴. 여관 문(touch)의 자동 재생은 이벤트 쪽으로 한 걸음
    const door = panel.locator('[data-testid="rpg-events-row"][data-id="inn_door"]');
    await door.click({ button: "right" });
    await expect(panel.getByTestId("rpg-events-menu")).toBeVisible();
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("inn_door");
    await panel.getByTestId("rpg-events-menu-probe").click();
    await expect(panel.getByTestId("rpg-events-menu")).toHaveCount(0);
    await expect.poll(async () => (await runStarts(page)).length).toBe(3);
    expect((await runStarts(page))[2]).toEqual({ env: { ...base, ...probe, INITIAL2D_RPG_AT: "13,30,up", INITIAL2D_RPG_ROUTE: "up" } });

    // 여기서 실행(Ctrl+F5): 고른 이벤트(여관 문)의 앞, 자동 재생 변수 없이. rpgPlay 가 기본 제공자(샘플의 play)보다 먼저다
    await host.focus();
    await page.keyboard.press(`${mod}+F5`);
    await expect.poll(async () => (await runStarts(page)).length).toBe(4);
    expect((await runStarts(page))[3]).toEqual({ env: { ...base, INITIAL2D_RPG_AT: "13,30,up" } });
    expect((await editorLogTexts(page)).some((l) => l.startsWith("여기서 실행: 항구 마을 x 13, y 30 (이벤트 inn_door 앞, 시작 상태 arrived,heardAltar)"))).toBe(true);
  });
});

const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? "../Initial2D");
const serverScript = path.join(engineDir, "tools", "bridge", "server.js");
const BRIDGE_PORT = Number(process.env.E2E_BRIDGE_PORT ?? 6073);
const hasEngineRepo = existsSync(serverScript) && existsSync(path.join(engineDir, "resources", "data", "rpg-game.json"));

/** 엔진 저장소의 resources(rtp 와 zip 빼고)와 scripts 를 임시 폴더에 복사하고 game.json 을 쓴다 (엔진 저장소를 직접 가리키지 않는다) */
function copyEngineProject(script: "lua" | "mruby"): string {
  const dir = mkdtempSync(path.join(tmpdir(), "initial-editor-rpg-events-"));
  const skip = (src: string) => {
    const rel = path.relative(engineDir, src).split(path.sep).join("/");
    return rel === "resources/rtp" || rel.startsWith("resources/rtp/") || /\.(zip|psd)$/i.test(rel) || path.basename(src).startsWith(".");
  };
  for (const sub of ["resources", "scripts"]) cpSync(path.join(engineDir, sub), path.join(dir, sub), { recursive: true, filter: (src) => !skip(src) });
  writeFileSync(path.join(dir, "game.json"), JSON.stringify({ name: "Initial2D", windowWidth: 768, windowHeight: 896, renderScale: 1, script }, null, 2) + "\n");
  return dir;
}

/** 콘솔에 온 엔진 줄 (source engine), 온 차례대로 */
function engineLines(page: Page): Promise<string[]> {
  return ev<string[]>(page, "(e) => e.log.entries.filter((x) => x.source === 'engine').map((x) => x.text)");
}

test.describe("RPG 이벤트 (브리지 모드, 내장 게임 뷰의 자동 재생)", () => {
  test.skip(!hasEngineRepo, `엔진 저장소가 없거나 M2 전이다: ${engineDir} (INITIAL2D_DIR 로 위치를 준다)`);

  let bridge: Bridge | null = null;
  let projectDir = "";

  test.beforeAll(async () => {
    projectDir = copyEngineProject("mruby");
    bridge = await startBridge({ serverScript, project: projectDir, port: BRIDGE_PORT });
  });

  test.afterAll(async () => {
    await bridge?.stop();
    bridge = null;
    if (projectDir && process.env.KEEP_WORKDIR !== "1") rmSync(projectDir, { recursive: true, force: true });
  });

  test("아이를 고르고 자동 재생: 앞 칸에 서서 말을 걸고, 시작 상태의 가지 대사가 나오고, 스스로 끝난다", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/?backend=bridge&url=${encodeURIComponent(bridge!.url)}`);
    await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
    await page.reload();
    await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible({ timeout: 15_000 });
    await waitRpgLoaded(page);
    await openMap(page, PORT, "port_town.json");
    const view = page.getByTestId("map-view");
    await page.getByTestId("map-fit").click();

    // 목록 패널에서 아이를 고르고 시작 상태를 적는다 (heardAltar 면 조개 목걸이를 주는 가지)
    await page.getByRole("menubar").getByRole("menuitem", { name: "창", exact: true }).click();
    await page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: /^이벤트$/ }) }).click();
    const panel = page.getByTestId("rpg-events-panel");
    await panel.getByTestId("rpg-start-state-input").fill("arrived,heardAltar");
    await panel.getByTestId("rpg-start-state-input").press("Enter");
    await expect.poll(() => (existsSync(path.join(projectDir, ".initial-editor", "rpg-play.json")) ? readFileSync(path.join(projectDir, ".initial-editor", "rpg-play.json"), "utf8") : "")).toContain("arrived,heardAltar");
    await panel.locator('[data-testid="rpg-events-row"][data-id="kid"]').click();
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("kid");
    await expect(view).toHaveAttribute("data-target", "ext:rpg.events");

    await page.getByTestId("rpg-inspector-probe").click();
    const game = page.getByTestId("game-view");
    await expect(game).toHaveAttribute("data-phase", "running", { timeout: 60_000 });
    await expect.poll(async () => (await engineLines(page)).includes("rpg:route:done"), { timeout: 60_000 }).toBe(true);
    await expect(game).toHaveAttribute("data-phase", "ended", { timeout: 15_000 });

    const lines = (await engineLines(page)).filter((l) => l.startsWith("rpg:"));
    const at = (line: string) => lines.indexOf(line);
    const iPlayer = at("rpg:player:port_town,14,21,up");
    const iEvent = at("rpg:event:kid");
    const iSong = lines.findIndex((l) => l.startsWith("rpg:message:아이|등대 할아버지도 노래 얘기를 했죠?"));
    const iGift = at("rpg:message:|조개 목걸이를 받았다.");
    const iDone = at("rpg:route:done");
    expect(lines.filter((l) => l.startsWith("rpg:error"))).toEqual([]);
    expect(iPlayer, lines.join("\n")).toBeGreaterThanOrEqual(0);
    expect(iEvent, lines.join("\n")).toBeGreaterThan(iPlayer);
    expect(iSong, lines.join("\n")).toBeGreaterThan(iEvent);
    expect(iGift, lines.join("\n")).toBeGreaterThan(iSong);
    expect(iDone, lines.join("\n")).toBe(lines.length - 1);
    // 시작 상태 arrived 라 선장의 인사가 없고, heardAltar 가 없는 가지(북쪽 문 이야기)도 없다
    expect(lines.some((l) => l.startsWith("rpg:message:선장|"))).toBe(false);
    expect(lines.some((l) => l.startsWith("rpg:message:아이|북쪽 문은"))).toBe(false);

    // game.json 은 mruby 지만 RPG 실행은 play.env 의 lua 로 뜬다
    const logs = await editorLogTexts(page);
    expect(logs.some((l) => /^엔진 시작: 에디터 안 \(웹 엔진, [^)]*\), 언어 lua /.test(l)), logs.join("\n")).toBe(true);
    expect(logs.some((l) => l.startsWith("이 이벤트 자동 재생: 항구 마을 x 14, y 21 (이벤트 kid 앞에서 말 걸기, 시작 상태 arrived,heardAltar)"))).toBe(true);
    const shot = process.env.RPG_EVENTS_SCREENSHOT;
    if (shot) await page.screenshot({ path: shot });
  });
});
