// 스크립트 탭 여럿에 차례로 치는 e2e (docs/plans/e1-scripting.md 검수). 메모리 백엔드(?backend=memory)라 서버가 필요 없다.
// 탭을 열고, 오가고, 닫고, 다시 열고, 옆 그룹으로 나누고, 씬 탭을 끼워도 글자와 단축키(되돌리기, 찾기와 바꾸기)가
// 누른 탭의 파일에만 들어가는지, 모두 저장한 바이트가 그 내용인지 본다. WebKit 프로젝트로도 돈다 (yarn test:e2e:webkit).

import { expect, test, type Page } from "@playwright/test";

const LAYOUT_KEY = "initial-editor.layout";
const A = "scripts/lua/a.lua";
const B = "scripts/ruby/b.rb";
const C = "scripts/lua/c.lua";

interface ScriptDoc {
  text: string;
  reveal(line: number, column: number): void;
}
interface TestWindow {
  initialEditor: {
    backend: { writeText(p: string, t: string): Promise<void>; readBinary(p: string): Promise<Uint8Array> };
    documents: { findByPath(p: string): ScriptDoc | undefined };
    scripting: { openScript(p: string): Promise<unknown> };
    openPath(p: string): Promise<void>;
    layout: { api: DockApi };
  };
}
interface DockPanel {
  group: unknown;
  api: { moveTo(o: { group: unknown }): void; setActive(): void };
}
interface DockApi {
  getPanel(id: string): DockPanel | undefined;
  addGroup(o: { referenceGroup: unknown; direction: "right" }): unknown;
}

async function openMenu(page: Page, branch: string, item: string | RegExp) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item", { hasText: item }).first().click();
}

/** 샘플 프로젝트를 열고 스크립트 파일들을 이 내용으로 만든다 */
async function openSampleWith(page: Page, files: Record<string, string>) {
  await page.goto("/?backend=memory");
  await page.evaluate((key) => localStorage.removeItem(key), LAYOUT_KEY);
  await page.reload();
  await page.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
  await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
  await page.evaluate(async (entries) => {
    const editor = (window as unknown as TestWindow).initialEditor;
    for (const [p, t] of entries) await editor.backend.writeText(p, t);
  }, Object.entries(files));
}

/** 그 경로의 스크립트 편집기 (보이는 탭의 것만 DOM 에 있다) */
function editorOf(page: Page, path: string) {
  return page.getByTestId("script-editor").filter({ has: page.locator(".doc-header-path", { hasText: path }) });
}

function tabOf(page: Page, title: string) {
  return page.getByTestId("doc-tab").filter({ hasText: title });
}

/** 초점을 옮기지 않고 스크립트 탭을 연다 (콘솔 링크나 명령이 여는 것과 같다) */
async function openScript(page: Page, path: string) {
  await page.evaluate((p) => (window as unknown as TestWindow).initialEditor.scripting.openScript(p), path);
  await expect(editorOf(page, path).locator(".view-lines")).toBeVisible();
}

/** 그 편집기를 눌러 파일 끝으로 가서 친다 */
async function typeAtEnd(page: Page, path: string, text: string) {
  await editorOf(page, path).locator(".view-lines").click();
  await page.evaluate((p) => (window as unknown as TestWindow).initialEditor.documents.findByPath(p)?.reveal(1e9, 1e9), path);
  await page.keyboard.type(text);
}

/** Monaco 는 사용자 에이전트로 mac 단축키를 고른다 (Desktop Chrome 장치는 Windows 에이전트, Desktop Safari 는 mac) */
async function monacoKeys(page: Page) {
  const mac = await page.evaluate(() => navigator.userAgent.includes("Macintosh"));
  const mod = mac ? "Meta" : "Control";
  return { undo: `${mod}+Z`, findReplace: mac ? "Meta+Alt+F" : "Control+H", replaceAll: `${mod}+Alt+Enter` };
}

async function textsOf(page: Page, paths: string[]) {
  return page.evaluate((ps) => Object.fromEntries(ps.map((p) => [p, (window as unknown as TestWindow).initialEditor.documents.findByPath(p)?.text ?? null])), paths);
}

/** 모든 파일의 모델 내용이 기대와 같다 */
async function expectTexts(page: Page, want: Record<string, string>) {
  await expect.poll(() => textsOf(page, Object.keys(want))).toEqual(want);
}

/** 모두 저장한 뒤 백엔드의 바이트가 기대 내용의 UTF-8 과 같다 */
async function saveAllAndExpectBytes(page: Page, want: Record<string, string>) {
  await openMenu(page, "파일", "모두 저장");
  await expect(page.getByTestId("doc-tab").locator(".doc-tab-dirty")).toHaveCount(0);
  const saved = await page.evaluate(async (ps) => {
    const editor = (window as unknown as TestWindow).initialEditor;
    const out: Record<string, number[]> = {};
    for (const p of ps) out[p] = Array.from(await editor.backend.readBinary(p));
    return out;
  }, Object.keys(want));
  const expected = Object.fromEntries(Object.entries(want).map(([p, t]) => [p, Array.from(Buffer.from(t, "utf8"))]));
  expect(saved).toEqual(expected);
}

