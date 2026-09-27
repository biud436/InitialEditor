#!/usr/bin/env node
// 자가 검사 계획을 만든다 (docs/plans/e6-packaging.md 5절). 셸(src-tauri/src/selftest.rs)이 환경 변수
// INITIAL_EDITOR_SELFTEST 로 이 파일을 읽고, 앱이 계획대로 새 프로젝트를 만들어 돌린다. 판정은 scripts/selftest-check.mjs.
//
//   node scripts/selftest-plan.mjs --os <mac|linux|windows|local> --work <workDir> --out <plan.json>
//                                  [--embedded] [--forest <엔진 저장소>] [--total-timeout <ms>]
//
//   mac, linux  플래피 Lua 와 Ruby, 타일맵을 앱에 든 엔진으로 (필수), 플래피 Lua 를 에디터 안에서 (시도). 창을 보인다
//   windows     앱에 든 엔진이 없다: 플래피 Lua 를 프로세스 방식으로 시작해 에디터 안으로 넘어가 돈다 (필수). 창을 보인다
//   local       mac 과 같되 프로세스 실행만이고 창을 숨긴다 (yarn selftest:app 의 기본). --embedded 면 에디터 안 실행을 더하고 창을 보인다
//   --forest    엔진 저장소의 알데바란 숲(resources/maps/aldebaran_forest.json)을 맵 뷰로 열고, 게임을 같은 카메라로 돌려
//               맵 뷰의 타일과 게임 화면을 견준다 (E3 완료 기준 1). 게임에 필요한 것만 <workDir>-forest 로 복사한다
//
// workDir 은 아직 없어야 한다 (셸이 만든다). 보고서는 <workDir>/report.json, 로그와 스크린샷은 <workDir>/logs/.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const OSES = ["mac", "linux", "windows", "local"];
export const SELFTEST_ENV = "INITIAL_EDITOR_SELFTEST";
export const FOREST_MAP = "resources/maps/aldebaran_forest.json";
/** 숲에서 서 볼 자리 (입구 쪽, 카메라가 맵 안쪽을 비춘다) */
export const FOREST_AT = 1200;
/** 알데바란의 논리 화면 (렌더 배율 2, 창 768x896) */
export const FOREST_VIEW = { width: 384, height: 448 };
/** 엔진의 배치 줄 "알데바란: 시작 x <x> (y <y>)" 또는 옮겼으면 "알데바란: 시작 x <x> → <새 x>" */
export const FOREST_PLACEMENT = "^알데바란: 시작 x (-?\\d+(?:\\.\\d+)?)(?: → (-?\\d+(?:\\.\\d+)?))?";
/** 숲 사본에 복사할 엔진 저장소의 경로 (RTP 와 그 변환물은 싣지 않는다. INITIAL2D_NO_RTP=1 로 돈다) */
export const FOREST_COPY = ["scripts", "resources/maps", "resources/aldebaran", "resources/fonts", "resources/schema", "resources/data", "resources/tiles", "resources/audio", "resources/ui", "resources/icons"];
export const FOREST_GAME_JSON = { name: "aldebaran-selftest", windowWidth: 768, windowHeight: 896, renderScale: 1, script: "lua" };

const HEADLESS = { SDL_VIDEODRIVER: "dummy", SDL_AUDIODRIVER: "dummy" };

function logsPath(workDir, name) {
  return path.join(workDir, "logs", name);
}

function flappyProcessRun() {
  return {
    mode: "process",
    expectEngineSource: "bundled",
    check: "flappy",
    env: { ...HEADLESS, INITIAL2D_AUTOPLAY: "1", INITIAL2D_EXIT_AFTER: "60000" },
    timeoutMs: 90_000,
  };
}

function flappyEmbeddedRun() {
  return { mode: "embedded", optional: true, check: "flappy", env: { INITIAL2D_AUTOPLAY: "1" }, timeoutMs: 120_000 };
}

function tilemapProject(workDir) {
  return {
    id: "tilemap",
    template: "tilemap",
    language: "lua",
    edit: { kind: "paintTile", map: "resources/maps/start.json", layer: 0, x: 24, y: 28, gid: 45 },
    runs: [
      {
        mode: "process",
        expectEngineSource: "bundled",
        check: "tilemapPixel",
        env: { ...HEADLESS, INITIAL2D_SCREENSHOT: logsPath(workDir, "tilemap-1.bmp"), INITIAL2D_SCREENSHOT_FRAME: "30", INITIAL2D_EXIT_AFTER: "40" },
        timeoutMs: 60_000,
      },
    ],
  };
}

export function forestProject(workDir, root) {
  return {
    id: "forest",
    root,
    language: "lua",
    openMap: FOREST_MAP,
    runs: [
      {
        mode: "process",
        expectEngineSource: "bundled",
        check: "mapFrame",
        env: {
          ...HEADLESS,
          INITIAL2D_SCENE: "aldebaran",
          INITIAL2D_SKIP_INTRO: "1",
          INITIAL2D_ALDEBARAN_STAGE: "aldebaran_forest",
          INITIAL2D_ALDEBARAN_AT: String(FOREST_AT),
          INITIAL2D_ALDEBARAN_TRACE: "1",
          INITIAL2D_NO_RTP: "1",
          INITIAL2D_SCREENSHOT: logsPath(workDir, "forest-1.bmp"),
          INITIAL2D_SCREENSHOT_FRAME: "30",
          INITIAL2D_EXIT_AFTER: "40",
        },
        timeoutMs: 60_000,
        mapCapture: { map: FOREST_MAP, width: FOREST_VIEW.width, height: FOREST_VIEW.height, placement: FOREST_PLACEMENT },
      },
    ],
  };
}

