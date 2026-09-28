// RPG 이벤트 편집기의 검수 뒤 고친 것 e2e (docs/plans/e5-rpg.md "레이어 검수 뒤 고친 것"). 메모리 모드에 픽스처를 써 넣는다 (support/rpg.ts).
//   기본 폭(280px) 인스펙터의 선택지 항목과 이동 루트 걸음 칸, 입력 칸 안의 Ctrl+Z (커맨드 폼과 씬 인스펙터가 같다),
//   앞의 이벤트를 지우고 되돌린 뒤의 고르기, 폼이 열린 채 가지의 끝 줄 두 번 누르기, 커맨드 트리의 도구 글자, 한 줄 칸의 Enter,
//   숨긴 이벤트 레이어, 목록 패널의 틀린 칸, 2^53을 넘는 정수(저장, 수 인자의 폼과 검사, 클립보드), 이미 고른 외형을 다시 누르기,
//   RPG 스키마가 없는 프로젝트의 메뉴와 확장 패널 목록과 타일맵 레이아웃

import { expect, test, type Locator, type Page } from "@playwright/test";
import { cellPoint, ev, LAYOUT_KEY, MEADOW, openMap, openRpgProject, PORT, primaryKey } from "./support/rpg";

type Cmd = Record<string, unknown>;

const depth = (page: Page) => ev<number>(page, "(e) => e.documents.active.undo.depth");
const dirty = (page: Page) => ev<boolean>(page, "(e) => e.documents.active.dirty");

function commandsOf(page: Page, id: string): Promise<Cmd[] | null> {
  return ev<Cmd[] | null>(page, "(e, id) => { const s = e.documents.active.layerState('rpg.events'); const i = s.section.indexOfId(id); return i < 0 ? null : (s.section.list[i].commands ?? []); }", id);
}

function eventCell(page: Page, id: string): Promise<number[] | null> {
  return ev<number[] | null>(page, "(e, id) => { const s = e.documents.active.layerState('rpg.events'); const i = s.section.indexOfId(id); return i < 0 ? null : [s.section.list[i].x, s.section.list[i].y]; }", id);
}

/** 대상을 이벤트 레이어로 하고 id 의 이벤트 하나를 고른다 */
async function pick(page: Page, id: string): Promise<void> {
  await ev(page, "(e, id) => { const doc = e.documents.active; doc.setTarget({ kind: 'ext', id: 'rpg.events' }); const s = doc.layerState('rpg.events'); s.select([s.section.indexOfId(id)]); }", id);
  await expect(page.getByTestId("rpg-inspector-id")).toHaveText(id);
}

/** 트리의 맨 바깥 끝 줄에서 팔레트를 열고 커맨드를 넣는다 */
async function insertAtEnd(page: Page, code: string): Promise<void> {
  const tree = page.getByTestId("rpg-cmd-tree");
  await tree.locator('[data-row-key="e.commands"]').click();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("rpg-cmd-palette")).toBeVisible();
  await page.getByTestId(`rpg-palette-item-${code}`).click();
  await expect(page.getByTestId("rpg-cmd-palette")).toHaveCount(0);
}

async function width(el: Locator): Promise<number> {
  return (await el.boundingBox())?.width ?? 0;
}

async function menuLabels(page: Page, branch: string): Promise<string[]> {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  const labels = await page.locator(".menu .menu-label").allTextContents();
  await page.keyboard.press("Escape");
  return labels;
}

