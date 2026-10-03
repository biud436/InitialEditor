#!/usr/bin/env node
// 엔진의 템플릿과 씬 로더와 예제를 packages/app/templates/ 로 복사한다 (docs/plans/e2-scene.md 마일스톤 6,
// docs/plans/e6-packaging.md 마일스톤 3). 에디터의 "새 프로젝트"가 이 사본을 쓰고, scene/templates.test.ts 가 사본을 검사한다.
//
//   yarn sync:templates                                     엔진 체크아웃에서 (INITIAL2D_DIR, 기본 ../Initial2D)
//   yarn sync:templates --from-zip <Initial2D-templates.zip> 엔진의 템플릿 묶음에서 (tools/pack_templates.py. dist 폴더도 받는다)
//   yarn sync:templates --allow-dirty                       체크아웃의 추적 파일이 커밋과 달라도 복사한다 (MANIFEST 에 dirty)
//   yarn sync:templates --out <폴더>                        다른 폴더에 쓴다 (테스트용)
//
// 복사 목록은 SOURCES 다: 엔진 안 경로(from), 새 프로젝트 안 경로(to), 그룹(common 은 늘, empty, flappy, tilemap, rpg 는 그 템플릿일 때),
// 언어(lua, ruby, null 은 둘 다), 텍스트와 바이너리. 엔진의 tools/templates_list.txt 가 같은 from 목록이다.
// MANIFEST.json 의 source 는 "checkout"(엔진 체크아웃) 또는 "release"(템플릿 묶음), engineCommit 은 40자,
// files[].generated 는 git 이 추적하지 않는 생성물이다 (체크아웃이면 git ls-files, 묶음이면 묶음의 MANIFEST 가 정한다).

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const DEFAULT_OUT = path.join(repo, "packages", "app", "templates");
const MANIFEST = "MANIFEST.json";
const ZIP_NAME = "Initial2D-templates.zip";
const COMMENT = "scripts/sync-engine-templates.mjs 가 만든다. 손으로 고치지 않는다. path 는 엔진 저장소와 이 폴더 안의 경로, to 는 새 프로젝트 안의 경로";

const TEXT = "text";
const BINARY = "binary";

const FLAPPY_COMPONENTS = ["bird", "common", "director", "pipes", "scroller"];

