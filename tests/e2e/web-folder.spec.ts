// 웹판의 브라우저 폴더 백엔드 e2e (docs/plans/e4-embedded-play.md 웹판). 서버가 필요 없다.
// 진짜 폴더 열기 대화상자는 자동화할 수 없어서 브라우저 전용 저장소(OPFS)를 폴더 대신 쓴다 (?backend=opfs).
// 흐름: OPFS 에 작은 프로젝트를 심고 연다 → 트리 → main.lua 를 고쳐 저장하면 OPFS 에 남는다 →
//       에디터 몰래 OPFS 에 쓴 파일이 3초 안에 트리에 나타나고, 연 문서는 다시 읽힌다.
// 시작 화면(?backend=browser): 폴더 열기 버튼, IndexedDB 에 기억한 폴더 목록과 다시 열기, 샘플로 해 보기.
// Playwright 의 기본 컨텍스트는 시크릿 창과 같은 off-the-record 프로필이라 IndexedDB 에서 폴더 핸들을 꺼내면
// 브라우저 프로세스가 통째로 죽는다. 앱은 그런 곳에서 핸들을 꺼내지 않는다: 기본 컨텍스트에서는 다시 열기와 폴더 열기가
// 폴더 고르기로 돌고 브라우저가 살아 있는지 본다. 핸들을 바로 꺼내는 다시 열기는 일반 프로필(launchPersistentContext)에서
// 짐작을 흉내 내지 않고 진짜 값으로 본다. performance.memory 가 없으면(NO_MEMORY) 일반 프로필이어도 폴더 고르기로 돈다.
// 폴더 고르기 대화상자는 OPFS 하위 폴더를 돌려주는 가짜로 바꾼다 (PICKER_STUB).
// 샘플로 해 보기 뒤의 Ctrl+O 와 파일 > 프로젝트 열기도 폴더 고르기다. 저장하지 않은 문서를 묻는 곳에서 취소하면
// 기억한 기록과 페이지의 핸들이 그대로다 (이름이 같은 두 폴더 a/game, b/game).
// 샘플은 메모리 백엔드라 밖에 엔진이 없다: 수동 리로드는 게임 탭이 돌 때만 켜지고, 게임이 끝난 뒤 저장해도 보냈다고 적지 않는다.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";

const CODE = ".monaco-editor .view-lines";

const PROJECT: Record<string, string> = {
  "game.json": '{\n  "name": "웹판 e2e",\n  "windowWidth": 320,\n  "windowHeight": 240,\n  "renderScale": 2,\n  "script": "lua"\n}\n',
  "scripts/lua/main.lua": "-- 웹판 e2e 진입점\nfunction init()\n  print(\"안녕\")\nend\n",
  "resources/maps/field.json":
    '{\n  "version": 2,\n  "width": 2,\n  "height": 2,\n  "tileWidth": 16,\n  "tileHeight": 16,\n  "tilesets": [],\n  "layers": [{ "name": "ground", "data": [0, 0, 0, 0] }],\n  "events": [],\n  "objects": []\n}\n',
};

/** OPFS 에 파일을 쓴다 (sub 가 있으면 그 하위 폴더에, "a/game" 처럼 여러 층도 된다). 에디터를 거치지 않는다 */
async function writeOpfs(page: Page, files: Record<string, string>, sub = "") {
  await page.evaluate(
    async ({ files, sub }) => {
      let root = await navigator.storage.getDirectory();
      for (const seg of sub.split("/").filter(Boolean)) root = await root.getDirectoryHandle(seg, { create: true });
      for (const [path, text] of Object.entries(files)) {
        const parts = path.split("/");
        const name = parts.pop()!;
        let dir = root;
        for (const seg of parts) dir = await dir.getDirectoryHandle(seg, { create: true });
        const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await writable.write(text);
        await writable.close();
      }
    },
    { files, sub },
  );
}

async function readOpfs(page: Page, path: string): Promise<string> {
  return page.evaluate(async (path) => {
    const parts = path.split("/");
    const name = parts.pop()!;
    let dir = await navigator.storage.getDirectory();
    for (const seg of parts) dir = await dir.getDirectoryHandle(seg);
    return (await (await dir.getFileHandle(name)).getFile()).text();
  }, path);
}

async function openMenu(page: Page, branch: string, item: string | RegExp) {
  await page.getByRole("menubar").getByRole("menuitem", { name: branch, exact: true }).click();
  await page.locator(".menu-item", { hasText: item }).first().click();
}

/** 새 컨텍스트라 OPFS 는 비어 있다. 심은 뒤 ?backend=opfs 로 다시 열면 바로 그 프로젝트가 열린다 */
async function openSeededOpfs(page: Page) {
  await page.goto("/?backend=browser");
  await writeOpfs(page, PROJECT);
  await page.goto("/?backend=opfs");
  const tree = page.getByTestId("project-tree");
  await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
  return tree;
}

