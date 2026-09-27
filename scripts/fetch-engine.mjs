#!/usr/bin/env node
// 앱에 싣는 엔진을 src-tauri/ 로 받는다 (docs/plans/e6-packaging.md 2.2 절, 2.4 절, 4.2 절).
//
//   yarn engine:fetch --from <엔진 dist 폴더>   엔진에서 tools/build_dist.sh 로 만든 dist/, 또는 dist.yml 의 산출물 폴더
//   yarn engine:fetch                            핀(engine-pin.json)의 공개 릴리스 자산. 엔진 태그가 생긴 뒤에 쓴다
//   --target <트리플>     기본은 이 컴퓨터. x86_64-pc-windows-msvc 는 고지만 받는다 (Windows 엔진이 없다)
//   --templates <폴더>    엔진 대신 템플릿 묶음(Initial2D-templates.zip)을 그 폴더에 푼다 (템플릿 대조용)
//   --any-commit          dist 의 엔진 커밋이 핀과 달라도 받는다 (개발 중 다른 엔진을 시험할 때)
//
// 쓰는 곳 (전부 gitignore):
//   src-tauri/binaries/Initial2D-<트리플>     사이드카 (tauri.sidecar.conf.json 의 externalBin)
//   src-tauri/binaries/engine.json            판 정보. 번들 리소스 engine/engine.json 으로 실려 앱이 읽는다
//   src-tauri/licenses/engine/THIRD-PARTY.md  엔진의 제3자 고지
// 받는 파일은 모두 sha256 을 확인한다. dist 폴더는 그 폴더의 engine-dist.json 과 SHA256SUMS.txt(있으면), 릴리스는 핀.
// dist 폴더에 THIRD-PARTY.md 가 없으면(엔진 체크아웃의 dist/) 한 단계 위(엔진 저장소 루트)의 것을 쓴다.
// 종료 코드: 0 성공, 1 확인 실패나 파일 없음, 2 인자 오류.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_BASE,
  TARGETS,
  hostTriple,
  parseSha256Sums,
  readJson,
  sha256,
  validateDist,
  validatePin,
} from "./lib/engineDist.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_JSON = "engine-dist.json";
const SUMS = "SHA256SUMS.txt";
const THIRD_PARTY = "THIRD-PARTY.md";
const TEMPLATES_ZIP = "Initial2D-templates.zip";
export const USAGE = "사용법: fetch-engine.mjs [--from <엔진 dist 폴더>] [--target <트리플>] [--templates <풀 폴더>] [--any-commit]";

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
  const args = { from: null, target: null, templates: null, anyCommit: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--any-commit") args.anyCommit = true;
    else if (a === "--from" || a === "--target" || a === "--templates") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) fail(`${a} 에 값이 없다\n${USAGE}`, 2);
      args[a.slice(2)] = v;
    } else fail(`모르는 인자: ${a}\n${USAGE}`, 2);
  }
  return args;
}

/** 파일을 받는 곳: dist 폴더 또는 공개 릴리스. read(이름)은 바이트와 확인에 쓴 sha256 출처를 준다 */
function folderSource(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail(`dist 폴더가 없다: ${dir}`);
  const sumsFile = path.join(dir, SUMS);
  const sums = fs.existsSync(sumsFile) ? parseSha256Sums(fs.readFileSync(sumsFile, "utf8")) : new Map();
  return {
    kind: "dist-folder",
    label: dir,
    sums,
    has: (name) => fs.existsSync(path.join(dir, name)),
    async read(name) {
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) fail(`dist 폴더에 없다: ${file}`);
      const data = fs.readFileSync(file);
      const listed = sums.get(name);
      if (listed && listed !== sha256(data)) fail(`${SUMS} 와 sha256 이 다르다: ${file}`);
      return data;
    },
  };
}

