#!/usr/bin/env node
// 안드로이드 스테이징 교차 검사 (docs/plans/e6-packaging.md 6.4). "에디터 명령으로 스테이징한 것만으로 게임이 돈다" 를
// 사람이 아니라 스크립트가 확인한다. 기기와 Gradle 없이, 스테이징한 폴더를 데스크톱 엔진으로 돌린다.
//
//   yarn test:android-stage                          엔진 저장소는 INITIAL2D_DIR (기본 ../Initial2D)
//   INITIAL2D_DIR=/path/to/Initial2D node scripts/e2e-android-stage.mjs
//
// 하는 일:
//   1. 임시 폴더에 플래피(Lua) 새 프로젝트를 템플릿 MANIFEST 대로 쓴다 (scene/projectTemplates.ts 와 같은 규칙). 엔진이
//      실행 때 쓰는 config.setting, 가짜 RTP 변환물(resources/rtp/), 에디터 상태(.initial-editor/)도 둔다
//   2. 엔진 저장소의 android/prepare_assets.sh 를 에디터 명령과 같은 인자로 돌린다: bash <저장소>/android/prepare_assets.sh
//      --project <프로젝트> (src-tauri/src/android.rs 의 stage_args), 작업 폴더는 저장소. 시험이라 --dest <임시 폴더> 만 더한다.
//      먼저 --dry-run 으로 세고(대화상자), 그 수가 스테이징의 수와 같은지 본다
//   3. 마지막 줄 STAGED 를 읽고, 스탬프 파일이 assets_manifest.txt 에 있고, config.setting 과 RTP 변환물과 .initial-editor 가
//      들어가지 않았는지, 목록과 폴더가 같은지 본다
//   4. assets_manifest.txt 대로 다른 임시 폴더에 푼다 (AndroidBootstrap 과 같은 규칙: 줄마다 파일 하나)
//   5. 그 폴더를 작업 폴더로 데스크톱 엔진을 헤드리스로 돌려 플래피 자동 시연 검사를 통과한다
//      (SDL_VIDEODRIVER=dummy, SDL_AUDIODRIVER=dummy, INITIAL2D_AUTOPLAY=1, 900틱 뒤 스스로 끝난다)
//   6. 스크립트 한 파일의 내용만 바꿔 다시 스테이징하면 스탬프가 다르다. 되돌리면 처음 스탬프다
//   7. 대화상자의 체크를 켠 것처럼 --with-rtp 를 더하면 RTP 변환물이 들고 경고 줄이 나온다
// 엔진 저장소에 --project 를 아는 prepare_assets.sh(tools/stage_list.py)나 빌드한 엔진이 없으면 건너뛰고 0 으로 끝난다.
// KEEP_WORKDIR=1 이면 임시 폴더를 남긴다.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const templatesDir = path.join(repo, "packages", "app", "templates");
const manifest = JSON.parse(fs.readFileSync(path.join(templatesDir, "MANIFEST.json"), "utf8"));
const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? path.join(repo, "..", "Initial2D"));
const exe = path.resolve(process.env.INITIAL2D_EXE ?? path.join(engineDir, "build", process.platform === "win32" ? "Initial2D.exe" : "Initial2D"));
const script = path.join(engineDir, "android", "prepare_assets.sh");
const KEEP = process.env.KEEP_WORKDIR === "1";
const EXIT_AFTER = 60000;

function skip(reason) {
  console.log(`SKIP: ${reason}`);
  process.exit(0);
}

if (!fs.existsSync(path.join(engineDir, "tools", "stage_list.py"))) skip(`엔진 저장소의 prepare_assets.sh 가 --project 를 모른다 (tools/stage_list.py 가 없다): ${engineDir}`);
if (!fs.existsSync(exe)) skip(`엔진 실행 파일이 없다: ${exe} (INITIAL2D_DIR 로 저장소 위치를 주거나 cmake 로 빌드한다)`);

