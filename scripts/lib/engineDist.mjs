// 엔진 배포물(R4)과 핀(engine-pin.json)을 다루는 공용 함수 (docs/plans/e6-packaging.md 2.2 절, 4.2 절).
// scripts/fetch-engine.mjs, scripts/check-engine-pin.mjs, scripts/check-sidecar.mjs 가 같이 쓴다. 의존성 없음.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const COMMIT_RE = /^[0-9a-f]{40}$/;
export const SHA256_RE = /^[0-9a-f]{64}$/;
/** 엔진 `--version` 의 한 줄: `Initial2D <describe> <커밋 40자>` */
export const VERSION_RE = /^Initial2D (\S+) ([0-9a-f]{40})$/;
export const RELEASE_BASE = "https://github.com/biud436/Initial2D/releases/download";

/** 타깃별 사이드카. Windows 는 엔진(R5)이 없어 고지만 받는다. Intel 맥은 지원하지 않는다 */
export const TARGETS = {
  "aarch64-apple-darwin": { sidecar: true, exe: "Initial2D" },
  "x86_64-unknown-linux-gnu": { sidecar: true, exe: "Initial2D" },
  "x86_64-pc-windows-msvc": { sidecar: false, exe: "Initial2D.exe" },
};

/** 이 컴퓨터의 타깃 트리플. 모르는 조합이면 null */
export function hostTriple(platform = process.platform, arch = process.arch) {
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  if (platform === "linux" && arch === "x64") return "x86_64-unknown-linux-gnu";
  if (platform === "win32" && arch === "x64") return "x86_64-pc-windows-msvc";
  return null;
}

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isStringOrNull = (v) => v === null || typeof v === "string";

function checkAsset(errors, where, a, { needsFeatures = false } = {}) {
  if (!isObject(a)) return errors.push(`${where} 가 객체가 아니다`);
  if (typeof a.asset !== "string" || !a.asset) errors.push(`${where}.asset 이 없다`);
  if (!SHA256_RE.test(String(a.sha256 ?? ""))) errors.push(`${where}.sha256 이 64자 16진수가 아니다`);
  if (needsFeatures && (!Array.isArray(a.features) || !a.features.every((f) => typeof f === "string"))) errors.push(`${where}.features 가 글 배열이 아니다`);
}

/** engine-pin.json 의 모양. 틀린 곳의 목록 (비면 맞다) */
export function validatePin(pin) {
  const errors = [];
  if (!isObject(pin)) return ["핀이 객체가 아니다"];
  if (!COMMIT_RE.test(String(pin.engineCommit ?? ""))) errors.push("engineCommit 이 40자 커밋이 아니다");
  if (!isStringOrNull(pin.engineTag ?? null)) errors.push("engineTag 는 글이나 null 이다");
  if (!isStringOrNull(pin.ciEngineRef ?? null)) errors.push("ciEngineRef 는 글이나 null 이다");
  if (pin.native !== undefined) {
    if (!isObject(pin.native)) errors.push("native 가 객체가 아니다");
    else for (const [triple, a] of Object.entries(pin.native)) checkAsset(errors, `native.${triple}`, a, { needsFeatures: true });
  }
  for (const key of ["web", "templates", "thirdParty"]) if (pin[key] !== undefined) checkAsset(errors, key, pin[key]);
  return errors;
}

/** 엔진의 dist 폴더(tools/build_dist.sh, dist.yml 의 collect)가 쓴 engine-dist.json 의 모양 */
export function validateDist(dist) {
  const errors = [];
  if (!isObject(dist)) return ["engine-dist.json 이 객체가 아니다"];
  if (!COMMIT_RE.test(String(dist.engineCommit ?? ""))) errors.push("engineCommit 이 40자 커밋이 아니다");
  if (typeof dist.describe !== "string" || !dist.describe) errors.push("describe 가 없다");
  if (!isStringOrNull(dist.engineTag ?? null)) errors.push("engineTag 는 글이나 null 이다");
  if (!isObject(dist.native)) errors.push("native 가 객체가 아니다");
  else for (const [triple, a] of Object.entries(dist.native)) checkAsset(errors, `native.${triple}`, a, { needsFeatures: true });
  return errors;
}

/** SHA256SUMS.txt (`<sha256>  <이름>` 줄들) */
export function parseSha256Sums(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64}) [ *]?(.+)$/.exec(line.trim());
    if (m) out.set(m[2], m[1]);
  }
  return out;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "target", "test-results", "playwright-report", ".yarn", "binaries"]);

/** 저장소 안의 엔진에서 온 MANIFEST.json 전부 (engineCommit 칸이 있는 것). 저장소 기준 경로 */
export function findEngineManifests(repo) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (entry.name === "MANIFEST.json") {
        const file = path.join(dir, entry.name);
        let data;
        try {
          data = readJson(file);
        } catch {
          continue;
        }
        if (isObject(data) && "engineCommit" in data) found.push({ rel: path.relative(repo, file).split(path.sep).join("/"), data });
      }
    }
  };
  walk(repo);
  return found.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** 엔진에서 온 MANIFEST 하나가 핀과 맞는가: 커밋 40자가 핀과 같고, source 와 syncCommand 가 있다 */
export function checkManifest(manifest, pin) {
  const errors = [];
  const commit = String(manifest.engineCommit ?? "");
  if (!COMMIT_RE.test(commit)) errors.push(`engineCommit 이 40자 커밋이 아니다 (${commit || "없음"})`);
  else if (commit !== pin.engineCommit) errors.push(`엔진 커밋 ${commit.slice(0, 7)} 이 핀 ${pin.engineCommit.slice(0, 7)} 과 다르다`);
  if (manifest.source !== "release" && manifest.source !== "checkout") errors.push(`source 가 release 나 checkout 이 아니다 (${manifest.source ?? "없음"})`);
  if (typeof manifest.syncCommand !== "string" || !manifest.syncCommand.trim()) errors.push("syncCommand 가 없다");
  return errors;
}
