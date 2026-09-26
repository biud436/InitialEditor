// 웹판의 브라우저 폴더 백엔드 e2e (docs/plans/e4-embedded-play.md 웹판). 서버가 필요 없다.
// 진짜 폴더 열기 대화상자는 자동화할 수 없어서 브라우저 전용 저장소(OPFS)를 폴더 대신 쓴다 (?backend=opfs).
// 흐름: OPFS 에 작은 프로젝트를 심고 연다 → 트리 → main.lua 를 고쳐 저장하면 OPFS 에 남는다 →
//       에디터 몰래 OPFS 에 쓴 파일이 3초 안에 트리에 나타나고, 연 문서는 다시 읽힌다.
// 시작 화면(?backend=browser): 폴더 열기 버튼, IndexedDB 에 기억한 폴더 목록과 다시 열기, 샘플로 해 보기.
// Playwright 의 기본 컨텍스트는 시크릿 창과 같은 off-the-record 프로필이라 IndexedDB 에서 폴더 핸들을 꺼내면
// 브라우저 프로세스가 통째로 죽는다. 앱은 그런 곳에서 핸들을 꺼내지 않는다: 기본 컨텍스트에서는 다시 열기와 폴더 열기가
// 폴더 고르기로 돌고 브라우저가 살아 있는지 본다. 핸들을 바로 꺼내는 다시 열기는 일반 프로필(launchPersistentContext)에서
// 짐작을 흉내 내지 않고 진짜 값으로 본다. 폴더 고르기 대화상자는 OPFS 하위 폴더를 돌려주는 가짜로 바꾼다 (PICKER_STUB).

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

/** OPFS 에 파일을 쓴다 (sub 가 있으면 그 하위 폴더에). 에디터를 거치지 않는다 */
async function writeOpfs(page: Page, files: Record<string, string>, sub = "") {
  await page.evaluate(
    async ({ files, sub }) => {
      let root = await navigator.storage.getDirectory();
      if (sub) root = await root.getDirectoryHandle(sub, { create: true });
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
    await expect(page.getByTestId("toasts")).toContainText("저장했다: main.lua");

    const saved = await readOpfs(page, "scripts/lua/main.lua");
    expect(saved.startsWith("-- 웹판에서 고침\n-- 웹판 e2e 진입점\n")).toBe(true);
    expect(saved).not.toContain("\r");

    // 내가 저장한 것은 밖의 변경으로 보지 않는다 (폴링 두 번이 지나도 다시 읽기 알림이 없다)
    await page.waitForTimeout(3200);
    await expect(page.getByTestId("console-list")).not.toContainText("밖에서 바뀌어 다시 읽었다: scripts/lua/main.lua");
  });

  test("에디터 몰래 OPFS 에 쓴 파일이 3초 안에 트리에 나타나고, 연 문서는 다시 읽힌다", async ({ page }) => {
    const tree = await openSeededOpfs(page);
    await tree.locator('[data-path="scripts"]').click();
    await tree.locator('[data-path="scripts/lua"]').click();
    await tree.locator('[data-path="scripts/lua/main.lua"]').dblclick();
    await expect(page.locator(CODE)).toContainText("웹판 e2e 진입점");

    await writeOpfs(page, { "scripts/lua/outside.lua": "-- 밖에서 만듦\n", "notes.txt": "메모\n" });
    await expect(tree.locator('[data-path="scripts/lua/outside.lua"]')).toBeVisible({ timeout: 3000 });
    await expect(tree.locator('[data-path="notes.txt"]')).toBeVisible({ timeout: 3000 });

    await writeOpfs(page, { "scripts/lua/main.lua": "-- 밖에서 바꿈\nfunction init()\nend\n" });
    await expect(page.locator(CODE)).toContainText("밖에서 바꿈", { timeout: 3000 });
    await expect(page.getByTestId("toasts")).toContainText("밖에서 바뀌어 다시 읽었다: main.lua");
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

/**
 * 폴더 고르기 대화상자의 가짜: window.__pick 이름의 OPFS 하위 폴더를 돌려주고, 받은 옵션을 window.__picks 에 남긴다.
 * 페이지를 새로 고치면 __picks 는 비어서 다시 시작한다
 */
const PICKER_STUB = `
  window.__pick = "remembered";
  window.__picks = [];
  window.showDirectoryPicker = async (options) => {
    window.__picks.push(options ?? null);
    return (await navigator.storage.getDirectory()).getDirectoryHandle(window.__pick, { create: true });
  };
`;

type PickerWindow = { __picks: unknown[] };

async function pickerCalls(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (window as unknown as PickerWindow).__picks);
}

const PICKER_OPTIONS = { mode: "readwrite", id: "initial-editor" };
const PRIVATE_NOTICE = "시크릿 창일 수 있어 기억한 폴더를 바로 꺼내지 않는다";
const CRASH_NOTICE = "지난번에 기억한 폴더를 꺼내다 브라우저가 꺼졌다";

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
    await expect(welcome).toContainText("아직 없다");

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
    await welcome.getByRole("button", { name: "샘플로 해 보기" }).click();
    await expect(page.getByTestId("statusbar")).toContainText("memory://sample");
    await expect(tree.locator('[data-path="scripts"]')).toBeVisible();
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
      await expect(welcome).toContainText("아직 없다");
      // 앱의 짐작(profile.ts)이 이 컨텍스트를 일반 프로필로 봐야 이 테스트가 뜻이 있다: 할당량이 힙 한도의 두 배 이상
      const signals = await page.evaluate(async () => ({
        quota: (await navigator.storage.estimate()).quota ?? 0,
        heapLimit: (performance as unknown as { memory?: { jsHeapSizeLimit: number } }).memory?.jsHeapSizeLimit ?? 1024 ** 3,
      }));
      expect(signals.quota, `일반 프로필의 할당량 ${signals.quota} 이 힙 한도 ${signals.heapLimit} 의 두 배보다 작다`).toBeGreaterThanOrEqual(2 * signals.heapLimit);

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
    } finally {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    }
  });
});
