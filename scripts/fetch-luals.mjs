#!/usr/bin/env node
// 앱에 싣는 언어 서버 LuaLS 를 src-tauri/luals/ 로 받는다 (docs/plans/language-server.md 3절).
//
//   yarn luals:fetch                      이 컴퓨터의 판
//   yarn luals:fetch --target <트리플>    번들 대상의 판 (릴리스 워크플로가 대상마다 부른다)
//   yarn luals:fetch --from <압축 파일>   받지 않고 그 파일을 쓴다 (sha256 은 똑같이 확인한다)
//
// 압축의 sha256 을 LUALS 의 값과 대조한 뒤, 앱에 쓰지 않는 것(meta/3rd 의 다른 엔진용 정의, 맞춤법 사전, 미리 만든
// 메타 파일, en-us 밖의 번역, 변경 기록)을 빼고 푼다. src-tauri/luals/luals.json 에 판과 대상을 적고, 배포본의 LICENSE 를
// src-tauri/licenses/luals/LICENSE 로 복사한다. 같은 폴더의 NOTICE.md(정적으로 묶인 구성 요소의 고지)는 저장소에 있다.
// 받은 압축은 src-tauri/target/luals-download/ 에 남겨 다시 쓴다. 종료 코드: 0 성공, 1 확인 실패, 2 인자 오류.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hostTriple, sha256 } from "./lib/engineDist.mjs";
import { readZip } from "./sync-engine-templates.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const USAGE = "사용법: fetch-luals.mjs [--target <트리플>] [--from <압축 파일>]";

const VERSION = "3.19.1";
const BASE = `https://github.com/LuaLS/lua-language-server/releases/download/${VERSION}`;

/** 번들 대상마다 받을 배포본과 그 sha256 (GitHub 릴리스의 digest) */
export const LUALS = {
  version: VERSION,
  assets: {
    "aarch64-apple-darwin": { name: `lua-language-server-${VERSION}-darwin-arm64.tar.gz`, sha256: "0bc077f4447f076b4c92c14e9fd303f5b569eda2ec74b4dca2b55f75fae2e90c" },
    "x86_64-apple-darwin": { name: `lua-language-server-${VERSION}-darwin-x64.tar.gz`, sha256: "eb373c159cbe556711d7cd316315de2dce969bfd54b31edb7eb9cab2937f2cca" },
    "x86_64-unknown-linux-gnu": { name: `lua-language-server-${VERSION}-linux-x64.tar.gz`, sha256: "e9235d2d72ef55bc41cf8c99cda2ed64777682024b4bb81f5dea425060c5cbb8" },
    "aarch64-unknown-linux-gnu": { name: `lua-language-server-${VERSION}-linux-arm64.tar.gz`, sha256: "abd2572e8fc929dc838a81ffb8473c5bce0bf39bfe8edb4b120b3b623176ce83" },
    "x86_64-pc-windows-msvc": { name: `lua-language-server-${VERSION}-win32-x64.zip`, sha256: "fdb9a59108cf62517813c97fa5549b0e16d1ef0688306bac728b08434db7e4cd" },
  },
};

class FetchError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const fail = (message, code = 1) => {
  throw new FetchError(message, code);
};

export function parseArgs(argv) {
  const args = { target: null, from: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--target" || a === "--from") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) fail(`${a} 에 값이 없다\n${USAGE}`, 2);
      args[a.slice(2)] = v;
    } else fail(`모르는 인자: ${a}\n${USAGE}`, 2);
  }
  return args;
}

/**
 * 배포본 안의 경로를 앱에 싣는가. meta/ 는 표준 라이브러리 정의의 원본(template)과 whimsical 만 싣는다.
 * 배포본의 "default utf8" 같은 폴더는 Lua 5.4 설정으로 미리 만든 결과이고, 앱은 --metapath 에 5.3 판을 만든다
 */
export function keep(rel) {
  if (rel === "changelog.md") return false;
  const meta = /^meta\/([^/]+)\//.exec(rel);
  if (meta && meta[1] !== "template" && meta[1] !== "whimsical") return false;
  const locale = /^locale\/([^/]+)\//.exec(rel);
  if (locale && locale[1] !== "en-us") return false;
  return true;
}

function octal(buf, start, length) {
  const text = buf.toString("latin1", start, start + length).replace(/\0.*$/s, "").trim();
  return text ? parseInt(text, 8) : 0;
}

function cString(buf, start, length) {
  return buf.toString("utf8", start, start + length).replace(/\0.*$/s, "");
}

/** pax 머리의 "길이 키=값\n" 레코드 */
function paxRecords(data) {
  const out = {};
  let i = 0;
  const text = data.toString("utf8");
  while (i < text.length) {
    const space = text.indexOf(" ", i);
    if (space < 0) break;
    const len = parseInt(text.slice(i, space), 10);
    if (!len) break;
    const record = text.slice(space + 1, i + len - 1);
    const eq = record.indexOf("=");
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    i += len;
  }
  return out;
}

