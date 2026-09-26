// 브리지 모드 스모크. 엔진 저장소(INITIAL2D_DIR, 기본 ../Initial2D)의 tools/bridge/server.js 를 임시 프로젝트로 띄우고
// 브라우저가 그 서버로 프로젝트를 여는지 본다. 엔진 저장소가 없으면 건너뛴다. 포트는 OS가 준 빈 포트다.

import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { freePort, startBridge, type Bridge } from "./support/project";

const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? "../Initial2D");
const serverScript = path.join(engineDir, "tools", "bridge", "server.js");

test.describe("브리지 모드", () => {
  test.skip(!existsSync(serverScript), `엔진 저장소가 없다: ${serverScript} (INITIAL2D_DIR 로 위치를 준다)`);

  let bridge: Bridge | null = null;
  let projectDir = "";

  test.beforeAll(async () => {
    projectDir = mkdtempSync(path.join(tmpdir(), "initial-editor-bridge-"));
    mkdirSync(path.join(projectDir, "scripts", "lua"), { recursive: true });
    mkdirSync(path.join(projectDir, "resources"), { recursive: true });
    writeFileSync(path.join(projectDir, "scripts", "lua", "main.lua"), "function init() end\nfunction update(elapsed) end\nfunction render() end\nfunction destroy() end\n");
    writeFileSync(path.join(projectDir, "game.json"), JSON.stringify({ windowWidth: 768, windowHeight: 896, renderScale: 1, script: "lua" }, null, 2) + "\n");
    bridge = await startBridge({ serverScript, project: projectDir, port: await freePort() });
  });

  test.afterAll(async () => {
    await bridge?.stop();
    bridge = null;
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  test("브리지 서버의 프로젝트가 프로젝트 패널에 보인다", async ({ page }) => {
    await page.goto(`/?backend=bridge&url=${encodeURIComponent(bridge!.url)}`);
    const tree = page.getByTestId("project-tree");
    await expect(tree.locator('[data-path="scripts"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("statusbar")).toContainText("브리지");
    await tree.locator('[data-path="scripts"]').click();
    await expect(tree.locator('[data-path="scripts/lua"]')).toBeVisible();
    await tree.locator('[data-path="scripts/lua"]').click();
    await tree.locator('[data-path="scripts/lua/main.lua"]').dblclick();
    // E1 부터 스크립트는 Monaco 편집기로 열린다
    await expect(page.locator(".monaco-editor .view-lines")).toContainText("function init()");
  });
});
