#!/usr/bin/env node
// 핀(engine-pin.json)을 엔진의 공개 릴리스 하나에 묶는다 (docs/plans/e6-packaging.md 4.2 절).
//
//   yarn engine:pin <태그>                      릴리스의 engine-dist.json 과 SHA256SUMS.txt 를 받아 쓴다
//   yarn engine:pin <태그> --from <dist 폴더>   같은 파일을 폴더에서 읽는다 (dist.yml 의 산출물을 푼 폴더)
//
// 핀에 engineTag 와 자산 칸(native 의 타깃마다, templates, thirdParty)을 적는다. 그 뒤 yarn engine:fetch 는 --from 없이
// 릴리스에서 받고 sha256 을 핀과 견준다. 릴리스의 커밋이 핀의 커밋과 다르면 쓰지 않는다: 웹 엔진, 템플릿, ext-rpg 픽스처의
// MANIFEST 가 핀의 커밋에서 온 것이라 먼저 그 커밋으로 다시 동기화해야 한다 (yarn engine:check).
// 종료 코드: 0 성공, 1 확인 실패, 2 인자 오류.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RELEASE_BASE, parseSha256Sums, readJson, validateDist, validatePin } from "./lib/engineDist.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const USAGE = "사용법: pin-engine.mjs <태그> [--from <dist 폴더>]";
const TEMPLATES_ZIP = "Initial2D-templates.zip";
const THIRD_PARTY = "THIRD-PARTY.md";

class PinError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const fail = (message, code = 1) => {
  throw new PinError(message, code);
};

export function parseArgs(argv) {
  const args = { tag: null, from: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) fail(`--from 에 값이 없음\n${USAGE}`, 2);
      args.from = v;
    } else if (a.startsWith("--")) fail(`지원하지 않는 인자: ${a}\n${USAGE}`, 2);
    else if (args.tag) fail(`태그는 하나만\n${USAGE}`, 2);
    else args.tag = a;
  }
  if (!args.tag) fail(`태그 없음\n${USAGE}`, 2);
  return args;
}

/** 릴리스나 폴더에서 이름 하나를 글로 읽는다 */
function reader(args, fetchImpl) {
  if (args.from) {
    const dir = path.resolve(args.from);
    return {
      label: dir,
      async text(name) {
        const file = path.join(dir, name);
        if (!fs.existsSync(file)) fail(`파일 없음: ${file}`);
        return fs.readFileSync(file, "utf8");
      },
    };
  }
  return {
    label: `${RELEASE_BASE}/${args.tag}/`,
    async text(name) {
      const url = `${RELEASE_BASE}/${args.tag}/${name}`;
      let res;
      try {
        res = await fetchImpl(url);
      } catch (e) {
        fail(`받기 실패: ${url} (${e.message})`);
      }
      if (!res.ok) fail(`받기 실패: ${url} (HTTP ${res.status})`);
      return Buffer.from(await res.arrayBuffer()).toString("utf8");
    },
  };
}

/** 릴리스의 파일로 만든 새 핀. 핀의 comment 와 ciEngineRef 는 그대로 둔다 */
export function buildPin(pin, tag, dist, sums) {
  const errors = validateDist(dist);
  if (errors.length) fail(`engine-dist.json 의 모양이 틀림:\n${errors.map((e) => `  ${e}`).join("\n")}`);
  if (dist.engineTag !== tag) fail(`engine-dist.json 의 engineTag 가 ${tag} 가 아님 (현재: ${dist.engineTag ?? "null"})`);
  if (dist.engineCommit !== pin.engineCommit) {
    fail(
      `릴리스의 커밋 ${dist.engineCommit.slice(0, 7)} 이 핀의 커밋 ${pin.engineCommit.slice(0, 7)} 과 다름.\n` +
        `  먼저 핀을 그 커밋으로 올리고 웹 엔진, 템플릿, ext-rpg 픽스처를 다시 동기화한다 (yarn engine:check)`,
    );
  }
  const native = {};
  for (const [triple, a] of Object.entries(dist.native)) {
    if (sums.get(a.asset) !== a.sha256) fail(`${a.asset} 의 sha256 이 SHA256SUMS.txt 와 다름`);
    native[triple] = { asset: a.asset, sha256: a.sha256, size: a.size, features: a.features };
  }
  const asset = (name) => {
    const sha = sums.get(name);
    if (!sha) fail(`SHA256SUMS.txt 에 ${name} 없음`);
    return { asset: name, sha256: sha };
  };
  const next = { ...pin, engineTag: tag, native, templates: asset(TEMPLATES_ZIP), thirdParty: asset(THIRD_PARTY) };
  const pinErrors = validatePin(next);
  if (pinErrors.length) fail(`새 핀의 모양이 틀림:\n${pinErrors.map((e) => `  ${e}`).join("\n")}`);
  return next;
}

export async function main(argv, deps = {}) {
  const log = deps.log ?? console.log;
  const err = deps.error ?? console.error;
  const repo = deps.repo ?? REPO;
  try {
    const args = parseArgs(argv);
    const pinFile = path.join(repo, "engine-pin.json");
    const pin = readJson(pinFile);
    const src = reader(args, deps.fetchImpl ?? globalThis.fetch);
    const dist = JSON.parse(await src.text("engine-dist.json"));
    const sums = parseSha256Sums(await src.text("SHA256SUMS.txt"));
    const next = buildPin(pin, args.tag, dist, sums);
    fs.writeFileSync(pinFile, JSON.stringify(next, null, 2) + "\n");
    log(`핀: ${args.tag} (${next.engineCommit.slice(0, 7)}), 타깃 ${Object.keys(next.native).join(", ")} ← ${src.label}`);
    return 0;
  } catch (e) {
    if (e instanceof PinError) {
      err(`engine:pin: ${e.message}`);
      return e.code;
    }
    throw e;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main(process.argv.slice(2)));
}