test.describe("RPG 이벤트 편집기 (메모리 모드)", () => {
  test("기본 폭 인스펙터: 선택지 항목 칸과 이동 루트의 걸음 칸이 쓸 만한 폭이고, 한글 항목이 제 순서로 들어간다", async ({ page }) => {
    await openRpgProject(page);
    await openMap(page, PORT, "port_town.json");
    await pick(page, "crates");
    // 기본 레이아웃의 인스펙터 (layoutPresets 의 280px)
    expect((await page.getByTestId("rpg-inspector").boundingBox())!.width).toBeLessThanOrEqual(280);

    await insertAtEnd(page, "choice");
    await page.getByTestId("rpg-arg-options-add").click();
    const option = page.getByTestId("rpg-arg-options-1-text");
    expect(await width(page.getByTestId("rpg-arg-options-0-text"))).toBeGreaterThanOrEqual(100);
    expect(await width(option)).toBeGreaterThanOrEqual(100);
    // 단추가 잘리지 않는다 (인스펙터 안)
    const inspector = (await page.getByTestId("rpg-inspector").boundingBox())!;
    const remove = (await page.getByTestId("rpg-arg-options-1-remove").boundingBox())!;
    expect(remove.x + remove.width).toBeLessThanOrEqual(inspector.x + inspector.width + 1);
    const mod = await primaryKey(page);
    await option.click();
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type("안내를 듣는다");
    await expect.poll(async () => ((await commandsOf(page, "crates"))!.at(-1)!.options as string[])[1]).toBe("안내를 듣는다");

    await page.keyboard.press("Escape");
    await insertAtEnd(page, "moveRoute");
    await page.getByTestId("rpg-arg-route-add-up").click();
    await page.getByTestId("rpg-arg-route-add-wait").click();
    expect(await width(page.getByTestId("rpg-arg-route-0-dir"))).toBeGreaterThanOrEqual(60);
    const ms = page.getByTestId("rpg-arg-route-1-ms");
    expect(await width(ms)).toBeGreaterThanOrEqual(60);
    await ms.click();
    await page.keyboard.press(`${mod}+a`);
    await page.keyboard.type("450");
    await expect.poll(async () => (await commandsOf(page, "crates"))!.at(-1)!.route).toEqual(["up", "wait:450"]);
  });

  test("입력 칸 안의 Ctrl+Z: 커맨드 폼의 대사 칸이 되돌린 값을 보이고, 다음 타이핑이 되돌린 글을 되살리지 않는다", async ({ page }) => {
    await openRpgProject(page);
    await openMap(page, PORT, "port_town.json");
    const mod = await primaryKey(page);
    await pick(page, "crates");
    await page.getByTestId("rpg-cmd-tree").locator('[data-row-key="c.commands[1]"]').click();
    const text = page.getByTestId("rpg-arg-text");
    const original = await text.inputValue();
    await text.click();
    await text.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
    const d0 = await depth(page);
    await page.keyboard.type(" XYZ");
    await expect.poll(async () => (await commandsOf(page, "crates"))![0].text).toBe(`${original} XYZ`);
    expect(await depth(page)).toBe(d0 + 1);
    await page.keyboard.press(`${mod}+z`);
    await expect(text).toHaveValue(original);
    await expect(text).toBeFocused();
    expect(await depth(page)).toBe(d0);
    expect((await commandsOf(page, "crates"))![0].text).toBe(original);
    await page.keyboard.type("Q");
    await expect.poll(async () => (await commandsOf(page, "crates"))![0].text).toBe(`${original}Q`);
    await expect(text).toHaveValue(`${original}Q`);
    expect(await depth(page)).toBe(d0 + 1);
  });

  test("입력 칸 안의 Ctrl+Z: 씬 인스펙터의 칸도 같은 규칙이다 (packages/ui 의 같은 부품)", async ({ page }) => {
    await page.goto("/?backend=memory");
    await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
    await page.reload();
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
    const mod = await primaryKey(page);
    await page.getByRole("menubar").getByRole("menuitem", { name: "씬", exact: true }).click();
    await page.locator(".menu-item", { hasText: "새 씬" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("undo_check");
    await dialog.getByRole("button", { name: "만들기" }).click();
    await expect(page.getByTestId("hierarchy")).toHaveAttribute("data-scene", "undo_check.json");
    await page.getByRole("menubar").getByRole("menuitem", { name: "씬", exact: true }).click();
    await page.locator(".menu-item", { hasText: "오브젝트 추가" }).first().click();
    await page.locator(".menu-item", { hasText: "스프라이트" }).first().click();
    const x = page.getByTestId("inspector-x");
    const before = await x.inputValue();
    const sceneX = () => ev<number>(page, "(e) => e.documents.active.scene.find('sprite').x");
    await x.click();
    await x.evaluate((el: HTMLInputElement) => el.select());
    await page.keyboard.type("5");
    await expect.poll(sceneX).toBe(5);
    await page.keyboard.press(`${mod}+z`);
    await expect(x).toHaveValue(before);
    await expect(x).toBeFocused();
    expect(await sceneX()).toBe(Number(before));
    await x.evaluate((el: HTMLInputElement) => el.select());
    await page.keyboard.type("7");
    await expect.poll(sceneX).toBe(7);
    await expect(x).toHaveValue("7");
  });

  test("앞의 이벤트를 지우고 되돌려도 고른 이벤트가 그대로라 방향키가 그 이벤트를 옮긴다", async ({ page }) => {
    await openRpgProject(page);
    await openMap(page, PORT, "port_town.json");
    const mod = await primaryKey(page);
    const view = page.getByTestId("map-view");
    const host = view.locator(".map-view-host");
    await page.getByTestId("map-fit").click();
    await host.focus();
    await page.keyboard.press("n");
    const notice = await cellPoint(view, 13, 37);
    await page.mouse.click(notice.x, notice.y);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("notice");
    await host.focus();
    await page.keyboard.press("Delete");
    await expect.poll(() => eventCell(page, "notice")).toBeNull();
    const kid = await cellPoint(view, 14, 20);
    await page.mouse.click(kid.x, kid.y);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("kid");
    await host.focus();
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(() => eventCell(page, "notice")).toEqual([13, 37]);
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("kid");
    await host.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => eventCell(page, "kid")).toEqual([15, 20]);
    expect(await eventCell(page, "laundry")).toEqual([12, 21]);
  });

  test("조건 분기의 폼이 열린 채 참이면 가지의 끝 줄을 두 번 누르면 그 가지에 넣는다 (첫 누름이 폼을 닫아 줄이 밀려도)", async ({ page }) => {
    await openRpgProject(page);
    await openMap(page, PORT, "port_town.json");
    await ev(
      page,
      `(e) => {
        const doc = e.documents.active;
        const s = doc.layerState('rpg.events');
        const r = s.run((ed) => ed.addEvent({ x: 2, y: 44 }));
        const i = r.command.focus[0];
        s.run((ed) => ed.insertCommands(i, [], 0, [
          { code: "message", text: "첫 대사" },
          { code: "choice", options: ["예", "아니요"], branches: [[{ code: "setFlag", key: "f1" }], []] },
          { code: "if", cond: { flag: "f1" }, thenDo: [{ code: "message", text: "참" }] },
        ]));
        doc.setTarget({ kind: 'ext', id: 'rpg.events' });
        s.select([i]);
      }`,
    );
    await expect(page.getByTestId("rpg-inspector-id")).toHaveText("event_1");
    const tree = page.getByTestId("rpg-cmd-tree");
    await tree.locator('[data-row-key="c.commands[3]"]').click();
    await expect(page.getByTestId("rpg-arg-cond-row")).toBeVisible();
    const end = tree.locator('[data-row-key="e.commands[3].thenDo"]');
    await end.evaluate((el) => el.scrollIntoView({ block: "end" }));
    const box = (await end.boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId("rpg-cmd-palette")).toContainText("events[18].commands[3].thenDo[2]");
    await page.getByTestId("rpg-palette-item-comment").click();
    const cmds = (await commandsOf(page, "event_1"))!;
    expect(cmds).toHaveLength(3);
    expect(cmds[2].thenDo).toEqual([{ code: "message", text: "참" }, { code: "comment" }]);
  });

  test("커맨드 트리의 도구 글자는 도구를 바꾸지 않고, 한 줄 칸의 Enter 는 넣고 폼에 남는다", async ({ page }) => {
    await openRpgProject(page);
    await openMap(page, PORT, "port_town.json");
    const view = page.getByTestId("map-view");
    await pick(page, "crates");
    const tree = page.getByTestId("rpg-cmd-tree");
    await tree.locator('[data-row-key="c.commands[1]"]').click();
    await expect(tree).toBeFocused();
    for (const key of ["b", "r", "v", "c"]) await page.keyboard.press(key);
    await expect(view).toHaveAttribute("data-target", "ext:rpg.events");
    await expect(page.getByTestId("rpg-inspector")).toBeVisible();
    await expect(tree).toBeFocused();

    await insertAtEnd(page, "setFlag");
    const key = page.getByTestId("rpg-arg-key");
    await expect(key).toBeFocused();
    await page.keyboard.type("met_crates");
    await page.keyboard.press("Enter");
    await expect(key).toBeFocused();
    await expect.poll(async () => (await commandsOf(page, "crates"))!.at(-1)).toEqual({ code: "setFlag", key: "met_crates" });
    // Escape 는 트리로 돌아가고 트리의 키가 다시 돈다
    await page.keyboard.press("Escape");
    await expect(tree).toBeFocused();
  });

  test("숨긴 이벤트 레이어는 맵 뷰에서 고치지 않고 알린다 (타일 레이어처럼)", async ({ page }) => {
    await openRpgProject(page);
    await openMap(page, PORT, "port_town.json");
    const view = page.getByTestId("map-view");
    const host = view.locator(".map-view-host");
    await page.getByTestId("map-fit").click();
    await host.focus();
    await page.keyboard.press("n");
    await expect(view).toHaveAttribute("data-target", "ext:rpg.events");
    await page.getByTestId("layers").locator('[data-target="ext:rpg.events"]').getByTestId("layer-eye").click();
    await expect(page.getByTestId("map-target-hidden")).toHaveText("숨김 상태, 편집 불가");
    const d0 = await depth(page);
    const empty = await cellPoint(view, 2, 44);
    await page.mouse.dblclick(empty.x, empty.y);
    await expect(page.getByTestId("toasts")).toContainText("숨긴 레이어는 편집 불가");
    const captain = await cellPoint(view, 16, 44);
    await page.mouse.click(captain.x, captain.y);
    await host.focus();
    await page.keyboard.press("Delete");
    expect(await depth(page)).toBe(d0);
    expect(await eventCell(page, "captain")).toEqual([16, 44]);
    expect(await ev<number>(page, "(e) => e.documents.active.layerState('rpg.events').section.list.length")).toBe(17);
  });

  test("목록 패널: 객체가 아닌 칸은 엔진 표기와 함께 틀린 줄이다. 손대지 않은 이벤트의 큰 정수는 저장해도 그대로다", async ({ page }) => {
    await openRpgProject(page);
    const mod = await primaryKey(page);
    const text = await ev<string>(page, "(e, p) => e.backend.readText(p)", PORT);
    const data = JSON.parse(text) as { events: unknown[] };
    data.events.push(null, "oops");
    // mapfile.py 형식을 흉내 낼 필요는 없다: 에디터는 큰 정수를 글 그대로 싣는다
    const withSeed = JSON.stringify(data, null, 2).replace('"id": "crates",', '"id": "crates",\n      "data": { "seed": 12345678901234567890 },');
    await ev(page, "(e, a) => e.backend.writeText(a.p, a.t)", { p: PORT, t: withSeed });
    await openMap(page, PORT, "port_town.json");
    await page.getByRole("menubar").getByRole("menuitem", { name: "창", exact: true }).click();
    await page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: /^이벤트$/ }) }).click();
    const rows = page.getByTestId("rpg-events-panel").getByTestId("rpg-events-row");
    await expect(rows).toHaveCount(19);
    await expect(rows.nth(17)).toHaveText("!events[18]객체가 아님 (null)");
    await expect(rows.nth(18)).toHaveText('!events[19]객체가 아님 ("oops")');
    await expect(page.getByTestId("rpg-events-panel")).not.toContainText("undefined");

    // 다른 이벤트를 옮겨 저장해도 crates 의 seed 는 숫자 글 그대로다
    await pick(page, "bench");
    const host = page.getByTestId("map-view").locator(".map-view-host");
    await host.focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => eventCell(page, "bench")).toEqual([18, 34]);
    await page.keyboard.press(`${mod}+s`);
    await page.getByRole("button", { name: "그래도 저장" }).click();
    await expect(page.getByTestId("toasts")).toContainText("저장됨: port_town.json");
    const saved = await ev<string>(page, "(e, p) => e.backend.readText(p)", PORT);
    expect(saved).toContain('"seed": 12345678901234567890');
  });

  test("2^53을 넘는 정수는 수 인자에서 수다: 폼은 숫자 그대로, 트리 줄과 저장에 오류가 없고, 복사한 글은 JSON의 수다", async ({ page, context, browserName }) => {
    // WebKit 은 클립보드 권한을 줄 수 없고 페이지의 readText 도 막는다. 그래서 앱이 부른 writeText 의 글과
    // 그 쓰기가 성공했는지를 기록해 읽는다 (쓰기가 거절되면 기록하지 않아 단언이 실패한다)
    if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    else {
      await page.addInitScript(() => {
        const clip = navigator.clipboard;
        const write = clip.writeText.bind(clip);
        const w = window as unknown as { __written: string };
        w.__written = "";
        clip.writeText = (text: string) =>
          write(text).then(() => {
            w.__written = text;
          });
      });
    }
    const clipboardText = () =>
      browserName === "chromium"
        ? page.evaluate(() => navigator.clipboard.readText())
        : page.evaluate(() => (window as unknown as { __written: string }).__written);
    await openRpgProject(page);
    const mod = await primaryKey(page);
    const data = JSON.parse(await ev<string>(page, "(e, p) => e.backend.readText(p)", PORT)) as { events: Array<Record<string, unknown>> };
    const well = data.events.find((e) => e.id === "well")!;
    well.data = { seed: "@BIG@" };
    (well.commands as Cmd[]).push({ code: "setVar", key: "big", value: "@BIG@" });
    await ev(page, "(e, a) => e.backend.writeText(a.p, a.t)", { p: PORT, t: JSON.stringify(data, null, 2).replaceAll('"@BIG@"', "12345678901234567890") });
    await openMap(page, PORT, "port_town.json");
    await pick(page, "well");
    const tree = page.getByTestId("rpg-cmd-tree");
    const row = tree.locator('[data-row-key="c.commands[2]"]');
    await expect(row).toContainText("변수");
    await expect(row.getByTestId("rpg-cmd-marker")).toHaveCount(0);
    await row.click();
    await expect(page.getByTestId("rpg-arg-value")).toHaveValue("12345678901234567890");
    await expect(page.getByTestId("rpg-inspector")).not.toContainText("INT:");
    await expect(page.getByTestId("rpg-inspector")).not.toContainText("타입 불일치");

    // 커맨드 복사 (트리의 Ctrl+C)와 이벤트 복사 (맵 뷰의 Ctrl+C)는 시스템 클립보드에 수로 간다
    await expect(tree).toBeFocused();
    await page.keyboard.press(`${mod}+c`);
    await expect.poll(clipboardText).toContain('"value": 12345678901234567890');
    expect(await ev<string>(page, "(e) => e.extensions.exportsOf('rpg').services.commandClipboard.json")).not.toContain("INT:");
    const host = page.getByTestId("map-view").locator(".map-view-host");
    await host.focus();
    await page.keyboard.press(`${mod}+c`);
    await expect.poll(clipboardText).toContain('"seed": 12345678901234567890');
    const copied = await clipboardText();
    expect(copied).toContain('"value": 12345678901234567890');
    expect(copied).not.toContain("INT:");

    // 다른 이벤트를 옮기고 저장해도 오류 대화상자 없이 저장되고 큰 정수는 그대로다
    await pick(page, "bench");
    await host.focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => eventCell(page, "bench")).toEqual([18, 34]);
    await page.keyboard.press(`${mod}+s`);
    await expect(page.getByTestId("toasts")).toContainText("저장됨: port_town.json");
    await expect(page.getByRole("button", { name: "그래도 저장" })).toHaveCount(0);
    const saved = await ev<string>(page, "(e, p) => e.backend.readText(p)", PORT);
    expect(saved).toContain('"seed": 12345678901234567890');
    expect(saved).toContain('"value": 12345678901234567890');
  });

  test("이미 고른 외형 칸을 다시 누르면 되돌리기 단계도 저장 안 됨도 없다", async ({ page }) => {
    await openRpgProject(page);
    await openMap(page, PORT, "port_town.json");
    await pick(page, "captain");
    const cell = (i: number) => page.getByTestId(`rpg-field-charset-grid-${i}`);
    await expect(cell(6)).toHaveAttribute("aria-pressed", "true");
    await cell(6).click();
    await cell(6).click();
    expect([await depth(page), await dirty(page)]).toEqual([0, false]);
    await cell(5).click();
    await cell(5).click();
    expect([await depth(page), await dirty(page)]).toEqual([1, true]);
  });
});