/** @type {Array<{from: string, to: string, groups: string[], language: "lua" | "ruby" | null, kind: "text" | "binary"}>} */
export const SOURCES = [
  // 씬 로더 (모든 템플릿)
  { from: "scripts/lua/scene_loader.lua", to: "scripts/lua/scene_loader.lua", groups: ["common"], language: "lua", kind: TEXT },
  { from: "scripts/lua/scene_types/tilemap.lua", to: "scripts/lua/scene_types/tilemap.lua", groups: ["common"], language: "lua", kind: TEXT },
  { from: "scripts/ruby/scene_loader.rb", to: "scripts/ruby/scene_loader.rb", groups: ["common"], language: "ruby", kind: TEXT },
  { from: "scripts/ruby/scene_types/tilemap.rb", to: "scripts/ruby/scene_types/tilemap.rb", groups: ["common"], language: "ruby", kind: TEXT },
  // 한글 비트맵 폰트 (템플릿 씬의 text 가 쓴다)
  { from: "resources/fonts/hangul.fnt", to: "resources/fonts/hangul.fnt", groups: ["common"], language: null, kind: BINARY },
  { from: "resources/fonts/hangul_0.png", to: "resources/fonts/hangul_0.png", groups: ["common"], language: null, kind: BINARY },
  // API 명세 (자동완성)와 언어 서버용 스텁, LuaLS 설정 (.luarc.json)
  { from: "resources/api/initial2d-api.json", to: "resources/api/initial2d-api.json", groups: ["common"], language: null, kind: TEXT },
  { from: "resources/api/initial2d.lua", to: "resources/api/initial2d.lua", groups: ["common"], language: "lua", kind: TEXT },
  { from: "resources/templates/luarc.json", to: ".luarc.json", groups: ["common"], language: "lua", kind: TEXT },
  { from: "resources/api/initial2d.rb", to: "resources/api/initial2d.rb", groups: ["common"], language: "ruby", kind: TEXT },
  { from: "resources/api/initial2d.rbs", to: "resources/api/initial2d.rbs", groups: ["common"], language: "ruby", kind: TEXT },
  // 진입점 (세 템플릿 모두)
  { from: "resources/templates/main.lua", to: "scripts/lua/main.lua", groups: ["empty", "flappy", "tilemap"], language: "lua", kind: TEXT },
  { from: "resources/templates/main.rb", to: "scripts/ruby/main.rb", groups: ["empty", "flappy", "tilemap"], language: "ruby", kind: TEXT },
  // 빈 프로젝트의 씬 하나
  { from: "resources/templates/scene.json", to: "resources/scenes/main.json", groups: ["empty"], language: null, kind: TEXT },
  // 플래피버드: 씬, 컴포넌트, 그림, 효과음
  { from: "resources/scenes/flappy.json", to: "resources/scenes/flappy.json", groups: ["flappy"], language: null, kind: TEXT },
  ...FLAPPY_COMPONENTS.map((name) => ({
    from: `scripts/lua/components/flappy/${name}.lua`,
    to: `scripts/lua/components/flappy/${name}.lua`,
    groups: ["flappy"],
    language: /** @type {const} */ ("lua"),
    kind: TEXT,
  })),
  ...FLAPPY_COMPONENTS.map((name) => ({
    from: `scripts/ruby/components/flappy/${name}.rb`,
    to: `scripts/ruby/components/flappy/${name}.rb`,
    groups: ["flappy"],
    language: /** @type {const} */ ("ruby"),
    kind: TEXT,
  })),
  ...["background_768x896.png", "ground_768x64.png", "bird_276x64.png", "object_52x271.png"].map((name) => ({
    from: `resources/${name}`,
    to: `resources/${name}`,
    groups: ["flappy"],
    language: null,
    kind: BINARY,
  })),
  ...["flap.wav", "hit.wav", "point.wav"].map((name) => ({
    from: `resources/audio/${name}`,
    to: `resources/audio/${name}`,
    groups: ["flappy"],
    language: null,
    kind: BINARY,
  })),
  // 타일맵: 그 맵을 여는 씬, 맵 한 장, 오브젝트 스키마, 맵이 쓰는 타일셋
  { from: "resources/templates/tilemap/scene.json", to: "resources/scenes/main.json", groups: ["tilemap"], language: null, kind: TEXT },
  { from: "resources/templates/tilemap/map.json", to: "resources/maps/start.json", groups: ["tilemap"], language: null, kind: TEXT },
  { from: "resources/templates/tilemap/map-objects.json", to: "resources/schema/map-objects.json", groups: ["tilemap"], language: null, kind: TEXT },
  { from: "resources/tiles/tileset16-8x13.png", to: "resources/tiles/tileset16-8x13.png", groups: ["tilemap"], language: null, kind: BINARY },
  // 타일맵과 RPG 템플릿에 함께 싣는 타일셋 (새 맵에서 고를 수 있다)
  { from: "resources/tiles/tile1.png", to: "resources/tiles/tile1.png", groups: ["tilemap", "rpg"], language: null, kind: BINARY },
  // RPG: 데모 「떠나기 전에」의 항구 마을과 여관 (Lua 만). 진입 파일과 게임 설정만 자리가 다르고 나머지는 엔진 경로 그대로
  { from: "resources/templates/rpg/main.lua", to: "scripts/lua/main.lua", groups: ["rpg"], language: "lua", kind: TEXT },
  { from: "resources/templates/rpg/rpg-game.json", to: "resources/data/rpg-game.json", groups: ["rpg"], language: null, kind: TEXT },
  ...[
    ...["config", "game", "items", "playenv", "title"].map((n) => `scripts/lua/games/rpgdemo/${n}.lua`),
    ...["assets", "camera", "character", "choice", "commands", "event", "interpreter", "inventory", "jsonshape", "map_scene", "mapdata", "menu", "message", "player", "rng", "specs", "text", "window"].map(
      (n) => `scripts/lua/rpg/${n}.lua`,
    ),
    "scripts/lua/bgm.lua",
    "scripts/lua/image.lua",
    "scripts/lua/ui/buttons.lua",
    "scripts/lua/ui/touch.lua",
    "scripts/lua/ui/vpad.lua",
    "scripts/lua/maps/port_town.lua",
    "scripts/lua/maps/inn.lua",
  ].map((path) => ({ from: path, to: path, groups: ["rpg"], language: "lua", kind: TEXT })),
  ...["resources/maps/port_town.json", "resources/maps/inn.json", "resources/data/items.json", "resources/schema/event-commands.json"].map((path) => ({
    from: path,
    to: path,
    groups: ["rpg"],
    language: null,
    kind: TEXT,
  })),
  ...[
    "resources/tiles/port16.png",
    "resources/titles/port_title.png",
    "resources/ui/window.png",
    "resources/ui/fade.png",
    "resources/ui/dpad.png",
    "resources/ui/actionbtn.png",
    "resources/charsets/placeholder.png",
    "resources/faces/placeholder.png",
    "resources/fonts/hangul16.fnt",
    "resources/fonts/hangul16_0.png",
    "resources/audio/bless.ogg",
    "resources/audio/door.wav",
    "resources/audio/ui_cursor.wav",
    "resources/audio/ui_decision.wav",
    "resources/audio/ui_text.wav",
  ].map((path) => ({ from: path, to: path, groups: ["rpg"], language: null, kind: BINARY })),
];

