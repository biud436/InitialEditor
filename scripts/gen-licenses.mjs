#!/usr/bin/env node
// 에디터의 제3자 고지 src-tauri/licenses/THIRD-PARTY-editor.md 를 만든다 (docs/plans/e6-packaging.md 1절, 2.2 절).
// 엔진의 고지는 엔진 저장소의 THIRD-PARTY.md 이고 yarn engine:fetch 가 src-tauri/licenses/engine/ 에 받는다.
//
//   yarn licenses            파일을 다시 쓴다
//   yarn licenses --check    지금 의존성으로 만든 글과 커밋한 파일이 다르면 1 (CI)
//
// 싣는 것:
//   npm   packages/app 의 dependencies 에서 시작해 node_modules 를 따라간 런타임 의존 전부 (워크스페이스 패키지는 건너뛰고
//         그 의존을 따라간다). 프런트 번들에 들어가는 것들이다.
//   Cargo src-tauri 의 cargo metadata 에서 일반 의존(dev, build 가 아닌 것)을 따라간 크레이트 전부. 모든 OS 의 합이다.
// 둘 이상 중에서 고르는 라이선스(MIT OR Apache-2.0 등)는 MIT 부터 고르고 그 원문 파일만 싣는다. 같은 원문은 한 번만 싣는다.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, "..");
export const OUT_REL = "src-tauri/licenses/THIRD-PARTY-editor.md";
const WORKSPACE_SCOPE = "@initial-editor/";
/** 고를 수 있으면 이 순서로 고른다 */
export const PREFERRED = ["MIT", "Apache-2.0", "Zlib", "BSD-3-Clause", "BSD-2-Clause", "ISC", "Unlicense", "0BSD", "CC0-1.0", "MPL-2.0"];
const LICENSE_FILE = /^(licen[cs]e|copying|notice)/i;
/** 파일 이름에서 라이선스를 가려내는 낱말 */
const FILE_HINTS = { MIT: /mit/i, "Apache-2.0": /apache/i, Zlib: /zlib/i, "BSD-3-Clause": /bsd/i, "BSD-2-Clause": /bsd/i, ISC: /isc/i, Unlicense: /unlicen/i };

/** "MIT OR Apache-2.0", "MIT/Apache-2.0", "(MIT OR Apache-2.0) AND Unicode-3.0" 에서 고른 표현. 모르면 원래 표현 */
export function pickLicense(expr) {
  if (!expr) return "UNKNOWN";
  const text = String(expr).trim();
  // AND 가 있으면 전부 지켜야 하므로 고르지 않는다
  if (/\bAND\b/.test(text)) return text;
  const options = text
    .replace(/[()]/g, "")
    .split(/\s+OR\s+|\//)
    .map((s) => s.trim())
    .filter(Boolean);
  if (options.length <= 1) return text;
  for (const id of PREFERRED) if (options.includes(id)) return id;
  return text;
}

/** 패키지 폴더의 라이선스 원문 파일들 (고른 라이선스의 이름이 든 파일이 있으면 그것만) */
export function licenseFiles(dir, chosen) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => LICENSE_FILE.test(n) && fs.statSync(path.join(dir, n)).isFile());
  } catch {
    return [];
  }
  names.sort();
  const hint = FILE_HINTS[chosen];
  if (hint && names.length > 1) {
    const matching = names.filter((n) => hint.test(n));
    if (matching.length) return matching.map((n) => path.join(dir, n));
    // 다른 라이선스 이름만 붙은 파일(LICENSE-APACHE)은 빼고 이름 없는 것(LICENSE)을 남긴다
    const plain = names.filter((n) => !Object.values(FILE_HINTS).some((h) => h.test(n)));
    if (plain.length) return plain.map((n) => path.join(dir, n));
  }
  return names.map((n) => path.join(dir, n));
}

/** 줄 끝과 끝 공백을 맞춘다 (OS 마다 체크아웃이 달라도 같은 글이 나오게) */
export function normalizeText(text) {
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .trim();
}

function repoUrl(value) {
  if (!value) return null;
  const raw = typeof value === "string" ? value : value.url;
  if (!raw) return null;
  let url = raw.replace(/^git\+/, "").replace(/\.git$/, "").replace(/^git:\/\//, "https://");
  const short = /^(?:github:)?([\w.-]+\/[\w.-]+)$/.exec(url);
  if (short && !url.includes(":")) url = `https://github.com/${short[1]}`;
  else if (short) url = `https://github.com/${short[1]}`;
  return url.replace(/^ssh:\/\/git@github\.com\//, "https://github.com/").replace(/^git@github\.com:/, "https://github.com/");
}

function npmLicense(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license && typeof pkg.license.type === "string") return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => (typeof l === "string" ? l : l.type)).join(" OR ");
  return null;
}