test.describe("RPG 스키마가 없는 프로젝트 (문서 2.5)", () => {
  test("맵 메뉴에 이벤트 항목이 없고 창 메뉴에 이벤트가 없다", async ({ page }) => {
    await page.goto("/?backend=memory");
    await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
    await page.reload();
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
    await openMap(page, MEADOW, "meadow.json");
    await expect.poll(() => ev<boolean>(page, "(e) => e.extensions.exportsOf('rpg').store.loaded")).toBe(true);
    const mapMenu = await menuLabels(page, "맵");
    expect(mapMenu).toContain("펜");
    for (const label of ["이벤트 도구", "이 이벤트 앞에서 실행", "이 이벤트 자동 재생"]) expect(mapMenu).not.toContain(label);
    expect(await menuLabels(page, "창")).not.toContain("이벤트");
    await expect(page.getByTestId("layers").getByTestId("layer-hint")).toHaveCount(0);
    // 확장 패널 목록에도 없고, 타일맵 레이아웃도 이벤트 탭을 넣지 않는다
    await expect(page.getByTestId("extensions-empty")).toBeVisible();
    await expect(page.getByTestId("extension-panel-entry")).toHaveCount(0);
    await ev(page, "(e) => e.commands.execute('window.layout.tilemap')");
    await expect(page.getByTestId("map-view")).toBeVisible();
    expect(await ev<boolean>(page, "(e) => e.layout.isPanelOpen('ext:rpg.events')")).toBe(false);
    await expect(page.getByTestId("rpg-events-panel")).toHaveCount(0);
  });

  test("되살린 레이아웃의 이벤트 탭: 브라우저 저장소에서 온 것도 프로젝트의 layout.json 에서 온 것도 스키마가 없으면 빠진다", async ({ page }) => {
    const eventsOpen = () => ev<boolean>(page, "(e) => e.layout.isPanelOpen('ext:rpg.events')");
    // RPG 프로젝트(메모리 모드의 픽스처)에서 타일맵 레이아웃을 지어 브라우저 저장소와 프로젝트의 layout.json 에 이벤트 탭을 남긴다
    await openRpgProject(page);
    await openMap(page, PORT, "port_town.json");
    await ev(page, "(e) => e.commands.execute('window.layout.tilemap')");
    await expect.poll(eventsOpen).toBe(true);
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key) ?? "", LAYOUT_KEY)).toContain("ext:rpg.events");
    const withEvents = (await page.evaluate((key) => localStorage.getItem(key), LAYOUT_KEY))!;

    // layout.json 길: 스키마를 지우고 프로젝트를 다시 연다 (닫을 때 이벤트 탭이 든 레이아웃을 layout.json 에 쓴다)
    await ev(page, "(e) => e.backend.remove('resources/schema/event-commands.json')");
    await expect.poll(() => ev<boolean>(page, "(e) => e.extensions.exportsOf('rpg').store.schemaPresent")).toBe(false);
    expect(await eventsOpen()).toBe(true);
    await ev(page, "(e) => e.openProject('memory://sample')");
    expect(await ev<string>(page, "(e) => e.backend.readText('.initial-editor/layout.json')")).toContain("ext:rpg.events");
    await expect.poll(() => ev<boolean>(page, "(e) => e.extensions.exportsOf('rpg').store.loaded")).toBe(true);
    await expect.poll(eventsOpen).toBe(false);
    await expect(page.getByTestId("rpg-events-panel")).toHaveCount(0);
    expect(await ev<boolean>(page, "(e) => e.layout.userClosed.has('ext:rpg.events')")).toBe(false);

    // 브라우저 저장소 길: 저장소에는 이제 이벤트 탭이 없는 레이아웃이 있다. 타일맵 레이아웃을 지은 때의 것(이벤트 탭)으로 되돌려 두고,
    // 새 메모리 백엔드(스키마 없는 샘플, layout.json 없음)로 연다. 프로젝트를 열기 전(모름)에는 탭을 둔다
    // 레이아웃은 바뀐 뒤 PERSIST_DELAY_MS(400ms) 뒤에 저장된다
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key) ?? "", LAYOUT_KEY)).not.toContain("ext:rpg.events");
    await page.goto("/?backend=memory");
    await page.evaluate(([key, layout]) => localStorage.setItem(key, layout), [LAYOUT_KEY, withEvents] as const);
    await page.reload();
    await expect.poll(eventsOpen).toBe(true);
    await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    // 되살린 타일맵 레이아웃에서는 프로젝트 트리가 가려진 탭일 수 있어 프로젝트가 열렸는지로 기다린다
    await expect.poll(() => ev<boolean>(page, "(e) => e.project.isOpen")).toBe(true);
    await openMap(page, MEADOW, "meadow.json");
    await expect.poll(() => ev<boolean>(page, "(e) => e.extensions.exportsOf('rpg').store.loaded")).toBe(true);
    await expect.poll(eventsOpen).toBe(false);
    await expect(page.getByTestId("rpg-events-panel")).toHaveCount(0);
    await expect(page.getByText("이 맵에 이벤트 레이어 없음")).toHaveCount(0);
  });

  test("RPG 프로젝트에서는 같은 항목이 보인다 (대조)", async ({ page }) => {
    await openRpgProject(page);
    await openMap(page, PORT, "port_town.json");
    const mapMenu = await menuLabels(page, "맵");
    for (const label of ["이벤트 도구", "이 이벤트 앞에서 실행", "이 이벤트 자동 재생"]) expect(mapMenu).toContain(label);
    expect(await menuLabels(page, "창")).toContain("이벤트");
    await expect(page.locator('[data-testid="extension-panel-entry"][data-panel="rpg.events"]')).toHaveCount(1);
    await ev(page, "(e) => e.commands.execute('window.layout.tilemap')");
    await expect.poll(() => ev<boolean>(page, "(e) => e.layout.isPanelOpen('ext:rpg.events')")).toBe(true);
  });
});