test.describe("웹판 브라우저 폴더 (OPFS)", () => {
  test("OPFS 프로젝트를 열고, main.lua 를 고쳐 저장하면 OPFS 에 남는다", async ({ page }) => {
    const tree = await openSeededOpfs(page);
    await expect(tree.locator('[data-path="game.json"]')).toBeVisible();
    await expect(tree.locator('[data-path="resources"]')).toBeVisible();
    await expect(page.getByTestId("statusbar")).toContainText("브라우저 폴더");
    await expect(page.getByTestId("console-list")).toContainText("백엔드: browser");

    await tree.locator('[data-path="scripts"]').click();
    await tree.locator('[data-path="scripts/lua"]').click();
    await tree.locator('[data-path="scripts/lua/main.lua"]').dblclick();
    await expect(page.locator(CODE)).toContainText("웹판 e2e 진입점");

    await page.locator(CODE).click();
    await page.evaluate(() =>
      (window as unknown as { initialEditor: { scripting: { activeScript: { reveal(l: number, c: number): void } } } }).initialEditor.scripting.activeScript.reveal(1, 1),
    );
    await page.keyboard.type("-- 웹판에서 고침\n");
    const tab = page.getByTestId("doc-tab").filter({ hasText: "main.lua" });
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(1);
    await openMenu(page, "파일", "저장");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(0);
    await expect(page.getByTestId("toasts")).toContainText("저장됨: main.lua");

    const saved = await readOpfs(page, "scripts/lua/main.lua");
    expect(saved.startsWith("-- 웹판에서 고침\n-- 웹판 e2e 진입점\n")).toBe(true);
    expect(saved).not.toContain("\r");

    // 내가 저장한 것은 밖의 변경으로 보지 않는다 (폴링 두 번이 지나도 다시 읽기 알림이 없다)
    await page.waitForTimeout(3200);
    await expect(page.getByTestId("console-list")).not.toContainText("외부에서 변경되어 다시 읽음: scripts/lua/main.lua");
  });

  test("에디터 몰래 OPFS 에 쓴 파일이 3초 안에 트리에 나타나고, 연 문서는 다시 읽힌다", async ({ page }) => {
    const tree = await openSeededOpfs(page);
    await tree.locator('[data-path="scripts"]').click();
    await tree.locator('[data-path="scripts/lua"]').click();
    await tree.locator('[data-path="scripts/lua/main.lua"]').dblclick();
    await expect(page.locator(CODE)).toContainText("웹판 e2e 진입점");

    // 최상위의 notes.txt 는 프로젝트 파일이 아니라 필터가 숨긴다. 필터를 끈 채로 밖에서 쓰면 3초 안에 보이고, 켜면 숨는다
    const filter = page.getByTestId("project-filter");
    await filter.click();
    await expect(filter).toHaveAttribute("aria-pressed", "false");
    await writeOpfs(page, { "scripts/lua/outside.lua": "-- 밖에서 만듦\n", "notes.txt": "메모\n" });
    await expect(tree.locator('[data-path="scripts/lua/outside.lua"]')).toBeVisible({ timeout: 3000 });
    await expect(tree.locator('[data-path="notes.txt"]')).toBeVisible({ timeout: 3000 });
    await filter.click();
    await expect(tree.locator('[data-path="notes.txt"]')).toHaveCount(0);

    await writeOpfs(page, { "scripts/lua/main.lua": "-- 밖에서 바꿈\nfunction init()\nend\n" });
    await expect(page.locator(CODE)).toContainText("밖에서 바꿈", { timeout: 3000 });
    await expect(page.getByTestId("toasts")).toContainText("외부에서 변경되어 다시 읽음: main.lua");
  });
});

/**
 * 폴더 고르기 대화상자 대신: OPFS 의 하위 폴더 핸들을 앱과 같은 자리에 기억시킨다
 * (IndexedDB initial-editor 의 folders 에 이름, handles 에 핸들)
 */
