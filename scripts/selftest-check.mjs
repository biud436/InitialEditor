#!/usr/bin/env node
// 자가 검사 판정 (docs/plans/e6-packaging.md 5절). 앱이 쓴 보고서의 ok 는 믿지 않고, 계획을 기준으로 실행마다 셸이 logs/ 에
// 남긴 전체 로그와 스크린샷을 다시 읽는다.
//
//   node scripts/selftest-check.mjs --plan <plan.json> --report <report.json>
//
// 보고서가 없거나 error 가 있으면 실패 (셸의 시간 감시가 쓴 total_timeout 포함). CSP 위반과 뜬 모달도 실패다.
// 필수 실행: 보고서에 있어야 하고, 엔진 출처와 넘어감이 계획과 같고, 검사별로
//   flappy        로그 전체에서 종료 코드 0, 오류 줄 없음, 상태 전이 셋, flappyFinal ... ticks=900 과 best >= 1
//   tilemapPixel  종료 코드 0, 오류 줄 없음, 저장한 칸이 gid, 스크린샷의 그 칸이 표식 색이고 옆 칸은 잔디
//   mapFrame      종료 코드 0, 오류 줄 없음, 맵 뷰가 맵의 오브젝트를 다 가졌다, 로그의 자리에서 셈한 카메라가 뽑은 사각형과
//                 같고, 맵 뷰의 불투명한 타일 픽셀이 게임 화면과 거의 같다 (MAP_FRAME_MIN_RATIO). 그리고 판정이 저장한 맵 파일과
//                 타일셋 그림(scripts/lib/png.mjs)으로 기준을 직접 그려 견준다: 맵 뷰 뽑기가 기준과 같고, 레이어마다 그 레이어만
//                 보이는 픽셀이 게임 화면에 있고, 계획이 칠한 칸이 저장한 파일에 있고 게임 화면에도 있다 (칠하기 전 gid 와 다른 픽셀).
//                 게임이 레이어 하나를 빼고 그리거나 칠하기 전 맵을 돌리면 여기서 떨어진다
//   eventFront    종료 코드 0, 오류 줄 없음, 게임이 맵의 이벤트를 다 읽었고(rpg:map:<맵> events:<수> skipped:0), 플레이어가 선 자리
//                 (rpg:player:)가 판정이 디스크의 맵 파일로 셈한 "이 이벤트 앞" 이다 (ext-rpg 의 eventPlayPlan 을 Vite SSR 로 부른다)
//   eventProbe    위에 더해 자동 재생의 시작 자리에 섰고 자동 재생이 그 이벤트를 돌렸다 (rpg:event:<id>)
// 계획의 probe (확장의 탐침): 이벤트 레이어가 붙었고 잠기지 않았고 오류가 없으며, 탐침이 적은 이벤트가 맵 파일의 이벤트와 같고,
// 뷰가 그린 표식이 이벤트마다 하나씩 게임의 그리기 규칙(엔진 scripts/lua/rpg/character.lua 의 draw: 가로 가운데, 발이 칸 아래 변)의
// 자리에 있다. 외형이 있는 이벤트는 스키마의 프레임 크기로 그린 그림이고 그 시트 파일이 프로젝트에 있다. 나머지는 칸의 표식이다
// 계획의 languageServer: 앱에 든 언어 서버가 running 이 되었고, 진입 스크립트의 "Json." 뒤 완성 후보에 Load 가 있고 호버에 Load 가 있다.
// 선택 실행의 실패는 WARN 줄만. 종료 코드: 0 통과, 1 실패, 2 인자 오류.
// BMP 읽기는 tests/e2e/support/bmp.ts (단위 시험 있음)를 Vite 의 SSR 로 읽는다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { flappyChecks, exitChecks } from "./lib/flappyChecks.mjs";
import { compareMapFrame, followCamera, MAP_FRAME_MIN_OPAQUE, MAP_FRAME_MIN_RATIO, placementX, referenceChecks, tilemapPixelChecks } from "./lib/frameChecks.mjs";
import { decodePng } from "./lib/png.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function projectRoot(plan, project) {
  return project.root ?? path.join(plan.workDir, project.id);
}

