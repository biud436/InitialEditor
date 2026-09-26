import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freePort, GAME_JSON, makeTempProject, startBridge } from "./project";

let dir = "";

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "initial-editor-project-unit-"));
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** 가짜 엔진 저장소: resources, scripts, 그리고 복사하지 않을 build */
function fakeEngine(): string {
  const engine = mkdtempSync(path.join(dir, "engine-"));
  mkdirSync(path.join(engine, "resources", "maps"), { recursive: true });
  mkdirSync(path.join(engine, "scripts", "lua"), { recursive: true });
  mkdirSync(path.join(engine, "build"), { recursive: true });
  writeFileSync(path.join(engine, "resources", "maps", "a.json"), '{ "version": 2 }\n');
  writeFileSync(path.join(engine, "scripts", "lua", "main.lua"), "function init() end\n");
  writeFileSync(path.join(engine, "build", "Initial2D"), "binary");
  return engine;
}

/** 가짜 브리지: --port로 듣고 /api/health에 받은 인수를 돌려준다 */
const FAKE_BRIDGE = `
const http = require("node:http");
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]);
http.createServer((req, res) => {
  if (req.url === "/api/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, args }));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(port, "127.0.0.1");
`;

function script(name: string, body: string): string {
  const p = path.join(dir, name);
  writeFileSync(p, body);
  return p;
}

describe("makeTempProject", () => {
  it("project/ 에 resources와 scripts를 복사하고 game.json(lua)을 쓴다. dispose는 통째로 지운다", () => {
    const engine = fakeEngine();
    const tmp = makeTempProject(engine, { prefix: "initial-editor-unit-copy-" });
    try {
      expect(path.dirname(tmp.project)).toBe(tmp.root);
      expect(readdirSync(tmp.project).sort()).toEqual(["game.json", "resources", "scripts"]);
      expect(readFileSync(path.join(tmp.project, "resources", "maps", "a.json"), "utf8")).toBe('{ "version": 2 }\n');
      expect(readFileSync(path.join(tmp.project, "scripts", "lua", "main.lua"), "utf8")).toBe("function init() end\n");
      const game = readFileSync(path.join(tmp.project, "game.json"), "utf8");
      expect(game.endsWith("}\n")).toBe(true);
      expect(JSON.parse(game)).toEqual(GAME_JSON);
      expect(GAME_JSON.script).toBe("lua");
      // 사본을 고쳐도 원본은 그대로다
      writeFileSync(path.join(tmp.project, "resources", "maps", "a.json"), "changed");
      expect(readFileSync(path.join(engine, "resources", "maps", "a.json"), "utf8")).toBe('{ "version": 2 }\n');
    } finally {
      tmp.dispose();
    }
    expect(existsSync(tmp.root)).toBe(false);
  });

  it("복사할 폴더가 없으면 예외이고 임시 폴더를 남기지 않는다", () => {
    const prefix = "initial-editor-unit-missing-";
    const before = readdirSync(tmpdir()).filter((n) => n.startsWith(prefix)).length;
    expect(() => makeTempProject(path.join(dir, "no-engine"), { prefix })).toThrow();
    expect(readdirSync(tmpdir()).filter((n) => n.startsWith(prefix)).length).toBe(before);
  });
});

describe("freePort", () => {
  it("루프백에서 바로 쓸 수 있는 포트", async () => {
    const port = await freePort();
    expect(Number.isInteger(port) && port > 0 && port < 65536).toBe(true);
    await new Promise<void>((resolve, reject) => {
      const srv = net.createServer();
      srv.on("error", reject);
      srv.listen(port, "127.0.0.1", () => srv.close(() => resolve()));
    });
  });
});

describe("startBridge", () => {
  it("--project, --port, --quiet로 띄우고 health를 기다리며, stop은 프로세스를 끝낸다", async () => {
    const port = await freePort();
    const bridge = await startBridge({ serverScript: script("fake-bridge.cjs", FAKE_BRIDGE), project: "/some/project", port });
    try {
      expect(bridge.url).toBe(`http://127.0.0.1:${port}`);
      const health = (await (await fetch(`${bridge.url}/api/health`)).json()) as { args: string[] };
      expect(health.args).toEqual(["--project", "/some/project", "--port", String(port), "--quiet"]);
      expect(bridge.exited()).toBe(false);
    } finally {
      await bridge.stop();
    }
    expect(bridge.exited()).toBe(true);
    await bridge.stop();
  });

  it("서버가 먼저 끝나면 그 출력과 함께 거부한다", async () => {
    const serverScript = script("dying-bridge.cjs", 'console.error("포트를 쓸 수 없다"); process.exit(1);');
    await expect(startBridge({ serverScript, project: dir, port: await freePort() })).rejects.toThrow(/먼저 끝났다: 포트를 쓸 수 없다/);
  });

  it("시간 안에 뜨지 않으면 끝내고 거부한다", async () => {
    const serverScript = script("silent-bridge.cjs", "setInterval(() => {}, 1000);");
    await expect(startBridge({ serverScript, project: dir, port: await freePort(), timeoutMs: 400 })).rejects.toThrow(/뜨지 않았다/);
  });
});