/** name 을 dir 에서 Node 규칙대로 찾는다 (dir/node_modules, 그 위의 node_modules ... repo 까지) */
function resolvePackage(name, fromDir, repo) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", ...name.split("/"));
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    if (path.resolve(dir) === path.resolve(repo)) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** packages/app 에서 시작한 npm 런타임 의존. [{ name, version, license, repository, dir }] */
export function npmPackages(repo) {
  const workspaces = new Map();
  const pkgRoot = path.join(repo, "packages");
  for (const name of fs.existsSync(pkgRoot) ? fs.readdirSync(pkgRoot) : []) {
    const file = path.join(pkgRoot, name, "package.json");
    if (fs.existsSync(file)) {
      const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
      workspaces.set(pkg.name, path.join(pkgRoot, name));
    }
  }
  const found = new Map();
  const missing = [];
  const visitedWorkspaces = new Set();
  const visit = (dir, deps) => {
    for (const name of Object.keys(deps ?? {}).sort()) {
      if (workspaces.has(name)) {
        if (visitedWorkspaces.has(name)) continue;
        visitedWorkspaces.add(name);
        const wdir = workspaces.get(name);
        visit(wdir, JSON.parse(fs.readFileSync(path.join(wdir, "package.json"), "utf8")).dependencies);
        continue;
      }
      const at = resolvePackage(name, dir, repo);
      if (!at) {
        missing.push(`${name} (${path.relative(repo, dir) || "."} 에서)`);
        continue;
      }
      const real = fs.realpathSync(at);
      if (found.has(real)) continue;
      const pkg = JSON.parse(fs.readFileSync(path.join(at, "package.json"), "utf8"));
      found.set(real, { name: pkg.name ?? name, version: pkg.version ?? "?", license: npmLicense(pkg), repository: repoUrl(pkg.repository) ?? pkg.homepage ?? null, dir: at });
      visit(at, { ...(pkg.dependencies ?? {}), ...Object.fromEntries(Object.keys(pkg.optionalDependencies ?? {}).filter((d) => resolvePackage(d, at, repo)).map((d) => [d, "*"])) });
    }
  };
  const appDir = path.join(pkgRoot, "app");
  visitedWorkspaces.add("@initial-editor/app");
  visit(appDir, JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8")).dependencies);
  if (missing.length) throw new Error(`node_modules 에 없는 의존: ${missing.join(", ")} (yarn install 부터)`);
  return dedupe([...found.values()].filter((p) => !p.name.startsWith(WORKSPACE_SCOPE)));
}

function dedupe(list) {
  const map = new Map();
  for (const p of list) map.set(`${p.name}@${p.version}`, p);
  return [...map.values()].sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name < b.name ? -1 : 1));
}

/** cargo metadata 의 일반 의존 닫힘. 뿌리 크레이트는 뺀다 */
export function cargoPackages(metadata) {
  const byId = new Map(metadata.packages.map((p) => [p.id, p]));
  const nodes = new Map(metadata.resolve.nodes.map((n) => [n.id, n]));
  const root = metadata.resolve.root;
  const seen = new Set();
  const stack = [root];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const dep of nodes.get(id)?.deps ?? []) {
      if ((dep.dep_kinds ?? [{ kind: null }]).some((k) => k.kind == null)) stack.push(dep.pkg);
    }
  }
  seen.delete(root);
  return dedupe(
    [...seen].map((id) => {
      const p = byId.get(id);
      return { name: p.name, version: p.version, license: p.license ?? (p.license_file ? `파일: ${p.license_file}` : null), repository: p.repository ?? p.homepage ?? null, dir: path.dirname(p.manifest_path) };
    }),
  );
}

