#!/usr/bin/env node
// 빌드한 앱의 자가 검사를 로컬에서 (docs/plans/e6-packaging.md 5절). CI 의 release.yml 도 같은 스크립트로 앱을 띄운다.
//
//   yarn selftest:app <InitialEditor.app | 실행 파일 | AppImage> [--embedded] [--forest <엔진 저장소>] [--os <mac|linux|windows|local>]
//                     [--work <workDir>] [--total-timeout <ms>]
//   yarn selftest:app <앱> --plan <plan.json> [--no-check]      이미 만든 계획으로 띄우기만 (CI 가 판정을 따로 돈다)
//
// 기본 계획은 local 이다: 플래피 Lua 와 Ruby, 타일맵을 앱에 든 엔진으로 프로세스 방식으로만 돌리고 창을 숨긴다 (창도 게임 창도
// 뜨지 않는다. 엔진은 SDL_VIDEODRIVER=dummy). --embedded 는 에디터 안 실행을 더해 창이 뜬다. --forest 는 엔진 저장소의 숲을
// 맵 뷰로 열어 게임 화면과 견준다.
// 작업 폴더는 매번 새 임시 폴더(<tmp>/i2d-selftest-<시각>)이고 지우지 않는다. 앱이 끝나면(또는 전체 시간 + 60초 뒤 끊으면)
// scripts/selftest-check.mjs 로 판정한다. 종료 코드는 판정의 것 (--no-check 면 앱의 것).

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { main as checkMain } from "./selftest-check.mjs";
import { OSES, SELFTEST_ENV, writePlan } from "./selftest-plan.mjs";

const KILL_GRACE_MS = 60_000;

/** .app 이면 Contents/MacOS 안의 메인 실행 파일, 아니면 그대로 */
export function resolveApp(target) {
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) throw new Error(`앱이 없다: ${abs}`);
  if (fs.statSync(abs).isDirectory()) {
    if (!abs.endsWith(".app")) throw new Error(`.app 폴더나 실행 파일을 준다: ${abs}`);
    const plist = path.join(abs, "Contents", "Info.plist");
    const text = fs.existsSync(plist) ? fs.readFileSync(plist, "utf8") : "";
    const m = /<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/.exec(text);
    const exe = path.join(abs, "Contents", "MacOS", m ? m[1] : path.basename(abs, ".app"));
    if (!fs.existsSync(exe)) throw new Error(`앱의 실행 파일이 없다: ${exe}`);
    return exe;
  }
  return abs;
}

export function parseArgs(argv) {
  const out = { app: null, plan: null, check: true, os: null, embedded: false, forest: null, work: null, totalTimeout: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v) throw new Error(`${a} 에 값이 없다`);
      return v;
    };
    if (a === "--plan") out.plan = path.resolve(value());
    else if (a === "--no-check") out.check = false;
    else if (a === "--os") out.os = value();
    else if (a === "--embedded") out.embedded = true;
    else if (a === "--forest") out.forest = path.resolve(value());
    else if (a === "--work") out.work = path.resolve(value());
    else if (a === "--total-timeout") out.totalTimeout = Number(value());
    else if (a.startsWith("--")) throw new Error(`모르는 인자: ${a}`);
    else if (!out.app) out.app = a;
    else throw new Error(`남는 인자: ${a}`);
  }
  if (!out.app) throw new Error("앱 경로가 없다");
  if (out.os && !OSES.includes(out.os)) throw new Error(`--os 는 ${OSES.join(", ")} 중 하나다`);
  if (out.plan && (out.os || out.embedded || out.forest || out.work || out.totalTimeout)) throw new Error("--plan 과 계획 인자(--os, --embedded, --forest, --work, --total-timeout)는 같이 주지 않는다");
  if (out.totalTimeout !== null && !(Number.isInteger(out.totalTimeout) && out.totalTimeout > 0)) throw new Error("--total-timeout 은 양의 정수다");
  return out;
}

/** 앱을 계획으로 띄우고 끝나기를 기다린다. 돌려주는 것은 종료 코드 (끊었으면 null) */
export function runApp(exe, planPath, totalTimeoutMs, deps = {}) {
  const log = deps.log ?? console.log;
  return new Promise((resolve, reject) => {
    const env = { ...process.env, [SELFTEST_ENV]: planPath };
    delete env.INITIAL_EDITOR_OPEN;
    const child = (deps.spawn ?? spawn)(exe, [], { env, stdio: ["ignore", "inherit", "inherit"] });
    const timer = setTimeout(() => {
      log(`앱이 ${totalTimeoutMs + KILL_GRACE_MS} ms 안에 끝나지 않아 끊는다`);
      child.kill("SIGKILL");
    }, totalTimeoutMs + KILL_GRACE_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (signal) log(`앱이 시그널 ${signal} 로 끝났다`);
      resolve(code);
    });
  });
}

export async function main(argv, deps = {}) {
  const log = deps.log ?? console.log;
  const err = deps.error ?? console.error;
  let args;
  let exe;
  try {
    args = parseArgs(argv);
    exe = resolveApp(args.app);
  } catch (e) {
    err(`selftest-app: ${e.message}`);
    err("사용법: selftest-app.mjs <앱> [--embedded] [--forest <엔진 저장소>] [--os <mac|linux|windows|local>] | <앱> --plan <plan.json> [--no-check]");
    return 2;
  }
  let planPath = args.plan;
  let plan;
  try {
    if (!planPath) {
      const base = fs.mkdtempSync(path.join(os.tmpdir(), `i2d-selftest-${new Date().toISOString().replace(/[:.]/g, "-")}-`));
      planPath = path.join(base, "plan.json");
      plan = writePlan({ os: args.os ?? "local", work: args.work ?? path.join(base, "run"), out: planPath, embedded: args.embedded, forest: args.forest, totalTimeout: args.totalTimeout });
    } else plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  } catch (e) {
    err(`selftest-app: ${e.message}`);
    return 2;
  }
  log(`자가 검사: ${exe}`);
  log(`  계획 ${planPath} (창 ${plan.showWindow ? "보임" : "숨김"}, 프로젝트 ${plan.projects.map((p) => p.id).join(", ")})`);
  log(`  작업 폴더 ${plan.workDir}`);
  let code;
  try {
    code = await (deps.runApp ?? runApp)(exe, planPath, plan.totalTimeoutMs, { log });
  } catch (e) {
    err(`selftest-app: 앱을 띄우지 못했다: ${e.message}`);
    return 1;
  }
  log(`앱 종료 코드 ${code}`);
  if (!args.check) return code === 0 ? 0 : 1;
  const judged = await (deps.check ?? checkMain)(["--plan", planPath], { log, error: err });
  log(`작업 폴더를 남겼다: ${plan.workDir}`);
  return judged;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main(process.argv.slice(2)));
}
