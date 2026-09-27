#!/usr/bin/env node
// 번들 안 사이드카 검사 (docs/plans/e6-packaging.md 4.1 절의 bundle 잡, 4.3 절). 앱에 실린 엔진이 자립 실행 파일이고
// 핀의 커밋에서 왔는지 본다. 엔진 저장소의 tools/check_dist.sh 와 같은 기준을 번들 안의 파일에 다시 댄다.
//
//   node scripts/check-sidecar.mjs <InitialEditor.app | 사이드카 실행 파일 | 그것이 든 폴더> [--engine-json <경로> | --no-engine-json] [--any-commit]
//
// engine.json 은 .app 이면 Contents/Resources/engine/, 파일이나 폴더면 그 옆의 engine/ 과 그 옆(yarn engine:fetch 가 쓰는
// src-tauri/binaries/engine.json)에서 찾는다. 없으면 실패다 (앱에 싣는 사이드카는 늘 engine.json 과 함께다). 엔진 실행 파일만
// 볼 때(엔진의 dist/ 등)는 --no-engine-json 으로 그 검사를 뺀다고 밝힌다.
//
// 보는 것:
//   1. 동적 의존: macOS 는 otool -L 이 /usr/lib/ 와 /System/Library/ 뿐, minos 11.0, arm64, codesign --verify.
//      Linux 는 ldd 가 glibc 계열과 libstdc++, libgcc_s 뿐이고 not found 가 없다
//   2. --features 에 lua 와 mruby
//   3. --version 이 `Initial2D <describe> <커밋 40자>` 이고 커밋이 핀(engine-pin.json)과, 있으면 engine.json 과 같다
//   4. --bogus 가 종료 코드 2 (모르는 인자에 게임을 띄우지 않는다)
//   5. 세 실행 모두 버리는 작업 폴더에 아무것도 쓰지 않는다
// 실행은 모두 임시 작업 폴더에서 시간 제한(20초)과 SDL_VIDEODRIVER=dummy, SDL_AUDIODRIVER=dummy, INITIAL2D_EXIT_AFTER=30 으로 한다.
// engine.json 의 sha256 과 다르면 INFO 로만 알린다 (번들러가 사이드카를 다시 서명하면 바이트가 바뀐다).
// 종료 코드: 0 통과, 1 실패, 2 인자 오류.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION_RE, readJson, sha256File } from "./lib/engineDist.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUN_TIMEOUT_MS = 20_000;
export const USAGE = "사용법: check-sidecar.mjs <InitialEditor.app | 사이드카 | 폴더> [--engine-json <경로> | --no-engine-json] [--any-commit]";
/** Linux ldd 의 허용 목록 (tools/check_dist.sh 와 같다) */
export const LINUX_ALLOWED = [/^linux-vdso\.so/, /^libc\.so/, /^libm\.so/, /^libdl\.so/, /^libpthread\.so/, /^librt\.so/, /^ld-linux/, /^\/lib.*\/ld-linux/, /^libstdc\+\+\.so/, /^libgcc_s\.so/];

/** otool -L 의 라이브러리 경로들 (첫 줄은 파일 이름이라 뺀다) */
export function parseOtoolL(text) {
  return text
    .split("\n")
    .slice(1)
    .map((l) => l.trim().replace(/\s+\(compatibility.*$/, ""))
    .filter(Boolean);
}

/** macOS 의존 가운데 허용 밖 (Homebrew 등) */
export function macDepProblems(libs) {
  return libs.filter((l) => !l.startsWith("/usr/lib/") && !l.startsWith("/System/Library/"));
}

/** otool -l 의 LC_BUILD_VERSION minos (없으면 LC_VERSION_MIN_MACOSX 의 version) */
export function parseMinos(text) {
  const m = /\bminos\s+(\S+)/.exec(text) ?? /LC_VERSION_MIN_MACOSX[\s\S]*?\bversion\s+(\S+)/.exec(text);
  return m ? m[1] : null;
}

/** ldd 의 라이브러리 이름들과 not found 인 것 */
export function parseLdd(text) {
  const libs = [];
  const missing = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const name = line.split(/\s+/)[0];
    libs.push(name);
    if (/not found/.test(line)) missing.push(name);
  }
  return { libs, missing };
}

export function linuxDepProblems(libs) {
  return libs.filter((l) => !LINUX_ALLOWED.some((re) => re.test(l)));
}

