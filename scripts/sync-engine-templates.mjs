#!/usr/bin/env node
// 엔진 저장소의 템플릿과 씬 로더와 플래피 예제를 packages/app/templates/ 로 복사한다 (docs/plans/e2-scene.md 마일스톤 6).
// 에디터의 "새 프로젝트"가 이 사본을 쓰고, scene/templates.test.ts 가 사본이 엔진과 같은지(sha256) 검사한다.
//
//   yarn sync:templates                                  엔진 저장소는 INITIAL2D_DIR (기본 ../Initial2D)
//   INITIAL2D_DIR=/path/to/Initial2D node scripts/sync-engine-templates.mjs
//
// 복사 목록은 아래 SOURCES 다. 항목마다 엔진 안 경로(from), 새 프로젝트 안 경로(to), 어느 템플릿에 들어가는지(groups:
// common 은 늘, empty 와 flappy 는 그 템플릿일 때), 언어(lua, ruby, 없으면 둘 다), 텍스트인지 바이너리인지를 적는다.
// 결과는 packages/app/templates/<from> 에 놓고 MANIFEST.json 에 sha256 과 함께 적는다. optional 인 것(API 명세)은
// 엔진 저장소에 없으면 건너뛰고 알린다.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? path.join(repo, "..", "Initial2D"));
const outDir = path.join(repo, "packages", "app", "templates");
const MANIFEST = "MANIFEST.json";

const TEXT = "text";
const BINARY = "binary";

/** @type {Array<{from: string, to: string, groups: string[], language: "lua" | "ruby" | null, kind: "text" | "binary", optional?: boolean}>} */
const SOURCES = [
  // 씬 로더 (모든 템플릿)
  { from: "scripts/lua/scene_loader.lua", to: "scripts/lua/scene_loader.lua", groups: ["common"], language: "lua", kind: TEXT },
  { from: "scripts/lua/scene_types/tilemap.lua", to: "scripts/lua/scene_types/tilemap.lua", groups: ["common"], language: "lua", kind: TEXT },
  { from: "scripts/ruby/scene_loader.rb", to: "scripts/ruby/scene_loader.rb", groups: ["common"], language: "ruby", kind: TEXT },
  { from: "scripts/ruby/scene_types/tilemap.rb", to: "scripts/ruby/scene_types/tilemap.rb", groups: ["common"], language: "ruby", kind: TEXT },
  // 한글 비트맵 폰트 (템플릿 씬의 text 가 쓴다)
  { from: "resources/fonts/hangul.fnt", to: "resources/fonts/hangul.fnt", groups: ["common"], language: null, kind: BINARY },
  { from: "resources/fonts/hangul_0.png", to: "resources/fonts/hangul_0.png", groups: ["common"], language: null, kind: BINARY },
  // API 명세 (자동완성). 엔진 저장소의 R2 결과물이라 없을 수 있다
  { from: "resources/api/initial2d-api.json", to: "resources/api/initial2d-api.json", groups: ["common"], language: null, kind: TEXT, optional: true },
  // 진입점 (빈 프로젝트와 플래피 둘 다)
  { from: "resources/templates/main.lua", to: "scripts/lua/main.lua", groups: ["empty", "flappy"], language: "lua", kind: TEXT },
  { from: "resources/templates/main.rb", to: "scripts/ruby/main.rb", groups: ["empty", "flappy"], language: "ruby", kind: TEXT },
  // 빈 프로젝트의 씬 하나
  { from: "resources/templates/scene.json", to: "resources/scenes/main.json", groups: ["empty"], language: null, kind: TEXT },
  // 플래피버드: 씬, 컴포넌트, 그림, 효과음
  { from: "resources/scenes/flappy.json", to: "resources/scenes/flappy.json", groups: ["flappy"], language: null, kind: TEXT },
  ...["bird", "common", "director", "pipes", "scroller"].map((name) => ({
    from: `scripts/lua/components/flappy/${name}.lua`,
    to: `scripts/lua/components/flappy/${name}.lua`,
    groups: ["flappy"],
    language: "lua",
    kind: TEXT,
  })),
  ...["bird", "common", "director", "pipes", "scroller"].map((name) => ({
    from: `scripts/ruby/components/flappy/${name}.rb`,
    to: `scripts/ruby/components/flappy/${name}.rb`,
    groups: ["flappy"],
    language: "ruby",
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
];

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function engineCommit() {
  try {
    return execFileSync("git", ["-C", engineDir, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

if (!fs.existsSync(path.join(engineDir, "scripts", "lua", "scene_loader.lua"))) {
  console.error(`엔진 저장소에 씬 로더가 없다: ${engineDir} (INITIAL2D_DIR 로 R1 이 든 저장소를 가리킨다)`);
  process.exit(1);
}

// 목록 밖의 옛 파일이 남지 않게 폴더를 비우고 다시 만든다
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const files = [];
const skipped = [];
for (const src of SOURCES) {
  const fromAbs = path.join(engineDir, src.from);
  if (!fs.existsSync(fromAbs)) {
    if (src.optional) {
      skipped.push(src.from);
      continue;
    }
    console.error(`엔진 저장소에 없다: ${src.from}`);
    process.exit(1);
  }
  const data = fs.readFileSync(fromAbs);
  if (src.kind === TEXT && data.includes("\r")) {
    console.error(`CRLF 가 들어 있다 (엔진 쪽을 LF 로 고친다): ${src.from}`);
    process.exit(1);
  }
  const toAbs = path.join(outDir, src.from);
  fs.mkdirSync(path.dirname(toAbs), { recursive: true });
  fs.writeFileSync(toAbs, data);
  files.push({ path: src.from, to: src.to, groups: src.groups, language: src.language, kind: src.kind, size: data.length, sha256: sha256(data) });
}

const manifest = {
  comment: "scripts/sync-engine-templates.mjs 가 만든다. 손으로 고치지 않는다. path 는 엔진 저장소와 이 폴더 안의 경로, to 는 새 프로젝트 안의 경로",
  engineCommit: engineCommit(),
  syncedAt: new Date().toISOString().slice(0, 10),
  files,
};
fs.writeFileSync(path.join(outDir, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");

const total = files.reduce((n, f) => n + f.size, 0);
console.log(`엔진: ${engineDir}${manifest.engineCommit ? ` (${manifest.engineCommit})` : ""}`);
console.log(`복사: ${files.length}개 파일, ${(total / 1024).toFixed(0)} KB → ${path.relative(repo, outDir)}/`);
for (const f of files) console.log(`  ${f.path}${f.to !== f.path ? ` → ${f.to}` : ""}  [${f.groups.join(",")}${f.language ? `, ${f.language}` : ""}]`);
for (const s of skipped) console.log(`  건너뜀 (엔진 저장소에 없음): ${s}`);