async function rememberOpfsFolder(page: Page, sub: string, key: string) {
  await writeOpfs(page, PROJECT, sub);
  await page.evaluate(
    async ({ sub, key }) => {
      const handle = await (await navigator.storage.getDirectory()).getDirectoryHandle(sub);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("initial-editor");
        req.onupgradeneeded = () => {
          for (const name of ["handles", "folders"]) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: "key" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["folders", "handles"], "readwrite");
        tx.objectStore("folders").put({ key, name: sub, openedAt: Date.now() });
        tx.objectStore("handles").put({ key, handle });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { sub, key },
  );
}

/** 기억한 폴더의 키 (folders 저장소만 읽는다. 핸들은 꺼내지 않는다) */
async function folderKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open("initial-editor");
        req.onsuccess = () => {
          const db = req.result;
          const keys = db.transaction("folders").objectStore("folders").getAllKeys();
          keys.onsuccess = () => {
            db.close();
            resolve((keys.result as string[]).sort());
          };
          keys.onerror = () => reject(keys.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

/** 기억한 폴더의 기록 (folders 저장소만 읽는다. 핸들은 꺼내지 않는다) */
async function folderRecords(page: Page): Promise<{ key: string; name: string; openedAt: number }[]> {
  return page.evaluate(
    () =>
      new Promise<{ key: string; name: string; openedAt: number }[]>((resolve, reject) => {
        const req = indexedDB.open("initial-editor");
        req.onsuccess = () => {
          const db = req.result;
          const all = db.transaction("folders").objectStore("folders").getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result);
          };
          all.onerror = () => reject(all.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

/** 열린 프로젝트의 키와, 페이지가 그 키로 들고 있는 핸들의 scripts/lua/main.lua 내용 */
async function liveMain(page: Page): Promise<{ key: string | null; main: string }> {
  return page.evaluate(async () => {
    const backend = (window as unknown as EditorWindow).initialEditor.backend;
    const key = backend.openedRoot;
    const handle = key ? backend.handles?.opened(key) : undefined;
    if (!handle) return { key, main: "(핸들 없음)" };
    const lua = await (await handle.getDirectoryHandle("scripts")).getDirectoryHandle("lua");
    return { key, main: await (await (await lua.getFileHandle("main.lua")).getFile()).text() };
  });
}

/**
 * 폴더 고르기 대화상자의 가짜: window.__pick 경로("a/game" 처럼 / 로 나눈다)의 OPFS 하위 폴더를 돌려주고,
 * 받은 옵션을 window.__picks 에 남긴다. 페이지를 새로 고치면 __picks 는 비어서 다시 시작한다
 */
const PICKER_STUB = `
  window.__pick = "remembered";
  window.__picks = [];
  window.showDirectoryPicker = async (options) => {
    window.__picks.push(options ?? null);
    let dir = await navigator.storage.getDirectory();
    for (const seg of window.__pick.split("/")) dir = await dir.getDirectoryHandle(seg, { create: true });
    return dir;
  };
`;

/** performance.memory 를 없앤다 (힙 한도를 알려 주지 않는 브라우저) */
const NO_MEMORY = `Object.defineProperty(Performance.prototype, "memory", { get() { return undefined; }, configurable: true });`;

type PickerWindow = { __picks: unknown[]; __pick: string };
type EditorWindow = {
  initialEditor: {
    backend: { openedRoot: string | null; handles?: { opened(key: string): FileSystemDirectoryHandle | undefined } };
    project: { gameJson?: { name?: string } };
    commands: { execute(id: string): Promise<unknown> };
  };
};

async function pickerCalls(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (window as unknown as PickerWindow).__picks);
}

const PICKER_OPTIONS = { mode: "readwrite", id: "initial-editor" };
const PRIVATE_NOTICE = "시크릿 창일 수 있어 최근 폴더 목록을 불러오지 않음";
const CRASH_NOTICE = "지난번 최근 폴더 목록 로드 중 브라우저 종료됨";

async function expectBrowserWelcome(page: Page) {
  const welcome = page.getByTestId("welcome");
  await expect(welcome).toContainText("브라우저 폴더 모드.");
  await expect(welcome).toContainText("최근 폴더");
  return welcome;
}

test.describe("웹판 시작 화면 (브라우저 폴더 모드)", () => {
  test("시크릿 컨텍스트: 목록은 이름만 읽고, 다시 열기와 이미 기억한 이름의 폴더 열기는 핸들을 꺼내지 않고 폴더 고르기로 연다. 브라우저는 살아 있고 기록은 늘지 않는다", async ({
    browser,
    context,
    page,
  }) => {
    await context.addInitScript(PICKER_STUB);
    await page.goto("/?backend=browser");
    const welcome = await expectBrowserWelcome(page);
    const openFolder = welcome.getByRole("button", { name: "폴더 열기", exact: true });
    await expect(openFolder).toBeEnabled();
    await expect(welcome).toContainText("최근 폴더 없음");

    await rememberOpfsFolder(page, "remembered", "folder-e2e");
    await page.reload();
    const recent = page.getByTestId("welcome-recent-folders");
    await expect(recent).toContainText("remembered");
    await expect(page.getByTestId("welcome-restore-notice")).toContainText(PRIVATE_NOTICE);

    // 다시 열기: 핸들을 꺼내지 않고 이유를 알린 뒤 폴더 고르기(같은 id)로 연다
    await recent.getByRole("button", { name: "다시 열기" }).click();
    await expect(page.getByTestId("toasts")).toContainText(PRIVATE_NOTICE);
    const tree = page.getByTestId("project-tree");
    await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
    await expect(page.getByTestId("statusbar")).toContainText("remembered");
    expect(await pickerCalls(page)).toEqual([PICKER_OPTIONS]);
    expect(browser.isConnected()).toBe(true);
    // 같은 이름이라 기억한 기록의 핸들을 바꾼다 (기록이 늘지 않는다)
    expect(await folderKeys(page)).toEqual(["folder-e2e"]);

    // 새 페이지에서 폴더 열기로 이미 기억한 이름을 고른다 (기억한 핸들과 비교하려고 꺼내지 않는다)
    await page.reload();
    await expect(recent).toContainText("remembered");
    await welcome.getByRole("button", { name: "폴더 열기", exact: true }).click();
    await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
    expect(await pickerCalls(page)).toEqual([PICKER_OPTIONS]);
    expect(browser.isConnected()).toBe(true);
    expect(await folderKeys(page)).toEqual(["folder-e2e"]);

    // 프로젝트 열기 커맨드(Ctrl+O)도 같다. 프로젝트가 열린 채로 새 페이지에서 부른다
    await page.reload();
    await expect(recent).toContainText("remembered");
    await page.evaluate(() => (window as unknown as { initialEditor: { commands: { execute(id: string): Promise<unknown> } } }).initialEditor.commands.execute("file.openProject"));
    await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
    expect(await pickerCalls(page)).toEqual([PICKER_OPTIONS]);
    expect(browser.isConnected()).toBe(true);
    expect(await folderKeys(page)).toEqual(["folder-e2e"]);

    await page.reload();
    await welcome.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("statusbar")).toContainText("memory://sample");
    await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
    expect(browser.isConnected()).toBe(true);
  });

  test("시크릿 컨텍스트에 performance.memory 가 없어도 (할당량은 2 GiB 에 사용량을 더한 값) 다시 열기는 핸들을 꺼내지 않고 폴더 고르기로 연다. 브라우저는 살아 있다", async ({
    browser,
    context,
    page,
  }) => {
    await context.addInitScript(NO_MEMORY);
    await context.addInitScript(PICKER_STUB);
    await page.goto("/?backend=browser");
    await expectBrowserWelcome(page);
    await rememberOpfsFolder(page, "remembered", "folder-e2e");
    await page.reload();
    // 이 테스트가 뜻이 있으려면: 힙 한도가 없고 할당량이 시크릿 창의 값(2 GiB 이상 4 GiB 이하)이다
    const signals = await page.evaluate(async () => ({
      quota: (await navigator.storage.estimate()).quota ?? 0,
      memory: (performance as unknown as { memory?: unknown }).memory ?? null,
    }));
    expect(signals.memory).toBeNull();
    expect(signals.quota, `시크릿 컨텍스트의 할당량 ${signals.quota}`).toBeGreaterThanOrEqual(2 * 1024 ** 3);
    expect(signals.quota, `시크릿 컨텍스트의 할당량 ${signals.quota}`).toBeLessThanOrEqual(4 * 1024 ** 3);

    const recent = page.getByTestId("welcome-recent-folders");
    await expect(recent).toContainText("remembered");
    await expect(page.getByTestId("welcome-restore-notice")).toContainText(PRIVATE_NOTICE);
    await recent.getByRole("button", { name: "다시 열기" }).click();
    await expect(page.getByTestId("toasts")).toContainText(PRIVATE_NOTICE);
    await expect(page.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
    expect(await pickerCalls(page)).toEqual([PICKER_OPTIONS]);
    expect(browser.isConnected()).toBe(true);
    expect(await folderKeys(page)).toEqual(["folder-e2e"]);
  });

  test("샘플로 해 보기 뒤에도 Ctrl+O 와 파일 > 프로젝트 열기는 폴더 고르기로 연다 (브리지 주소를 묻지 않는다)", async ({ browser, context, page }) => {
    await context.addInitScript(PICKER_STUB);
    await page.goto("/?backend=browser");
    const welcome = await expectBrowserWelcome(page);
    await writeOpfs(page, PROJECT, "remembered");
    const tree = page.getByTestId("project-tree");
    const statusbar = page.getByTestId("statusbar");

    for (const how of ["Ctrl+O", "파일 > 프로젝트 열기"]) {
      await page.reload();
      await welcome.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
      await expect(statusbar).toContainText("memory://sample");
      await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
      if (how === "Ctrl+O") await page.keyboard.press("ControlOrMeta+o");
      else await openMenu(page, "파일", "프로젝트 열기");
      await expect(statusbar, how).toContainText("remembered");
      await expect(statusbar).toContainText("브라우저 폴더");
      await expect(tree.locator('[data-path="game.json"]')).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(await pickerCalls(page), how).toEqual([PICKER_OPTIONS]);
      await expect(page.getByTestId("console-list")).toContainText("백엔드 교체: browser");
    }
    expect(browser.isConnected()).toBe(true);
  });

  test("샘플로 해 보기(메모리 백엔드)는 밖에 엔진이 없다: 수동 리로드는 게임 탭이 돌 때만 켜지고, 게임이 끝난 뒤 저장해도 보냈다고 적지 않는다", async ({ page }) => {
    await page.goto("/?backend=browser");
    const welcome = await expectBrowserWelcome(page);
    await welcome.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("statusbar")).toContainText("memory://sample");
    const toolbar = page.getByTestId("toolbar");
    const reload = toolbar.locator('[data-command="run.reload"]');
    await expect(reload).toBeDisabled();
    await expect(toolbar.locator('span.toolbar-tip:has([data-command="run.reload"])')).toHaveAttribute("title", /게임 탭에서 실행 중인 게임 없음/);
    const list = page.getByTestId("console-list");
    await expect(list).toContainText("외부 엔진으로 전송 안 함. 저장한 파일은 게임 탭에서 실행 중일 때만 반영");
    await expect(list).not.toContainText("수동 리로드(Ctrl+Shift+R) 전송 가능");

    const tree = page.getByTestId("project-tree");
    await tree.locator('[data-path="scripts"]').click();
    await tree.locator('[data-path="scripts/lua"]').click();
    await tree.locator('[data-path="scripts/lua/main.lua"]').dblclick();
    await expect(page.locator(CODE)).toContainText("function init()");
    await page.locator(CODE).click();
    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    await expect(reload).toBeEnabled();
    await page.keyboard.press("Shift+F5");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    await expect(reload).toBeDisabled();

    // 게임이 끝난 뒤 고쳐 저장한다
    const rowsBefore = await list.locator(".console-row").count();
    const tab = page.getByTestId("doc-tab").filter({ hasText: "main.lua" });
    await tab.click();
    await page.locator(CODE).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("\n-- 끝난 뒤에 고침");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(0);
    await page.waitForTimeout(1000); // 저장 리로드의 디바운스(300ms)보다 길게
    const after = await list.locator(".console-row").allInnerTexts();
    expect(after.slice(rowsBefore).filter((t) => t.includes("리로드"))).toEqual([]);
    await expect(list).not.toContainText("개 전송됨");
    await expect(page.getByTestId("toasts")).not.toContainText("리로드");
    await expect(reload).toBeDisabled();
  });

  test("저장하지 않은 문서를 묻는 곳에서 Ctrl+O 를 취소하면 기억한 기록과 페이지의 핸들이 그대로다 (이름이 같은 두 폴더 a/game, b/game)", async ({
    browser,
    context,
    page,
  }) => {
    await context.addInitScript(PICKER_STUB);
    await page.goto("/?backend=browser");
    const welcome = await expectBrowserWelcome(page);
    for (const sub of ["a", "b"]) {
      await writeOpfs(page, { "game.json": `{"name":"${sub}","script":"lua"}\n`, "scripts/lua/main.lua": `-- ${sub.toUpperCase()}\n` }, `${sub}/game`);
    }
    const setPick = (path: string) => page.evaluate((path) => ((window as unknown as PickerWindow).__pick = path), path);

    // a/game 을 열고 main.lua 를 고친 채 둔다
    await setPick("a/game");
    await welcome.getByRole("button", { name: "폴더 열기", exact: true }).click();
    const tree = page.getByTestId("project-tree");
    await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
    await tree.locator('[data-path="scripts"]').click();
    await tree.locator('[data-path="scripts/lua"]').click();
    await tree.locator('[data-path="scripts/lua/main.lua"]').dblclick();
    await expect(page.locator(CODE)).toContainText("-- A");
    await page.locator(CODE).click();
    await page.evaluate(() =>
      (window as unknown as { initialEditor: { scripting: { activeScript: { reveal(l: number, c: number): void } } } }).initialEditor.scripting.activeScript.reveal(1, 1),
    );
    await page.keyboard.type("-- unsaved edit\n");
    const tab = page.getByTestId("doc-tab").filter({ hasText: "main.lua" });
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(1);
    const recordsBefore = await folderRecords(page);
    expect(recordsBefore.map((r) => r.name)).toEqual(["game"]);
    const liveBefore = await liveMain(page);
    expect(liveBefore).toEqual({ key: recordsBefore[0].key, main: "-- A\n" });

    // Ctrl+O 로 b/game 을 고르고, 저장하지 않은 문서를 묻는 곳에서 취소한다
    await setPick("b/game");
    await page.keyboard.press("ControlOrMeta+o");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("저장 안 된 문서 1개");
    await dialog.getByRole("button", { name: "취소" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await pickerCalls(page)).toEqual([PICKER_OPTIONS, PICKER_OPTIONS]);
    expect(await folderRecords(page)).toEqual(recordsBefore);
    expect(await liveMain(page)).toEqual(liveBefore);
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(1);

    // 저장은 a 로 간다
    await openMenu(page, "파일", "저장");
    await expect(tab.locator(".doc-tab-dirty")).toHaveCount(0);
    expect(await readOpfs(page, "a/game/scripts/lua/main.lua")).toBe("-- unsaved edit\n-- A\n");
    expect(await readOpfs(page, "b/game/scripts/lua/main.lua")).toBe("-- B\n");

    // 최근 프로젝트 > game 은 대화상자 없이 a 를 다시 연다
    const opened = page.getByTestId("console-list").getByText("프로젝트 열림: game");
    await expect(opened).toHaveCount(1);
    await page.getByRole("menubar").getByRole("menuitem", { name: "파일", exact: true }).click();
    await page.locator(".menu-item", { hasText: "최근 프로젝트" }).first().hover();
    await page.locator(".menu-item", { hasText: /^game/ }).first().click();
    await expect(opened).toHaveCount(2);
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as EditorWindow).initialEditor.project.gameJson?.name)).toBe("a");
    expect(await liveMain(page)).toEqual({ key: recordsBefore[0].key, main: "-- unsaved edit\n-- A\n" });
    expect(await pickerCalls(page)).toEqual([PICKER_OPTIONS, PICKER_OPTIONS]);
    expect(browser.isConnected()).toBe(true);
  });

  test("일반 프로필: 기억한 폴더를 다시 열면 핸들을 바로 꺼내 연다. 꺼내다 꺼진 표시가 남아 있으면 폴더 고르기로 열고 표시를 지운다", async ({ baseURL }) => {
    const profile = mkdtempSync(path.join(tmpdir(), "ie-web-folder-"));
    const context = await chromium.launchPersistentContext(profile, { baseURL, viewport: { width: 1280, height: 800 } });
    try {
      await context.addInitScript(PICKER_STUB);
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto("/?backend=browser");
      const welcome = await expectBrowserWelcome(page);
      await expect(welcome).toContainText("최근 폴더 없음");
      // 앱의 짐작(profile.ts)이 이 컨텍스트를 일반 프로필로 봐야 이 테스트가 뜻이 있다:
      // 힙 한도가 있고, 할당량이 힙 한도의 두 배보다 크고 4 GiB 보다도 크다
      const signals = await page.evaluate(async () => ({
        quota: (await navigator.storage.estimate()).quota ?? 0,
        heapLimit: (performance as unknown as { memory?: { jsHeapSizeLimit: number } }).memory?.jsHeapSizeLimit ?? 0,
      }));
      expect(signals.heapLimit, "performance.memory.jsHeapSizeLimit 없음").toBeGreaterThan(0);
      expect(signals.quota, `일반 프로필의 할당량 ${signals.quota} 이 힙 한도 ${signals.heapLimit} 의 두 배보다 크지 않다`).toBeGreaterThan(2 * signals.heapLimit);
      expect(signals.quota, `일반 프로필의 할당량 ${signals.quota} 이 4 GiB 보다 크지 않다`).toBeGreaterThan(4 * 1024 ** 3);

      await rememberOpfsFolder(page, "remembered", "folder-e2e");
      await page.reload();
      const recent = page.getByTestId("welcome-recent-folders");
      await expect(recent).toContainText("remembered");
      await expect(page.getByTestId("welcome-restore-notice")).toHaveCount(0);
      await recent.getByRole("button", { name: "다시 열기" }).click();

      const tree = page.getByTestId("project-tree");
      await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
      await expect(tree.locator('[data-path="game.json"]')).toBeVisible();
      await expect(page.getByTestId("statusbar")).toContainText("remembered");
      expect(await pickerCalls(page)).toEqual([]);
      await page.getByRole("menubar").getByRole("menuitem", { name: "파일", exact: true }).click();
      await page.locator(".menu-item", { hasText: "최근 프로젝트" }).first().hover();
      await expect(page.locator(".menu-item", { hasText: "remembered" })).toBeVisible();
      await page.keyboard.press("Escape");
      // 설정 쪽 최근 목록(브리지와 같은 저장소)에는 키를 남기지 않는다
      const settingsRecent = await page.evaluate(() => (window as unknown as { initialEditor: { settings: { settings: { recentProjects: string[] } } } }).initialEditor.settings.settings.recentProjects);
      expect(settingsRecent).not.toContain("folder-e2e");

      // 지난번에 핸들을 꺼내다 꺼진 표시: 이 페이지에서는 꺼내지 않고 폴더 고르기로 연다. 열면 표시를 지운다
      await page.evaluate(() => localStorage.setItem("initial-editor.folders.restoring", String(Date.now())));
      await page.reload();
      await expect(recent).toContainText("remembered");
      await expect(page.getByTestId("welcome-restore-notice")).toContainText(CRASH_NOTICE);
      await recent.getByRole("button", { name: "다시 열기" }).click();
      await expect(page.getByTestId("toasts")).toContainText(CRASH_NOTICE);
      await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
      expect(await pickerCalls(page)).toEqual([PICKER_OPTIONS]);
      expect(await page.evaluate(() => localStorage.getItem("initial-editor.folders.restoring"))).toBeNull();
      expect(await folderKeys(page)).toEqual(["folder-e2e"]);

      // 표시가 지워졌으니 다음 페이지는 다시 바로 꺼낸다
      await page.reload();
      await expect(recent).toContainText("remembered");
      await expect(page.getByTestId("welcome-restore-notice")).toHaveCount(0);
      await recent.getByRole("button", { name: "다시 열기" }).click();
      await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
      expect(await pickerCalls(page)).toEqual([]);

      // performance.memory 가 없으면 일반 프로필이어도 핸들을 꺼내지 않고 폴더 고르기로 연다
      const bare = await context.newPage();
      await bare.addInitScript(NO_MEMORY);
      await bare.goto("/?backend=browser");
      const bareRecent = bare.getByTestId("welcome-recent-folders");
      await expect(bareRecent).toContainText("remembered");
      await expect(bare.getByTestId("welcome-restore-notice")).toContainText(PRIVATE_NOTICE);
      await bareRecent.getByRole("button", { name: "다시 열기" }).click();
      await expect(bare.getByTestId("toasts")).toContainText(PRIVATE_NOTICE);
      await expect(bare.getByTestId("project-tree").locator('[data-path="scripts"]')).toBeVisible();
      expect(await pickerCalls(bare)).toEqual([PICKER_OPTIONS]);
      expect(await folderKeys(bare)).toEqual(["folder-e2e"]);
    } finally {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    }
  });
});

const SAMPLE_MAP_HINT = "샘플 게임에서 렌더링하는 맵입니다. 팔레트에서 타일을 선택해 칠하고 저장한 뒤 F5를 눌러 실행하세요.";
const WEB_NO_RUBY = "브라우저 모드에서 실행 불가 (데스크톱 앱에서 실행)";

/** engine/MANIFEST.json 을 가로채 기능에서 mruby 를 뺀다 (mruby 없는 웹 엔진 빌드 흉내) */
async function withoutMruby(page: Page) {
  await page.route("**/engine/MANIFEST.json", async (route) => {
    const res = await route.fetch();
    const manifest = (await res.json()) as { features: string[] };
    await route.fulfill({ response: res, json: { ...manifest, features: manifest.features.filter((f) => f !== "mruby") } });
  });
}

test.describe("웹판 시작 화면의 더한 것 (e6 7.4)", () => {
  test("샘플로 해 보기는 게임이 그리는 샘플 맵을 연 채로 뜨고 칠하고 F5 안내를 한 번 띄운다. 아래 줄은 데스크톱 앱 받기와 웹판에서 안 되는 것", async ({ page }) => {
    await page.goto("/?backend=browser");
    const welcome = await expectBrowserWelcome(page);
    const footer = page.getByTestId("welcome-web");
    await expect(footer.getByTestId("welcome-edition")).toHaveText("데스크톱 앱 받기");
    await expect(footer.getByTestId("welcome-edition")).toHaveAttribute("href", "https://github.com/biud436/InitialEditor/releases");
    await expect(footer.getByTestId("welcome-edition")).not.toHaveAttribute("target", /.+/);
    // 이 웹 엔진 빌드에는 mruby 가 있어 Ruby 실행은 안 되는 것에 없다
    await expect(page.getByTestId("welcome-web-limits")).toHaveText("브라우저 모드 미지원: 엔진 프로세스 실행, 안드로이드 스테이징 (데스크톱 앱에서 지원)");

    await welcome.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("statusbar")).toContainText("memory://sample");
    await expect(page.getByTestId("doc-tab").filter({ hasText: "meadow.json" })).toBeVisible();
    await expect(page.getByTestId("map-view")).toHaveAttribute("data-ready", "true");
    await expect(page.getByTestId("toasts")).toContainText(SAMPLE_MAP_HINT);
    expect(await page.evaluate(() => (window as unknown as { initialEditor: { documents: { active: { path: string } | null } } }).initialEditor.documents.active?.path)).toBe("resources/maps/meadow.json");
    // 같은 페이지에서 다시 열면 맵은 열지만 안내는 다시 띄우지 않는다
    await page.evaluate(() => {
      const toasts = (window as unknown as { initialEditor: { toasts: { toasts: { id: number }[]; dismiss(id: number): void } } }).initialEditor.toasts;
      for (const t of [...toasts.toasts]) toasts.dismiss(t.id);
    });
    await expect(page.getByTestId("toasts")).not.toContainText(SAMPLE_MAP_HINT);
    await openMenu(page, "파일", "프로젝트 닫기");
    await page.getByTestId("welcome").getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "meadow.json" })).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByTestId("toasts")).not.toContainText(SAMPLE_MAP_HINT);
  });

  test("웹 엔진에 mruby 가 없으면 아래 줄에 Ruby 게임 실행이 붙는다", async ({ page }) => {
    await withoutMruby(page);
    await page.goto("/?backend=browser");
    await expectBrowserWelcome(page);
    await expect(page.getByTestId("welcome-web-limits")).toHaveText("브라우저 모드 미지원: 엔진 프로세스 실행, 안드로이드 스테이징, Ruby 게임 실행 (데스크톱 앱에서 지원)");
  });
});