export function cargoMetadata(repo) {
  const out = execFileSync("cargo", ["metadata", "--format-version", "1", "--locked"], { cwd: path.join(repo, "src-tauri"), encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(out);
}

/** 원문을 모아 같은 글끼리 묶는다. 돌려주는 것은 [{ text, users: ["name 판"] }] (처음 나온 순서) */
function collectTexts(groups) {
  const texts = new Map();
  for (const list of groups) {
    for (const p of list) {
      p.chosen = pickLicense(p.license);
      p.texts = [];
      for (const file of licenseFiles(p.dir, p.chosen)) {
        const text = normalizeText(fs.readFileSync(file, "utf8"));
        if (!text) continue;
        const key = createHash("sha256").update(text).digest("hex");
        if (!texts.has(key)) texts.set(key, { text, users: [] });
        const entry = texts.get(key);
        entry.users.push(`${p.name} ${p.version}`);
        p.texts.push(key);
      }
    }
  }
  return texts;
}

function cell(v) {
  return String(v ?? "").replace(/\|/g, "\\|");
}

export function render(npm, cargo) {
  const texts = collectTexts([npm, cargo]);
  const order = [...texts.keys()];
  const number = new Map(order.map((k, i) => [k, i + 1]));
  const lines = [];
  lines.push("# InitialEditor 제3자 고지");
  lines.push("");
  lines.push("`node scripts/gen-licenses.mjs` 가 만든다. 손으로 고치지 않는다 (`--check` 가 CI 에서 대조한다).");
  lines.push("엔진(Initial2D)과 웹 엔진의 고지는 `engine/THIRD-PARTY.md` 에 따로 있다.");
  lines.push("");
  lines.push("InitialEditor 의 프런트(웹뷰)와 데스크톱 셸에 들어간 제3자 소프트웨어다. 둘 이상 중에서 고르는 라이선스는 고른 것을 적었고,");
  lines.push("원문은 아래 \"라이선스 원문\" 에 번호로 한 번씩 싣는다. 원문 파일이 없는 패키지는 라이선스 이름과 출처만 적는다.");
  const table = (title, list) => {
    lines.push("");
    lines.push(`## ${title} (${list.length}개)`);
    lines.push("");
    lines.push("| 패키지 | 판 | 라이선스 | 원문 | 출처 |");
    lines.push("|---|---|---|---|---|");
    for (const p of list) lines.push(`| ${cell(p.name)} | ${cell(p.version)} | ${cell(p.chosen)} | ${p.texts.map((k) => number.get(k)).join(", ") || "-"} | ${cell(p.repository ?? "")} |`);
  };
  table("npm, 프런트", npm);
  table("Cargo, 데스크톱 셸 (모든 OS 의 합)", cargo);
  lines.push("");
  lines.push("## 라이선스 원문");
  order.forEach((key, i) => {
    const t = texts.get(key);
    lines.push("");
    lines.push(`### ${i + 1}`);
    lines.push("");
    lines.push(`적용: ${t.users.join(", ")}`);
    lines.push("");
    lines.push("````text");
    lines.push(t.text);
    lines.push("````");
  });
  lines.push("");
  return lines.join("\n");
}

export async function main(argv, deps = {}) {
  const repo = deps.repo ?? DEFAULT_REPO;
  const log = deps.log ?? console.log;
  const err = deps.error ?? console.error;
  const unknown = argv.filter((a) => a !== "--check");
  if (unknown.length) {
    err(`gen-licenses: 모르는 인자 ${unknown.join(" ")} (사용법: gen-licenses.mjs [--check])`);
    return 2;
  }
  const check = argv.includes("--check");
  let text;
  try {
    const npm = (deps.npmPackages ?? npmPackages)(repo);
    const cargo = cargoPackages((deps.cargoMetadata ?? cargoMetadata)(repo));
    text = render(npm, cargo);
  } catch (e) {
    err(`FAIL ${e.message}`);
    return 1;
  }
  const out = path.join(repo, OUT_REL);
  if (check) {
    const current = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : null;
    if (current === text) {
      log(`OK ${OUT_REL} 가 지금 의존성과 같다`);
      return 0;
    }
    if (current == null) err(`FAIL ${OUT_REL} 이 없다. yarn licenses 로 만든다`);
    else {
      const a = current.split("\n");
      const b = text.split("\n");
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      err(`FAIL ${OUT_REL} 가 지금 의존성과 다르다 (${i + 1}번째 줄부터). yarn licenses 로 다시 만든다`);
      err(`  파일: ${a[i] ?? "(끝)"}`);
      err(`  새로: ${b[i] ?? "(끝)"}`);
    }
    return 1;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  log(`${OUT_REL} 를 썼다 (${Buffer.byteLength(text)} 바이트)`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main(process.argv.slice(2)));
}
