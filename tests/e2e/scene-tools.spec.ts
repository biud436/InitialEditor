// 씬 도구 e2e (docs/plans/e2-scene.md 마일스톤 2, 3, 5, 7). 메모리 백엔드(?backend=memory)라 서버가 필요 없다.
// 흐름: 새 씬 → 오브젝트 추가 → 계층에 보이고 선택 → 인스펙터로 x 수정 → F2 이름 바꾸기 → 복제 → 삭제 → 되돌리기 →
//       복사와 붙여넣기 → 시작 씬으로 지정 → 저장하면 파일에 오브젝트가 있다. 그리고 인스펙터의 스크립트 붙이기가
//       컴포넌트 파일을 만들어 트리에 드러낸다.

import { expect, test, type Page } from "@playwright/test";

const LAYOUT_KEY = "initial-editor.layout";

/** 페이지 안의 window.initialEditor 를 느슨하게 본다 (테스트에서 필요한 것만) */
type SceneObjectLike = { id: string; x: number; y: number; scripts: string[] };
type EditorLike = {
  documents: { active: { path: string | null; scene: { find(id: string): SceneObjectLike | undefined; ids(): string[] }; selectedIds: string[]; undo: { depth: number } } | null };
  project: { gameJson: { startScene?: string } };
  backend: { readText(p: string): Promise<string> };
};
/** 페이지 안에서 fn(window.initialEditor) 를 돌린다 (fn 은 직렬화되어 페이지에서 다시 만들어진다) */
function withEditor<T>(page: Page, fn: (e: EditorLike) => T | Promise<T>): Promise<T> {
  return page.evaluate((src: string) => {
    const f = new Function("e", `return (${src})(e)`) as (e: unknown) => T | Promise<T>;
    return f((window as unknown as { initialEditor: unknown }).initialEditor);
  }, fn.toString());
}

async function openMenu(page: Page, branch: string, item: string | RegExp) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item", { hasText: item }).first().click();
}

/** 씬 > 오브젝트 추가 > <타입 라벨> (하위 메뉴) */
async function addObjectViaMenu(page: Page, label: string) {
  await page.getByRole("menubar").getByRole("menuitem", { name: "씬", exact: true }).click();
  await page.locator(".menu-item", { hasText: "오브젝트 추가" }).first().click();
  await page.locator(".menu-item", { hasText: label }).first().click();
}

async function openSample(page: Page) {
  await page.goto("/?backend=memory");
  await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  const tree = page.getByTestId("project-tree");
  await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
  return tree;
}