/** 판정. 돌려주는 것은 { failures: string[], warnings: string[], lines: string[] } */
export function judge(plan, report, deps) {
  const readBmp = deps.readBmp;
  const failures = [];
  const warnings = [];
  const lines = [];
  const fail = (name, detail = "") => {
    failures.push(name);
    lines.push(`  FAIL  ${name}${detail ? `  ${detail}` : ""}`);
  };
  const pass = (name) => lines.push(`  PASS  ${name}`);

  if (!report) {
    fail("보고서가 없다", plan.report);
    return { failures, warnings, lines };
  }
  if (report.error) {
    fail(`보고서의 오류: ${report.error}`, report.progress ? `마지막 단계 ${JSON.stringify(report.progress)}` : "");
  }
  if (report.version !== 1) fail("보고서의 version 이 1 이 아니다", String(report.version));
  const csp = Array.isArray(report.cspViolations) ? report.cspViolations : [];
  if (csp.length) for (const v of csp) fail("웹뷰 보안 정책 위반", `${v.directive} ${v.blocked}${v.source ? ` (${v.source}:${v.line ?? "?"})` : ""}`);
  else if (!report.error) pass("웹뷰 보안 정책 위반 없음");
  const dialogs = Array.isArray(report.dialogs) ? report.dialogs : [];
  for (const d of dialogs) fail("뜨지 말아야 할 모달이 떴다", d);

  const reportProjects = new Map((report.projects ?? []).map((p) => [p.id, p]));
  for (const project of plan.projects) {
    const rp = reportProjects.get(project.id);
    lines.push(`\n[${project.id}]`);
    if (!rp) {
      const required = project.runs.some((r) => !r.optional);
      if (required) fail(`${project.id}: 보고서에 없다`);
      continue;
    }
    for (const problem of rp.problems ?? []) fail(`${project.id}: ${problem}`);
    if (project.template && !(rp.files > 0)) fail(`${project.id}: 템플릿으로 쓴 파일이 없다`, String(rp.files));
    if (rp.entryScript?.opened) pass(`진입 스크립트를 편집기로 열었다 (${rp.entryScript.path})`);
    else fail(`${project.id}: 진입 스크립트를 열지 못했다`);
    if (project.probe) judgeProbe(plan, project, rp, (name, ok, detail) => (ok ? pass(`${project.id}: ${name}`) : fail(`${project.id}: ${name}`, detail)));
    if (project.languageServer) {
      const ls = rp.languageServer ?? null;
      const say = (name, ok, detail) => (ok ? pass(`${project.id}: ${name}`) : fail(`${project.id}: ${name}`, detail));
      say("언어 서버가 떴다", ls?.state === "running", ls ? `${ls.state} ${ls.reason ?? ""}`.trim() : "보고서에 없다");
      if (ls?.state === "running") {
        say(`언어 서버 ${ls.version ?? ""}: "Json." 뒤 완성에 Load`.replace("  ", " "), (ls.completion ?? []).some((l) => String(l).startsWith("Load")), (ls.completion ?? []).join(", "));
        say("언어 서버: Json.Load 의 호버", String(ls.hover ?? "").includes("Load"), JSON.stringify(ls.hover ?? ""));
      }
    }

    project.runs.forEach((run, i) => {
      const n = i + 1;
      const name = `${project.id} 실행 ${n} (${run.mode}, ${run.check})`;
      const rr = rp.runs?.[i];
      const runFailures = [];
      const note = (label, ok, detail, always = false) => {
        if (ok) lines.push(`  PASS  ${name}: ${label}${always && detail ? `  ${detail}` : ""}`);
        else {
          runFailures.push(label);
          lines.push(`  ${run.optional ? "WARN" : "FAIL"}  ${name}: ${label}${detail ? `  ${detail}` : ""}`);
        }
      };
      if (!rr) {
        note("보고서에 이 실행이 없다", false);
      } else {
        const source = rr.engine?.source ?? null;
        if (run.expectEngineSource) note(`엔진 출처 ${run.expectEngineSource}`, source === run.expectEngineSource, `보고서 ${source}`);
        const expectFallback = run.expectFallback ?? null;
        note(expectFallback ? `${expectFallback} 로 넘어갔다` : "넘어가지 않았다", (rr.fallback ?? null) === expectFallback, `보고서 ${rr.fallback ?? null}`);
        const logFile = path.join(plan.workDir, "logs", `${project.id}-${n}.log`);
        const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : null;
        if (log === null) note("실행 로그가 있다", false, logFile);
        else {
          const exitCode = rr.exitCode ?? null;
          const checks = run.check === "flappy" ? flappyChecks(log, exitCode) : exitChecks(log, exitCode);
          for (const c of checks) note(c.name, c.ok, c.detail);
          if (run.check === "tilemapPixel") judgeTilemap(project, run, rp, note, readBmp);
          if (run.check === "mapFrame") judgeMapFrame(plan, project, run, rp, rr, log, note, readBmp);
          if (run.check === "eventFront" || run.check === "eventProbe") judgeEventRun(plan, project, run, rr, log, note, deps.eventPlayPlan);
        }
      }
      if (runFailures.length) {
        if (run.optional) warnings.push(`${name}: ${runFailures.join(", ")}`);
        else failures.push(...runFailures.map((f) => `${name}: ${f}`));
      }
    });
  }
  return { failures, warnings, lines };
}

