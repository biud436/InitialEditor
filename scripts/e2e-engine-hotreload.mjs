#!/usr/bin/env node
// 진짜 엔진과의 핫 리로드 교차 검사 (docs/plans/e1-scripting.md 검수 "교차"). Playwright 의 브라우저 모드는 프로세스를
// 못 띄우므로 Node 에서 직접 한다.
//
//   yarn test:engine                         엔진 저장소는 INITIAL2D_DIR (기본 ../Initial2D)
//   INITIAL2D_DIR=/path/to/Initial2D node scripts/e2e-engine-hotreload.mjs
//
// 하는 일:
//   1. <엔진>/build/Initial2D 를 헤드리스로 띄운다 (INITIAL2D_HMR=1, INITIAL2D_EXIT_AFTER=3000, SDL_VIDEODRIVER=dummy,
//      작업 폴더는 엔진 저장소. 그래서 게임은 알데바란이다)
//   2. "HotReload: listening" 이 찍히면 엔진의 인코더(tools/bridge/lib/hmr.js, I2DH)로 묶음을 127.0.0.1:5959 에 push 한다.
//      엔진은 받은 파일을 작업 폴더에 그대로 쓰므로 디스크에 있는 바이트를 그대로 되보낸다 (저장소가 바뀌지 않는다)
//   3. "HotReload: reloaded with N files" 가 찍히는지 본다. 그 뒤 엔진을 끈다 (EXIT_AFTER 는 안전장치)
// 엔진 실행 파일이 없으면 건너뛰고 0 으로 끝난다.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? path.join(here, "..", "..", "Initial2D"));
const exe = path.join(engineDir, "build", process.platform === "win32" ? "Initial2D.exe" : "Initial2D");
const hmrLib = path.join(engineDir, "tools", "bridge", "lib", "hmr.js");
const HMR_PORT = Number(process.env.INITIAL2D_HMR_PORT ?? 5959);
const LISTEN_TIMEOUT_MS = 20_000;
const RELOAD_TIMEOUT_MS = 20_000;
const BUNDLE_PATHS = ["scripts/lua/main.lua", "scripts/lua/bgm.lua"];

function skip(reason) {
  console.log(`SKIP: ${reason}`);
  process.exit(0);
}

if (!fs.existsSync(exe)) skip(`엔진 실행 파일 없음: ${exe} (INITIAL2D_DIR로 저장소 위치 지정 또는 cmake로 빌드)`);
if (!fs.existsSync(hmrLib)) skip(`엔진의 HMR 인코더 없음: ${hmrLib}`);

const { pushBundle } = await import(pathToFileURL(hmrLib).href);

const files = BUNDLE_PATHS.filter((p) => fs.existsSync(path.join(engineDir, p))).map((p) => ({ path: p, data: fs.readFileSync(path.join(engineDir, p)) }));
if (files.length === 0) skip(`HMR 번들에 포함할 스크립트 없음: ${BUNDLE_PATHS.join(", ")}`);

const env = {
  ...process.env,
  INITIAL2D_HMR: "1",
  INITIAL2D_EXIT_AFTER: "3000",
  SDL_VIDEODRIVER: "dummy",
  SDL_AUDIODRIVER: "dummy",
};
console.log(`엔진: ${exe}`);
console.log(`작업 폴더: ${engineDir}`);
const child = spawn(exe, [], { cwd: engineDir, env, stdio: ["ignore", "pipe", "pipe"] });

const lines = [];
const waiters = [];
function onLine(stream, line) {
  lines.push(`[${stream}] ${line}`);
  for (const w of [...waiters]) {
    if (w.pattern.test(line)) {
      waiters.splice(waiters.indexOf(w), 1);
      w.resolve(line);
    }
  }
}
function pump(stream, name) {
  let rest = "";
  stream.on("data", (chunk) => {
    rest += chunk.toString("utf8");
    let i;
    while ((i = rest.indexOf("\n")) >= 0) {
      onLine(name, rest.slice(0, i).replace(/\r$/, ""));
      rest = rest.slice(i + 1);
    }
  });
  stream.on("end", () => {
    if (rest) onLine(name, rest);
  });
}
pump(child.stdout, "out");
pump(child.stderr, "err");

let exited = null;
const exitPromise = new Promise((resolve) => {
  child.on("exit", (code, signal) => {
    exited = { code, signal };
    resolve(exited);
  });
});

function waitFor(pattern, timeoutMs, what) {
  return new Promise((resolve, reject) => {
    const hit = lines.find((l) => pattern.test(l));
    if (hit) return resolve(hit);
    const timer = setTimeout(() => {
      waiters.splice(waiters.findIndex((w) => w.resolve === done), 1);
      reject(new Error(`${what} 대기 시간 초과 (${timeoutMs}ms)`));
    }, timeoutMs);
    const done = (line) => {
      clearTimeout(timer);
      resolve(line);
    };
    waiters.push({ pattern, resolve: done });
    exitPromise.then((e) => {
      clearTimeout(timer);
      reject(new Error(`${what} 전에 엔진 종료 (code ${e.code}, signal ${e.signal})`));
    });
  });
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  console.error("--- 엔진 출력 ---");
  for (const l of lines) console.error(l);
  if (!exited) child.kill("SIGKILL");
  process.exit(1);
}

try {
  const listening = await waitFor(/HotReload: listening/, LISTEN_TIMEOUT_MS, "HotReload: listening");
  console.log(`엔진: ${listening.replace(/^\[\w+\] /, "")}`);
  const result = await pushBundle({ host: "127.0.0.1", port: HMR_PORT, files, timeoutMs: 10_000 });
  console.log(`push: ${files.length}개 파일 (${files.map((f) => f.path).join(", ")}) → 응답 ${result.reply}`);
  if (!result.ok) throw new Error(`엔진이 push 거부 (응답 ${result.reply})`);
  const reloaded = await waitFor(/HotReload: reloaded with \d+ files/, RELOAD_TIMEOUT_MS, "HotReload: reloaded");
  const count = Number(/reloaded with (\d+) files/.exec(reloaded)[1]);
  console.log(`엔진: ${reloaded.replace(/^\[\w+\] /, "")}`);
  if (count !== files.length) throw new Error(`파일 수 불일치: 전송 ${files.length}, 엔진 ${count}`);
  const failed = lines.find((l) => /HotReload: reload failed|PANIC|uncaught exception/.test(l));
  if (failed) throw new Error(`리로드 후 오류: ${failed}`);
} catch (e) {
  fail(e.message);
}

child.kill("SIGTERM");
const killTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
await exitPromise;
clearTimeout(killTimer);
console.log(`OK: 핫 리로드 완료, 파일 ${files.length}개 (엔진 종료: code ${exited.code}, signal ${exited.signal})`);
