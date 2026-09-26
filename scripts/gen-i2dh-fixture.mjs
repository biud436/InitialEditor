#!/usr/bin/env node
// I2DH 테스트 벡터를 엔진 저장소의 인코더(tools/bridge/lib/hmr.js)로 만든다.
// Rust 쪽 hmr::encode_bundle 이 같은 바이트를 내는지 cargo test 가 이 두 파일로 확인한다.
//
//   node scripts/gen-i2dh-fixture.mjs [엔진 저장소 경로]
//
// 기본 엔진 저장소는 형제 폴더 ../Initial2D 다. 결과물:
//   src-tauri/tests/fixtures/i2dh_sample.bin   인코딩된 번들
//   src-tauri/tests/fixtures/i2dh_sample.json  번들에 든 파일 목록 (data 는 base64)
// 두 파일 모두 커밋한다. 인코딩 규칙이 바뀌면 이 스크립트를 다시 돌린다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(process.argv[2] ?? path.join(here, "..", "..", "Initial2D"));
const hmrPath = path.join(engineRoot, "tools", "bridge", "lib", "hmr.js");
if (!fs.existsSync(hmrPath)) {
  console.error(`엔진 인코더가 없다: ${hmrPath}`);
  process.exit(1);
}
const { encodeBundle, decodeBundle } = await import(pathToFileURL(hmrPath).href);

// 한글 경로, 빈 파일, 0..255 전부가 든 바이너리, 줄바꿈과 따옴표가 든 텍스트를 섞는다.
const binary = Buffer.alloc(256);
for (let i = 0; i < 256; i++) binary[i] = i;
const files = [
  { path: "scripts/lua/main.lua", data: Buffer.from('print("안녕, \\"세계\\"")\nreturn 1\n', "utf8") },
  { path: "scripts/lua/한글 폴더/빈파일.lua", data: Buffer.alloc(0) },
  { path: "resources/scenes/title.json", data: Buffer.from('{"version":1,"name":"타이틀"}', "utf8") },
  { path: "resources/images/blob.bin", data: binary },
];

const encoded = encodeBundle(files);
// 엔진과 같은 규칙의 디코더로 되읽어 스스로 검증한다.
const decoded = decodeBundle(encoded);
if (decoded.length !== files.length) throw new Error("decode mismatch");

const outDir = path.join(here, "..", "src-tauri", "tests", "fixtures");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "i2dh_sample.bin"), encoded);
fs.writeFileSync(
  path.join(outDir, "i2dh_sample.json"),
  JSON.stringify(
    {
      generatedBy: "scripts/gen-i2dh-fixture.mjs (tools/bridge/lib/hmr.js encodeBundle)",
      files: files.map((f) => ({ path: f.path, dataBase64: f.data.toString("base64") })),
    },
    null,
    2,
  ) + "\n",
);
console.log(`wrote ${files.length} files, ${encoded.length} bytes -> ${outDir}`);
