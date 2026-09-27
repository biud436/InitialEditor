#!/usr/bin/env node
// 판 번호 (docs/plans/e6-packaging.md 9절). 판의 원천은 루트 package.json 하나다. tauri.conf.json 의 version 은
// "../package.json" 이라 판이 바뀔 때 고칠 곳이 아니다.
//
//   yarn version:set <판> [--no-install]
//       루트와 packages/*/package.json 의 version, 워크스페이스끼리의 의존(판을 그대로 적은 것), src-tauri/Cargo.toml,
//       Cargo.lock 의 자기 항목을 한꺼번에 고친다. 그다음 yarn install 로 잠금 파일을 맞춘다 (--no-install 이면 건너뛴다)
//   yarn version:check [--tag v<판>] [--bundles <폴더>]
//       위 파일이 하나라도 어긋나거나, tauri.conf.json 의 version 이 "../package.json" 이 아니거나, 태그가 판과 다르거나,
//       번들 폴더의 설치 파일(dmg, AppImage, deb, exe, msi) 이름에 판이 없으면 1
// 종료 코드: 0 통과, 1 어긋남, 2 인자 오류.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, "..");

export const TAURI_VERSION_REF = "../package.json";
export const CRATE_NAME = "initial-editor";
const INTERNAL_SCOPE = "@initial-editor/";
const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const BUNDLE_EXTS = [".dmg", ".appimage", ".deb", ".rpm", ".exe", ".msi"];

// semver.org 2.0.0 의 정규식
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isSemver(v) {
  return typeof v === "string" && SEMVER.test(v);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** JSON 을 들여쓰기 두 칸과 끝 줄바꿈으로 (저장소의 package.json 모양) */
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

/** 루트 package.json 의 workspaces 글롭("packages/*" 꼴)에 든 package.json 경로들 */
export function workspacePackages(repo) {
  const root = readJson(path.join(repo, "package.json"));
  const globs = Array.isArray(root.workspaces) ? root.workspaces : (root.workspaces?.packages ?? []);
  const out = [];
  for (const glob of globs) {
    if (!glob.endsWith("/*")) throw new Error(`모르는 workspaces 글롭이다: ${glob}`);
    const dir = path.join(repo, glob.slice(0, -2));
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name, "package.json");
      if (fs.existsSync(file)) out.push(file);
    }
  }
  return out;
}

/** Cargo.toml 의 [package] 절 version */
export function cargoTomlVersion(text) {
  const section = /^\[package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(text);
  if (!section) return null;
  const m = /^version\s*=\s*"([^"]*)"\s*$/m.exec(section[1]);
  return m ? m[1] : null;
}

