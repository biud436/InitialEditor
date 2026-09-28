#!/usr/bin/env node
// 엔진의 WebAssembly 빌드(R3)를 packages/app/public/engine/ 로 복사한다 (docs/plans/e4-embedded-play.md).
// 에디터의 게임 뷰가 이 사본으로 게임을 에디터 안에서 돌린다. Vite 가 public/ 을 dist/ 로 옮기므로
// Cloudflare Pages 빌드와 Tauri 번들에 그대로 실린다.
//
//   yarn sync:engine-web                                   엔진 저장소는 INITIAL2D_DIR (기본 ../Initial2D)
//   INITIAL2D_DIR=/path/to/Initial2D node scripts/sync-engine-web.mjs
//   node scripts/sync-engine-web.mjs --features "lua wasm"  빌드의 기능 목록을 직접 준다
//
// 먼저 엔진 저장소에서 tools/build_web.sh 로 build-web/site/ 를 만든다. 복사하는 파일은 FILES 셋이고,
// 엔진 저장소 루트의 THIRD-PARTY.md (제3자 고지, 웹판의 정보 창이 보인다)도 옆에 복사한다 (MANIFEST 의 files 에는 넣지 않는다).
// MANIFEST.json 에 엔진 커밋, 출처(source: checkout)와 다시 만드는 명령(syncCommand), 파일별 sha256 과 크기,
// 빌드의 기능(--features 와 같은 단어)을 적는다. 커밋이 engine-pin.json 과 같은지는 yarn engine:check 가 본다.
// 기능은 wasm 에 libmruby 가 링크되었는지로 정한다 (mruby 코어의 MRUBY_COPYRIGHT 문자열이 들어 있다).
// mruby 없이 빌드한 사이트(INITIAL2D_WEB_MRUBY=0 tools/build_web.sh)는 "lua wasm" 이다.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? path.join(repo, "..", "Initial2D"));
const siteDir = path.join(engineDir, "build-web", "site");
const outDir = path.join(repo, "packages", "app", "public", "engine");
const FILES = ["Initial2D.js", "Initial2D.wasm", "initial2d-loader.js"];
const MANIFEST = "MANIFEST.json";
const NOTICES = "THIRD-PARTY.md";

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function git(args) {
  try {
    return execFileSync("git", ["-C", engineDir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** mruby 코어(src/version.c 의 MRUBY_COPYRIGHT)만 가진 문자열. Lua 만 넣은 빌드에는 없다 */
const MRUBY_MARKER = "mruby - Copyright";

/** 빌드의 기능 목록. --features 로 주면 그것, 아니면 wasm 에 libmruby 가 들었는지 본다 */
function detectFeatures(wasm) {
  const given = argValue("--features");
  if (given) return given.split(/\s+/).filter(Boolean);
  const features = ["lua"];
  if (wasm.includes(MRUBY_MARKER)) features.push("mruby");
  features.push("wasm");
  return features;
}

for (const name of FILES) {
  if (!fs.existsSync(path.join(siteDir, name))) {
    console.error(`웹 빌드 없음: ${path.join(siteDir, name)}`);
    console.error("엔진 저장소에서 tools/build_web.sh 먼저 실행 필요 (INITIAL2D_DIR로 저장소 위치 지정)");
    process.exit(1);
  }
}

// 목록 밖의 옛 파일이 남지 않게 폴더를 비우고 다시 만든다
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const files = [];
for (const name of FILES) {
  const data = fs.readFileSync(path.join(siteDir, name));
  fs.writeFileSync(path.join(outDir, name), data);
  files.push({ path: name, size: data.length, sha256: sha256(data) });
}

// 엔진의 제3자 고지. R4 이전 커밋의 엔진 저장소에는 없다
const notices = path.join(engineDir, NOTICES);
if (fs.existsSync(notices)) fs.copyFileSync(notices, path.join(outDir, NOTICES));
else console.warn(`경고: ${notices} 가 없다. 정보 창의 제3자 고지가 비고 scripts/check-web-dist.mjs 가 실패한다`);

const wasmStat = fs.statSync(path.join(siteDir, "Initial2D.wasm"));
const dirty = git(["status", "--porcelain", "--untracked-files=no"]);
const manifest = {
  comment: "scripts/sync-engine-web.mjs 가 만든다. 손으로 고치지 않는다. 엔진 저장소의 build-web/site/ 사본이다",
  engineCommit: git(["rev-parse", "HEAD"]),
  source: "checkout",
  syncCommand: "yarn sync:engine-web",
  engineDirty: dirty === null ? null : dirty.length > 0,
  builtAt: wasmStat.mtime.toISOString(),
  syncedAt: new Date().toISOString().slice(0, 10),
  features: detectFeatures(fs.readFileSync(path.join(siteDir, "Initial2D.wasm"))),
  files,
};
fs.writeFileSync(path.join(outDir, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");

const total = files.reduce((n, f) => n + f.size, 0);
console.log(`엔진: ${engineDir}${manifest.engineCommit ? ` (${manifest.engineCommit.slice(0, 7)}${manifest.engineDirty ? ", 커밋 안 된 변경 있음" : ""})` : ""}`);
console.log(`기능: ${manifest.features.join(" ")}`);
console.log(`복사: ${files.length}개 파일, ${(total / 1024).toFixed(0)} KB → ${path.relative(repo, outDir)}/`);
for (const f of files) console.log(`  ${f.path}  ${(f.size / 1024).toFixed(0)} KB`);
