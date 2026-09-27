// 엔진 저장소의 사본 프로젝트와 브리지 서버. 테스트는 엔진 저장소를 직접 고치지 않는다.
//   makeTempProject  임시 폴더 아래 project/에 resources와 scripts를 복사하고 game.json을 쓴다.
//                    root에는 프로젝트 밖의 산출물(스크린샷)을 둔다
//   freePort         비어 있는 루프백 포트
//   startBridge      node <server.js> --project <dir> --port <port> --quiet를 띄우고 /api/health를 기다린다

import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net, { type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

export const GAME_JSON = { name: "aldebaran-e2e", windowWidth: 768, windowHeight: 896, renderScale: 1, script: "lua" } as const;

export interface TempProject {
  /** 임시 폴더 (지우는 단위) */
  root: string;
  /** 브리지와 엔진이 보는 프로젝트 폴더 */
  project: string;
  dispose(): void;
}

export function makeTempProject(engineDir: string, opts: { dirs?: readonly string[]; game?: Record<string, unknown>; prefix?: string } = {}): TempProject {
  const root = mkdtempSync(path.join(tmpdir(), opts.prefix ?? "initial-editor-aldebaran-"));
  const project = path.join(root, "project");
  try {
    mkdirSync(project);
    for (const d of opts.dirs ?? ["resources", "scripts"]) cpSync(path.join(engineDir, d), path.join(project, d), { recursive: true });
    writeFileSync(path.join(project, "game.json"), JSON.stringify(opts.game ?? GAME_JSON, null, 2) + "\n");
  } catch (e) {
    rmSync(root, { recursive: true, force: true });
    throw e;
  }
  return { root, project, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

export interface Bridge {
  url: string;
  port: number;
  /** 지금까지의 stdout과 stderr */
  output(): string;
  /** 끝났으면 true */
  exited(): boolean;
  stop(): Promise<void>;
}

function waitExit(proc: ChildProcess, ms: number): Promise<boolean> {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

export async function startBridge(opts: { serverScript: string; project: string; port: number; timeoutMs?: number; node?: string }): Promise<Bridge> {
  const url = `http://127.0.0.1:${opts.port}`;
  const proc = spawn(opts.node ?? process.execPath, [opts.serverScript, "--project", opts.project, "--port", String(opts.port), "--quiet"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  let done = false;
  proc.stdout?.setEncoding("utf8");
  proc.stderr?.setEncoding("utf8");
  proc.stdout?.on("data", (c: string) => (out += c));
  proc.stderr?.on("data", (c: string) => (out += c));
  proc.on("exit", () => (done = true));
  proc.on("error", (e) => {
    done = true;
    out += `\n${e.message}`;
  });
  const bridge: Bridge = {
    url,
    port: opts.port,
    output: () => out,
    exited: () => done,
    async stop() {
      if (done) return;
      proc.kill("SIGTERM");
      if (!(await waitExit(proc, 5_000))) {
        proc.kill("SIGKILL");
        await waitExit(proc, 5_000);
      }
    },
  };
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  while (Date.now() < deadline) {
    if (done) throw new Error(`브리지 서버가 먼저 끝났다: ${out.trim() || "출력 없음"}`);
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return bridge;
    } catch {
      // 아직 안 떴다
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  await bridge.stop();
  throw new Error(`브리지 서버가 뜨지 않았다: ${url} (${out.trim() || "출력 없음"})`);
}
