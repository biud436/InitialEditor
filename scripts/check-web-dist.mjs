#!/usr/bin/env node
// 빌드한 웹 산출물(dist/) 검사 (docs/plans/e6-packaging.md 7.5). CI 의 web 잡이 yarn build 뒤에 돈다.
//
//   node scripts/check-web-dist.mjs                 저장소의 dist/ (웹판, Cloudflare Pages 가 내는 것)
//   node scripts/check-web-dist.mjs --dist <폴더>    다른 폴더
//   node scripts/check-web-dist.mjs --desktop       데스크톱 번들용 빌드 (소스맵이 없어야 한다)
//
// 보는 것:
//   1. index.html 과 _headers 가 있고, index.html 이 부르는 /assets/ 파일이 다 있다
//   2. _headers 규칙 (Cloudflare Pages 문법): 모든 .wasm 이 application/wasm, engine/ 은 no-cache 이고 immutable 이 아니다,
//      assets/ 는 immutable, 모든 경로에 X-Content-Type-Options: nosniff. 교차 출처 격리 헤더(COOP, COEP)는 없다
//   3. engine/MANIFEST.json 에 로더 셋이 있고 그 파일들의 크기와 sha256 이 같다. engine/THIRD-PARTY.md (엔진 제3자 고지)가 있다
//   4. Pages 한도: 25 MiB 넘는 파일이 없고 파일 수가 20,000 아래다
//   5. --desktop 이면 소스맵(*.map)이 없다
// 문제가 있으면 줄마다 찍고 종료 코드 1, 없으면 요약 한 줄과 0.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 20_000;
export const ENGINE_FILES = ["Initial2D.js", "Initial2D.wasm", "initial2d-loader.js"];
export const ENGINE_NOTICES = "THIRD-PARTY.md";
const ISOLATION_HEADERS = ["cross-origin-opener-policy", "cross-origin-embedder-policy"];

/**
 * _headers 를 읽는다. 규칙 줄은 경로(/ 로 시작)나 절대 주소, 헤더 줄은 들여 쓴 "이름: 값", "! 이름" 은 떼기다. # 은 주석.
 * @returns {{ rules: Array<{ pattern: string, line: number, headers: Array<[string, string]>, detach: string[] }>, problems: string[] }}
 */
export function parseHeaders(text) {
  const rules = [];
  const problems = [];
  let current = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (raw.trim() === "" || raw.trim().startsWith("#")) return;
    if (!/^\s/.test(raw)) {
      const pattern = raw.trim();
      if (!pattern.startsWith("/") && !/^https?:\/\//.test(pattern)) {
        problems.push(`_headers ${line}행: 규칙은 / 나 https:// 로 시작한다: ${pattern}`);
        current = null;
        return;
      }
      current = { pattern, line, headers: [], detach: [] };
      rules.push(current);
      return;
    }
    if (!current) {
      problems.push(`_headers ${line}행: 규칙 줄 없이 헤더가 왔다: ${raw.trim()}`);
      return;
    }
    const body = raw.trim();
    if (body.startsWith("!")) {
      current.detach.push(body.slice(1).trim().toLowerCase());
      return;
    }
    const colon = body.indexOf(":");
    if (colon <= 0) {
      problems.push(`_headers ${line}행: "이름: 값" 꼴이 아니다: ${body}`);
      return;
    }
    current.headers.push([body.slice(0, colon).trim(), body.slice(colon + 1).trim()]);
  });
  for (const r of rules) if (r.headers.length === 0 && r.detach.length === 0) problems.push(`_headers ${r.line}행: 헤더가 없는 규칙이다: ${r.pattern}`);
  return { rules, problems };
}