function judgeTilemap(project, run, rp, note, readBmp) {
  const edit = project.edit;
  if (!edit) {
    note("계획에 칠할 칸(edit)이 있다", false);
    return;
  }
  note(`저장한 맵의 칸 (${edit.x}, ${edit.y}) 이 gid ${edit.gid} 다`, rp.edit?.cellAfter === edit.gid && rp.edit?.saved === "saved", JSON.stringify(rp.edit ?? null));
  const shot = run.env?.INITIAL2D_SCREENSHOT;
  const has = shot && fs.existsSync(shot) && fs.statSync(shot).size > 1000;
  note("스크린샷이 있다", Boolean(has), shot ?? "(계획에 INITIAL2D_SCREENSHOT 이 없다)");
  if (!has) return;
  for (const c of tilemapPixelChecks(readBmp(fs.readFileSync(shot)), edit)) note(c.name, c.ok, c.detail);
}

/** 맵의 타일셋 그림을 프로젝트 폴더에서 읽는다: image 칸 → { width, height, rgba } */
export function loadTilesetImages(root, map) {
  const images = new Map();
  for (const t of map.tilesets ?? []) {
    if (images.has(t.image)) continue;
    const file = path.join(root, String(t.image).replace(/^\.\//, ""));
    try {
      images.set(t.image, decodePng(fs.readFileSync(file)));
    } catch (e) {
      throw new Error(`${t.image}: ${e.message}`);
    }
  }
  return images;
}

function judgeMapFrame(plan, project, run, rp, rr, log, note, readBmp) {
  const spec = run.mapCapture;
  const root = projectRoot(plan, project);
  let map;
  try {
    map = readJson(path.join(root, spec.map));
  } catch (e) {
    note("맵 파일을 읽는다", false, e.message);
    return;
  }
  const objects = Array.isArray(map.objects) ? map.objects.length : 0;
  const view = rp.mapView;
  note(`맵 뷰가 맵을 열었다 (오브젝트 ${objects}개)`, view?.path === spec.map && view?.objects === objects && view?.width === map.width && view?.height === map.height, JSON.stringify(view ?? null));
  if (plan.showWindow) note("맵 뷰가 그릴 준비가 됐다 (WebGL)", view?.ready === true, JSON.stringify(view ?? null));
  // 게임이 저장한 맵을 읽었는지는 계획이 칠한 칸으로 본다 (판정은 보고서가 아니라 디스크의 파일을 읽는다)
  const edit = project.edit && project.edit.map === spec.map ? project.edit : null;
  note("계획이 이 맵의 한 칸을 칠한다 (게임이 저장한 맵을 읽었는지 본다)", edit !== null, JSON.stringify(project.edit ?? null));
  const cellBefore = Number.isInteger(rp.edit?.cellBefore) ? rp.edit.cellBefore : null;
  if (edit) {
    const layerName = map.layers?.[edit.layer]?.name ?? `#${edit.layer}`;
    const onDisk = map.layers?.[edit.layer]?.data?.[edit.y * map.width + edit.x];
    note(`저장한 맵 파일의 칸 (${edit.x}, ${edit.y}) 이 gid ${edit.gid} 다 (레이어 ${layerName})`, onDisk === edit.gid, `파일 ${onDisk ?? "없음"}`);
    note(`칠하기 전 칸이 gid ${edit.gid} 가 아니었다 (칠한 것이 그림을 바꾼다)`, cellBefore !== null && cellBefore !== edit.gid, `보고서의 cellBefore ${rp.edit?.cellBefore ?? "없음"}`);
  }
  const x = placementX(log, spec.placement);
  note("로그에 자리 줄이 있다", x !== null, spec.placement);
  if (x === null) return;
  const expected = followCamera(x, spec.width, spec.height, map.width * map.tileWidth);
  const capture = rr.mapCapture;
  note(`뽑은 사각형이 게임의 카메라다 (x ${expected.x})`, capture && JSON.stringify(capture.rect) === JSON.stringify(expected), JSON.stringify(capture?.rect ?? null));
  const mapFile = path.join(plan.workDir, "logs", `${project.id}-${project.runs.indexOf(run) + 1}.map.bmp`);
  const shot = run.env?.INITIAL2D_SCREENSHOT;
  const hasMap = fs.existsSync(mapFile);
  const hasShot = shot && fs.existsSync(shot);
  note("맵 뷰에서 뽑은 타일이 있다", hasMap, mapFile);
  note("게임 스크린샷이 있다", Boolean(hasShot), shot ?? "(계획에 INITIAL2D_SCREENSHOT 이 없다)");
  if (!hasMap || !hasShot) return;
  const mapImg = readBmp(fs.readFileSync(mapFile));
  note(`뽑은 타일이 ${spec.width}x${spec.height} 다`, mapImg.width === spec.width && mapImg.height === spec.height, `${mapImg.width}x${mapImg.height}`);
  const frame = readBmp(fs.readFileSync(shot));
  let cmp;
  try {
    cmp = compareMapFrame(mapImg, frame);
  } catch (e) {
    note("게임 화면과 견준다", false, e.message);
    return;
  }
  const detail = `불투명 ${cmp.opaque} (${(cmp.opaqueShare * 100).toFixed(1)}%), 같음 ${cmp.match} (${(cmp.ratio * 100).toFixed(2)}%)`;
  note(`맵 뷰의 타일이 사각형의 ${MAP_FRAME_MIN_OPAQUE * 100}% 이상을 덮는다`, cmp.opaqueShare >= MAP_FRAME_MIN_OPAQUE, detail);
  note(`맵 뷰의 타일 픽셀이 게임 화면과 같다 (${MAP_FRAME_MIN_RATIO * 100}% 이상, 채널마다 ±8)`, cmp.ratio >= MAP_FRAME_MIN_RATIO, detail, true);

  // 저장한 맵으로 그린 기준: 레이어마다, 칠한 칸까지 게임 화면에 있는가
  let checks;
  try {
    checks = referenceChecks({ map, images: loadTilesetImages(root, map), rect: expected, frame, capture: mapImg, edit, cellBefore });
  } catch (e) {
    note("저장한 맵과 타일셋으로 기준을 그린다", false, e.message);
    return;
  }
  for (const c of checks) note(c.name, c.ok, c.detail, true);
}

/** 맵 파일과 rpg-game.json 의 그 맵 이름 */
function readEventMap(root, mapPath) {
  const map = readJson(path.join(root, mapPath));
  const game = readJson(path.join(root, "resources/data/rpg-game.json"));
  const entry = (game.maps ?? []).find((m) => m.file === mapPath || (m.alt ?? []).includes(mapPath));
  return { map, name: entry?.name ?? null, events: Array.isArray(map.events) ? map.events : [] };
}

function judgeProbe(plan, project, rp, note) {
  const spec = project.probe;
  const root = projectRoot(plan, project);
  let disk;
  let schema;
  try {
    disk = readEventMap(root, spec.map);
    schema = readJson(path.join(root, "resources/schema/event-commands.json"));
  } catch (e) {
    note("맵 파일과 스키마를 읽는다", false, e.message);
    return;
  }
  const probe = rp.probe;
  const r = probe?.result ?? null;
  note(`탐침 ${spec.extension} 이(가) ${spec.map} 을(를) 적었다`, probe?.extension === spec.extension && probe?.map === spec.map && r !== null, JSON.stringify(probe ?? null));
  if (!r) return;
  note("탐침이 ready 다 (뷰가 외형 그림을 다 읽었다)", r.ready === true, `기다린 ${probe.waitedMs} ms`);
  if (plan.showWindow) note("맵 뷰가 그릴 준비가 됐다 (WebGL)", rp.mapView?.path === spec.map && rp.mapView?.ready === true, JSON.stringify(rp.mapView ?? null));
  note("이벤트 레이어가 붙었고 잠기지 않았고 오류가 없다", r.attached === true && r.locked === null && r.errors === 0, JSON.stringify({ attached: r.attached, locked: r.locked, errors: r.errors, hint: r.hint }));
  const expected = disk.events.map((e, index) => ({ index, id: e.id ?? null, x: e.x ?? null, y: e.y ?? null, charset: e.charset !== undefined }));
  note(`탐침의 이벤트가 맵 파일의 이벤트 ${expected.length}개와 같다`, JSON.stringify(r.events) === JSON.stringify(expected), `탐침 ${Array.isArray(r.events) ? r.events.length : "없음"}개`);
  const drawn = Array.isArray(r.view?.drawn) ? r.view.drawn : [];
  note(`뷰가 표식 ${expected.length}개를 그렸다`, drawn.length === expected.length && new Set(drawn.map((d) => d.index)).size === expected.length, `그린 ${drawn.length}개`);
  const failed = Array.isArray(r.view?.failedSheets) ? r.view.failedSheets : [];
  note("읽지 못한 외형 그림이 없다", Boolean(r.view) && failed.length === 0, failed.join(", "));
  const tw = disk.map.tileWidth;
  const th = disk.map.tileHeight;
  const frameW = schema.sheets?.charset?.frameW;
  const frameH = schema.sheets?.charset?.frameH;
  const byIndex = new Map(drawn.map((d) => [d.index, d]));
  const wrong = [];
  const sheets = new Set();
  for (const ev of expected) {
    const d = byIndex.get(ev.index);
    if (!d) {
      wrong.push(`${ev.id}: 그리지 않았다`);
      continue;
    }
    if (ev.charset) {
      const x = ev.x * tw + (tw - frameW) / 2;
      const y = (ev.y + 1) * th - frameH;
      if (d.kind !== "sprite" || d.x !== x || d.y !== y || d.frame?.w !== frameW || d.frame?.h !== frameH) wrong.push(`${ev.id}: ${JSON.stringify(d)} (기대 sprite ${x},${y} ${frameW}x${frameH})`);
      if (d.sheet) sheets.add(d.sheet);
    } else if (d.kind !== "badge" || d.x !== ev.x * tw || d.y !== ev.y * th) {
      wrong.push(`${ev.id}: ${JSON.stringify(d)} (기대 badge ${ev.x * tw},${ev.y * th})`);
    }
  }
  note("표식이 게임의 그리기 규칙 자리에 있다 (외형은 가로 가운데와 발이 칸 아래 변, 나머지는 칸)", wrong.length === 0, wrong.slice(0, 5).join(" | "));
  const missing = [...sheets].filter((sheet) => !fs.existsSync(path.join(root, sheet)));
  note(`외형 그림 ${sheets.size}장이 프로젝트에 있다`, sheets.size > 0 && missing.length === 0, missing.join(", "));
}

function judgeEventRun(plan, project, run, rr, log, note, eventPlayPlan) {
  const spec = run.play;
  if (!spec) {
    note("계획에 play 가 있다", false);
    return;
  }
  note("탐침이 실행 요청을 만들었다", Boolean(rr.play) && rr.play.refused === null, JSON.stringify(rr.play ?? null));
  let disk;
  try {
    disk = readEventMap(projectRoot(plan, project), spec.map);
  } catch (e) {
    note("맵 파일을 읽는다", false, e.message);
    return;
  }
  const lines = log.split("\n").map((l) => l.trim());
  const id = spec.args?.event;
  const index = disk.events.findIndex((e) => e.id === id);
  note(`맵 파일에 이벤트 ${id} 이(가) 있고 rpg-game.json 에 맵이 있다`, index >= 0 && disk.name !== null, `${disk.name}`);
  if (index < 0 || disk.name === null) return;
  const loaded = lines.find((l) => l.startsWith(`rpg:map:${disk.name} `));
  note(`게임이 맵의 이벤트 ${disk.events.length}개를 다 읽었다`, loaded === `rpg:map:${disk.name} events:${disk.events.length} skipped:0`, loaded ?? "rpg:map: 줄 없음");
  const mode = spec.args?.mode === "probe" ? "probe" : "play";
  const geometry = { width: disk.map.width, height: disk.map.height, collision: Array.isArray(disk.map.collision) ? disk.map.collision : null };
  const r = eventPlayPlan(geometry, disk.events, index, mode);
  if (!r.ok) {
    note(`판정이 이 이벤트의 ${mode} 자리를 셈한다`, false, r.reason);
    return;
  }
  const at = r.plan.at;
  const want = `rpg:player:${disk.name},${at.x},${at.y},${at.dir}`;
  const player = lines.find((l) => l.startsWith(`rpg:player:${disk.name},`));
  note(`플레이어가 ${mode === "probe" ? "자동 재생의 시작" : "이벤트 앞"}에 섰다 (${want})`, player === want, player ?? "rpg:player: 줄 없음", true);
  if (run.check === "eventProbe") note(`자동 재생이 이벤트를 돌렸다 (rpg:event:${id})`, lines.includes(`rpg:event:${id}`));
}

export function parseArgs(argv) {
  const out = { plan: null, report: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--plan" || a === "--report") {
      const v = argv[++i];
      if (!v) throw new Error(`${a} 에 값이 없다`);
      out[a.slice(2)] = path.resolve(v);
    } else throw new Error(`모르는 인자: ${a}`);
  }
  if (!out.plan) throw new Error("--plan 이 필요하다");
  return out;
}

/** tests/e2e/support/bmp.ts 의 readBmp 와 ext-rpg 의 eventPlayPlan 을 Vite SSR 로 */
export async function loadJudgeModules() {
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: false,
    root: repo,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { readBmp } = await vite.ssrLoadModule("/tests/e2e/support/bmp.ts");
    const { eventPlayPlan } = await vite.ssrLoadModule("/packages/ext-rpg/src/model/play.ts");
    return { readBmp, eventPlayPlan };
  } finally {
    await vite.close();
  }
}

