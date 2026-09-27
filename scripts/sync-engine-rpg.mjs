#!/usr/bin/env node
// 엔진 저장소의 RPG 이벤트 계약 파일을 packages/ext-rpg/test/fixtures/ 로 복사한다 (docs/plans/e5-rpg.md 마일스톤 2).
// ext-rpg 모델의 테스트가 이 사본으로 돌고, fixtures.test.ts 가 사본이 MANIFEST 와 같은지와 (엔진 저장소가 있으면)
// 엔진의 파일과 같은지 sha256 으로 본다.
//
//   yarn sync:rpg                                    엔진 저장소는 INITIAL2D_DIR (기본 ../Initial2D)
//   INITIAL2D_DIR=/path/to/Initial2D node scripts/sync-engine-rpg.mjs
//   node scripts/sync-engine-rpg.mjs --allow-dirty   엔진의 작업 트리가 커밋과 달라도 복사한다 (MANIFEST 에 dirty 표시)
//   node scripts/sync-engine-rpg.mjs --out <폴더>    다른 폴더에 쓴다 (테스트용)
//
// MANIFEST 는 엔진에서 온 다른 사본(템플릿, 웹 엔진)과 같은 칸을 가진다: source "checkout", syncCommand, 40자 engineCommit.
// yarn engine:check 가 그 커밋을 engine-pin.json 과 대조하므로, 엔진을 올릴 때는 핀의 커밋으로 체크아웃한 엔진에서 다시 돌린다.
//
// 파일은 엔진 저장소 안의 경로 그대로 둔다 (test/fixtures/resources/maps/port_town.json). 그래서 픽스처 폴더가 작은
// 프로젝트처럼 보이고, e2e 가 메모리 백엔드에 같은 경로로 쓸 수 있다. resources/rtp/ 는 라이선스 때문에 복사하지 않는다.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? path.join(repo, "..", "Initial2D"));
const MANIFEST = "MANIFEST.json";
const USAGE = "사용법: sync-engine-rpg.mjs [--allow-dirty] [--out <폴더>]";

let allowDirty = false;
let outDir = path.join(repo, "packages", "ext-rpg", "test", "fixtures");
{
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--allow-dirty") allowDirty = true;
    else if (args[i] === "--out" && args[i + 1]) outDir = path.resolve(args[++i]);
    else {
      console.error(`모르는 인자: ${args[i]}\n${USAGE}`);
      process.exit(2);
    }
  }
}

/** 복사 목록. 엔진 저장소 안의 경로이자 픽스처 폴더 안의 경로 */
const SOURCES = [
  // 계약: 이벤트 스키마와 게임 설정과 아이템 표 (M2 2.1)
  "resources/schema/event-commands.json",
  "resources/data/rpg-game.json",
  "resources/data/items.json",
  // 이벤트를 옮긴 두 맵 (M2 6절)
  "resources/maps/port_town.json",
  "resources/maps/inn.json",
  // 경로 대조 픽스처 (M2 3.4)
  "tests/fixtures/events/invalid_events.json",
  "tests/fixtures/events/invalid_events.paths.json",
  // 그림: 플레이스홀더 CharSet 과 FaceSet, 두 맵의 타일셋
  "resources/charsets/placeholder.png",
  "resources/faces/placeholder.png",
  "resources/tiles/port16.png",
];

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/** 이 기계의 날짜 (YYYY-MM-DD) */
function localDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function git(...args) {
  return execFileSync("git", ["-C", engineDir, ...args], { encoding: "utf8" }).trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

for (const rel of SOURCES) {
  if (rel.startsWith("resources/rtp/") || rel.includes("/rtp/")) fail(`RTP 소재는 복사하지 않는다: ${rel}`);
}
if (!fs.existsSync(path.join(engineDir, "resources", "schema", "event-commands.json"))) {
  fail(`엔진 저장소에 이벤트 스키마가 없다: ${engineDir} (INITIAL2D_DIR 로 M2 가 든 저장소를 가리킨다)`);
}

let engineCommit;
try {
  engineCommit = git("rev-parse", "HEAD");
} catch {
  fail(`엔진 저장소의 커밋을 읽지 못했다: ${engineDir} (git 체크아웃이어야 한다)`);
}
if (!/^[0-9a-f]{40}$/.test(engineCommit)) fail(`엔진 커밋이 40자가 아니다: ${engineCommit}`);
const dirty = git("status", "--porcelain", "--", ...SOURCES);
if (dirty && !allowDirty) fail(`엔진의 작업 트리가 커밋과 다르다 (커밋하거나 --allow-dirty):\n${dirty}`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const files = [];
for (const rel of SOURCES) {
  const from = path.join(engineDir, rel);
  if (!fs.existsSync(from)) fail(`엔진 저장소에 없다: ${rel}`);
  const data = fs.readFileSync(from);
  if (rel.endsWith(".json") && data.includes("\r")) fail(`CRLF 가 들어 있다 (엔진 쪽을 LF 로 고친다): ${rel}`);
  const to = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, data);
  files.push({ path: rel, size: data.length, sha256: sha256(data) });
}

const manifest = {
  comment: "scripts/sync-engine-rpg.mjs 가 만든다. 손으로 고치지 않는다. path 는 엔진 저장소와 이 폴더 안의 같은 경로",
  source: "checkout",
  syncCommand: "yarn sync:rpg",
  engineCommit,
  ...(dirty ? { dirty: true } : {}),
  syncedAt: localDate(),
  files,
};
fs.writeFileSync(path.join(outDir, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");

const total = files.reduce((n, f) => n + f.size, 0);
console.log(`엔진: ${engineDir} (${engineCommit}${dirty ? ", 작업 트리가 커밋과 다름" : ""})`);
console.log(`복사: ${files.length}개 파일, ${(total / 1024).toFixed(0)} KB → ${path.relative(repo, outDir)}/`);
for (const f of files) console.log(`  ${f.path}`);