export function setCargoTomlVersion(text, version) {
  const section = /^\[package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(text);
  if (!section) throw new Error("Cargo.toml 에 [package] 절이 없다");
  const body = section[1].replace(/^version\s*=\s*"[^"]*"\s*$/m, `version = "${version}"`);
  return text.slice(0, section.index) + section[0].replace(section[1], body) + text.slice(section.index + section[0].length);
}

const LOCK_ENTRY = (name) => new RegExp(`(\\[\\[package\\]\\]\\r?\\nname = "${name}"\\r?\\nversion = ")([^"]*)(")`);

/** Cargo.lock 의 자기 크레이트 항목 version */
export function cargoLockVersion(text, name = CRATE_NAME) {
  const m = LOCK_ENTRY(name).exec(text);
  return m ? m[2] : null;
}

export function setCargoLockVersion(text, version, name = CRATE_NAME) {
  if (!LOCK_ENTRY(name).test(text)) throw new Error(`Cargo.lock 에 ${name} 항목이 없다`);
  return text.replace(LOCK_ENTRY(name), `$1${version}$3`);
}

/** 판이 적힌 곳 전부: [{ file, what, value }] */
export function collectVersions(repo) {
  const rel = (f) => path.relative(repo, f).split(path.sep).join("/");
  const out = [];
  const rootFile = path.join(repo, "package.json");
  const rootPkg = readJson(rootFile);
  out.push({ file: "package.json", what: "version", value: rootPkg.version });
  for (const file of workspacePackages(repo)) {
    const pkg = readJson(file);
    out.push({ file: rel(file), what: "version", value: pkg.version });
    for (const field of DEP_FIELDS) {
      for (const [dep, spec] of Object.entries(pkg[field] ?? {})) {
        if (dep.startsWith(INTERNAL_SCOPE)) out.push({ file: rel(file), what: `${field}.${dep}`, value: spec, internal: true });
      }
    }
  }
  const toml = path.join(repo, "src-tauri", "Cargo.toml");
  if (fs.existsSync(toml)) out.push({ file: "src-tauri/Cargo.toml", what: "[package].version", value: cargoTomlVersion(fs.readFileSync(toml, "utf8")) });
  const lock = path.join(repo, "src-tauri", "Cargo.lock");
  if (fs.existsSync(lock)) out.push({ file: "src-tauri/Cargo.lock", what: `${CRATE_NAME}.version`, value: cargoLockVersion(fs.readFileSync(lock, "utf8")) });
  return out;
}

/** 번들 폴더(재귀) 안의 설치 파일 이름들 */
export function findBundles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        // .app 폴더 안은 보지 않는다 (설치 파일이 아니다)
        if (!e.name.endsWith(".app")) walk(p);
      } else if (BUNDLE_EXTS.includes(path.extname(e.name).toLowerCase())) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/** 어긋남 목록. 비었으면 통과 */
export function checkRepo(repo, opts = {}) {
  const problems = [];
  const entries = collectVersions(repo);
  const version = entries[0].value;
  if (!isSemver(version)) problems.push(`package.json 의 version 이 SemVer 가 아니다: ${JSON.stringify(version)}`);
  for (const e of entries.slice(1)) {
    if (e.value == null) problems.push(`${e.file}: ${e.what} 값을 찾지 못했다`);
    else if (e.internal && String(e.value).startsWith("workspace:")) continue;
    else if (e.value !== version) problems.push(`${e.file}: ${e.what} 값이 ${e.value}, 루트 package.json 은 ${version}`);
  }
  const confFile = path.join(repo, "src-tauri", "tauri.conf.json");
  if (fs.existsSync(confFile)) {
    const conf = readJson(confFile);
    if (conf.version !== TAURI_VERSION_REF) problems.push(`src-tauri/tauri.conf.json 의 version 은 ${JSON.stringify(TAURI_VERSION_REF)} 이어야 한다 (지금 ${JSON.stringify(conf.version)})`);
  } else problems.push("src-tauri/tauri.conf.json 이 없다");
  if (opts.tag != null) {
    if (!/^v/.test(opts.tag)) problems.push(`태그는 v<판> 꼴이어야 한다: ${opts.tag}`);
    else if (opts.tag.slice(1) !== version) problems.push(`태그 ${opts.tag} 가 판 ${version} 과 다르다`);
  }
  if (opts.bundles != null) {
    if (!fs.existsSync(opts.bundles)) problems.push(`번들 폴더가 없다: ${opts.bundles}`);
    else {
      const files = findBundles(opts.bundles);
      if (files.length === 0) problems.push(`번들 폴더에 설치 파일이 없다: ${opts.bundles}`);
      for (const f of files) if (!path.basename(f).includes(`_${version}_`)) problems.push(`번들 이름에 판 ${version} 이 없다: ${path.basename(f)}`);
    }
  }
  return { version, entries, problems };
}

