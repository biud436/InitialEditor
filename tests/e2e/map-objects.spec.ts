// 맵 오브젝트 e2e (docs/plans/e3-tilemap.md "오브젝트 목록 패널과 스키마 폼 인스펙터", "이 맵에서 실행").
// 메모리 백엔드(?backend=memory)라 서버가 필요 없다. 샘플 프로젝트에는 resources/schema/map-objects.json과
// 오브젝트 셋(start, slime_1, sign_1)이 든 resources/maps/sample.json이 있다.
// 흐름: 맵 열기 → 묶음과 수 → 몬스터 고르기와 종 바꾸기 → 순찰 범위 → 흔적 추가 → 여러 줄 한글 글 저장 →
//       겹치는 id 거부 → 삭제와 되돌리기 → 뒤집힌 범위의 검사 결과 → 여기서 실행은 브라우저 모드에서도 켜져 있다
//       (에디터 안 게임 탭에서 돈다. 실제 실행은 game-view.spec.ts).
// 둘째 테스트: 스키마의 play.maps에 맞지 않는 맵에서도 여기서 실행은 켜져 있고, 툴팁에 이유가 있으며, 누르면(Ctrl+F5)
// 띄우지 않고 이유를 토스트와 콘솔로 알린다 (러너는 감싸서 띄운 척한다).

import { expect, test, type Page } from "@playwright/test";
import { captureRunStarts, restoreRunner, runStarts } from "./support/editorPage";

const LAYOUT_KEY = "initial-editor.layout";
const MAP_PATH = "resources/maps/sample.json";

type MapObjectLike = { id: string; type: string; x: number; y: number; width?: number; props: Record<string, unknown> };
type EditorLike = {
  documents: {
    active: {
      kind: string;
      path: string | null;
      dirty: boolean;
      selectedIds: string[];
      model: { findObject(id: string): MapObjectLike | undefined; objectIds(): string[] };
      undo: { depth: number };
    } | null;
  };
  backend: { readText(p: string): Promise<string>; writeText(p: string, text: string): Promise<void> };
  commands: { isEnabled(id: string): boolean };
  commandHint(id: string): string | undefined;
  commandNote(id: string): string | undefined;
  commandLabel(id: string): string;
  log: { entries: Array<{ level: string; source: string; text: string }> };
};

/** 페이지 안에서 fn(window.initialEditor)를 돌린다 (fn은 직렬화되어 페이지에서 다시 만들어진다) */
function withEditor<T>(page: Page, fn: (e: EditorLike) => T | Promise<T>): Promise<T> {
  return page.evaluate((src: string) => {
    const f = new Function("e", `return (${src})(e)`) as (e: unknown) => T | Promise<T>;
    return f((window as unknown as { initialEditor: unknown }).initialEditor);
  }, fn.toString());
}

function objectProps(page: Page, id: string): Promise<Record<string, unknown> | null> {
  return page.evaluate((oid) => {
    const e = (window as unknown as { initialEditor: EditorLike }).initialEditor;
    return e.documents.active?.model.findObject(oid)?.props ?? null;
  }, id);
}

async function openMenu(page: Page, branch: string, item: string | RegExp) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item", { hasText: item }).first().click();
}

async function primaryKey(page: Page): Promise<string> {
  return (await page.evaluate(() => /Mac/i.test(navigator.platform))) ? "Meta" : "Control";
}

async function openSampleMap(page: Page) {
  await page.goto("/?backend=memory");
  await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  const tree = page.getByTestId("project-tree");
  await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
  await tree.locator('[data-path="resources"]').click();
  await tree.locator('[data-path="resources/maps"]').click();
  await tree.locator(`[data-path="${MAP_PATH}"]`).dblclick();
  await expect(page.getByTestId("doc-tab").filter({ hasText: "sample.json" })).toBeVisible();
  await expect.poll(() => withEditor(page, (e) => e.documents.active?.kind)).toBe("map");
  // 기본 레이아웃(씬)에는 맵 오브젝트 패널이 없으므로 창 메뉴로 켠다
  if ((await page.getByTestId("map-objects").count()) === 0) await openMenu(page, "창", "맵 오브젝트");
  const panel = page.getByTestId("map-objects");
  await expect(panel).toHaveAttribute("data-map", "sample.json");
  return panel;
}