/** 계획 객체 (파일은 쓰지 않는다) */
export function buildPlan({ os, workDir, embedded = false, forestRoot = null, totalTimeoutMs = null }) {
  if (!OSES.includes(os)) throw new Error(`--os 는 ${OSES.join(", ")} 중 하나다`);
  if (!path.isAbsolute(workDir)) throw new Error(`workDir 은 절대 경로다: ${workDir}`);
  let projects;
  let showWindow;
  if (os === "windows") {
    // 앱에 든 엔진이 없다 (R5 전): 프로세스 방식으로 시작하므로 엔진 탐색과 넘어감이 둘 다 검사 대상이다
    projects = [{ id: "flappy-lua", template: "flappy", language: "lua", runs: [{ mode: "process", expectEngineSource: "none", expectFallback: "embedded", check: "flappy", env: { INITIAL2D_AUTOPLAY: "1" }, timeoutMs: 150_000 }] }];
    showWindow = true;
  } else {
    const withEmbedded = os !== "local" || embedded;
    projects = [
      { id: "flappy-lua", template: "flappy", language: "lua", runs: withEmbedded ? [flappyProcessRun(), flappyEmbeddedRun()] : [flappyProcessRun()] },
      { id: "flappy-ruby", template: "flappy", language: "mruby", runs: [flappyProcessRun()] },
      tilemapProject(workDir),
    ];
    // 에디터 안 실행은 보이는 창이 필요하다 (숨은 웹뷰는 프레임을 멈춘다)
    showWindow = withEmbedded;
  }
  if (forestRoot) projects.push(forestProject(workDir, forestRoot));
  const runs = projects.flatMap((p) => p.runs);
  const budget = runs.reduce((sum, r) => sum + r.timeoutMs, 0) + 60_000 * projects.length;
  return {
    version: 1,
    workDir,
    report: path.join(workDir, "report.json"),
    totalTimeoutMs: totalTimeoutMs ?? Math.min(3_600_000, budget),
    showWindow,
    projects,
  };
}

/** 엔진 저장소에서 숲을 돌리는 데 필요한 것만 dest 로 복사한다. 돌려주는 것은 복사한 파일 수 */
export function prepareForest(engineDir, dest) {
  const map = path.join(engineDir, FOREST_MAP);
  if (!fs.existsSync(map)) throw new Error(`엔진 저장소에 숲 맵이 없다: ${map}`);
  if (fs.existsSync(dest)) throw new Error(`숲 사본 폴더가 이미 있다: ${dest}`);
  let files = 0;
  for (const rel of FOREST_COPY) {
    const from = path.join(engineDir, rel);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(dest, rel), {
      recursive: true,
      filter: (src) => {
        const name = path.basename(src);
        if (name.startsWith(".") && src !== from) return false;
        if (fs.statSync(src).isFile()) files++;
        return true;
      },
    });
  }
  fs.writeFileSync(path.join(dest, "game.json"), JSON.stringify(FOREST_GAME_JSON, null, 2) + "\n");
  return files + 1;
}

export function parseArgs(argv) {
  const out = { os: null, work: null, out: null, embedded: false, forest: null, totalTimeout: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v) throw new Error(`${a} 에 값이 없다`);
      return v;
    };
    if (a === "--os") out.os = value();
    else if (a === "--work") out.work = path.resolve(value());
    else if (a === "--out") out.out = path.resolve(value());
    else if (a === "--forest") out.forest = path.resolve(value());
    else if (a === "--total-timeout") out.totalTimeout = Number(value());
    else if (a === "--embedded") out.embedded = true;
    else throw new Error(`모르는 인자: ${a}`);
  }
  if (!out.os || !out.work || !out.out) throw new Error("--os, --work, --out 이 필요하다");
  if (out.totalTimeout !== null && !(Number.isInteger(out.totalTimeout) && out.totalTimeout > 0)) throw new Error("--total-timeout 은 양의 정수다");
  return out;
}

/** 계획을 만들어 쓴다 (숲이면 사본도). 돌려주는 것은 계획 객체 */
export function writePlan(args) {
  if (fs.existsSync(args.work)) throw new Error(`workDir 이 이미 있다: ${args.work} (셸이 새로 만든다)`);
  let forestRoot = null;
  if (args.forest) {
    forestRoot = `${args.work}-forest`;
    prepareForest(args.forest, forestRoot);
  }
  const plan = buildPlan({ os: args.os, workDir: args.work, embedded: args.embedded, forestRoot, totalTimeoutMs: args.totalTimeout });
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(plan, null, 2) + "\n");
  return plan;
}

export function main(argv, deps = {}) {
  const log = deps.log ?? console.log;
  const err = deps.error ?? console.error;
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    err(`selftest-plan: ${e.message}`);
    err("사용법: selftest-plan.mjs --os <mac|linux|windows|local> --work <workDir> --out <plan.json> [--embedded] [--forest <엔진 저장소>] [--total-timeout <ms>]");
    return 2;
  }
  try {
    const plan = writePlan(args);
    log(`계획 ${args.out}: 프로젝트 ${plan.projects.map((p) => p.id).join(", ")}, 창 ${plan.showWindow ? "보임" : "숨김"}, 전체 ${plan.totalTimeoutMs} ms`);
    return 0;
  } catch (e) {
    err(`selftest-plan: ${e.message}`);
    return 2;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main(process.argv.slice(2)));
}
