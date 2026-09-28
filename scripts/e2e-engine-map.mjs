#!/usr/bin/env node
// 맵 편집(E3)과 진짜 엔진의 교차 검사 (docs/plans/e3-tilemap.md 완료 기준). "에디터가 고치고 저장한 맵을 엔진이 같게 읽는다" 를
// 사람이 아니라 스크립트가 확인한다. 에디터 모듈(TypeScript)은 Vite 의 SSR 로 읽는다. 판 셋:
//
//   collision/<언어>  타일맵 템플릿 프로젝트의 start.json 을 맵 문서로 열고 맵 뷰의 도구(MapToolController)로 통행을 막고 푼 뒤 저장한다
//                    (펜 끌기, 오른쪽 끌기, Alt 클릭, 사각형, 지우개). 씬 문서로 탐침 노드와 컴포넌트를 더해, 씬의 타일맵 오브젝트가 연
//                    맵의 IsPassable(Ruby 는 passable?)을 칸마다 찍게 하고, 저장한 파일과 에디터 모델의 collision 과 칸마다 견준다
//   golden/<언어>     새 맵 대화상자의 함수(createMapFile)로 맵을 만들고 두 레이어에 도구로 무늬를 칠해 저장한다. 씬의 타일맵 오브젝트를
//                    그 맵으로 바꿔 저장하고, 엔진의 프레임 30 을 저장한 맵과 타일셋으로 그린 기준과 견준다 (frameChecks.mjs 의
//                    referenceChecks 와 paintedCellsCheck, 채널마다 ±8). 대조 둘: 칠하기 전 맵, deco 를 비운 맵을 준 엔진 화면은 떨어진다
//   harbour          엔진 저장소 추적 파일의 사본(git archive HEAD)에서 port_town.json 을 앱과 같은 길(이벤트 레이어가 붙은 맵 문서)로
//                    열어 골든 화면 밖의 한 칸을 펜으로 칠해 저장한다. 파일은 그 칸만 다르고(events 포함), 엔진 테스트 러너의 인수
//                    시나리오(run_engine_tests.py --only=rpgdemo_scene)가 칠하기 전과 같은 PASS 목록으로 통과하고, 짐 상자 대사가 저장한
//                    이벤트의 글이고, 러너가 화면을 보는 맵 멈춤 셋(town 과 bag 은 골든, wall 은 색 픽셀 수)이 칠하기 전과 픽셀까지 같다.
//                    대조: 마을 첫 화면 안의 칸을 칠하면 그 화면이 그 칸 자리에서만 달라진다
//
//   yarn test:engine-map                                   엔진은 <INITIAL2D_DIR>/build/Initial2D (기본 ../Initial2D)
//   INITIAL2D_EXE=/path/to/Initial2D yarn test:engine-map  엔진 실행 파일을 직접 준다 (항구 마을은 INITIAL2D_DIR 의 git 저장소를 쓴다)
//   KEEP_WORKDIR=1 yarn test:engine-map                    임시 폴더를 남긴다
//
// 엔진은 헤드리스다 (SDL_VIDEODRIVER=dummy, SDL_AUDIODRIVER=dummy, INITIAL2D_EXIT_AFTER). 엔진 실행 파일이 없으면 SKIP 한 줄을 찍고
// 0 으로 끝난다. INITIAL2D_DIR 이 git 저장소가 아니면 항구 마을만, mruby 가 없는 빌드면 Ruby 판만 SKIP 이다. 엔진 저장소는 고치지 않는다.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exitChecks } from "./lib/flappyChecks.mjs";
import { cropImage, paintedCellsCheck, referenceChecks, SCREEN_WIDTH } from "./lib/frameChecks.mjs";
import { collisionChecks, frameDiff, jsonDiff, lineDiff, runnerSummary } from "./lib/mapChecks.mjs";
import { decodePng } from "./lib/png.mjs";
import { caseDir as tempDir, checkList, engineTarget, fsBackend, hasShot, loadEditorModules, requireEngine, runEngine, tail } from "./lib/engineRun.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const templatesDir = path.join(repo, "packages", "app", "templates");
const target = engineTarget(repo);
const { engineDir, exe } = target;
const KEEP = process.env.KEEP_WORKDIR === "1";

const START_MAP = "resources/maps/start.json";
const MAIN_SCENE = "resources/scenes/main.json";
const TILESET = "resources/tiles/tileset16-8x13.png";
const SCENE_TYPES = new Set(["node", "sprite", "text", "tilemap"]);
const PROBE_SCRIPT = "components/collision_probe";