export class SyncError extends Error {}

function fail(message) {
  throw new SyncError(message);
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/** 이 기계의 날짜 (YYYY-MM-DD) */
function localDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const COMMIT_RE = /^[0-9a-f]{40}$/;

// ---- zip 읽기 (저장과 deflate 만. zip64 는 받지 않는다) ----

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** zip 의 파일 이름에서 내용으로. 폴더 항목은 뺀다 */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail("zip 이 아니다 (끝 레코드가 없다)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) fail("zip64 는 읽지 못한다");
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIG) fail("zip 의 목록이 깨졌다");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (flags & 1) fail(`암호가 걸린 항목이다: ${name}`);
    if (csize === 0xffffffff || usize === 0xffffffff || local === 0xffffffff) fail("zip64 는 읽지 못한다");
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== LOCAL_SIG) fail(`zip 의 항목이 깨졌다: ${name}`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else fail(`모르는 압축 방식 ${method}: ${name}`);
    if (data.length !== usize) fail(`풀어 보니 크기가 다르다: ${name}`);
    if (typeof zlib.crc32 === "function" && zlib.crc32(data) >>> 0 !== crc) fail(`CRC 가 다르다: ${name}`);
    if (out.has(name)) fail(`zip 에 두 번 든 이름: ${name}`);
    out.set(name, data);
  }
  return out;
}

// ---- 원본 두 가지: 엔진 체크아웃과 템플릿 묶음 ----

/**
 * @typedef {{ source: "checkout" | "release", syncCommand: string, engineCommit: string, dirty: boolean, label: string,
 *   read(rel: string): Buffer, generated(rel: string): boolean, notes: string[] }} Origin
 */