/**
 * 앱 번들이나 폴더에서 사이드카와 engine.json 을 찾는다. looked 는 engine.json 을 찾아본 곳 (없을 때 알린다).
 * 파일이나 폴더면 옆의 engine/engine.json(개발 빌드의 target/debug/) 다음에 옆의 engine.json(yarn engine:fetch 의 binaries/)
 */
export function locate(target, engineJson) {
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) return { error: `없다: ${abs}` };
  let exe = abs;
  let looked;
  if (fs.statSync(abs).isDirectory()) {
    if (abs.endsWith(".app")) {
      exe = path.join(abs, "Contents", "MacOS", "Initial2D");
      looked = [path.join(abs, "Contents", "Resources", "engine", "engine.json")];
    } else {
      exe = ["Initial2D", "Initial2D.exe"].map((n) => path.join(abs, n)).find((p) => fs.existsSync(p)) ?? path.join(abs, "Initial2D");
      looked = [path.join(abs, "engine", "engine.json"), path.join(abs, "engine.json")];
    }
  } else {
    looked = [path.join(path.dirname(abs), "engine", "engine.json"), path.join(path.dirname(abs), "engine.json")];
  }
  if (engineJson) looked = [path.resolve(engineJson)];
  if (!fs.existsSync(exe)) return { error: `사이드카가 없다: ${exe}` };
  return { exe, meta: looked.find((p) => fs.existsSync(p)) ?? null, looked };
}

function defaultTool(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: RUN_TIMEOUT_MS });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? (r.error ? String(r.error.message) : "") };
}