export async function main(argv, deps = {}) {
  const log = deps.log ?? console.log;
  const err = deps.error ?? console.error;
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    err(`selftest-check: ${e.message}`);
    err("사용법: selftest-check.mjs --plan <plan.json> [--report <report.json>]");
    return 2;
  }
  let plan;
  try {
    plan = readJson(args.plan);
  } catch (e) {
    err(`selftest-check: 계획을 읽지 못했다: ${e.message}`);
    return 2;
  }
  const reportPath = args.report ?? plan.report;
  let report = null;
  if (fs.existsSync(reportPath)) {
    try {
      report = readJson(reportPath);
    } catch (e) {
      err(`FAIL 보고서가 JSON 이 아니다: ${e.message}`);
      return 1;
    }
  }
  const loaded = deps.readBmp && deps.eventPlayPlan ? {} : await loadJudgeModules();
  const result = judge({ ...plan, report: reportPath }, report, { readBmp: deps.readBmp ?? loaded.readBmp, eventPlayPlan: deps.eventPlayPlan ?? loaded.eventPlayPlan });
  for (const line of result.lines) log(line);
  for (const w of result.warnings) log(`WARN ${w}`);
  const passes = result.lines.filter((l) => l.includes("PASS")).length;
  log(`\n결과: ${passes} PASS / ${result.failures.length} FAIL${result.warnings.length ? ` / ${result.warnings.length} WARN (선택 실행)` : ""}`);
  if (result.failures.length) {
    for (const f of result.failures) err(`  - ${f}`);
    return 1;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main(process.argv.slice(2)));
}