// 항구 마을: 러너가 화면을 보는 맵 멈춤 셋의 카메라는 y 264 이상이라 줄 16 부터 보인다. 칠할 칸은 그 위 줄 2 의 풀밭이고 통행은 그대로다
const HARBOUR_MAP = "resources/maps/port_town.json";
const HARBOUR_PAINT = { layer: 0, x: 3, y: 2, gid: 45 };
/** 대조: 마을 첫 화면(town, 카메라 x 72, y 320, 화면은 논리 크기의 2배) 안의 칸을 over 레이어(캐릭터 위)에 칠한다 */
const HARBOUR_CONTROL = { layer: 2, x: 10, y: 26, gid: 45, stop: "town", camera: { x: 72, y: 320 }, scale: 2 };
const GOLDEN_STOPS = ["town", "bag", "wall"];
/** 짐 상자 이벤트를 보는 러너의 검사 이름 (needle 은 crateLine) */
const CRATE_CHECK = "맵 파일에 실린 이벤트가 그대로 실행된다";

function caseDir(name) {
  return tempDir("initial-editor-map", name);
}

function cleanup(dir) {
  if (KEEP) console.log(`  작업 폴더 유지: ${dir}`);
  else fs.rmSync(dir, { recursive: true, force: true });
}

const features = requireEngine(target, "initial-editor-map");
const hasMruby = features.has("mruby");
console.log(`엔진: ${exe} (기능: ${[...features].join(" ")})`);

// ---- 에디터 모듈 (TypeScript) ----

const [core, tilemapExt, model, rpg, templates, mapTools, newMap, bmp] = await loadEditorModules(repo, [
  "/packages/core/src/index.ts",
  "/packages/ext-tilemap/src/index.ts",
  "/packages/ext-tilemap/src/model/index.ts",
  "/packages/ext-rpg/src/model/index.ts",
  "/packages/app/src/editor/scene/projectTemplates.ts",
  "/packages/app/src/editor/maps/mapTools.ts",
  "/packages/app/src/editor/maps/newMap.ts",
  "/tests/e2e/support/bmp.ts",
]);

/** 번들 대신 packages/app/templates/ 를 읽는 템플릿 소스 */
const fsSource = {
  text: (rel) => fs.readFileSync(path.join(templatesDir, rel), "utf8"),
  binary: async (rel) => new Uint8Array(fs.readFileSync(path.join(templatesDir, rel))),
};

/** 새 프로젝트 대화상자의 "만들기" 와 같은 함수로 타일맵 템플릿을 쓴다 */
async function writeTilemapProject(dir, language) {
  const script = language === "ruby" ? "mruby" : "lua";
  return templates.writeProjectTemplate(fsBackend(dir), { template: "tilemap", language: script, name: `e2e-map-${language}` }, fsSource);
}

function readText(dir, rel) {
  return fs.readFileSync(path.join(dir, rel), "utf8");
}

// ---- 맵 뷰의 도구 ----

/** 맵 뷰의 도구 (렌더러가 만드는 것과 같은 MapToolController, 줌 1) */
function toolsFor(doc) {
  return new mapTools.MapToolController({ document: doc, zoom: () => 1, changed: () => {}, notice: (m) => console.log(`  (알림) ${m}`) });
}

/** 맵 뷰가 하듯 도구에 포인터를 넘긴다. 칸의 가운데(월드 픽셀)를 누르고, 끌 칸을 차례로 지나 마지막 칸에서 뗀다 */
function gesture(doc, tools, cells, { button = 0, alt = false } = {}) {
  const { tileWidth: tw, tileHeight: th } = doc.model;
  const at = ([x, y]) => ({ world: { x: x * tw + tw / 2, y: y * th + th / 2 }, button, shift: false, alt });
  tools.pointerDown(at(cells[0]));
  for (const c of cells.slice(1)) tools.pointerMove(at(c));
  tools.pointerUp(at(cells[cells.length - 1]));
}

/** 씬 문서를 열어 명령을 되돌리기 스택으로 적용하고 저장한다 (인스펙터와 계층 패널이 하는 길) */
async function editScene(dir, commands) {
  const doc = await core.SceneDocument.open(fsBackend(dir), MAIN_SCENE, () => SCENE_TYPES);
  for (const make of commands) doc.apply(make(doc.scene));
  await doc.save();
  return { problems: doc.problems, dirty: doc.dirty };
}

const report = checkList();
const check = report.check;
const measure = report.measure;

function dumpOnFailure(result, log) {
  if (result.status !== 0) console.log("  --- 엔진 출력 ---\n" + log.trim().split("\n").slice(-40).map((l) => "  " + l).join("\n"));
}

// ---- 1. 통행 ----

