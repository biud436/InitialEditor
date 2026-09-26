// 엔진 실행 파일을 헤드리스로 띄우고 결과(종료 코드, 로그, 스크린샷)를 모은다.
// 환경 변수는 에디터의 러너처럼 INITIAL2D_SCRIPT 위에 "여기서 실행"의 변수를 덧씌우고, 그 위에 유한 실행과 덤프 변수를 둔다.
// 셸에 남은 INITIAL2D_* 는 지운다 (결과가 실행한 사람의 셸에 따라 달라지지 않게).

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export interface EngineLayout {
  dir: string;
  exe: string;
  bridgeServer: string;
}

/** 엔진 저장소 안의 실행 파일과 브리지 서버 위치 */
export function engineLayout(dir: string, platform: NodeJS.Platform = process.platform): EngineLayout {
  return {
    dir,
    exe: path.join(dir, "build", platform === "win32" ? "Initial2D.exe" : "Initial2D"),
    bridgeServer: path.join(dir, "tools", "bridge", "server.js"),
  };
}

/** 없는 것 목록 (비었으면 실행할 수 있다) */
export function missingFiles(paths: readonly string[]): string[] {
  return paths.filter((p) => !existsSync(p));
}

/** `<exe> --features`가 알리는 기능 (lua, mruby). 답하지 않으면 빈 집합 */
export function probeFeatures(exe: string, timeoutMs = 30_000): Set<string> {
  const r = spawnSync(exe, ["--features"], { encoding: "utf8", timeout: timeoutMs });
  if (r.status !== 0) return new Set();
  return new Set((r.stdout ?? "").split(/\s+/).filter(Boolean));
}

export type ScriptLanguage = "lua" | "mruby";

export interface EngineRunOptions {
  exe: string;
  /** 실행 파일 앞에 붙는 인수 (테스트에서 가짜 엔진을 node 스크립트로 띄울 때) */
  args?: string[];
  cwd: string;
  script: ScriptLanguage;
  /** "여기서 실행"의 환경 변수 */
  playEnv: Record<string, string>;
  exitAfter: number;
  shot?: { dir: string; prefix: string; frame: number };
  timeoutMs?: number;
  baseEnv?: NodeJS.ProcessEnv;
}

export interface EngineRun {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  /** stdout과 stderr를 합친 것 */
  log: string;
  /** 기대한 스크린샷 경로 (shot을 주지 않았으면 null) */
  shot: string | null;
  env: Record<string, string>;
}

/** INITIAL2D_SCREENSHOT의 %04ld가 채워진 파일 이름 */
export function screenshotPath(dir: string, prefix: string, frame: number): string {
  return path.join(dir, `${prefix}_${String(frame).padStart(4, "0")}.bmp`);
}

/** 엔진에 넘길 환경 변수 */
export function engineEnv(opts: Pick<EngineRunOptions, "script" | "playEnv" | "exitAfter" | "shot" | "baseEnv">): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.baseEnv ?? process.env)) {
    if (v === undefined || k.startsWith("INITIAL2D_")) continue;
    env[k] = v;
  }
  env.SDL_VIDEODRIVER = "dummy";
  env.SDL_AUDIODRIVER = "dummy";
  env.INITIAL2D_SCRIPT = opts.script;
  Object.assign(env, opts.playEnv);
  env.INITIAL2D_EXIT_AFTER = String(opts.exitAfter);
  if (opts.shot) {
    env.INITIAL2D_SCREENSHOT = path.join(opts.shot.dir, `${opts.shot.prefix}_%04ld.bmp`);
    env.INITIAL2D_SCREENSHOT_FRAME = String(opts.shot.frame);
  }
  return env;
}

/** 엔진을 띄워 끝날 때까지 기다린다. timeoutMs가 지나면 죽이고 timedOut을 참으로 */
export function runEngine(opts: EngineRunOptions): Promise<EngineRun> {
  const env = engineEnv(opts);
  const shot = opts.shot ? screenshotPath(opts.shot.dir, opts.shot.prefix, opts.shot.frame) : null;
  return new Promise((resolve, reject) => {
    const child = spawn(opts.exe, opts.args ?? [], { cwd: opts.cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (log += c));
    child.stderr.on("data", (c: string) => (log += c));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? 30_000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut, log, shot, env });
    });
  });
}

/** 엔진 테스트와 같은 기준의 오류 줄: iCCP 경고를 빼고 error, panic, uncaught exception */
export function errorLines(log: string): string[] {
  return log
    .split("\n")
    .filter((l) => !/iccp/i.test(l))
    .filter((l) => /error|panic|uncaught exception/i.test(l));
}

/**
 * 엔진의 배치 줄: 알데바란 씬이 INITIAL2D_ALDEBARAN_AT으로 시작할 때마다 찍는다.
 *   "알데바란: 시작 x 1966 (y 304)"                               그 자리에 선 경우
 *   "알데바란: 시작 x 2120 → 2104 (구덩이 위라 가까운 땅으로)"   가까운 땅으로 옮긴 경우
 */
export const PLACEMENT_LINE = /^알데바란: 시작 x (-?\d+(?:\.\d+)?)(?: → (-?\d+(?:\.\d+)?)| \(y (-?\d+(?:\.\d+)?)\))?/;

export interface Placement {
  line: string;
  /** 엔진이 받은 x */
  requested: number;
  /** 엔진이 세운 x (옮기지 않았으면 requested) */
  placed: number;
  /** 그 자리에 선 경우의 y. 옮긴 줄에는 없다 */
  y: number | null;
}

/** 로그의 첫 배치 줄. 없으면 null */
export function parsePlacement(log: string): Placement | null {
  for (const raw of log.split("\n")) {
    const line = raw.trim();
    const m = PLACEMENT_LINE.exec(line);
    if (m) return { line, requested: Number(m[1]), placed: Number(m[2] ?? m[1]), y: m[3] === undefined ? null : Number(m[3]) };
  }
  return null;
}

/** 배치 줄이 아닌 "알데바란:" 줄 (예: 모르는 스테이지). 스테이지를 못 열었다는 뜻이다 */
export function stageProblemLines(log: string): string[] {
  return log
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("알데바란:") && !PLACEMENT_LINE.test(l));
}