/** 판을 한꺼번에 고친다. 워크스페이스끼리의 의존은 판을 그대로 적은 것만 (workspace: 는 그대로) */
export function setRepoVersion(repo, version) {
  if (!isSemver(version)) throw new Error(`SemVer 가 아니다: ${version}`);
  const changed = [];
  const rootFile = path.join(repo, "package.json");
  const rootPkg = readJson(rootFile);
  const old = rootPkg.version;
  const touch = (file, before, after, write) => {
    if (before !== after) {
      write(after);
      changed.push(path.relative(repo, file).split(path.sep).join("/"));
    }
  };
  touch(rootFile, rootPkg.version, version, (v) => writeJson(rootFile, { ...rootPkg, version: v }));
  for (const file of workspacePackages(repo)) {
    const pkg = readJson(file);
    const before = JSON.stringify(pkg);
    pkg.version = version;
    for (const field of DEP_FIELDS) {
      for (const [dep, spec] of Object.entries(pkg[field] ?? {})) {
        if (dep.startsWith(INTERNAL_SCOPE) && !String(spec).startsWith("workspace:") && (spec === old || isSemver(spec))) pkg[field][dep] = version;
      }
    }
    touch(file, before, JSON.stringify(pkg), () => writeJson(file, pkg));
  }
  const toml = path.join(repo, "src-tauri", "Cargo.toml");
  if (fs.existsSync(toml)) {
    const text = fs.readFileSync(toml, "utf8");
    touch(toml, text, setCargoTomlVersion(text, version), (t) => fs.writeFileSync(toml, t));
  }
  const lock = path.join(repo, "src-tauri", "Cargo.lock");
  if (fs.existsSync(lock)) {
    const text = fs.readFileSync(lock, "utf8");
    touch(lock, text, setCargoLockVersion(text, version), (t) => fs.writeFileSync(lock, t));
  }
  return { old, changed };
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const out = { command, version: null, tag: null, bundles: null, install: true };
  if (command !== "set" && command !== "check") throw new Error("명령은 set 이나 check 다");
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--no-install") out.install = false;
    else if (a === "--tag" || a === "--bundles") {
      const v = rest[++i];
      if (!v) throw new Error(`${a} 에 값이 없다`);
      out[a.slice(2)] = v;
    } else if (a.startsWith("--")) throw new Error(`모르는 인자: ${a}`);
    else if (command === "set" && out.version == null) out.version = a;
    else throw new Error(`남는 인자: ${a}`);
  }
  if (command === "set" && !out.version) throw new Error("set 에 판이 없다 (예: yarn version:set 2.0.0-alpha.1)");
  if (command === "check" && !out.install) throw new Error("--no-install 은 set 에만 쓴다");
  return out;
}

export async function main(argv, deps = {}) {
  const repo = deps.repo ?? DEFAULT_REPO;
  const log = deps.log ?? console.log;
  const err = deps.error ?? console.error;
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    err(`version: ${e.message}`);
    err("사용법: version.mjs set <판> [--no-install] | version.mjs check [--tag v<판>] [--bundles <폴더>]");
    return 2;
  }
  if (args.command === "set") {
    let result;
    try {
      result = setRepoVersion(repo, args.version);
    } catch (e) {
      err(`version: ${e.message}`);
      return 2;
    }
    log(`판 ${result.old} -> ${args.version} (고친 파일 ${result.changed.length}개)`);
    for (const f of result.changed) log(`  ${f}`);
    if (args.install && result.changed.length) {
      const install = deps.install ?? (() => spawnSync("yarn", ["install"], { cwd: repo, stdio: "inherit", shell: process.platform === "win32" }).status ?? 1);
      log("yarn install 로 잠금 파일을 맞춘다");
      const code = install();
      if (code !== 0) {
        err("yarn install 이 실패했다. 손으로 yarn install 을 돌린다");
        return 1;
      }
    }
    const after = checkRepo(repo);
    for (const p of after.problems) err(`FAIL ${p}`);
    return after.problems.length ? 1 : 0;
  }
  let result;
  try {
    result = checkRepo(repo, { tag: args.tag, bundles: args.bundles ? path.resolve(args.bundles) : null });
  } catch (e) {
    err(`FAIL ${e.message}`);
    return 1;
  }
  for (const p of result.problems) err(`FAIL ${p}`);
  if (result.problems.length) return 1;
  log(`OK 판 ${result.version} (적힌 곳 ${result.entries.length}군데${args.tag ? `, 태그 ${args.tag}` : ""}${args.bundles ? ", 번들 이름" : ""})`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main(process.argv.slice(2)));
}