function probeSource(language) {
  if (language === "lua") {
    return `-- CollisionProbe 컴포넌트. 씬의 타일맵 오브젝트(map)가 연 맵의 통행을 칸마다 찍는다 (1 막힘, 0 지나감).

local CollisionProbe = {}

function CollisionProbe.init(obj, scene)
  local map = scene:find("map").tilemap
  local w, h = Tilemap.GetSize(map)
  print(string.format("collisionProbe:size %d %d", w, h))
  for y = 0, h - 1 do
    local row = {}
    for x = 0, w - 1 do
      row[#row + 1] = Tilemap.IsPassable(map, x, y) and "0" or "1"
    end
    print("collisionProbe:row " .. y .. " " .. table.concat(row))
  end
  print("collisionProbe:done")
end

function CollisionProbe.update(obj, scene, elapsed)
end

function CollisionProbe.render(obj, scene)
end

function CollisionProbe.destroy(obj, scene)
end

return CollisionProbe
`;
  }
  return `# CollisionProbe 컴포넌트. 씬의 타일맵 오브젝트(map)가 연 맵의 통행을 칸마다 찍는다 (1 막힘, 0 지나감).

class CollisionProbe
  def init(obj, scene)
    map = scene.find("map").tilemap
    puts "collisionProbe:size #{map.width} #{map.height}"
    map.height.times do |y|
      row = (0...map.width).map { |x| map.passable?(x, y) ? "0" : "1" }.join
      puts "collisionProbe:row #{y} #{row}"
    end
    puts "collisionProbe:done"
  end

  def update(obj, scene, elapsed)
  end

  def render(obj, scene)
  end

  def destroy(obj, scene)
  end
end
`;
}

/**
 * 통행 편집: [설명, 도구, 지나는 칸, 포인터, 칠하는 값]. 끌기는 가로줄이나 사각형이라 첫 칸과 끝 칸의 사각형이 바뀌는 칸이다.
 * 템플릿 맵은 둘레 두 칸이 울타리(막힘)이고 안은 지나감이다
 */
const COLLISION_EDITS = [
  ["통행 도구 왼쪽 끌기 (10..14, 10) 막음", "collision", [[10, 10], [14, 10]], {}, 1],
  ["통행 도구 오른쪽 끌기 (0..1, 20) 울타리 풂", "collision", [[0, 20], [1, 20]], { button: 2 }, 0],
  ["통행 도구 Alt 클릭 (47, 30) 울타리 풂", "collision", [[47, 30]], { alt: true }, 0],
  ["통행 대상의 사각형 (20..22, 20..23) 막음", "rect", [[20, 20], [22, 23]], {}, 1],
  ["통행 대상의 지우개 (20..23, 0) 울타리 풂", "erase", [[20, 0], [23, 0]], {}, 0],
];

/** 편집이 바꿀 칸 (칸 번호 → 값) */
function expectedCollisionEdits(width) {
  const out = new Map();
  for (const [, , cells, , value] of COLLISION_EDITS) {
    const [x0, y0] = cells[0];
    const [x1, y1] = cells[cells.length - 1];
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.set(y * width + x, value);
  }
  return out;
}

async function collisionCase(language) {
  const script = language === "ruby" ? "mruby" : "lua";
  const dir = caseDir(`collision-${language}`);
  console.log(`\n[collision/${language}] ${dir}`);
  await writeTilemapProject(dir, language);
  const originalText = readText(dir, START_MAP);
  const original = model.parseMap(originalText);
  const doc = await model.MapDocument.open(fsBackend(dir), START_MAP);
  const tools = toolsFor(doc);
  for (const [label, tool, cells, pointer] of COLLISION_EDITS) {
    // 레이어 패널에서 통행을 고르고 도구 단축키를 누르는 순서
    doc.setTarget({ kind: "collision" });
    doc.setTool(tool);
    const depth = doc.undo.depth;
    gesture(doc, tools, cells, pointer);
    check(`${label}: 되돌리기 한 단계`, doc.target.kind === "collision" && doc.undo.depth === depth + 1, `대상 ${doc.target.kind}, 단계 ${depth} → ${doc.undo.depth}`);
  }
  // 이미 지나감인 칸을 풀면 명령이 없다 (바뀌는 칸만 칠한다)
  doc.setTool("collision");
  const depth = doc.undo.depth;
  gesture(doc, tools, [[30, 30]], { button: 2 });
  check("지나감인 칸을 풀면 명령이 쌓이지 않는다", doc.undo.depth === depth, `단계 ${depth} → ${doc.undo.depth}`);
  await doc.save();
  check("저장하면 맵 문서의 바뀜 표시가 풀린다", doc.dirty === false);

  const savedText = readText(dir, START_MAP);
  const saved = model.parseMap(savedText);
  const w = saved.width;
  const expected = expectedCollisionEdits(w);
  const changed = [];
  for (let i = 0; i < saved.collision.length; i++) if (saved.collision[i] !== original.collision[i]) changed.push(i);
  const unexpected = changed.filter((i) => expected.get(i) !== saved.collision[i]);
  const missing = [...expected.keys()].filter((i) => saved.collision[i] !== expected.get(i));
  check(
    `저장한 파일의 통행은 도구로 고친 ${expected.size} 칸만 다르다`,
    changed.length === expected.size && unexpected.length === 0 && missing.length === 0,
    `다른 칸 ${changed.length}, 뜻밖의 칸 ${unexpected.length}, 빠진 칸 ${missing.length}`,
  );
  check("저장한 파일의 타일 레이어는 그대로다", JSON.stringify(saved.layers) === JSON.stringify(original.layers));

  const scene = await editScene(dir, [
    (s) => s.addObject(core.makeObject("node", "probe", {})),
    (s) => s.attachScript("probe", PROBE_SCRIPT),
  ]);
  check("씬에 탐침 노드와 컴포넌트를 더해 저장했다 (문제 없음)", scene.dirty === false && scene.problems.length === 0, JSON.stringify(scene.problems));
  const component = core.scriptPathFor(PROBE_SCRIPT, script);
  fs.mkdirSync(path.dirname(path.join(dir, component)), { recursive: true });
  fs.writeFileSync(path.join(dir, component), probeSource(language));

  const { result, log } = runEngine(exe, dir, { script, exitAfter: 5 });
  for (const c of exitChecks(log, result.status)) check(c.name, c.ok, `${c.detail} signal=${result.signal}`);
  const modelCollision = doc.model.collision ? [...doc.model.collision] : null;
  const judge = (engineLog) => collisionChecks({ log: engineLog, width: w, height: saved.height, saved: saved.collision, model: modelCollision, original: original.collision });
  for (const c of judge(log)) measure(c.name, c.ok, c.detail);
  dumpOnFailure(result, log);

  // 대조: 판정은 그대로 저장한 파일과 모델로 하고, 엔진에게만 고치기 전 맵을 준다
  fs.writeFileSync(path.join(dir, START_MAP), originalText);
  const control = runEngine(exe, dir, { script, exitAfter: 5 });
  const failedChecks = judge(control.log).filter((c) => !c.ok);
  const mustFail = ["엔진의 막힘이 저장한 파일의 통행과", "엔진의 막힘이 에디터 모델의 통행과", "고친 칸"];
  const missed = mustFail.filter((m) => !failedChecks.some((c) => c.name.startsWith(m)));
  check(
    "대조: 엔진에 고치기 전 맵을 주면 칸마다 견주기에서 떨어진다",
    control.result.status === 0 && control.log.includes("collisionProbe:done") && missed.length === 0,
    `status ${control.result.status}, 떨어져야 하는데 통과: ${missed.join(" | ")}`,
  );
  for (const c of failedChecks) console.log(`    떨어짐: ${c.name.replace(/ \(.*$/, "")}  ${c.detail}`);
  fs.writeFileSync(path.join(dir, START_MAP), savedText);
  doc.dispose();
  cleanup(dir);
}