test.describe("웹판 새 프로젝트 (브라우저 폴더)", () => {
  test("시작 화면의 새 프로젝트: 빈 폴더를 고르고 플래피(Lua)를 만들면 그 폴더가 브라우저 폴더로 열리고 기억되며, F5 로 게임 탭에서 돈다", async ({ browser, context, page }) => {
    await context.addInitScript(PICKER_STUB);
    await page.goto("/?backend=browser");
    const welcome = await expectBrowserWelcome(page);
    await page.evaluate(() => ((window as unknown as PickerWindow).__pick = "newgame"));
    await welcome.getByRole("button", { name: "새 프로젝트", exact: true }).click();

    const form = page.getByTestId("new-project-dialog");
    await expect(form).toBeVisible();
    await expect(form).toContainText("newgame");
    await expect(page.getByTestId("new-project-name")).toHaveValue("newgame");
    await page.getByTestId("new-project-template").selectOption("flappy");
    // 이 웹 엔진 빌드에는 mruby 가 있어 Ruby 를 골라도 안내가 없다
    await page.getByTestId("new-project-language").selectOption("mruby");
    await expect(page.getByTestId("new-project-ruby-note")).toHaveCount(0);
    await page.getByTestId("new-project-language").selectOption("lua");
    await page.getByTestId("new-project-ok").click();

    const tree = page.getByTestId("project-tree");
    await expect(tree.locator('[data-path="game.json"]')).toBeVisible();
    await expect(page.getByTestId("statusbar")).toContainText("newgame");
    await expect(page.getByTestId("statusbar")).toContainText("브라우저 폴더");
    await expect(page.getByTestId("toasts")).toContainText("새 프로젝트: newgame");
    await expect(page.getByTestId("console-list")).toContainText(/새 프로젝트 생성됨: newgame \(플래피버드[^)]*\), lua, 파일 \d+개\)/);
    expect(await pickerCalls(page)).toEqual([PICKER_OPTIONS]);
    expect((await folderRecords(page)).map((r) => r.name)).toEqual(["newgame"]);
    const game = JSON.parse(await readOpfs(page, "newgame/game.json")) as { name: string; script: string; startScene: string };
    expect(game).toMatchObject({ name: "newgame", script: "lua", startScene: "flappy" });
    expect(await readOpfs(page, "newgame/scripts/lua/components/flappy/bird.lua")).toContain("function");
    expect(await readOpfs(page, "newgame/.gitignore")).toContain(".initial-editor/");

    await page.keyboard.press("F5");
    const view = page.getByTestId("game-view");
    await expect(view).toHaveAttribute("data-phase", "running", { timeout: 30_000 });
    const list = page.getByTestId("console-list");
    await expect(list.locator(".console-row", { hasText: "flappy:state:ready" })).toHaveCount(1, { timeout: 15_000 });
    await expect(list).not.toContainText("Lua error");
    await page.keyboard.press("Shift+F5");
    await expect(view).toHaveAttribute("data-phase", "ended", { timeout: 10_000 });
    expect(browser.isConnected()).toBe(true);
  });

  test("샘플을 연 채로 파일 > 새 프로젝트: 비어 있지 않은 폴더는 한 번 묻고, 있는 파일은 두고 없는 것만 만든 뒤 브라우저 폴더로 바꿔 연다", async ({ context, page }) => {
    await context.addInitScript(PICKER_STUB);
    await page.goto("/?backend=browser");
    const welcome = await expectBrowserWelcome(page);
    await writeOpfs(page, { "notes.txt": "메모\n", "scripts/lua/main.lua": "-- 내 것\n" }, "mine");
    await welcome.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("statusbar")).toContainText("memory://sample");

    await page.evaluate(() => ((window as unknown as PickerWindow).__pick = "mine"));
    await openMenu(page, "파일", "새 프로젝트");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("폴더가 비어 있지 않음 (항목 2개)");
    await dialog.getByRole("button", { name: "만들기" }).click();
    await expect(page.getByTestId("new-project-dialog")).toBeVisible();
    await page.getByTestId("new-project-ok").click();

    await expect(page.getByTestId("statusbar")).toContainText("mine");
    await expect(page.getByTestId("statusbar")).toContainText("브라우저 폴더");
    await expect(page.getByTestId("console-list")).toContainText("백엔드 교체: browser");
    expect(await readOpfs(page, "mine/scripts/lua/main.lua")).toBe("-- 내 것\n");
    expect(await readOpfs(page, "mine/notes.txt")).toBe("메모\n");
    expect(JSON.parse(await readOpfs(page, "mine/game.json"))).toMatchObject({ name: "mine", script: "lua", startScene: "main" });
    expect(await pickerCalls(page)).toEqual([PICKER_OPTIONS]);
  });

  test("웹 엔진에 mruby 가 없으면 새 프로젝트 대화상자에서 Ruby 를 고를 때 안내가 뜬다. 취소하면 폴더에 쓰지도 기억하지도 않는다", async ({ context, page }) => {
    await withoutMruby(page);
    await context.addInitScript(PICKER_STUB);
    await page.goto("/?backend=browser");
    await expectBrowserWelcome(page);
    await page.evaluate(() => ((window as unknown as PickerWindow).__pick = "rubygame"));
    await page.keyboard.press("ControlOrMeta+n");
    await expect(page.getByTestId("new-project-dialog")).toBeVisible();
    await expect(page.getByTestId("new-project-ruby-note")).toHaveCount(0);
    await page.getByTestId("new-project-language").selectOption("mruby");
    await expect(page.getByTestId("new-project-ruby-note")).toHaveText(WEB_NO_RUBY);
    await page.getByTestId("new-project-dialog").getByRole("button", { name: "취소" }).click();
    await expect(page.getByTestId("new-project-dialog")).toHaveCount(0);
    const names = await page.evaluate(async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("rubygame");
      const out: string[] = [];
      for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) out.push(name);
      return out;
    });
    expect(names).toEqual([]);
    expect(await folderRecords(page)).toEqual([]);
    await expect(page.getByTestId("welcome")).toContainText("최근 폴더 없음");
  });

  test("폴더 열기가 없는 브라우저의 웹판은 새 프로젝트가 꺼져 있고 이유를 보인다", async ({ context, page }) => {
    await context.addInitScript(() => {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    });
    await page.goto("/?backend=browser");
    const welcome = await expectBrowserWelcome(page);
    const button = welcome.getByRole("button", { name: "새 프로젝트", exact: true });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("title", "이 브라우저는 폴더 열기를 지원하지 않습니다 (크롬과 엣지에서 지원합니다)");
    expect(await page.evaluate(() => (window as unknown as { initialEditor: { commands: { isEnabled(id: string): boolean } } }).initialEditor.commands.isEnabled("file.newProject"))).toBe(false);
  });
});