function releaseSource(tag, fetchImpl) {
  return {
    kind: "release",
    label: `${RELEASE_BASE}/${tag}/`,
    sums: new Map(),
    has: () => true,
    async read(name) {
      const url = `${RELEASE_BASE}/${tag}/${name}`;
      let res;
      try {
        res = await fetchImpl(url);
      } catch (e) {
        fail(`받지 못했다: ${url} (${e.message})`);
      }
      if (!res.ok) fail(`받지 못했다: ${url} (HTTP ${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

/** where 는 조사까지 ("핀과", "engine-dist.json 과") */
function expectSha(name, data, want, where) {
  const got = sha256(data);
  if (got !== want) fail(`${name} 의 sha256 이 ${where} 다르다\n  받은 것 ${got}\n  적힌 것 ${want}`);
}

function writeFile(file, data, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.part`;
  fs.writeFileSync(tmp, data);
  if (mode) fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, file);
}

/** 엔진의 제3자 고지. dist 폴더에 없으면 한 단계 위(엔진 저장소 루트) */
async function readThirdParty(source, from, pin) {
  if (source.kind === "release") {
    if (!pin.thirdParty) fail("핀에 thirdParty 자산이 없다");
    const data = await source.read(pin.thirdParty.asset);
    expectSha(pin.thirdParty.asset, data, pin.thirdParty.sha256, "핀과");
    return { data, from: `${source.label}${pin.thirdParty.asset}` };
  }
  if (source.has(THIRD_PARTY)) return { data: await source.read(THIRD_PARTY), from: path.join(from, THIRD_PARTY) };
  const up = path.join(from, "..", THIRD_PARTY);
  if (fs.existsSync(up)) return { data: fs.readFileSync(up), from: path.resolve(up) };
  return fail(`${THIRD_PARTY} 가 dist 폴더에도 그 위에도 없다: ${from}`);
}

/** 템플릿 묶음을 out 에 푼다. out 은 없거나 비어 있어야 한다 (모르는 내용을 지우지 않는다) */
async function unpackTemplates(source, pin, out, anyCommit, log) {
  let data;
  if (source.kind === "release") {
    if (!pin.templates) fail("핀에 templates 자산이 없다");
    data = await source.read(pin.templates.asset);
    expectSha(pin.templates.asset, data, pin.templates.sha256, "핀과");
  } else {
    data = await source.read(TEMPLATES_ZIP);
  }
  const { readZip } = await import("./sync-engine-templates.mjs");
  const entries = readZip(data);
  const manifestData = entries.get("MANIFEST.json");
  if (!manifestData) fail(`${TEMPLATES_ZIP} 에 MANIFEST.json 이 없다`);
  const manifest = JSON.parse(manifestData.toString("utf8"));
  if (!anyCommit && manifest.engineCommit !== pin.engineCommit) {
    fail(`템플릿 묶음의 엔진 커밋 ${String(manifest.engineCommit).slice(0, 7)} 이 핀 ${pin.engineCommit.slice(0, 7)} 과 다르다`);
  }
  for (const f of manifest.files ?? []) {
    const body = entries.get(f.path);
    if (!body) fail(`묶음의 MANIFEST 에 있지만 zip 에 없다: ${f.path}`);
    expectSha(f.path, body, f.sha256, "묶음의 MANIFEST 와");
  }
  if (fs.existsSync(out) && fs.readdirSync(out).length) fail(`풀 폴더가 비어 있지 않다: ${out}`);
  for (const [name, body] of entries) {
    const dest = path.resolve(out, name);
    if (!dest.startsWith(path.resolve(out) + path.sep)) fail(`묶음의 경로가 폴더 밖을 가리킨다: ${name}`);
    writeFile(dest, body);
  }
  log(`템플릿 묶음: ${entries.size}개 파일 → ${out} (엔진 ${String(manifest.engineCommit).slice(0, 7)}${manifest.dirty ? ", dirty" : ""})`);
}

/**
 * @param {string[]} argv
 * @param {{ repo?: string, fetchImpl?: typeof fetch, log?: (s: string) => void, error?: (s: string) => void, platform?: string, arch?: string }} deps
 * @returns {Promise<number>} 종료 코드
 */
export async function main(argv, deps = {}) {
  const repo = deps.repo ?? REPO;
  const log = deps.log ?? ((s) => console.log(s));
  try {
    const args = parseArgs(argv);
    const pinFile = path.join(repo, "engine-pin.json");
    if (!fs.existsSync(pinFile)) fail(`핀이 없다: ${pinFile}`);
    const pin = readJson(pinFile);
    const pinErrors = validatePin(pin);
    if (pinErrors.length) fail(`engine-pin.json 의 모양이 틀렸다:\n${pinErrors.map((e) => `  ${e}`).join("\n")}`);
    const target = args.target ?? hostTriple(deps.platform, deps.arch);
    if (!target || !TARGETS[target]) fail(`지원하지 않는 타깃: ${target ?? `${deps.platform ?? process.platform} ${deps.arch ?? process.arch}`} (${Object.keys(TARGETS).join(", ")})`, 2);

    let source;
    let from = null;
    if (args.from) {
      from = path.resolve(args.from);
      source = folderSource(from);
    } else {
      if (!pin.engineTag) fail("핀에 엔진 태그가 없다. 공개 릴리스가 생기기 전에는 엔진에서 tools/build_dist.sh 로 만든 dist 폴더를 --from 으로 준다");
      source = releaseSource(pin.engineTag, deps.fetchImpl ?? globalThis.fetch);
    }

    if (args.templates) {
      await unpackTemplates(source, pin, path.resolve(args.templates), args.anyCommit, log);
      return 0;
    }

    // 판 정보: dist 폴더는 그 폴더의 engine-dist.json, 릴리스는 핀
    let info;
    if (source.kind === "dist-folder") {
      if (!source.has(DIST_JSON)) fail(`dist 폴더에 ${DIST_JSON} 이 없다: ${from} (엔진에서 tools/build_dist.sh 를 돌린다)`);
      const dist = JSON.parse((await source.read(DIST_JSON)).toString("utf8"));
      const distErrors = validateDist(dist);
      if (distErrors.length) fail(`${DIST_JSON} 의 모양이 틀렸다:\n${distErrors.map((e) => `  ${e}`).join("\n")}`);
      if (dist.engineCommit !== pin.engineCommit && !args.anyCommit) {
        fail(
          `dist 의 엔진 커밋 ${dist.engineCommit.slice(0, 7)} 이 핀 ${pin.engineCommit.slice(0, 7)} 과 다르다.\n` +
            `  엔진에서 git checkout ${pin.engineCommit} 뒤 tools/build_dist.sh, 또는 이 엔진을 그대로 시험하려면 --any-commit`,
        );
      }
      if (dist.describe.endsWith("-dirty")) log(`경고: 커밋 안 된 변경이 있는 엔진이다 (${dist.describe})`);
      info = { engineTag: dist.engineTag ?? null, engineCommit: dist.engineCommit, describe: dist.describe, native: dist.native };
    } else {
      info = { engineTag: pin.engineTag, engineCommit: pin.engineCommit, describe: pin.engineTag, native: pin.native ?? {} };
    }

    const binDir = path.join(repo, "src-tauri", "binaries");
    const written = [];
    if (TARGETS[target].sidecar) {
      const entry = info.native[target];
      if (!entry) fail(`${target} 엔진이 없다 (있는 것: ${Object.keys(info.native).join(", ") || "없음"})`);
      const data = await source.read(entry.asset);
      expectSha(entry.asset, data, entry.sha256, source.kind === "release" ? "핀과" : `${DIST_JSON} 과`);
      if (typeof entry.size === "number" && entry.size !== data.length) fail(`${entry.asset} 의 크기가 ${DIST_JSON} 과 다르다 (${data.length} 대 ${entry.size})`);
      if (!entry.features.includes("lua")) fail(`${entry.asset} 의 기능에 lua 가 없다 (${entry.features.join(" ")})`);
      const pinned = pin.native?.[target];
      if (source.kind === "dist-folder" && pinned && pinned.sha256 !== entry.sha256) {
        log(`참고: 핀의 sha256 과 다르다 (다른 컴퓨터에서 만든 같은 커밋이면 그럴 수 있다)`);
      }
      const exeFile = path.join(binDir, `Initial2D-${target}${target.includes("windows") ? ".exe" : ""}`);
      writeFile(exeFile, data, 0o755);
      const meta = {
        comment: "scripts/fetch-engine.mjs 가 쓴다. 손으로 고치지 않는다. 번들 리소스 engine/engine.json 으로 실려 앱이 읽는다",
        engineTag: info.engineTag,
        engineCommit: info.engineCommit,
        describe: info.describe,
        target,
        sha256: sha256(data),
        size: data.length,
        features: entry.features,
        source: source.kind,
        pinned: info.engineCommit === pin.engineCommit,
      };
      writeFile(path.join(binDir, "engine.json"), JSON.stringify(meta, null, 2) + "\n");
      written.push(`${path.relative(repo, exeFile)} (${(data.length / 1024 / 1024).toFixed(1)} MB, ${entry.features.join(" ")})`, "src-tauri/binaries/engine.json");
    } else {
      log(`${target} 는 엔진 사이드카가 없다 (Windows 엔진 R5 전). 고지만 받는다`);
    }

    const third = await readThirdParty(source, from, pin);
    const thirdFile = path.join(repo, "src-tauri", "licenses", "engine", THIRD_PARTY);
    writeFile(thirdFile, third.data);
    written.push(`${path.relative(repo, thirdFile)} (${third.from})`);

    log(`엔진 ${info.describe} (${info.engineCommit.slice(0, 7)}${info.engineTag ? `, ${info.engineTag}` : ""}) ← ${source.label}`);
    for (const w of written) log(`  ${w}`);
    if (info.engineCommit !== pin.engineCommit) log(`경고: 핀(${pin.engineCommit.slice(0, 7)})과 다른 엔진이다 (--any-commit)`);
    return 0;
  } catch (e) {
    if (e instanceof FetchError) {
      (deps.error ?? ((s) => console.error(s)))(e.message);
      return e.code;
    }
    throw e;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