// ---- 2. 새 맵 골든 ----

const GOLDEN_MAP = { name: "e3_golden", width: 24, height: 16 };

/** 새 맵을 칠하는 도구 순서: [레이어, 붓, 도구, 칸 목록] */
function goldenStrokes(tileset) {
  return [
    [0, model.singleBrush(46), "fill", [[0, 0]]],
    [0, model.paletteBrush(tileset, 4, 1, 5, 1), "rect", [[2, 2], [9, 6]]],
    [0, model.singleBrush(45), "pen", [[12, 2], [20, 10]]],
    [1, model.singleBrush(41), "pen", [[2, 12], [21, 12]]],
    [1, model.singleBrush(76), "rect", [[14, 3], [17, 5]]],
    [1, model.singleBrush(42), "pen", [[5, 4]]],
  ];
}

/** 새 맵 대화상자의 host (파일 쓰기만 진짜고 나머지는 적어 둔다) */
function newMapHost(backend) {
  const said = [];
  return {
    said,
    host: {
      backend,
      project: { refresh: async () => {} },
      tree: { reveal: async () => {} },
      log: { info: () => {}, error: (_source, message) => said.push(message) },
      toasts: { warn: (m) => said.push(m), error: (m) => said.push(m) },
    },
  };
}

/** 두 맵의 레이어에서 값이 다른 칸 [{ layer, x, y, before }] */
function paintedCells(before, after) {
  const out = [];
  after.layers.forEach((layer, li) =>
    layer.data.forEach((v, i) => {
      const b = before.layers[li].data[i];
      if (v !== b) out.push({ layer: li, x: i % after.width, y: Math.floor(i / after.width), before: b });
    }),
  );
  return out;
}

/** 엔진을 돌려 프레임 30 을 찍고 저장한 맵으로 그린 기준과 견준다. 돌려주는 것은 판정 목록 (스크린샷이 없으면 null) */
function goldenRun(dir, script, judge) {
  const { result, log, shot } = runEngine(exe, dir, { script, exitAfter: 40, shotFrame: 30 });
  const exits = exitChecks(log, result.status);
  if (!hasShot(shot)) return { exits, checks: null, result, log };
  const frame = bmp.readBmp(fs.readFileSync(shot));
  fs.rmSync(shot);
  return { exits, checks: judge(frame), result, log, frame };
}