/** tar(풀린 바이트)의 파일 목록: [{ name, mode, data }]. 폴더와 링크는 뺀다 */
export function readTar(buf) {
  const files = [];
  let offset = 0;
  let longName = null;
  let pax = null;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const data = buf.subarray(offset + 512, offset + 512 + size);
    if (data.length !== size) fail("tar 가 중간에 끊겼다");
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") {
      longName = cString(data, 0, data.length);
      continue;
    }
    if (type === "x") {
      pax = paxRecords(data);
      continue;
    }
    if (type === "g") continue;
    let name = cString(header, 0, 100);
    const prefix = header.toString("latin1", 257, 262) === "ustar" ? cString(header, 345, 155) : "";
    if (prefix) name = `${prefix}/${name}`;
    if (pax?.path) name = pax.path;
    if (longName) name = longName;
    longName = null;
    pax = null;
    if (type !== "0" && type !== "7") continue;
    files.push({ name: name.replace(/^\.\//, ""), mode: octal(header, 100, 8), data: Buffer.from(data) });
  }
  return files;
}

/** 압축 파일에서 [{ name, mode, data }] */
export function readArchive(file, data) {
  if (file.endsWith(".zip")) return [...readZip(data)].map(([name, bytes]) => ({ name, mode: 0o644, data: bytes }));
  if (file.endsWith(".tar.gz")) return readTar(zlib.gunzipSync(data));
  fail(`모르는 압축 형식: ${file}`);
}

/** 이름이 배포본 밖으로 나가지 않는가 */
function safeName(name) {
  return name !== "" && !name.startsWith("/") && !/^[A-Za-z]:/.test(name) && !name.split(/[\\/]/).includes("..");
}

async function download(url, file) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) fail(`받기 실패 ${res.status}: ${url}`);
  const data = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return data;
}

/** pins 는 시험이 바꾼다 (기본은 LUALS) */
export async function fetchLuals({ target, from }, repo = REPO, log = console.log, pins = LUALS) {
  const triple = target ?? hostTriple();
  if (!triple) fail(`이 컴퓨터(${process.platform} ${process.arch})의 대상을 모른다. --target 을 준다`, 2);
  const asset = pins.assets[triple];
  if (!asset) fail(`LuaLS 판이 없는 대상: ${triple} (${Object.keys(pins.assets).join(", ")})`, 2);

  let data;
  if (from) {
    data = fs.readFileSync(from);
  } else {
    const cached = path.join(repo, "src-tauri", "target", "luals-download", asset.name);
    if (fs.existsSync(cached) && sha256(fs.readFileSync(cached)) === asset.sha256) {
      data = fs.readFileSync(cached);
      log(`받아 둔 것 사용: ${path.relative(repo, cached)}`);
    } else {
      log(`LuaLS ${pins.version} 받는 중: ${BASE}/${asset.name}`);
      data = await download(`${BASE}/${asset.name}`, cached);
    }
  }
  const got = sha256(data);
  if (got !== asset.sha256) fail(`sha256 이 다르다: ${asset.name}\n  기대 ${asset.sha256}\n  실제 ${got}`);

  const files = readArchive(asset.name, data);
  const exeName = triple.includes("windows") ? "bin/lua-language-server.exe" : "bin/lua-language-server";
  if (!files.some((f) => f.name === exeName)) fail(`배포본에 ${exeName} 이 없다`);
  const license = files.find((f) => f.name === "LICENSE");
  if (!license) fail("배포본에 LICENSE 가 없다");

  const out = path.join(repo, "src-tauri", "luals");
  const tmp = `${out}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  let count = 0;
  let bytes = 0;
  for (const f of files) {
    if (!safeName(f.name)) fail(`배포본 밖을 가리키는 이름: ${f.name}`);
    if (!keep(f.name)) continue;
    const dest = path.join(tmp, f.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, f.data);
    if (process.platform !== "win32") fs.chmodSync(dest, f.mode & 0o111 ? 0o755 : 0o644);
    count++;
    bytes += f.data.length;
  }
  const meta = { comment: "scripts/fetch-luals.mjs 가 쓴다", version: pins.version, target: triple, asset: asset.name, sha256: asset.sha256, files: count, bytes };
  fs.writeFileSync(path.join(tmp, "luals.json"), JSON.stringify(meta, null, 2) + "\n");
  fs.rmSync(out, { recursive: true, force: true });
  fs.renameSync(tmp, out);

  const licenses = path.join(repo, "src-tauri", "licenses", "luals");
  fs.mkdirSync(licenses, { recursive: true });
  fs.writeFileSync(path.join(licenses, "LICENSE"), license.data);

  log(`LuaLS ${pins.version} (${triple}): 파일 ${count}개, ${(bytes / 1024 / 1024).toFixed(1)} MB → ${path.relative(repo, out)}`);
  return meta;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await fetchLuals(parseArgs(process.argv.slice(2)));
  } catch (e) {
    console.error(e.message);
    process.exit(e instanceof FetchError ? e.code : 1);
  }
}
