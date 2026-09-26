// 브리지 모드 스모크. 엔진 저장소(INITIAL2D_DIR, 기본 ../Initial2D)의 tools/bridge/server.js 를 임시 프로젝트로 띄우고
// 브라우저가 그 서버로 프로젝트를 여는지 본다. 엔진 저장소가 없으면 건너뛴다.

import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? "../Initial2D");
const serverScript = path.join(engineDir, "tools", "bridge", "server.js");
const PORT = 5961;
const BRIDGE_URL = `http://127.0.0.1:${PORT}`;

async function waitForHealth(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // 아직 안 떴다
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`브리지 서버가 뜨지 않았다: ${url}`);
}

test.describe("브리지 모드", () => {
  test.skip(!existsSync(serverScript), `엔진 저장소가 없다: ${serverScript} (INITIAL2D_DIR 로 위치를 준다)`);

  let proc: ChildProcess | null = null;
  let projectDir = "";

  test.beforeAll(async () => {
    projectDir = mkdtempSync(path.join(tmpdir(), "initial-editor-bridge-"));
    mkdirSync(path.join(projectDir, "scripts", "lua"), { recursive: true });
    mkdirSync(path.join(projectDir, "resources"), { recursive: true });
    writeFileSync(path.join(projectDir, "scripts", "lua", "main.lua"), "function init() end\nfunction update(elapsed) end\nfunction render() end\nfunction destroy() end\n");
    writeFileSync(path.join(projectDir, "game.json"), JSON.stringify({ windowWidth: 768, windowHeight: 896, renderScale: 1, script: "lua" }, null, 2) + "\n");
    proc = spawn(process.execPath, [serverScript, "--project", projectDir, "--port", String(PORT), "--quiet"], { stdio: ["ignore", "pipe", "pipe"] });
    proc.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[bridge] ${chunk}`));
    await waitForHealth(`${BRIDGE_URL}/api/health`);
  });

  test.afterAll(async () => {
    proc?.kill();
    proc = null;
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  test("브리지 서버의 프로젝트가 프로젝트 패널에 보인다", async ({ page }) => {
    await page.goto(`/?backend=bridge&url=${encodeURIComponent(BRIDGE_URL)}`);
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