async function goldenCase(language) {
  const script = language === "ruby" ? "mruby" : "lua";
  const dir = caseDir(`golden-${language}`);
  console.log(`\n[golden/${language}] ${dir}`);
  await writeTilemapProject(dir, language);
  const backend = fsBackend(dir);
  const size = await newMap.readImageSize(backend, TILESET);
  const spec = {
    name: GOLDEN_MAP.name,
    width: GOLDEN_MAP.width,
    height: GOLDEN_MAP.height,
    tileSize: newMap.DEFAULT_TILE_SIZE,
    tileset: { image: TILESET, columns: newMap.tilesetColumns(size.width, newMap.DEFAULT_TILE_SIZE) },
    layers: [...newMap.DEFAULT_LAYER_NAMES],
    collision: true,
  };
  const { host, said } = newMapHost(backend);
  const mapPath = await newMap.createMapFile(host, spec);
  check(`새 맵 대화상자의 함수가 맵 파일을 만들었다 (${GOLDEN_MAP.width}x${GOLDEN_MAP.height}, 레이어 ${spec.layers.join(", ")})`, mapPath === newMap.mapPathFor(GOLDEN_MAP.name) && said.length === 0, `${mapPath} ${said.join(" | ")}`);
  if (!mapPath) return cleanup(dir);
  const blankText = readText(dir, mapPath);
  const blank = model.parseMap(blankText);

  const doc = await model.MapDocument.open(backend, mapPath);
  const tools = toolsFor(doc);
  for (const [layer, brush, tool, cells] of goldenStrokes(doc.model.tilesets[0])) {
    doc.setTarget({ kind: "layer", index: layer });
    doc.setBrush(brush);
    doc.setTool(tool);
    gesture(doc, tools, cells);
  }
  check("붓질 여섯 번이 되돌리기 여섯 단계다", doc.undo.depth === 6, `단계 ${doc.undo.depth}`);
  await doc.save();
  const savedText = readText(dir, mapPath);
  const saved = JSON.parse(savedText);
  const painted = paintedCells(blank, model.parseMap(savedText));
  const perLayer = [0, 1].map((li) => painted.filter((c) => c.layer === li).length);
  check(
    "저장한 맵: 바닥은 전부 칠했고 deco 에도 칠한 칸이 있다",
    perLayer[0] === GOLDEN_MAP.width * GOLDEN_MAP.height && perLayer[1] > 0 && doc.dirty === false,
    `ground ${perLayer[0]} 칸, deco ${perLayer[1]} 칸`,
  );
  console.log(`  칠한 칸: ground ${perLayer[0]}, deco ${perLayer[1]} (gid ${[...new Set(painted.map((c) => saved.layers[c.layer].data[c.y * saved.width + c.x]))].sort((a, b) => a - b).join(", ")})`);

  const scene = await editScene(dir, [(s) => s.setProp("map", "map", mapPath)]);
  const sceneData = JSON.parse(readText(dir, MAIN_SCENE));
  const mapObject = sceneData.objects.find((o) => o.id === "map");
  check("씬의 타일맵 오브젝트가 새 맵을 가리킨다", scene.problems.length === 0 && mapObject?.type === "tilemap" && mapObject.props.map === mapPath, JSON.stringify(mapObject));

  const images = new Map([[TILESET, decodePng(fs.readFileSync(path.join(dir, TILESET)))]]);
  const judge = (frame) => {
    // 씬의 타일맵 오브젝트가 (0, 0) 이라 화면의 왼쪽 위가 맵의 왼쪽 위다. 맵 영역(배율만큼 키운 것)만 잘라 견준다
    const rect = { x: 0, y: 0, width: saved.width * saved.tileWidth, height: saved.height * saved.tileHeight };
    const scale = frame.width / SCREEN_WIDTH;
    const region = cropImage(frame, 0, 0, rect.width * scale, rect.height * scale);
    return [...referenceChecks({ map: saved, images, rect, frame: region }), paintedCellsCheck({ map: saved, images, rect, frame: region, cells: painted })];
  };

  const good = goldenRun(dir, script, judge);
  for (const c of good.exits) check(c.name, c.ok, `${c.detail} signal=${good.result.signal}`);
  check("프레임 30 스크린샷", good.checks !== null);
  for (const c of good.checks ?? []) measure(c.name, c.ok, c.detail);
  dumpOnFailure(good.result, good.log);

  // 대조: 판정은 그대로 저장한 맵으로 하고, 엔진에게만 다른 맵을 준다
  const noDeco = model.parseMap(savedText);
  noDeco.layers[1].data.fill(0);
  const controls = [
    ["칠하기 전 맵", blankText, ["게임 화면이 저장한 맵의 타일과 같다", "레이어 ground", "레이어 deco", "칠한 칸이 하나하나"]],
    ["deco 를 비운 맵", model.serializeMap(noDeco), ["레이어 deco", "칠한 칸이 하나하나"]],
  ];
  for (const [label, text, mustFail] of controls) {
    check(`대조 준비: ${label}은 저장한 맵과 다르다`, text !== savedText);
    fs.writeFileSync(path.join(dir, mapPath), text);
    const run = goldenRun(dir, script, judge);
    const failedChecks = (run.checks ?? []).filter((c) => !c.ok);
    const failed = failedChecks.map((c) => c.name);
    const missed = mustFail.filter((m) => !failed.some((f) => f.startsWith(m)));
    check(
      `대조: 엔진에 ${label}을 주면 판정에서 떨어진다`,
      run.result.status === 0 && run.checks !== null && missed.length === 0,
      `떨어진 검사 ${failed.length}: ${failed.join(" | ")}; 떨어져야 하는데 통과: ${missed.join(" | ")}`,
    );
    for (const c of failedChecks) console.log(`    떨어짐: ${c.name.replace(/ \(.*$/, "")}  ${c.detail}`);
  }
  fs.writeFileSync(path.join(dir, mapPath), savedText);
  doc.dispose();
  cleanup(dir);
}