test.describe("배포 웹판의 메모리 샘플 (폴더 열기가 없는 브라우저)", () => {
  test("로컬이 아닌 주소에서 폴더 열기가 없으면 메모리로 시작하고, 샘플 프로젝트 열기도 샘플 맵과 안내를 띄운다", async ({ context, page, baseURL }) => {
    await context.addInitScript(() => {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    });
    // *.localhost 는 크롬이 루프백으로 풀지만 앱의 isLocalHost 는 로컬로 보지 않는다 (배포된 페이지처럼 시작한다)
    const deployed = new URL(baseURL!);
    deployed.hostname = "pages.localhost";
    await page.goto(deployed.href);
    const welcome = page.getByTestId("welcome");
    await expect(welcome).toContainText("메모리 모드.");
    await expect(welcome).toContainText("이 브라우저는 폴더 열기를 지원하지 않아 샘플 프로젝트로 시작했습니다");
    await expect(page.getByTestId("welcome-edition")).toHaveText("데스크톱 앱 받기");
    await welcome.getByRole("button", { name: "샘플 프로젝트 열기" }).click();
    await expect(page.getByTestId("doc-tab").filter({ hasText: "meadow.json" })).toBeVisible();
    await expect(page.getByTestId("toasts")).toContainText(SAMPLE_MAP_HINT);
    expect(await page.evaluate(() => (window as unknown as { initialEditor: { commands: { isEnabled(id: string): boolean } } }).initialEditor.commands.isEnabled("file.newProject"))).toBe(false);
  });
});