/** 규칙의 경로가 path 와 맞는가 (* 는 아무 글자나, :이름 은 한 마디) */
export function matchesPattern(pattern, urlPath) {
  const pathPart = pattern.replace(/^https?:\/\/[^/]+/, "");
  const source = pathPart
    .split(/(\*|:[A-Za-z_][A-Za-z0-9_]*)/)
    .map((part) => (part === "*" ? ".*" : part.startsWith(":") && part.length > 1 ? "[^/]+" : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${source}$`).test(urlPath);
}

/** 그 경로의 응답 헤더 (소문자 이름 → 값). 맞는 규칙을 위에서부터 모으고 같은 이름은 쉼표로 잇는다 (Pages 와 같다) */
export function headersFor(rules, urlPath) {
  const out = new Map();
  const detached = new Set();
  for (const r of rules) {
    if (!matchesPattern(r.pattern, urlPath)) continue;
    for (const [name, value] of r.headers) {
      const key = name.toLowerCase();
      out.set(key, out.has(key) ? `${out.get(key)}, ${value}` : value);
    }
    for (const d of r.detach) detached.add(d);
  }
  for (const d of detached) out.delete(d);
  return out;
}

function* walk(dir, base = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, base);
    else if (entry.isFile()) yield { full, rel: path.relative(base, full).split(path.sep).join("/") };
  }
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function mib(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

/**
 * dist 폴더를 검사한다.
 * @param {string} dist
 * @param {{ desktop?: boolean }} [options]
 * @returns {{ problems: string[], summary: string }}
 */
export function checkWebDist(dist, options = {}) {
  const problems = [];
  if (!fs.existsSync(dist) || !fs.statSync(dist).isDirectory()) return { problems: [`dist 폴더가 없다: ${dist} (yarn build 를 먼저)`], summary: "" };
  const files = [...walk(dist)];
  const has = (rel) => files.some((f) => f.rel === rel);

  // 1. index.html 과 그것이 부르는 assets
  const indexFile = path.join(dist, "index.html");
  if (!fs.existsSync(indexFile)) problems.push("index.html 이 없다");
  else {
    const html = fs.readFileSync(indexFile, "utf8");
    for (const m of html.matchAll(/(?:src|href)="\/?(assets\/[^"]+)"/g)) if (!has(m[1])) problems.push(`index.html 이 부르는 ${m[1]} 이(가) 없다`);
  }

  // 2. _headers
  const headersFile = path.join(dist, "_headers");
  let rules = [];
  if (!fs.existsSync(headersFile)) problems.push("_headers 가 없다 (packages/app/public/_headers 가 dist 로 옮겨져야 한다)");
  else {
    const parsed = parseHeaders(fs.readFileSync(headersFile, "utf8"));
    rules = parsed.rules;
    problems.push(...parsed.problems);
    const wasmFiles = files.filter((f) => f.rel.endsWith(".wasm"));
    if (wasmFiles.length === 0) problems.push(".wasm 파일이 없다 (웹 엔진이 빠졌다)");
    for (const f of wasmFiles) {
      const type = headersFor(rules, `/${f.rel}`).get("content-type");
      if (type !== "application/wasm") problems.push(`/${f.rel} 의 Content-Type 규칙이 application/wasm 이 아니다 (${type ?? "없음"}). 스트리밍 컴파일이 실패한다`);
    }
    for (const rel of ["engine/MANIFEST.json", ...ENGINE_FILES.map((n) => `engine/${n}`)]) {
      const cache = headersFor(rules, `/${rel}`).get("cache-control") ?? "";
      if (!/no-cache/.test(cache)) problems.push(`/${rel} 의 Cache-Control 에 no-cache 가 없다 (${cache || "없음"}). 엔진 파일은 이름에 해시가 없다`);
      if (/immutable/.test(cache)) problems.push(`/${rel} 이(가) immutable 이다. 엔진 파일은 이름에 해시가 없다`);
    }
    const asset = files.find((f) => f.rel.startsWith("assets/"));
    if (!asset) problems.push("assets/ 에 파일이 없다");
    else if (!/immutable/.test(headersFor(rules, `/${asset.rel}`).get("cache-control") ?? "")) problems.push(`/${asset.rel} 의 Cache-Control 에 immutable 이 없다`);
    for (const p of ["/", "/index.html", `/${asset?.rel ?? "assets/x.js"}`, "/engine/Initial2D.wasm"]) {
      const h = headersFor(rules, p);
      if (h.get("x-content-type-options") !== "nosniff") problems.push(`${p} 에 X-Content-Type-Options: nosniff 가 없다`);
      for (const name of ISOLATION_HEADERS) if (h.has(name)) problems.push(`${p} 에 ${name} 가 있다. 교차 출처 격리는 두지 않는다 (엔진이 스레드를 쓰지 않는다)`);
    }
  }

  // 3. 웹 엔진과 고지
  const manifestFile = path.join(dist, "engine", "MANIFEST.json");
  if (!fs.existsSync(manifestFile)) problems.push("engine/MANIFEST.json 이 없다 (yarn sync:engine-web)");
  else {
    let manifest = null;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    } catch (e) {
      problems.push(`engine/MANIFEST.json 을 읽지 못했다: ${e.message}`);
    }
    if (manifest) {
      const listed = new Map((manifest.files ?? []).map((f) => [f.path, f]));
      for (const name of ENGINE_FILES) if (!listed.has(name)) problems.push(`engine/MANIFEST.json 에 ${name} 이(가) 없다`);
      for (const f of listed.values()) {
        const file = path.join(dist, "engine", f.path);
        if (!fs.existsSync(file)) {
          problems.push(`engine/${f.path} 이(가) 없다 (MANIFEST 에는 있다)`);
          continue;
        }
        const size = fs.statSync(file).size;
        if (size !== f.size) problems.push(`engine/${f.path} 의 크기가 MANIFEST 와 다르다: ${size} (MANIFEST ${f.size})`);
        else if (sha256(file) !== f.sha256) problems.push(`engine/${f.path} 의 sha256 이 MANIFEST 와 다르다`);
      }
    }
  }
  if (!has(`engine/${ENGINE_NOTICES}`)) problems.push(`engine/${ENGINE_NOTICES} 이(가) 없다 (엔진 제3자 고지, yarn sync:engine-web 이 엔진 저장소에서 복사한다)`);

  // 4. Pages 한도
  let total = 0;
  for (const f of files) {
    const size = fs.statSync(f.full).size;
    total += size;
    if (size > MAX_FILE_BYTES) problems.push(`${f.rel} 이(가) ${mib(size)} 다. Pages 는 파일 하나에 25 MiB 까지다`);
  }
  if (files.length >= MAX_FILES) problems.push(`파일이 ${files.length} 개다. Pages 는 20,000 개 아래다`);

  // 5. 데스크톱 빌드의 소스맵
  const maps = files.filter((f) => f.rel.endsWith(".map"));
  if (options.desktop && maps.length > 0) problems.push(`데스크톱 빌드에 소스맵이 ${maps.length} 개 있다 (예: ${maps[0].rel}). yarn build:desktop 은 소스맵 없이 만든다`);

  const summary = `${options.desktop ? "데스크톱" : "웹판"} dist: 파일 ${files.length} 개, ${mib(total)}, 소스맵 ${maps.length} 개, _headers 규칙 ${rules.length} 개`;
  return { problems, summary };
}

function main(argv) {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const i = argv.indexOf("--dist");
  const dist = path.resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : path.join(repo, "dist"));
  const { problems, summary } = checkWebDist(dist, { desktop: argv.includes("--desktop") });
  if (problems.length > 0) {
    for (const p of problems) console.error(`FAIL ${p}`);
    console.error(`check-web-dist: 문제 ${problems.length} 개 (${dist})`);
    return 1;
  }
  console.log(`OK ${summary}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main(process.argv.slice(2)));