async function newScene(page: Page, name: string) {
  await openMenu(page, "씬", "새 씬");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("새 씬");
  await dialog.getByRole("textbox").fill(name);
  await dialog.getByRole("button", { name: "만들기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const path = `resources/scenes/${name}.json`;
  await expect(page.getByTestId("project-tree").locator(`[data-path="${path}"]`)).toBeVisible();
  await expect(page.getByTestId("doc-tab").filter({ hasText: `${name}.json` })).toBeVisible();
  await expect(page.getByTestId("hierarchy")).toHaveAttribute("data-scene", `${name}.json`);
  expect(await withEditor(page, (e) => e.documents.active?.path)).toBe(path);
  return path;
}

async function primaryKey(page: Page): Promise<string> {
  return (await page.evaluate(() => /Mac/i.test(navigator.platform))) ? "Meta" : "Control";
}

test.describe("씬 도구 (메모리 모드)", () => {
  test("새 씬, 오브젝트 추가, 인스펙터, 이름 바꾸기, 복제, 삭제, 되돌리기, 복사와 붙여넣기, 시작 씬, 저장", async ({ page }) => {
    await openSample(page);
    const mod = await primaryKey(page);
    await expect(page.getByTestId("hierarchy")).toContainText("활성 씬 탭 없음");
    await newScene(page, "stage1");
    const hierarchy = page.getByTestId("hierarchy");
    await expect(hierarchy).toContainText("그리기 순서 (위 항목부터)");
    await expect(page.getByTestId("inspector")).toContainText("오브젝트 0개");

    // 씬 > 오브젝트 추가 > 스프라이트: 계층에 보이고 선택되어 있다
    await addObjectViaMenu(page, "스프라이트");
    const sprite = hierarchy.locator('[data-testid="hierarchy-row"][data-id="sprite"]');
    await expect(sprite).toBeVisible();
    await expect(sprite).toHaveAttribute("aria-selected", "true");
    await expect(sprite).toContainText("스프라이트");
    await expect(page.getByTestId("hierarchy-count")).toHaveText("1개");
    expect(await withEditor(page, (e) => e.documents.active!.selectedIds)).toEqual(["sprite"]);

    // 인스펙터: 타입 인스펙터가 보이고 x 를 50 으로 (타이핑 세션은 되돌리기 한 단계)
    const inspector = page.getByTestId("inspector");
    await expect(inspector).toContainText("sprite");
    await expect(page.getByTestId("inspector-sprite")).toBeVisible();
    await expect(page.getByTestId("prop-image")).toBeVisible();
    await expect(page.getByTestId("inspector-problems")).toContainText("이미지(props.image) 비어 있음");
    const x = page.getByTestId("inspector-x");
    await x.click();
    await x.fill("5");
    await x.fill("50");
    await x.press("Enter");
    expect(await withEditor(page, (e) => e.documents.active!.scene.find("sprite")!.x)).toBe(50);
    expect(await withEditor(page, (e) => e.documents.active!.undo.depth)).toBe(2); // 추가 + 타이핑 세션 하나

    // F2 로 이름 바꾸기
    await sprite.click();
    await page.keyboard.press("F2");
    const rename = page.getByTestId("hierarchy-rename");
    await expect(rename).toBeVisible();
    await rename.fill("player");
    await rename.press("Enter");
    const player = hierarchy.locator('[data-testid="hierarchy-row"][data-id="player"]');
    await expect(player).toBeVisible();
    await expect(sprite).toHaveCount(0);
    await expect(player).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("inspector-id")).toHaveValue("player");

    // 복제 (Ctrl+D): 바로 뒤에 +16
    await player.click();
    await page.keyboard.press(`${mod}+d`);
    const player2 = hierarchy.locator('[data-testid="hierarchy-row"][data-id="player_2"]');
    await expect(player2).toBeVisible();
    await expect(player2).toHaveAttribute("aria-selected", "true");
    expect(await withEditor(page, (e) => e.documents.active!.scene.find("player_2")!.x)).toBe(66);

    // 삭제 (Delete)
    await player2.click();
    await page.keyboard.press("Delete");
    await expect(player2).toHaveCount(0);
    await expect(page.getByTestId("hierarchy-count")).toHaveText("1개");

    // 편집 > 되돌리기 가 복구한다
    await openMenu(page, "편집", "되돌리기");
    await expect(player2).toBeVisible();
    expect(await withEditor(page, (e) => e.documents.active!.scene.ids())).toEqual(["player", "player_2"]);

    // 복사와 붙여넣기 (편집 메뉴)
    await player.click();
    await openMenu(page, "편집", "복사");
    await expect(page.getByTestId("toasts")).toContainText("오브젝트 1개 복사됨");
    await openMenu(page, "편집", "붙여넣기");
    const player3 = hierarchy.locator('[data-testid="hierarchy-row"][data-id="player_3"]');
    await expect(player3).toBeVisible();
    expect(await withEditor(page, (e) => e.documents.active!.scene.find("player_3")!.x)).toBe(66);

    // 눈 아이콘으로 숨기기
    await player3.getByTestId("hierarchy-eye").click();
    await expect(player3).toHaveClass(/is-hidden/);

    // 시작 씬으로 지정
    await openMenu(page, "씬", "시작 씬으로 지정");
    await expect(page.getByTestId("toasts")).toContainText("시작 씬으로 지정됨: stage1");
    expect(await withEditor(page, (e) => e.project.gameJson.startScene)).toBe("stage1");

    // 저장 (Ctrl+S): 파일에 오브젝트가 있다
    await player.click();
    await page.keyboard.press(`${mod}+s`);
    await expect(page.getByTestId("toasts")).toContainText("저장됨: stage1.json");
    const saved = JSON.parse(await withEditor(page, (e) => e.backend.readText("resources/scenes/stage1.json"))) as { version: number; name: string; objects: Array<{ id: string; type: string; x: number; visible?: boolean }> };
    expect(saved.version).toBe(1);
    expect(saved.name).toBe("stage1");
    expect(saved.objects.map((o) => o.id)).toEqual(["player", "player_2", "player_3"]);
    expect(saved.objects[0]).toMatchObject({ type: "sprite", x: 50 });
    expect(saved.objects[2].visible).toBe(false);
  });

  test("인스펙터의 스크립트 붙이기가 컴포넌트 파일을 만들고 트리에 드러내고 열 수 있다", async ({ page }) => {
    const tree = await openSample(page);
    await newScene(page, "stage2");
    await addObjectViaMenu(page, "빈 노드");
    const node = page.getByTestId("hierarchy").locator('[data-testid="hierarchy-row"][data-id="node"]');
    await expect(node).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("inspector-scripts")).toContainText("추가된 스크립트 없음");

    await page.getByTestId("inspector-attach").click();
    const dialog = page.getByTestId("attach-script-dialog");
    await expect(dialog).toBeVisible();
    await page.getByTestId("attach-script-name").fill("components/mover");
    await expect(dialog).toContainText("파일: scripts/lua/components/mover.lua");
    await page.getByTestId("attach-script-ok").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await expect(page.getByTestId("inspector-scripts").locator('[data-testid="inspector-script-row"][data-name="components/mover"]')).toBeVisible();
    await expect(tree.locator('[data-path="scripts/lua/components/mover.lua"]')).toBeVisible();
    expect(await withEditor(page, (e) => e.documents.active!.scene.find("node")!.scripts)).toEqual(["components/mover"]);
    const source = await withEditor(page, (e) => e.backend.readText("scripts/lua/components/mover.lua"));
    expect(source).toContain("function Mover.init(obj, scene, params)");
    expect(source).toContain("return Mover");
    await expect(page.getByTestId("console-list")).toContainText("컴포넌트 생성됨: scripts/lua/components/mover.lua");

    // 열기 → 편집기 탭. 씬 탭으로 돌아오면 계층이 다시 그 씬이다
    await page.getByTestId("inspector-script-open").click();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "mover.lua" })).toBeVisible();
    await expect(page.locator(".monaco-editor .view-lines")).toContainText("Mover.init");
    await expect(page.getByTestId("hierarchy")).toContainText("활성 씬 탭 없음");
    await page.getByTestId("doc-tab").filter({ hasText: "stage2.json" }).click();
    await expect(page.getByTestId("hierarchy")).toHaveAttribute("data-scene", "stage2.json");

    // 같은 이름을 다시 붙이면 알린다. 떼기
    await node.click();
    await page.getByTestId("inspector-attach").click();
    await page.getByTestId("attach-script-name").fill("components/mover");
    await page.getByTestId("attach-script-ok").click();
    await expect(page.getByTestId("toasts")).toContainText("이미 추가된 스크립트: components/mover");
    await page.getByTestId("attach-script-dialog").getByRole("button", { name: "취소" }).click();

    // 순서: 두 번째를 붙이고 위로 올리면 엔진이 먼저 부른다. 끝의 단추는 꺼져 있고, 되돌리기로 돌아간다
    await page.getByTestId("inspector-attach").click();
    await page.getByTestId("attach-script-name").fill("components/spinner");
    await page.getByTestId("attach-script-ok").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const rows = page.getByTestId("inspector-scripts").getByTestId("inspector-script-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.first().getByTestId("inspector-script-up")).toBeDisabled();
    await expect(rows.last().getByTestId("inspector-script-down")).toBeDisabled();
    await rows.last().getByTestId("inspector-script-up").click();
    expect(await withEditor(page, (e) => e.documents.active!.scene.find("node")!.scripts)).toEqual(["components/spinner", "components/mover"]);
    await expect(rows.first()).toHaveAttribute("data-name", "components/spinner");
    await page.keyboard.press(`${await primaryKey(page)}+z`);
    expect(await withEditor(page, (e) => e.documents.active!.scene.find("node")!.scripts)).toEqual(["components/mover", "components/spinner"]);
    await rows.first().getByTestId("inspector-script-down").click();
    await page.keyboard.press(`${await primaryKey(page)}+s`);
    await expect.poll(async () => JSON.parse(await withEditor(page, (e) => e.backend.readText("resources/scenes/stage2.json"))).objects.find((o: { id: string }) => o.id === "node").scripts).toEqual(["components/spinner", "components/mover"]);

    for (let i = 0; i < 2; i++) await page.getByTestId("inspector-script-remove").first().click();
    await expect(page.getByTestId("inspector-scripts")).toContainText("추가된 스크립트 없음");
  });

  test("컴포넌트 매개변수: 선언 파일을 만들고, 폼으로 고치고, 기본값으로 되돌리고, 저장하고, 떼면 값도 지워진다", async ({ page }) => {
    const tree = await openSample(page);
    await newScene(page, "stage3");
    await addObjectViaMenu(page, "빈 노드");
    await addObjectViaMenu(page, "빈 노드");
    const node = page.getByTestId("hierarchy").locator('[data-testid="hierarchy-row"][data-id="node"]');
    await node.click();
    await page.getByTestId("inspector-attach").click();
    await page.getByTestId("attach-script-name").fill("components/mover");
    await page.getByTestId("attach-script-ok").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // 선언 파일이 없으면 만들기 단추. 누르면 scripts/components/mover.json 을 만들고 연다
    const params = page.getByTestId("inspector-component").filter({ has: page.locator('[data-name="components/mover"]') }).getByTestId("inspector-params");
    await expect(params).toHaveAttribute("data-state", "none");
    await params.getByTestId("inspector-params-open").click();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "mover.json" })).toBeVisible();
    await expect(tree.locator('[data-path="scripts/components/mover.json"]')).toBeVisible();
    expect(JSON.parse(await withEditor(page, (e) => e.backend.readText("scripts/components/mover.json")))).toEqual({ version: 1, fields: [] });
    // 편집기는 선언 파일의 스키마로 틀린 곳을 표시한다 (모르는 type)
    const writeFile = (path: string, text: string) =>
      page.evaluate(([p, t]) => (window as unknown as { initialEditor: { backend: { writeText(p: string, t: string): Promise<void> } } }).initialEditor.backend.writeText(p, t), [path, text] as const);
    const writeDeclaration = (text: string) => writeFile("scripts/components/mover.json", text);
    // 외부에서 바뀐 선언 파일은 열린 탭이 다시 읽고, 모르는 type 에 오류 표시가 뜬다. 되돌리면 사라진다
    const changeOnDisk = (text: string) =>
      page.evaluate(([p, t]) => (window as unknown as { initialEditor: { backend: { simulateExternalChange(p: string, k: string, t: string): Promise<void> } } }).initialEditor.backend.simulateExternalChange(p, "modify", t), [
        "scripts/components/mover.json",
        text,
      ] as const);
    await changeOnDisk('{ "version": 1, "fields": [{ "key": "speed", "type": "vector" }] }\n');
    await expect(page.locator(".monaco-editor .view-lines")).toContainText("vector");
    await expect(page.locator(".monaco-editor .squiggly-error").first()).toBeAttached();
    await changeOnDisk('{ "version": 1, "fields": [] }\n');
    await expect(page.locator(".monaco-editor .view-lines")).not.toContainText("vector");
    await expect(page.locator(".monaco-editor .squiggly-error")).toHaveCount(0);
    await expect(page.getByTestId("doc-tab").filter({ hasText: "mover.json" }).locator(".doc-tab-dirty")).toHaveCount(0);
    await page.getByTestId("doc-tab").filter({ hasText: "stage3.json" }).click();
    await node.click();
    await expect(params).toHaveAttribute("data-state", "declared");
    await expect(params).toContainText("선언된 매개변수 없음");

    // 선언을 고치면 폼이 따라온다
    const declaration = {
      version: 1,
      fields: [
        { key: "speed", type: "number", label: "속도", default: 60, min: 0 },
        { key: "kind", type: "enum", values: ["ground", "pipes"], default: "ground" },
        { key: "target", type: "object", label: "대상" },
      ],
    };
    await writeDeclaration(JSON.stringify(declaration, null, 2));
    await expect(params.getByTestId("inspector-param")).toHaveCount(3);
    await expect(params.getByTestId("param-speed")).toHaveValue("60");
    await expect(params.getByTestId("param-kind")).toHaveValue("ground");

    // 폼으로 고친다. 고친 값은 표시되고 기본값으로 되돌릴 수 있다
    await params.getByTestId("param-speed").fill("90");
    await params.getByTestId("param-speed").press("Enter");
    await params.getByTestId("param-kind").selectOption("pipes");
    await params.getByTestId("param-target").selectOption("node_2");
    await expect(params.locator('[data-testid="inspector-param"][data-key="speed"]')).toHaveAttribute("data-set", "true");
    const sceneParams = () => withEditor(page, (e) => (e.documents.active!.scene.find("node") as unknown as { params: unknown }).params);
    expect(await sceneParams()).toEqual({ "components/mover": { speed: 90, kind: "pipes", target: "node_2" } });
    await expect(page.getByTestId("inspector-problems")).toHaveAttribute("data-count", "0");
    await params.getByTestId("param-speed-reset").click();
    await expect(params.getByTestId("param-speed")).toHaveValue("60");
    expect(await sceneParams()).toEqual({ "components/mover": { kind: "pipes", target: "node_2" } });

    // 저장하면 씬 파일의 params 에 고친 값만 있다
    await page.keyboard.press(`${await primaryKey(page)}+s`);
    await expect
      .poll(async () => JSON.parse(await withEditor(page, (e) => e.backend.readText("resources/scenes/stage3.json"))).objects.find((o: { id: string }) => o.id === "node").params)
      .toEqual({ "components/mover": { kind: "pipes", target: "node_2" } });

    // 붙이기 대화상자는 선언이 있는 컴포넌트를 표시하고, 이미 붙은 것은 빼고 제안한다
    await page.getByTestId("hierarchy").locator('[data-testid="hierarchy-row"][data-id="node_2"]').click();
    await page.getByTestId("inspector-attach").click();
    await expect(page.getByTestId("attach-script-suggestions").locator(".attach-script-suggestion").first()).toHaveAttribute("data-declared", "true");
    await page.getByTestId("attach-script-dialog").getByRole("button", { name: "취소" }).click();

    // 프로젝트의 씬 로더가 예전 사본이면 알리고 경고한다. 바꾸면 번들 템플릿의 로더(매개변수 지원)로 덮어쓴다
    await node.click();
    await writeFile("scripts/lua/scene_loader.lua", "-- 예전 씬 로더\nreturn {}\n");
    const note = page.getByTestId("inspector-loader-old");
    await expect(note).toBeVisible();
    await expect(page.getByTestId("inspector-problems")).toContainText("씬 로더(scripts/lua/scene_loader.lua)가 매개변수를 전달하지 않아");
    await note.getByTestId("inspector-loader-upgrade").click();
    await page.getByRole("dialog").getByRole("button", { name: "덮어쓰기" }).click();
    await expect(note).toHaveCount(0);
    expect(await withEditor(page, (e) => e.backend.readText("scripts/lua/scene_loader.lua"))).toContain('SceneLoader.DECLARATION_ROOT = "scripts/"');
    await expect(page.getByTestId("inspector-problems")).toHaveAttribute("data-count", "0");

    // 떼면 그 컴포넌트의 값도 지워지고, 되돌리면 돌아온다
    await page.getByTestId("inspector-script-remove").click();
    expect(await sceneParams()).toEqual({});
    await page.keyboard.press(`${await primaryKey(page)}+z`);
    expect(await sceneParams()).toEqual({ "components/mover": { kind: "pipes", target: "node_2" } });
  });

  test("하위 메뉴: 마우스를 올려 열린 뒤 부모 항목을 눌러도 닫히지 않는다", async ({ page }) => {
    await openSample(page);
    await page.getByRole("menubar").getByRole("menuitem", { name: "씬", exact: true }).click();
    const parent = page.locator(".menu-item", { hasText: "오브젝트 추가" }).first();
    const sub = page.locator(".menu .menu .menu-item", { hasText: "스프라이트" });
    await parent.hover();
    await expect(sub).toBeVisible();
    await parent.click();
    await expect(sub).toBeVisible();
    await parent.click();
    await expect(sub).toBeVisible();
  });

  test("여러 개를 고르면 공통 칸만 보이고 값이 다르면 여러 값이다", async ({ page }) => {
    await openSample(page);
    await newScene(page, "stage3");
    await addObjectViaMenu(page, "텍스트");
    await addObjectViaMenu(page, "빈 노드");
    const hierarchy = page.getByTestId("hierarchy");
    const text = hierarchy.locator('[data-testid="hierarchy-row"][data-id="text"]');
    const node = hierarchy.locator('[data-testid="hierarchy-row"][data-id="node"]');
    const x = page.getByTestId("inspector-x");
    await text.click();
    await x.fill("30");
    await x.press("Enter");
    await node.click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("inspector")).toHaveAttribute("data-selection", "2");
    await expect(page.getByTestId("inspector")).toContainText("2개 선택");
    await expect(x).toHaveAttribute("placeholder", "여러 값");
    await expect(page.getByTestId("inspector-scripts")).toHaveCount(0);
    // 둘 다 y 를 40 으로: 명령 하나. 새 오브젝트는 씬 뷰 가운데에 놓이므로 되돌린 값은 고치기 전 값과 비교한다
    const before = await withEditor(page, (e) => [e.documents.active!.scene.find("text")!.y, e.documents.active!.scene.find("node")!.y]);
    const y = page.getByTestId("inspector-y");
    await y.fill("40");
    await y.press("Enter");
    expect(await withEditor(page, (e) => [e.documents.active!.scene.find("text")!.y, e.documents.active!.scene.find("node")!.y])).toEqual([40, 40]);
    await openMenu(page, "편집", "되돌리기");
    expect(await withEditor(page, (e) => [e.documents.active!.scene.find("text")!.y, e.documents.active!.scene.find("node")!.y])).toEqual(before);
  });
});