// ---- 3. 항구 마을 ----

function gitHead(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** 엔진 저장소의 추적 파일을 새 폴더로 (git archive HEAD) */
function engineCopy(commit) {
  const dir = caseDir("harbour");
  const tar = `${dir}.tar`;
  execFileSync("git", ["-C", engineDir, "archive", "--format=tar", "-o", tar, commit]);
  execFileSync("tar", ["-xf", tar, "-C", dir]);
  fs.rmSync(tar);
  return dir;
}

/** 엔진 테스트 러너를 사본 안에서 돌린다 (사본의 resources 를 쓴다). 러너가 지우지 않는 작업 폴더는 사본 안(TMPDIR)에 둔다 */
function runRunner(copy) {
  const tmp = path.join(copy, ".runner-tmp");
  fs.mkdirSync(tmp, { recursive: true });
  const r = spawnSync("python3", ["tests/run_engine_tests.py", exe, "--only=rpgdemo_scene"], {
    cwd: copy,
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, SDL_VIDEODRIVER: "dummy", SDL_AUDIODRIVER: "dummy", TMPDIR: tmp },
  });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  return { status: r.status, out, summary: runnerSummary(out) };
}

/**
 * 러너의 make_workdir 와 같은 작업 폴더로 인수 씬을 한 번 돌린다: resources 는 사본에 심링크, scripts 는 복사하고 main.lua 대신
 * tests/engine/scenes/rpgdemo_scene.lua, 입력 재생기는 scripts/lua/luatests/. stop 이 있으면 그 화면의 프레임 20 을 찍는다
 */