/** 엔진을 버리는 작업 폴더에서 한 번 돌린다. 끝난 뒤 그 폴더에 생긴 이름들도 준다 */
function runEngine(exe, arg) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "check-sidecar-"));
  try {
    const r = spawnSync(exe, [arg], {
      cwd: work,
      encoding: "utf8",
      timeout: RUN_TIMEOUT_MS,
      // 인자를 모르는 옛 엔진이 게임을 띄워도 창 없이 곧 끝나게
      env: { ...process.env, SDL_VIDEODRIVER: "dummy", SDL_AUDIODRIVER: "dummy", INITIAL2D_EXIT_AFTER: "30" },
    });
    return { status: r.status, timedOut: r.error?.code === "ETIMEDOUT", stdout: r.stdout ?? "", stderr: r.stderr ?? "", left: fs.readdirSync(work) };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * @param {string[]} argv
 * @param {{ repo?: string, platform?: string, tool?: typeof defaultTool, log?: (s: string) => void }} deps
 * @returns {number} 종료 코드
 */
export function main(argv, deps = {}) {
  const repo = deps.repo ?? REPO;
  const log = deps.log ?? ((s) => console.log(s));
  const tool = deps.tool ?? defaultTool;
  const platform = deps.platform ?? process.platform;
  let target = null;
  let engineJson = null;
  let noEngineJson = false;
  let anyCommit = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--any-commit") anyCommit = true;
    else if (a === "--no-engine-json") noEngineJson = true;
    else if (a === "--engine-json") {
      engineJson = argv[++i];
      if (!engineJson) {
        log(`--engine-json 에 경로가 없다\n${USAGE}`);
        return 2;
      }
    } else if (!a.startsWith("--") && !target) target = a;
    else {
      log(`모르는 인자: ${a}\n${USAGE}`);
      return 2;
    }
  }
  if (!target || (engineJson && noEngineJson)) {
    log(USAGE);
    return 2;
  }
  const where = locate(target, engineJson);
  if (where.error) {
    log(where.error);
    return 1;
  }
  const { exe, meta, looked } = where;
  const pin = readJson(path.join(repo, "engine-pin.json"));
  const metaData = meta ? readJson(meta) : null;
  let failed = 0;
  const pass = (s) => log(`  PASS  ${s}`);
  const info = (s) => log(`  INFO  ${s}`);
  const bad = (s) => {
    failed++;
    log(`  FAIL  ${s}`);
  };
  log(`사이드카: ${exe}`);
  log(`engine.json: ${meta ?? (noEngineJson ? "(보지 않는다, --no-engine-json)" : "(없음)")}`);
  if (!meta && !noEngineJson) {
    bad(
      `engine.json 이 없다 (찾아본 곳: ${looked.join(", ")}). yarn engine:fetch 는 사이드카 옆에, 번들은 Resources/engine/ 에 싣는다. ` +
        "다른 곳이면 --engine-json <경로>, 엔진 실행 파일만 볼 때는 --no-engine-json",
    );
  }

  log("[의존]");
  if (platform === "darwin") {
    const libs = parseOtoolL(tool("otool", ["-L", exe]).stdout);
    const extra = macDepProblems(libs);
    if (libs.length === 0) bad("otool -L 이 아무것도 내지 않았다");
    else if (extra.length) bad(`허용 밖 의존: ${extra.join(", ")}`);
    else pass(`otool -L: ${libs.length}개, /usr/lib/ 와 /System/Library/ 뿐`);
    const minos = parseMinos(tool("otool", ["-l", exe]).stdout);
    if (minos === "11.0") pass("minos 11.0");
    else bad(`minos 가 11.0 이 아니다 (${minos ?? "없음"})`);
    const archs = tool("lipo", ["-archs", exe]).stdout.trim().split(/\s+/);
    if (archs.includes("arm64")) pass(`lipo -archs: ${archs.join(" ")}`);
    else bad(`arm64 가 아니다 (${archs.join(" ") || "없음"})`);
    const sign = tool("codesign", ["--verify", exe]);
    if (sign.status === 0) pass("codesign --verify");
    else bad(`codesign --verify 실패: ${sign.stderr.trim()}`);
  } else if (platform === "linux") {
    const ldd = tool("ldd", [exe]);
    const { libs, missing } = parseLdd(ldd.stdout);
    const extra = linuxDepProblems(libs);
    if (ldd.status !== 0 || libs.length === 0) bad(`ldd 실패: ${ldd.stderr.trim()}`);
    else if (missing.length) bad(`not found: ${missing.join(", ")}`);
    else if (extra.length) bad(`허용 밖 의존: ${extra.join(", ")}`);
    else pass(`ldd: ${libs.join(" ")}`);
  } else {
    info(`${platform} 의 의존 검사는 없다`);
  }

  log("[인자]");
  const features = runEngine(exe, "--features");
  const words = features.stdout.trim().split(/\s+/).filter(Boolean);
  if (features.status !== 0) bad(`--features 종료 코드 ${features.status}${features.timedOut ? " (시간 초과)" : ""}`);
  else if (words.includes("lua") && words.includes("mruby")) pass(`--features: ${words.join(" ")}`);
  else bad(`--features 에 lua 와 mruby 가 없다 (${words.join(" ") || "빈 출력"})`);

  const version = runEngine(exe, "--version");
  const m = VERSION_RE.exec(version.stdout.trim());
  if (version.status !== 0 || !m) bad(`--version 의 모양이 다르다 (종료 코드 ${version.status}): ${version.stdout.trim() || version.stderr.trim()}`);
  else {
    const [, describe, commit] = m;
    pass(`--version: ${describe} ${commit}`);
    if (describe.endsWith("-dirty")) info("커밋 안 된 변경이 있는 엔진이다");
    if (commit === pin.engineCommit) pass(`커밋이 핀과 같다 (${commit.slice(0, 7)})`);
    else if (anyCommit) info(`커밋이 핀(${pin.engineCommit.slice(0, 7)})과 다르다 (--any-commit)`);
    else bad(`커밋 ${commit.slice(0, 7)} 이 핀 ${pin.engineCommit.slice(0, 7)} 과 다르다`);
    if (metaData) {
      if (metaData.engineCommit === commit) pass("커밋이 engine.json 과 같다");
      else bad(`engine.json 의 커밋 ${String(metaData.engineCommit).slice(0, 7)} 이 실행 파일과 다르다`);
    }
  }

  const bogus = runEngine(exe, "--bogus");
  if (bogus.status === 2 && bogus.stdout.trim() === "") pass("--bogus: 종료 코드 2, 사용법은 stderr 에만");
  else bad(`--bogus: 종료 코드 ${bogus.status}${bogus.timedOut ? " (시간 초과, 게임을 띄웠다)" : ""}`);

  const left = [...features.left, ...version.left, ...bogus.left];
  if (left.length === 0) pass("작업 폴더에 아무것도 쓰지 않았다");
  else bad(`작업 폴더에 썼다: ${[...new Set(left)].join(", ")}`);

  if (metaData) {
    const got = sha256File(exe);
    if (got === metaData.sha256) pass("sha256 이 engine.json 과 같다");
    else info(`sha256 이 engine.json 과 다르다 (번들러가 다시 서명했을 수 있다): ${got}`);
  }

  log(failed ? `check-sidecar: ${failed}건 실패` : "check-sidecar: 전부 통과");
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