test.describe("맵 오브젝트 (메모리 모드)", () => {
  test("목록, 스키마 폼, 추가, 여러 줄 글 저장, 이름 겹침 거부, 삭제와 되돌리기, 검사, 여기서 실행", async ({ page }) => {
    const panel = await openSampleMap(page);
    const mod = await primaryKey(page);
    const group = (type: string) => panel.locator(`[data-testid="map-objects-group"][data-type="${type}"]`);
    const row = (id: string) => panel.locator(`[data-testid="map-objects-row"][data-id="${id}"]`);
    const inspector = page.getByTestId("map-object-inspector");

    // 스키마 타입별 묶음과 수, 줄 요약 (첫 enum 값, 띠는 x..x+width)
    await expect(panel.locator('[data-testid="map-objects-group"]')).toHaveCount(3);
    for (const type of ["spawn", "start", "landmark"]) await expect(group(type)).toHaveAttribute("data-count", "1");
    await expect(group("spawn")).toContainText("몬스터");
    await expect(group("spawn").getByTestId("map-objects-group-count")).toHaveText("1");
    await expect(row("slime_1").getByTestId("map-objects-summary")).toHaveText("slime");
    await expect(row("sign_1").getByTestId("map-objects-summary")).toHaveText("16..32");
    await expect(page.getByTestId("map-objects-count")).toHaveText("3개");

    // 아무것도 안 골랐으면 맵 요약과 스키마 출처
    await expect(inspector).toHaveAttribute("data-selection", "0");
    await expect(page.getByTestId("map-summary-schema")).toHaveAttribute("data-source", "project");
    await expect(page.getByTestId("map-summary-schema")).toContainText("타입 3개");
    await expect(page.getByTestId("map-summary-counts")).toContainText("몬스터 1");

    // 몬스터를 고르면 종 고르기가 보이고, 바꾸면 모델의 props가 바뀐다
    await row("slime_1").click();
    await expect(row("slime_1")).toHaveAttribute("aria-selected", "true");
    await expect(inspector).toHaveAttribute("data-object", "slime_1");
    await expect(page.getByTestId("map-inspector-type")).toHaveText("몬스터");
    const species = page.getByTestId("map-field-species");
    await expect(species).toHaveValue("slime");
    await species.selectOption("bat");
    await expect.poll(() => objectProps(page, "slime_1").then((p) => p?.species)).toBe("bat");
    await expect(row("slime_1").getByTestId("map-objects-summary")).toHaveText("bat");
    await expect(page.getByTestId("map-field-level")).toHaveAttribute("placeholder", "비어 있음");

    // 순찰 범위: 칸을 고치고, 현재 위치 기준 ±64 (x 40, 맵 폭 64 안으로 자른다)
    const minX = page.getByTestId("map-field-minX");
    await minX.fill("20");
    await minX.press("Enter");
    await expect.poll(() => objectProps(page, "slime_1").then((p) => p?.minX)).toBe(20);
    await page.getByTestId("map-range-around").click();
    await expect.poll(() => objectProps(page, "slime_1")).toMatchObject({ minX: 0, maxX: 64 });

    // unique 타입(시작 지점)은 둘째를 거부한다
    await group("start").getByTestId("map-objects-add").click();
    await expect(page.getByTestId("toasts")).toContainText("시작 지점: 맵당 1개만 허용");
    await expect(group("start")).toHaveAttribute("data-count", "1");

    // 흔적 추가: 띠 모양이라 defaultWidth(32) 폭으로 생기고 골라진다
    await group("landmark").getByTestId("map-objects-add").click();
    await expect(row("landmark_1")).toBeVisible();
    await expect(row("landmark_1")).toHaveAttribute("aria-selected", "true");
    await expect(group("landmark")).toHaveAttribute("data-count", "2");
    await expect(inspector).toHaveAttribute("data-object", "landmark_1");
    const added = await withEditor(page, (e) => e.documents.active!.model.findObject("landmark_1")!);
    expect(added.width).toBe(32);
    expect(added.type).toBe("landmark");
    await expect(page.getByTestId("map-inspector-width")).toHaveValue("32");

    // 여러 줄 한글 글을 적고 저장하면 파일에 그대로 (\n으로) 들어간다
    const text = '첫째 줄 한글\n둘째 줄: "따옴표"\n\n넷째 줄, 끝';
    const area = page.getByTestId("map-field-text");
    await area.fill(text);
    await area.blur();
    await expect.poll(() => objectProps(page, "landmark_1").then((p) => p?.text)).toBe(text);
    await page.keyboard.press(`${mod}+s`);
    await expect.poll(() => withEditor(page, (e) => e.documents.active!.dirty)).toBe(false);
    const raw = await withEditor(page, (e) => e.backend.readText("resources/maps/sample.json"));
    expect(raw).toContain(`"text": ${JSON.stringify(text)}`);
    expect(raw).toContain("\\n\\n넷째 줄");
    const saved = JSON.parse(raw) as { objects: MapObjectLike[] };
    expect(saved.objects.find((o) => o.id === "landmark_1")?.props.text).toBe(text);
    expect(saved.objects.find((o) => o.id === "slime_1")?.props).toMatchObject({ species: "bat", minX: 0, maxX: 64 });

    // 겹치는 id로 이름 바꾸기는 거부하고 원래 id로 돌아간다
    const id = page.getByTestId("map-inspector-id");
    await id.fill("start");
    await id.press("Enter");
    await expect(page.getByTestId("toasts")).toContainText("이미 있는 id: start");
    await expect(id).toHaveValue("landmark_1");
    expect(await withEditor(page, (e) => e.documents.active!.model.objectIds())).toEqual(["start", "slime_1", "sign_1", "landmark_1"]);

    // 오른쪽 클릭 메뉴로 삭제하면 사라지고, 되돌리면 돌아온다
    await row("landmark_1").click({ button: "right" });
    await page.getByRole("menuitem", { name: "삭제" }).click();
    await expect(row("landmark_1")).toHaveCount(0);
    await expect(group("landmark")).toHaveAttribute("data-count", "1");
    await openMenu(page, "편집", "되돌리기");
    await expect(row("landmark_1")).toBeVisible();
    expect(await withEditor(page, (e) => e.documents.active!.model.objectIds())).toContain("landmark_1");

    // 같은 타입 여럿을 고르면 함께 고칠 칸(종, 보스)만 보이고, 한 번에 바뀌며 되돌리기 한 단계다
    await group("spawn").getByTestId("map-objects-add").click();
    await expect(row("spawn_1")).toHaveAttribute("aria-selected", "true");
    await row("slime_1").click({ modifiers: ["ControlOrMeta"] });
    await expect(inspector).toHaveAttribute("data-selection", "2");
    await expect(inspector.locator('[data-testid="map-field-row"]')).toHaveCount(2);
    await expect(species).toHaveValue("");
    await expect(species.locator("option:checked")).toHaveText("여러 값");
    await species.selectOption("bat");
    await expect.poll(() => objectProps(page, "spawn_1").then((p) => p?.species)).toBe("bat");
    expect((await objectProps(page, "slime_1"))?.species).toBe("bat");
    await openMenu(page, "편집", "되돌리기");
    await expect.poll(() => objectProps(page, "spawn_1").then((p) => p?.species)).toBe("slime");
    expect((await objectProps(page, "slime_1"))?.species).toBe("bat");

    // 범위를 일부러 뒤집으면 검사 결과에 오류가 나오고, 누르면 그 오브젝트를 고른다
    await row("slime_1").click();
    await minX.fill("50");
    await minX.press("Enter");
    const maxX = page.getByTestId("map-field-maxX");
    await maxX.fill("10");
    await maxX.press("Enter");
    const problem = page.locator('[data-testid="map-objects-problem"][data-object-id="slime_1"][data-severity="error"]');
    await expect(problem).toContainText("순찰 왼끝 값은 순찰 오른끝 값 이하여야 합니다");
    await expect(page.getByTestId("map-inspector-problems")).toContainText("순찰 왼끝 값은 순찰 오른끝 값 이하여야 합니다");
    await row("start").click();
    await expect(inspector).toHaveAttribute("data-object", "start");
    await problem.click();
    await expect(inspector).toHaveAttribute("data-object", "slime_1");

    // 여기서 실행: 브라우저 모드에서도 켜져 있다 (에디터 안 게임 탭에서 돈다). Ctrl+F5(run.fromScene)도 맵에서는 여기서 실행이다
    const branch = (await page.getByRole("menubar").getByRole("menuitem", { name: "맵", exact: true }).count()) > 0 ? "맵" : "실행";
    await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
    const playHere = page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: /^이 맵에서 실행$/ }) });
    await expect(playHere).toBeEnabled();
    await page.keyboard.press("Escape");
    // 켜져 있으면 안내는 위치를 정하는 규칙이다 (objectTools/rules.ts 의 PLAY_POSITION_RULE)
    const rule = "실행 위치 결정 순서: 선택한 오브젝트 1개 (범위가 있으면 최소 X에서 48px 왼쪽, 16 이상), 맵 안의 커서, 화면 가운데, 시작 지점, 맵 가운데. 결과 좌표는 맵 안으로 제한";
    expect(await withEditor(page, (e) => [e.commands.isEnabled("map.playHere"), e.commandHint("map.playHere") ?? "(없음)"])).toEqual([true, rule]);
    expect(await withEditor(page, (e) => [e.commands.isEnabled("run.fromScene"), e.commandHint("run.fromScene") ?? "(없음)", e.commandLabel("run.fromScene")])).toEqual([true, rule, "이 맵에서 실행"]);
  });

  test("여기서 실행: 스키마의 play.maps에 맞지 않는 맵은 누르면 띄우지 않고 이유를 알리며, 맞는 맵은 그 맵으로 띄운다", async ({ page }) => {
    await openSampleMap(page);
    await captureRunStarts(page);
    // 샘플 스키마에 play.maps를 더한다 (파일이 바뀌면 스키마 저장소가 다시 읽는다)
    await withEditor(page, async (e) => {
      const path = "resources/schema/map-objects.json";
      const schema = JSON.parse(await e.backend.readText(path));
      schema.play.maps = ["meadow*"];
      await e.backend.writeText(path, JSON.stringify(schema, null, 2));
    });
    const reason = "'이 맵에서 실행' 대상이 아닌 맵: sample (스키마의 play.maps: meadow*)";
    await expect.poll(() => withEditor(page, (e) => e.commandHint("map.playHere"))).toBe(reason);
    expect(
      await withEditor(page, (e) => [e.commands.isEnabled("map.playHere"), e.commands.isEnabled("run.fromScene"), e.commandHint("run.fromScene"), e.commandNote("map.playHere"), e.commandNote("run.fromScene")]),
    ).toEqual([true, true, reason, reason, reason]);

    // 메뉴 항목은 켜져 있고 이유가 툴팁에 있다 (실행 > 이 맵에서 실행도 같다)
    const branch = (await page.getByRole("menubar").getByRole("menuitem", { name: "맵", exact: true }).count()) > 0 ? "맵" : "실행";
    await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
    const playHere = page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: /^이 맵에서 실행$/ }) });
    await expect(playHere).toBeEnabled();
    await expect(playHere).toHaveAttribute("title", reason);
    await page.keyboard.press("Escape");
    await page.getByRole("menubar").getByRole("menuitem", { name: "실행", exact: true }).click();
    const fromScene = page.locator(".menu-item").filter({ has: page.locator(".menu-label", { hasText: /^이 맵에서 실행$/ }) });
    await expect(fromScene).toBeEnabled();
    await expect(fromScene).toHaveAttribute("title", reason);
    await page.keyboard.press("Escape");

    // Ctrl+F5: 띄우지 않고 이유를 토스트와 콘솔 줄로 알린다
    await page.getByTestId("map-view").filter({ visible: true }).locator(".map-view-host").focus();
    await page.keyboard.press("ControlOrMeta+F5");
    await expect(page.getByTestId("toasts")).toContainText(reason);
    await expect
      .poll(() => withEditor(page, (e) => e.log.entries.filter((l) => l.source === "maps" && l.text.includes("이 맵에서 실행 불가")).map((l) => `${l.level}: ${l.text}`)))
      .toEqual([`warn: 이 맵에서 실행 불가: ${reason}`]);
    expect(await runStarts(page)).toEqual([]);

    // 맞는 맵(meadow)에서는 켜지고 그 맵의 이름으로 띄운다
    await page.getByTestId("project-tree").locator('[data-path="resources/maps/meadow.json"]').dblclick();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "meadow.json" })).toBeVisible();
    await expect.poll(() => withEditor(page, (e) => e.commands.isEnabled("map.playHere"))).toBe(true);
    expect(await withEditor(page, (e) => e.commandHint("map.playHere"))).not.toContain("play.maps");
    expect(await withEditor(page, (e) => [e.commandNote("map.playHere") ?? null, e.commandNote("run.fromScene") ?? null])).toEqual([null, null]);
    await page.getByTestId("map-view").filter({ visible: true }).locator(".map-view-host").focus();
    await page.keyboard.press("ControlOrMeta+F5");
    await expect.poll(async () => (await runStarts(page)).length).toBe(1);
    const [started] = await runStarts(page);
    expect(started.env).toMatchObject({ INITIAL2D_SCENE: "main", INITIAL2D_SAMPLE_MAP: "meadow" });
    await restoreRunner(page);
  });
});