function runScenario(copy, stop) {
  const work = caseDir(`scenario-${stop ?? "full"}`);
  fs.symlinkSync(path.join(copy, "resources"), path.join(work, "resources"));
  fs.cpSync(path.join(copy, "scripts"), path.join(work, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(work, "scripts", "lua", "luatests"), { recursive: true });
  fs.copyFileSync(path.join(copy, "tests", "lua", "input_replay.lua"), path.join(work, "scripts", "lua", "luatests", "input_replay.lua"));
  fs.copyFileSync(path.join(copy, "tests", "engine", "scenes", "rpgdemo_scene.lua"), path.join(work, "scripts", "lua", "main.lua"));
  const extraEnv = { INITIAL2D_NO_RTP: "1" };
  if (stop) extraEnv.INITIAL2D_DEMO_STOP = stop;
  const run = runEngine(exe, work, { exitAfter: 30, shotFrame: stop ? 20 : null, extraEnv, timeout: 600_000 });
  const frame = hasShot(run.shot) ? bmp.readBmp(fs.readFileSync(run.shot)) : null;
  fs.rmSync(work, { recursive: true, force: true });
  return { ...run, frame };
}

function stopFrames(copy) {
  const out = new Map();
  for (const stop of GOLDEN_STOPS) {
    const run = runScenario(copy, stop);
    out.set(stop, run.frame);
    check(`멈춤 ${stop} 의 프레임 20`, run.result.status === 0 && run.frame !== null, `status ${run.result.status} ${tail(run.log)}`);
  }
  return out;
}

/** 앱과 같은 길로 항구 마을을 연다: 타일맵 자리에 이벤트 레이어를 등록하고 맵 문서를 열린 문서에 넣는다 */
async function openHarbour(copy) {
  const read = (rel) => fs.readFileSync(path.join(copy, rel), "utf8");
  const schema = rpg.parseEventSchema(read("resources/schema/event-commands.json"));
  const game = rpg.parseGameConfig(read("resources/data/rpg-game.json"));
  const items = game.items ? rpg.parseItemTable(read(game.items)) : null;
  const defs = new Map();
  for (const m of game.maps) if (fs.existsSync(path.join(copy, m.def))) defs.set(m.def, rpg.defFileIds(read(m.def)));
  const sources = {
    schema,
    schemaPresent: true,
    schemaProblem: null,
    game,
    gameProblem: null,
    items,
    defIds: (p) => defs.get(p) ?? null,
    fileExists: (p) => fs.existsSync(path.join(copy, p)),
  };
  const documents = new core.DocumentRegistry();
  const contrib = new tilemapExt.TilemapContrib({ documents });
  contrib.registerMapLayer(rpg.eventsLayerCore(sources));
  const doc = await model.MapDocument.open(fsBackend(copy), HARBOUR_MAP);
  documents.open(doc);
  return { doc, state: rpg.eventsStateOf(doc) };
}

/** 문서의 레이어에 한 칸을 펜으로 칠하고 저장한다 */
async function paintAndSave(doc, cell) {
  doc.setTarget({ kind: "layer", index: cell.layer });
  doc.setBrush(model.singleBrush(cell.gid));
  gesture(doc, toolsFor(doc), [[cell.x, cell.y]]);
  const dirty = doc.dirty;
  await doc.save();
  return { dirty, saved: doc.dirty === false };
}

async function harbourCase() {
  console.log("\n[harbour]");
  const commit = gitHead(engineDir);
  if (!commit) {
    console.log(`  SKIP: 엔진 저장소 없음 (git 저장소가 아니다): ${engineDir}. INITIAL2D_DIR 로 엔진 체크아웃을 준다`);
    return;
  }
  const pil = spawnSync("python3", ["-c", "import PIL"], { encoding: "utf8" });
  if (!check("python3 과 Pillow 가 있다 (엔진 테스트 러너가 쓴다)", pil.status === 0, (pil.stderr ?? String(pil.error ?? "")).trim())) return;
  const copy = engineCopy(commit);
  console.log(`  엔진 ${commit.slice(0, 7)} 의 추적 파일 사본: ${copy}`);
  const mapFile = path.join(copy, HARBOUR_MAP);
  const originalText = fs.readFileSync(mapFile, "utf8");
  const original = JSON.parse(originalText);

  // 칠하기 전: 러너의 결과와 맵 멈춤 셋의 화면
  const before = runRunner(copy);
  check("칠하기 전 사본에서 인수 시나리오가 통과한다", before.status === 0 && before.summary.total?.fail === 0 && before.summary.passed.length > 0, `status ${before.status}, ${JSON.stringify(before.summary.total)}`);
  const framesBefore = stopFrames(copy);

  // 앱과 같은 길로 열고 한 칸 칠해 저장
  const { doc, state } = await openHarbour(copy);
  check("이벤트 레이어가 붙었다 (잠금 없음)", state !== null && state.locked === null, state?.locked);
  check("문서로 열고 다시 쓰면 바이트가 같다", doc.text() === originalText);
  const index = HARBOUR_PAINT.y * original.width + HARBOUR_PAINT.x;
  const beforeGid = original.layers[HARBOUR_PAINT.layer].data[index];
  check(`칠할 칸 (${HARBOUR_PAINT.x}, ${HARBOUR_PAINT.y}) 은 gid ${HARBOUR_PAINT.gid} 가 아니고 지나감이다`, beforeGid !== HARBOUR_PAINT.gid && original.collision[index] === 0, `gid ${beforeGid}, 통행 ${original.collision[index]}`);
  const paint = await paintAndSave(doc, HARBOUR_PAINT);
  check("칠하면 바뀜 표시, 저장하면 풀린다", paint.dirty && paint.saved);
  const savedText = fs.readFileSync(mapFile, "utf8");
  const saved = JSON.parse(savedText);
  const diffs = jsonDiff(original, saved);
  const cellPath = `$.layers[${HARBOUR_PAINT.layer}].data[${index}]`;
  check(`저장한 파일은 칠한 칸 하나만 다르다 (${cellPath})`, diffs.length === 1 && diffs[0] === cellPath && saved.layers[HARBOUR_PAINT.layer].data[index] === HARBOUR_PAINT.gid, diffs.slice(0, 8).join(" "));
  check(
    "이벤트는 그대로다 (짐 상자 포함)",
    Array.isArray(saved.events) && saved.events.length === original.events.length && jsonDiff(original.events, saved.events).length === 0 && saved.events.some((e) => e.id === "crates"),
    `원본 ${original.events?.length}, 저장 ${saved.events?.length}`,
  );
  const lines = lineDiff(originalText, savedText);
  const tokens = (text) => (lines.length === 1 ? text.split("\n")[lines[0] - 1].trim().split(",") : []);
  const tokenDiff = tokens(originalText).flatMap((t, i) => (t === tokens(savedText)[i] ? [] : [i]));
  check(
    "글에서도 그 칸의 줄 하나, 그 줄의 수 하나만 다르다",
    lines.length === 1 && tokenDiff.length === 1 && tokenDiff[0] === HARBOUR_PAINT.x && tokens(savedText)[HARBOUR_PAINT.x] === String(HARBOUR_PAINT.gid),
    `다른 줄 ${lines.join(", ")}, 다른 수의 자리 ${tokenDiff.join(", ")}`,
  );

  // 칠한 뒤: 러너가 같은 PASS 목록으로 통과하고 골든을 새로 쓰지 않는다
  const after = runRunner(copy);
  const s = after.summary;
  check("칠한 뒤 인수 시나리오가 무변경으로 통과한다 (run_engine_tests.py --only=rpgdemo_scene)", after.status === 0 && s.total !== null && s.total.fail === 0 && s.total.pass === s.passed.length, `status ${after.status}, ${JSON.stringify(s.total)} ${s.failed.join(" | ")}`);
  check("PASS 목록이 칠하기 전과 같다", s.passed.length > 0 && JSON.stringify(s.passed) === JSON.stringify(before.summary.passed), `전 ${before.summary.passed.length}, 뒤 ${s.passed.length}`);
  check("러너가 골든을 새로 쓰거나 갱신하지 않았다", s.golden.length === 0 && before.summary.golden.length === 0, [...before.summary.golden, ...s.golden].join(" | "));
  const goldenPasses = s.passed.filter((n) => n.startsWith("골든 일치:"));
  check("골든 셋(rpgdemo_title, town, bag)이 일치한다", ["rpgdemo_title", "rpgdemo_town", "rpgdemo_bag"].every((g) => goldenPasses.includes(`골든 일치: ${g}`)), goldenPasses.join(", "));
  check(`짐 상자 이벤트 검사가 통과한다 (${CRATE_CHECK})`, s.passed.includes(CRATE_CHECK));
  console.log(`  러너: ${s.total?.pass} PASS / ${s.total?.fail} FAIL (칠하기 전 ${before.summary.total?.pass} PASS)`);

  // 짐 상자 대사가 저장한 파일의 이벤트 글이다
  const full = runScenario(copy, null);
  const crate = saved.events.find((e) => e.id === "crates");
  const crateText = crate?.commands?.find((c) => c.code === "message")?.text ?? "";
  const crateLine = full.log.split("\n").find((l) => l.startsWith("crateLine:")) ?? "";
  const squash = (t) => t.replace(/\s+/g, "");
  check(
    "짐 상자 대사가 저장한 이벤트의 글이다",
    full.result.status === 0 && crateText !== "" && squash(crateLine.slice("crateLine:".length)) === squash(crateText) && full.log.includes("demoDone:true"),
    `${crateLine} | ${crateText}`,
  );
  console.log(`  ${crateLine}`);

  // 러너가 보는 맵 멈춤 화면이 칠하기 전과 픽셀까지 같다
  const framesAfter = stopFrames(copy);
  for (const stop of GOLDEN_STOPS) {
    const a = framesBefore.get(stop);
    const b = framesAfter.get(stop);
    const d = a && b ? frameDiff(a, b) : null;
    check(`멈춤 ${stop} 의 화면이 칠하기 전과 픽셀까지 같다 (칠한 칸이 러너가 보는 화면 밖이다)`, d !== null && !d.sizeMismatch && d.count === 0, JSON.stringify(d));
  }

  // 대조: 마을 첫 화면 안의 칸을 칠하면 그 화면이 그 칸 자리에서만 달라진다
  const control = HARBOUR_CONTROL;
  const again = await openHarbour(copy);
  const controlPaint = await paintAndSave(again.doc, control);
  const controlRun = runScenario(copy, control.stop);
  const d = framesBefore.get(control.stop) && controlRun.frame ? frameDiff(framesBefore.get(control.stop), controlRun.frame) : null;
  const size = original.tileWidth * control.scale;
  const cellBox = { x0: (control.x * original.tileWidth - control.camera.x) * control.scale, y0: (control.y * original.tileHeight - control.camera.y) * control.scale };
  const inside = d?.box && d.box.x0 >= cellBox.x0 && d.box.y0 >= cellBox.y0 && d.box.x1 < cellBox.x0 + size && d.box.y1 < cellBox.y0 + size;
  check(
    `대조: 마을 첫 화면 안의 칸 (${control.x}, ${control.y}) 을 칠하면 그 화면이 그 칸 자리에서만 달라진다`,
    controlPaint.saved && d !== null && d.count > 0 && inside,
    `${JSON.stringify(d)} 칸 자리 ${JSON.stringify(cellBox)} (${size}px)`,
  );
  if (d) console.log(`    대조의 다른 픽셀 ${d.count} 개, 사각형 ${JSON.stringify(d.box)}`);
  again.doc.dispose();
  doc.dispose();
  cleanup(copy);
}

// ---- 판 돌리기 ----

/** 판 하나를 돌린다. 판이 던지면 그 판의 실패로 적고 다음 판으로 간다 */
async function runCase(name, fn) {
  try {
    await fn();
  } catch (e) {
    console.log(`\n[${name}]`);
    check(`${name} 판이 끝까지 돈다`, false, e instanceof Error ? e.stack : String(e));
  }
}

for (const [name, fn] of [
  ["collision", collisionCase],
  ["golden", goldenCase],
]) {
  for (const language of ["lua", "ruby"]) {
    if (language === "ruby" && !hasMruby) console.log(`\n[${name}/ruby] SKIP: 이 엔진 빌드에 mruby 없음`);
    else await runCase(`${name}/${language}`, () => fn(language));
  }
}
await runCase("harbour", harbourCase);

report.finish();