const failures = [];
let passes = 0;
function check(name, cond, detail = "") {
  if (cond) {
    passes += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}  ${detail}`);
  }
}

function tail(log, n = 400) {
  return log.slice(-n).replace(/\n/g, " | ");
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "initial-editor-android-"));
const project = path.join(work, "flappy game");
const dest = path.join(work, "assets");
const unpacked = path.join(work, "device");

// ---- 1. 새 플래피 프로젝트 (scene/projectTemplates.ts 와 같은 규칙) ----

function writeProject(dir) {
  const plan = manifest.files.filter((f) => (f.groups.includes("common") || f.groups.includes("flappy")) && (f.language === null || f.language === "lua"));
  const game = { name: "e2e-android", windowWidth: 768, windowHeight: 896, renderScale: 1, script: "lua", startScene: "flappy" };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "game.json"), JSON.stringify(game, null, 2) + "\n");
  const written = ["game.json"];
  for (const f of plan) {
    const to = path.join(dir, f.to);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(templatesDir, f.path), to);
    written.push(f.to);
  }
  fs.writeFileSync(path.join(dir, ".gitignore"), ".initial-editor/\nconfig.setting\n");
  return written.sort();
}

const written = writeProject(project);
// 에디터로 한 번 실행한 프로젝트처럼: 엔진이 쓴 config.setting, 에디터 상태, 그리고 저장소에서 옮겨 온 RTP 변환물
fs.writeFileSync(path.join(project, "config.setting"), `exe=${exe}\ncwd=${project}\n`);
fs.mkdirSync(path.join(project, ".initial-editor"), { recursive: true });
fs.writeFileSync(path.join(project, ".initial-editor", "layout.json"), "{}\n");
fs.mkdirSync(path.join(project, "resources", "rtp", "CharSet"), { recursive: true });
fs.writeFileSync(path.join(project, "resources", "rtp", "CharSet", "hero.png"), "not really a png");
console.log(`프로젝트: ${project} (템플릿 파일 ${written.length}개)`);
console.log(`엔진 저장소: ${engineDir}`);

// ---- 2. 에디터 명령과 같은 인자 ----

/** src-tauri/src/android.rs 의 stage_args 와 같다: 스크립트, --project <프로젝트>, 고른 스위치 */
function editorArgs(withRtp, dryRun) {
  const args = [script, "--project", project];
  if (withRtp) args.push("--with-rtp");
  if (dryRun) args.push("--dry-run");
  return args;
}

function stage({ withRtp = false, dryRun = false, to = dest } = {}) {
  const args = [...editorArgs(withRtp, dryRun), "--dest", to];
  const result = spawnSync("bash", args, { cwd: engineDir, encoding: "utf8", timeout: 120_000 });
  const stdout = (result.stdout ?? "").trimEnd();
  const lines = stdout.split("\n");
  return { result, stdout, stderr: result.stderr ?? "", last: lines[lines.length - 1] ?? "" };
}

const STAGED_RE = /^STAGED files=(\d+) bytes=(\d+) stamp=([0-9a-f]{12}) rtp=(yes|no) dest=(.+)$/;
const DRYRUN_RE = /^DRYRUN files=(\d+) bytes=(\d+) rtp=(yes|no)$/;

console.log("\n[미리 세기]");
const dry = stage({ dryRun: true });
const dm = DRYRUN_RE.exec(dry.last);
check("종료 코드 0", dry.result.status === 0, `${dry.result.status} ${tail(dry.stderr)}`);
check("DRYRUN 줄", dm !== null, dry.last);
check("대상 폴더를 만들지 않는다", !fs.existsSync(dest));

console.log("\n[스테이징]");
const first = stage();
const m = STAGED_RE.exec(first.last);
check("종료 코드 0", first.result.status === 0, `${first.result.status} ${tail(first.stderr)}`);
check("마지막 줄이 STAGED", m !== null, first.last);
const stamp = m?.[3] ?? "";
if (m && dm) {
  check("미리 센 수와 크기가 같다", m[1] === dm[1] && m[2] === dm[2], `${dry.last} / ${first.last}`);
  check("RTP 변환물 없음 (rtp=no)", m[4] === "no" && dm[3] === "no", first.last);
  check("대상 경로", path.resolve(m[5]) === fs.realpathSync(dest) || path.resolve(m[5]) === path.resolve(dest), m[5]);
}
check("RTP 경고 줄이 없다", !first.stdout.includes("WARN rtp"), tail(first.stdout));

const manifestPath = path.join(dest, "assets_manifest.txt");
const listed = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8").split("\n").filter(Boolean) : [];
const stampFile = `assets_stamp/${stamp}.txt`;
check("스탬프 파일이 목록에 있다", stamp !== "" && listed.includes(stampFile) && fs.existsSync(path.join(dest, stampFile)), stampFile);
check("목록 = 템플릿 파일 + 스탬프", JSON.stringify(listed.filter((p) => p !== stampFile)) === JSON.stringify(written), listed.join(", "));
check("config.setting 이 없다", !listed.some((p) => p.endsWith("config.setting")) && !fs.existsSync(path.join(dest, "config.setting")));
check("RTP 변환물이 없다", !listed.some((p) => p.startsWith("resources/rtp/")) && !fs.existsSync(path.join(dest, "resources", "rtp")));
check(".initial-editor 와 점 파일이 없다", !listed.some((p) => p.split("/").some((s) => s.startsWith("."))));
check("STAGED 의 파일 수 = 목록 - 스탬프", m !== null && Number(m[1]) === listed.length - 1, `${m?.[1]} / ${listed.length}`);

// ---- 4. AndroidBootstrap 처럼 풀기 ----

console.log("\n[기기처럼 풀기]");
let unpackOk = true;
for (const rel of listed) {
  const from = path.join(dest, ...rel.split("/"));
  if (!fs.existsSync(from)) {
    unpackOk = false;
    console.log(`  목록에 있지만 없다: ${rel}`);
    continue;
  }
  const to = path.join(unpacked, ...rel.split("/"));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}
check("목록의 파일이 모두 있다 (APK 에서 풀기가 실패하지 않는다)", unpackOk && listed.length > 0);

// ---- 5. 스테이징한 것만으로 게임이 돈다 ----

console.log("\n[데스크톱 엔진으로 플래피]");
const env = {
  ...process.env,
  SDL_VIDEODRIVER: "dummy",
  SDL_AUDIODRIVER: "dummy",
  INITIAL2D_SCRIPT: "lua",
  INITIAL2D_SCENE: "flappy",
  INITIAL2D_EXIT_AFTER: String(EXIT_AFTER),
  INITIAL2D_AUTOPLAY: "1",
};
delete env.INITIAL2D_HMR;
const run = spawnSync(exe, [], { cwd: unpacked, env, encoding: "utf8", timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
const log = (run.stdout ?? "") + (run.stderr ?? "");
const errorLines = log
  .split("\n")
  .filter((l) => !/iccp/i.test(l))
  .filter((l) => /error|panic|uncaught exception|scene: /i.test(l));
check("프로세스 정상 종료 (코드 0)", run.status === 0, `status=${run.status} signal=${run.signal} | ${tail(log)}`);
check("스크립트 오류 없음", errorLines.length === 0, errorLines.join(" | "));
check("대기에서 시작한다 (flappy:state:ready)", log.includes("flappy:state:ready"), tail(log));
check("자동 시연이 플레이로 들어간다 (flappy:state:play)", log.includes("flappy:state:play"), tail(log));
check("부딪히면 게임 오버 (flappy:state:dead)", log.includes("flappy:state:dead"), tail(log));
const fm = /flappyFinal state=(\w+) score=(\d+) best=(\d+) ticks=(\d+)/.exec(log);
check("최종 요약 (씬이 스스로 끝냈다)", fm !== null, tail(log));
if (fm) {
  check("파이프를 하나 이상 지난다 (best >= 1)", Number(fm[3]) >= 1, fm[0]);
  check("900틱에 끝낸다", Number(fm[4]) === 900, fm[0]);
}
if (run.status !== 0 || errorLines.length) console.log("  --- 엔진 출력 ---\n" + log.trim().split("\n").map((l) => "  " + l).join("\n"));

// ---- 6. 내용만 바꾸면 스탬프가 다르다 ----

console.log("\n[두 번째 스테이징]");
const mainLua = path.join(project, "scripts", "lua", "main.lua");
const original = fs.readFileSync(mainLua);
fs.writeFileSync(mainLua, Buffer.concat([original, Buffer.from("\n-- e2e-android-stage: 내용만 바꾼다\n")]));
const second = stage();
const m2 = STAGED_RE.exec(second.last);
const listed2 = fs.readFileSync(manifestPath, "utf8");
check("종료 코드 0", second.result.status === 0, tail(second.stderr));
check("스탬프가 다르다", m2 !== null && m2[3] !== stamp, `${stamp} / ${m2?.[3]}`);
check("assets_manifest.txt 의 바이트가 다르다 (기기가 다시 푼다)", listed2 !== listed.join("\n") + "\n");
fs.writeFileSync(mainLua, original);
const third = stage();
check("되돌리면 처음 스탬프", STAGED_RE.exec(third.last)?.[3] === stamp, third.last);

// ---- 7. RTP 체크 ----

console.log("\n[RTP 변환물 넣기]");
const rtpDest = path.join(work, "assets-rtp");
const withRtp = stage({ withRtp: true, to: rtpDest });
check("종료 코드 0", withRtp.result.status === 0, tail(withRtp.stderr));
check("RTP 변환물이 들어간다", fs.existsSync(path.join(rtpDest, "resources", "rtp", "CharSet", "hero.png")));
check("경고 줄", withRtp.stdout.includes("WARN rtp: RTP 변환물이 들어간다. 이 APK 는 배포하지 않는다"), tail(withRtp.stdout));
check("rtp=yes", STAGED_RE.exec(withRtp.last)?.[4] === "yes", withRtp.last);
check("config.setting 은 여전히 없다", !fs.existsSync(path.join(rtpDest, "config.setting")));

if (KEEP) console.log(`\n작업 폴더를 남겼다: ${work}`);
else fs.rmSync(work, { recursive: true, force: true });

console.log(`\n결과: ${passes} PASS / ${failures.length} FAIL`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