test.describe("스크립트 탭 여럿 (메모리 모드)", () => {
  test("탭을 열고, 오가고, 닫고, 다시 열며 번갈아 쳐도 글자는 누른 탭의 파일에만 들어가고 저장한 바이트도 같다", async ({ page }) => {
    await openSampleWith(page, { [A]: "", [B]: "", [C]: "" });

    // 앞 탭에 초점이 있는 채로 다음 탭을 연다
    await openScript(page, A);
    await typeAtEnd(page, A, "-- a1\n");
    await openScript(page, B);
    await typeAtEnd(page, B, "# b1\n");
    await openScript(page, C);
    await typeAtEnd(page, C, "-- c1\n");
    await expectTexts(page, { [A]: "-- a1\n", [B]: "# b1\n", [C]: "-- c1\n" });

    // 탭을 눌러 오간다
    await tabOf(page, "a.lua").click();
    await typeAtEnd(page, A, "-- a2\n");
    await tabOf(page, "b.rb").click();
    await typeAtEnd(page, B, "# b2\n");
    await expectTexts(page, { [A]: "-- a1\n-- a2\n", [B]: "# b1\n# b2\n", [C]: "-- c1\n" });

    // 씬 탭을 사이에 연다
    await tabOf(page, "c.lua").click();
    await typeAtEnd(page, C, "-- c2\n");
    await page.evaluate(() => (window as unknown as TestWindow).initialEditor.openPath("resources/scenes/main.json"));
    await expect(page.locator('[data-testid="document"][data-kind="scene"]')).toBeVisible();
    await tabOf(page, "a.lua").click();
    await typeAtEnd(page, A, "-- a3\n");
    await expectTexts(page, { [A]: "-- a1\n-- a2\n-- a3\n", [B]: "# b1\n# b2\n", [C]: "-- c1\n-- c2\n" });

    // 저장한 탭을 닫고, 남은 탭에 치고, 다시 연다
    await tabOf(page, "c.lua").click();
    await openMenu(page, "파일", "저장");
    await expect(tabOf(page, "c.lua").locator(".doc-tab-dirty")).toHaveCount(0);
    await tabOf(page, "c.lua").hover();
    await tabOf(page, "c.lua").getByRole("button", { name: /닫기/ }).click();
    await expect(tabOf(page, "c.lua")).toHaveCount(0);
    await tabOf(page, "b.rb").click();
    await typeAtEnd(page, B, "# b3\n");
    await openScript(page, C);
    await typeAtEnd(page, C, "-- c3\n");
    const want = { [A]: "-- a1\n-- a2\n-- a3\n", [B]: "# b1\n# b2\n# b3\n", [C]: "-- c1\n-- c2\n-- c3\n" };
    await expectTexts(page, want);
    await saveAllAndExpectBytes(page, want);
  });

  test("옆 그룹으로 나눈 두 스크립트에 번갈아 쳐도 각자의 파일에만 들어간다", async ({ page }) => {
    await openSampleWith(page, { [A]: "", [B]: "" });
    await openScript(page, A);
    await typeAtEnd(page, A, "-- a1\n");
    await openScript(page, B);
    await page.evaluate(([a, b]) => {
      const api = (window as unknown as TestWindow).initialEditor.layout.api;
      const left = api.getPanel(`doc:${a}`)!;
      const right = api.getPanel(`doc:${b}`)!;
      right.api.moveTo({ group: api.addGroup({ referenceGroup: left.group, direction: "right" }) });
      left.api.setActive();
    }, [A, B]);
    await expect(editorOf(page, A).locator(".view-lines")).toBeVisible();
    await expect(editorOf(page, B).locator(".view-lines")).toBeVisible();

    await typeAtEnd(page, B, "# b1\n");
    await typeAtEnd(page, A, "-- a2\n");
    await typeAtEnd(page, B, "# b2\n");
    const want = { [A]: "-- a1\n-- a2\n", [B]: "# b1\n# b2\n" };
    await expectTexts(page, want);
    await saveAllAndExpectBytes(page, want);
  });

  test("둘째 탭에서 누른 되돌리기와 찾기와 바꾸기 단축키는 그 탭의 파일에만 듣는다", async ({ page }) => {
    await openSampleWith(page, { [A]: "x = 1\n", [B]: "x = 1\n" });
    await openScript(page, A);
    await editorOf(page, A).locator(".view-lines").click();
    await openScript(page, B);
    await typeAtEnd(page, B, "y");
    await expectTexts(page, { [A]: "x = 1\n", [B]: "x = 1\ny" });

    const keys = await monacoKeys(page);
    await page.keyboard.press(keys.undo);
    await expectTexts(page, { [A]: "x = 1\n", [B]: "x = 1\n" });

    // 찾기와 바꾸기 창은 누른 탭의 편집기에 뜨고, 모두 바꾸기도 그 파일만 바꾼다
    await page.keyboard.press(keys.findReplace);
    const widget = editorOf(page, B).locator(".find-widget.visible");
    await expect(widget).toBeVisible();
    await widget.locator(".find-part textarea").fill("x");
    await widget.locator(".replace-part textarea").fill("z");
    await widget.locator(".replace-part textarea").press(keys.replaceAll);
    const want = { [A]: "x = 1\n", [B]: "z = 1\n" };
    await expectTexts(page, want);
    await saveAllAndExpectBytes(page, want);
  });
});
