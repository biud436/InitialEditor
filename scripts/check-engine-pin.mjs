#!/usr/bin/env node
// 판 대조 (docs/plans/e6-packaging.md 4.1 절의 check 잡, 9절). 릴리스 전에 도는 문이다.
//
//   yarn engine:check
//
// 보는 것:
//   1. engine-pin.json 의 모양 (engineCommit 40자, 자산 칸)
//   2. ciEngineRef 가 비어 있다 (새 엔진 코드가 필요한 PR 이 잠시 쓰는 칸이라 릴리스에는 남으면 안 된다)
//   3. 저장소 안의 엔진에서 온 MANIFEST.json 전부(engineCommit 칸이 있는 것: 템플릿, 웹 엔진, 픽스처)의 커밋이 핀과 같고
//      source(release 나 checkout)와 syncCommand 가 있다
//   4. src-tauri/binaries/engine.json 이 있으면(yarn engine:fetch 뒤) 그 커밋도 핀과 같다
//   5. 핀에 web 자산이 있으면(릴리스가 생긴 뒤) public/engine/ 의 파일이 그 zip 과 sha256 이 같다. 없으면 건너뛴다고 알린다
// 종료 코드: 0 통과, 1 어긋남.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_BASE, checkManifest, findEngineManifests, readJson, sha256, validatePin } from "./lib/engineDist.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB_DIR = "packages/app/public/engine";

/**
 * @param {{ repo?: string, fetchImpl?: typeof fetch, log?: (s: string) => void }} deps
 * @returns {Promise<number>} 종료 코드
 */
export async function main(deps = {}) {
  const repo = deps.repo ?? REPO;
  const log = deps.log ?? ((s) => console.log(s));
  let failed = 0;
  const pass = (s) => log(`  PASS  ${s}`);
  const bad = (s) => {
    failed++;
    log(`  FAIL  ${s}`);
  };

  const pinFile = path.join(repo, "engine-pin.json");
  if (!fs.existsSync(pinFile)) {
    log(`핀이 없다: ${pinFile}`);
    return 1;
  }
  let pin;
  try {
    pin = readJson(pinFile);
  } catch (e) {
    log(`engine-pin.json 을 읽지 못했다: ${e.message}`);
    return 1;
  }
  log(`[핀] ${pin.engineCommit ?? "?"}${pin.engineTag ? ` (${pin.engineTag})` : " (태그 없음)"}`);
  const pinErrors = validatePin(pin);
  if (pinErrors.length) {
    for (const e of pinErrors) bad(`engine-pin.json: ${e}`);
    log("engine:check: 핀의 모양이 틀렸다");
    return 1;
  }
  pass("engine-pin.json 의 모양");
  if (pin.ciEngineRef) bad(`ciEngineRef 가 남아 있다 (${pin.ciEngineRef}). 엔진 PR 이 들어갔으면 engineCommit 을 올리고 비운다`);
  else pass("ciEngineRef 가 비어 있다");

  log("[엔진에서 온 MANIFEST]");
  const manifests = findEngineManifests(repo);
  if (manifests.length === 0) bad("엔진에서 온 MANIFEST.json 이 하나도 없다");
  for (const { rel, data } of manifests) {
    const errors = checkManifest(data, pin);
    const what = `${rel} (${String(data.engineCommit ?? "?").slice(0, 7)}, ${data.source ?? "source 없음"}${data.syncCommand ? `, ${data.syncCommand}` : ""})`;
    if (errors.length) bad(`${what}: ${errors.join(", ")}`);
    else pass(what);
  }

  const engineJson = path.join(repo, "src-tauri", "binaries", "engine.json");
  if (fs.existsSync(engineJson)) {
    log("[앱에 싣는 엔진]");
    const meta = readJson(engineJson);
    if (meta.engineCommit === pin.engineCommit) pass(`src-tauri/binaries/engine.json (${meta.describe}, ${meta.target})`);
    else bad(`src-tauri/binaries/engine.json 의 엔진 커밋 ${String(meta.engineCommit).slice(0, 7)} 이 핀과 다르다 (yarn engine:fetch 를 다시)`);
  }

  log("[웹 엔진과 릴리스]");
  if (!pin.web) {
    log(`  INFO  핀에 web 자산이 없다 (공개 릴리스 전). ${WEB_DIR} 는 MANIFEST 의 커밋만 대조했다`);
  } else {
    const url = `${RELEASE_BASE}/${pin.engineTag}/${pin.web.asset}`;
    try {
      const res = await (deps.fetchImpl ?? globalThis.fetch)(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const zip = Buffer.from(await res.arrayBuffer());
      if (sha256(zip) !== pin.web.sha256) bad(`${pin.web.asset} 의 sha256 이 핀과 다르다`);
      else {
        const { readZip } = await import("./sync-engine-templates.mjs");
        const entries = readZip(zip);
        const manifest = readJson(path.join(repo, WEB_DIR, "MANIFEST.json"));
        for (const f of manifest.files ?? []) {
          const inZip = [...entries].find(([name]) => name === f.path || name.endsWith(`/${f.path}`));
          if (!inZip) bad(`${pin.web.asset} 에 ${f.path} 가 없다`);
          else if (sha256(inZip[1]) !== f.sha256) bad(`${WEB_DIR}/${f.path} 가 릴리스의 ${pin.web.asset} 와 다르다`);
          else pass(`${WEB_DIR}/${f.path} = ${pin.web.asset}`);
        }
      }
    } catch (e) {
      bad(`${url} 를 받지 못했다: ${e.message}`);
    }
  }

  log(failed ? `engine:check: ${failed}건 어긋남` : "engine:check: 전부 통과");
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