/** 엔진 체크아웃. 생성물은 git ls-files 에 없는 파일이다 */
export function checkoutOrigin(engineDir, { allowDirty = false } = {}) {
  if (!fs.existsSync(path.join(engineDir, "scripts", "lua", "scene_loader.lua"))) {
    fail(`엔진 저장소에 씬 로더 없음: ${engineDir} (INITIAL2D_DIR에 엔진 저장소 경로 지정)`);
  }
  const git = (...args) => execFileSync("git", ["-C", engineDir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  let engineCommit = "";
  try {
    engineCommit = git("rev-parse", "HEAD").trim();
  } catch {
    fail(`엔진 저장소의 커밋을 읽지 못했다: ${engineDir} (git 체크아웃이어야 한다)`);
  }
  if (!COMMIT_RE.test(engineCommit)) fail(`엔진 커밋이 40자가 아니다: ${engineCommit}`);
  const froms = SOURCES.map((s) => s.from);
  const missing = froms.filter((rel) => !fs.existsSync(path.join(engineDir, rel)));
  if (missing.length) {
    fail(`엔진 저장소에 없음:\n${missing.map((m) => `  ${m}`).join("\n")}\n(플래피 그림이면 엔진에서 python3 tools/generate_placeholder_assets.py)`);
  }
  const tracked = new Set(git("ls-files", "-z", "--", ...froms).split("\0").filter(Boolean));
  const changed = tracked.size
    ? git("status", "--porcelain", "--", ...tracked)
        .split("\n")
        .filter(Boolean)
        .map((l) => l.slice(3))
    : [];
  if (changed.length && !allowDirty) {
    fail(`엔진의 작업 트리가 커밋과 다르다 (커밋하거나 --allow-dirty):\n${changed.map((c) => `  ${c}`).join("\n")}`);
  }
  return {
    source: "checkout",
    syncCommand: "yarn sync:templates",
    engineCommit,
    dirty: changed.length > 0,
    label: `${engineDir} (${engineCommit.slice(0, 7)}${changed.length ? ", 작업 트리가 커밋과 다름" : ""})`,
    read: (rel) => fs.readFileSync(path.join(engineDir, rel)),
    generated: (rel) => !tracked.has(rel),
    notes: changed.map((c) => `바뀜: ${c}`),
  };
}

/** 템플릿 묶음 (zip, 또는 그것이 든 dist 폴더). 파일은 묶음의 MANIFEST 와 sha256 이 같아야 한다 */
export function zipOrigin(zipPath) {
  const file = fs.existsSync(zipPath) && fs.statSync(zipPath).isDirectory() ? path.join(zipPath, ZIP_NAME) : zipPath;
  if (!fs.existsSync(file)) fail(`템플릿 묶음이 없다: ${file}`);
  const entries = readZip(fs.readFileSync(file));
  const manifestData = entries.get(MANIFEST);
  if (!manifestData) fail(`묶음에 ${MANIFEST} 가 없다: ${file}`);
  let bundle;
  try {
    bundle = JSON.parse(manifestData.toString("utf8"));
  } catch (e) {
    fail(`묶음의 ${MANIFEST} 를 읽지 못했다: ${e.message}`);
  }
  if (!COMMIT_RE.test(String(bundle.engineCommit ?? ""))) fail(`묶음의 엔진 커밋이 40자가 아니다: ${bundle.engineCommit}`);
  if (!Array.isArray(bundle.files)) fail(`묶음의 ${MANIFEST} 에 files 가 없다`);
  const listed = new Map(bundle.files.map((f) => [f.path, f]));
  for (const f of bundle.files) {
    const data = entries.get(f.path);
    if (!data) fail(`묶음의 MANIFEST 에 있지만 zip 에 없다: ${f.path}`);
    if (sha256(data) !== f.sha256) fail(`묶음의 MANIFEST 와 sha256 이 다르다: ${f.path}`);
  }
  const missing = SOURCES.map((s) => s.from).filter((rel) => !listed.has(rel));
  if (missing.length) fail(`묶음에 없다:\n${missing.map((m) => `  ${m}`).join("\n")}`);
  const known = new Set(SOURCES.map((s) => s.from));
  const extra = bundle.files.map((f) => f.path).filter((rel) => !known.has(rel));
  return {
    source: "release",
    syncCommand: `yarn sync:templates --from-zip <${ZIP_NAME}>`,
    engineCommit: bundle.engineCommit,
    dirty: bundle.dirty === true,
    label: `${file} (${bundle.engineCommit.slice(0, 7)}${bundle.describe ? `, ${bundle.describe}` : ""}${bundle.dirty ? ", dirty" : ""})`,
    read: (rel) => entries.get(rel),
    generated: (rel) => listed.get(rel)?.generated === true,
    notes: extra.map((rel) => `묶음에 있지만 목록에 없어 건너뜀: ${rel}`),
  };
}

/** out 을 비운다. 이 스크립트가 만든 폴더나 빈 폴더만 비운다 */
function prepareOut(outDir) {
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) {
    let ours = false;
    try {
      ours = JSON.parse(fs.readFileSync(path.join(outDir, MANIFEST), "utf8")).comment?.startsWith("scripts/sync-engine-templates.mjs") === true;
    } catch {
      ours = false;
    }
    if (!ours) fail(`이 스크립트가 만든 폴더가 아니라 비우지 않는다: ${outDir}`);
  }
  // 목록 밖의 옛 파일이 남지 않게 비우고 다시 만든다
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
}

/** @param {Origin} origin */
export function writeTemplates(origin, outDir) {
  const files = [];
  const blobs = [];
  for (const src of SOURCES) {
    const data = origin.read(src.from);
    if (src.kind === TEXT && data.includes("\r")) fail(`CRLF 줄바꿈 포함 (엔진 쪽 파일을 LF로 변환 필요): ${src.from}`);
    files.push({
      path: src.from,
      to: src.to,
      groups: src.groups,
      language: src.language,
      kind: src.kind,
      size: data.length,
      sha256: sha256(data),
      generated: origin.generated(src.from),
    });
    blobs.push([src.from, data]);
  }
  prepareOut(outDir);
  for (const [rel, data] of blobs) {
    const to = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, data);
  }
  const manifest = {
    comment: COMMENT,
    source: origin.source,
    syncCommand: origin.syncCommand,
    engineCommit: origin.engineCommit,
    ...(origin.dirty ? { dirty: true } : {}),
    syncedAt: localDate(),
    files,
  };
  fs.writeFileSync(path.join(outDir, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

const USAGE = "사용법: sync-engine-templates.mjs [--from-zip <zip 이나 dist 폴더>] [--allow-dirty] [--out <폴더>]";

function parseArgs(argv) {
  const args = { fromZip: null, out: DEFAULT_OUT, allowDirty: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--allow-dirty") args.allowDirty = true;
    else if (a === "--from-zip" || a === "--out") {
      const v = argv[++i];
      if (!v) fail(`${a} 뒤에 경로가 없다\n${USAGE}`);
      if (a === "--from-zip") args.fromZip = path.resolve(v);
      else args.out = path.resolve(v);
    } else fail(`모르는 인자: ${a}\n${USAGE}`);
  }
  return args;
}

export function main(argv, env = process.env) {
  const args = parseArgs(argv);
  const origin = args.fromZip
    ? zipOrigin(args.fromZip)
    : checkoutOrigin(path.resolve(env.INITIAL2D_DIR ?? path.join(repo, "..", "Initial2D")), { allowDirty: args.allowDirty });
  const manifest = writeTemplates(origin, args.out);
  const total = manifest.files.reduce((n, f) => n + f.size, 0);
  console.log(`엔진: ${origin.label}`);
  console.log(`복사: ${manifest.files.length}개 파일, ${(total / 1024).toFixed(0)} KB → ${path.relative(repo, args.out) || "."}/`);
  for (const f of manifest.files) {
    const tags = [f.groups.join(","), f.language, f.generated ? "생성물" : null].filter(Boolean).join(", ");
    console.log(`  ${f.path}${f.to !== f.path ? ` → ${f.to}` : ""}  [${tags}]`);
  }
  for (const n of origin.notes) console.log(`  ${n}`);
  return manifest;
}

function isMain() {
  try {
    return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}
