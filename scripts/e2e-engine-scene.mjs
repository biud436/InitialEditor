#!/usr/bin/env node
// 진짜 엔진과의 씬 교차 검사 (docs/plans/e2-scene.md 마일스톤 7, e6-packaging.md 마일스톤 3). "에디터가 만든 프로젝트와
// 씬이 게임에서 돈다"를 사람이 아니라 스크립트가 확인한다. Playwright 의 브라우저 모드는 프로세스를 못 띄우므로 Node 에서 한다.
//
//   yarn test:engine-scene                                   엔진은 <INITIAL2D_DIR>/build/Initial2D (기본 ../Initial2D)
//   INITIAL2D_EXE=/path/to/Initial2D yarn test:engine-scene  엔진 실행 파일을 직접 준다 (배포용 빌드, 사이드카)
//   KEEP_WORKDIR=1 yarn test:engine-scene                    임시 프로젝트를 남긴다
//
// 새 프로젝트는 앱과 같은 함수(scene/projectTemplates.ts 의 writeProjectTemplate)로 쓴다. TypeScript 모듈(그것과 맵 모델,
// e2e 의 BMP 읽기 tests/e2e/support/bmp.ts)은 Vite 의 SSR 로 읽는다. 하는 일 (언어마다):
//   1. 빈 프로젝트에 에디터가 하듯 오브젝트 둘(스프라이트와 컴포넌트가 붙은 노드)을 더해 돌리고 컴포넌트 init 을 본다.
//      컴포넌트에는 매개변수 선언(scripts/components/hello.json)이 있고, 코어의 SceneModel.setParam 으로 값 둘을 정해
//      저장한다. 엔진이 컴포넌트에 넘긴 params 가 선언의 기본값에 씬의 값을 덮은 것인지 본다
//   2. 플래피는 INITIAL2D_AUTOPLAY=1 로 자동 시연을 돌려 상태 전이와 900틱 종료 요약을 본다
//   3. 타일맵은 맵 문서(ext-tilemap 의 MapDocument)로 칸 (24, 28) 을 표식 타일(gid 45)로 칠해 저장하고, 시작 씬(game.json)
//      으로 돌려 스크린샷의 그 칸이 표식 색 #d8c880 이고 옆 칸은 잔디인지 본다
// 엔진은 헤드리스다 (SDL_VIDEODRIVER=dummy, SDL_AUDIODRIVER=dummy, INITIAL2D_EXIT_AFTER). <INITIAL2D_DIR>/build/Initial2D 가
// 없으면 건너뛰고 0 으로 끝난다. INITIAL2D_EXE 로 준 파일이 없으면 실패다. mruby 가 없는 빌드면 Ruby 판만 건너뛴다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { errorLines, exitChecks, flappyChecks } from "./lib/flappyChecks.mjs";
import { MARKER, tilemapPixelChecks } from "./lib/frameChecks.mjs";
import { caseDir as tempDir, checkList, engineTarget, fsBackend, loadEditorModules, requireEngine, runEngine as runEngineIn, tail } from "./lib/engineRun.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const templatesDir = path.join(repo, "packages", "app", "templates");
const manifest = JSON.parse(fs.readFileSync(path.join(templatesDir, "MANIFEST.json"), "utf8"));
const target = engineTarget(repo);
const exe = target.exe;
const KEEP = process.env.KEEP_WORKDIR === "1";

// 타일맵 템플릿의 표식 칸과 색, 화면 검사는 scripts/lib/frameChecks.mjs (자가 검사의 판정과 같은 셈)
const MAP_PATH = "resources/maps/start.json";

function caseDir(name) {
  return tempDir("initial-editor-scene", name);
}

const features = requireEngine(target, "initial-editor-scene");
const hasMruby = features.has("mruby");
console.log(`엔진: ${exe} (기능: ${[...features].join(" ")})`);

// ---- 에디터 모듈 (TypeScript) ----

const editor = Object.assign(
  {},
  ...(await loadEditorModules(repo, ["/packages/app/src/editor/scene/projectTemplates.ts", "/packages/ext-tilemap/src/model/index.ts", "/tests/e2e/support/bmp.ts", "/packages/core/src/index.ts"])),
);

/** 번들 대신 packages/app/templates/ 를 읽는 템플릿 소스 */
const fsSource = {
  text: (rel) => fs.readFileSync(path.join(templatesDir, rel), "utf8"),
  binary: async (rel) => new Uint8Array(fs.readFileSync(path.join(templatesDir, rel))),
};

/** 새 프로젝트 대화상자의 "만들기" 와 같은 함수로 쓴다 */
async function writeProject(dir, template, language) {
  const script = language === "ruby" ? "mruby" : "lua";
  return editor.writeProjectTemplate(fsBackend(dir), { template, language: script, name: `e2e-${template}-${language}` }, fsSource);
}

/** 코어 serializeScene 과 같은 키 순서 (version, name, objects[id, type, x, y, visible(false 만), props, scripts]) */
function serializeScene(data) {
  const out = { version: 1, name: data.name };
  out.objects = data.objects.map((o) => {
    const obj = { id: o.id, type: o.type, x: o.x ?? 0, y: o.y ?? 0 };
    if (o.visible === false) obj.visible = false;
    obj.props = o.props ?? {};
    obj.scripts = o.scripts ?? [];
    return obj;
  });
  return JSON.stringify(out, null, 2) + "\n";
}

/** 에디터의 컴포넌트 템플릿(scripting/templates.ts)과 같은 꼴에 print 하나를 더한 것. init 이 받은 params 를 찍는다 */
function componentSource(language, klass, marker) {
  if (language === "lua") {
    return `-- ${klass} 컴포넌트. 씬이 오브젝트(obj)에 붙여 계약 함수를 부른다.

local ${klass} = {}

function ${klass}.init(obj, scene, params)
  print("${marker}")
  print(string.format("hello:params greeting=%s count=%d target=%s", params.greeting, params.count, params.target))
end

function ${klass}.update(obj, scene, elapsed, params)
end

function ${klass}.render(obj, scene, params)
end

function ${klass}.destroy(obj, scene, params)
end

return ${klass}
`;
  }
  return `# ${klass} 컴포넌트. 씬이 오브젝트(obj)에 붙여 계약 메서드를 부른다.

class ${klass}
  def initialize(params = {})
    @params = params
  end

  def init(obj, scene)
    puts "${marker}"
    puts "hello:params greeting=#{@params["greeting"]} count=#{@params["count"].to_i} target=#{@params["target"]}"
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

const PARAMS_DECLARATION = "scripts/components/hello.json";
const PARAMS_FIELDS = {
  version: 1,
  fields: [
    { key: "greeting", type: "string", default: "hi" },
    { key: "count", type: "integer", default: 3, min: 0 },
    { key: "target", type: "object" },
  ],
};
const PARAMS_LINE = "hello:params greeting=안녕 count=3 target=bird";

/** 빈 프로젝트에 에디터가 하듯 오브젝트 둘을 더한다 (코어 CORE_DEFAULT_PROPS.sprite 와 같은 기본값) */
function addEditorObjects(dir, language) {
  const scenePath = path.join(dir, "resources", "scenes", "main.json");
  const scene = JSON.parse(fs.readFileSync(scenePath, "utf8"));
  const bird = manifest.files.find((f) => f.path === "resources/bird_276x64.png");
  fs.copyFileSync(path.join(templatesDir, bird.path), path.join(dir, bird.to));
  scene.objects.push({
    id: "bird",
    type: "sprite",
    x: 100,
    y: 120,
    props: { image: bird.to, width: 92, height: 64, frames: 3, frameDelay: 110, scale: 1, angle: 0, opacity: 255, loop: true, startFrame: 0, endFrame: 2 },
    scripts: [],
  });
  scene.objects.push({ id: "world", type: "node", x: 0, y: 0, props: {}, scripts: ["components/hello"] });
  // 매개변수: 선언의 기본값은 greeting "hi", count 3. 인스펙터가 하듯 코어 명령으로 greeting 과 target 을 정한다
  fs.mkdirSync(path.join(dir, "scripts", "components"), { recursive: true });
  fs.writeFileSync(path.join(dir, PARAMS_DECLARATION), JSON.stringify(PARAMS_FIELDS, null, 2) + "\n");
  const model = new editor.SceneModel(editor.parseScene(serializeScene(scene)));
  model.setParam("world", "components/hello", "greeting", "안녕").execute();
  model.setParam("world", "components/hello", "target", "bird").execute();
  fs.writeFileSync(scenePath, editor.serializeScene(model.toData()));
  const componentPath = language === "lua" ? "scripts/lua/components/hello.lua" : "scripts/ruby/components/hello.rb";
  fs.mkdirSync(path.dirname(path.join(dir, componentPath)), { recursive: true });
  fs.writeFileSync(path.join(dir, componentPath), componentSource(language, "Hello", "hello:init"));
  return componentPath;
}

/** 맵 문서를 열어 펜 한 번(붓 하나를 한 칸에)을 되돌리기 스택으로 적용하고 저장한다. 사용자가 칠하고 Ctrl+S 하는 길이다 */
async function paintMarker(dir) {
  const doc = await editor.MapDocument.open(fsBackend(dir), MAP_PATH);
  doc.setBrush(editor.singleBrush(MARKER.gid));
  const layer = doc.target.kind === "layer" ? doc.target.index : -1;
  doc.apply(doc.model.paintCells(layer, editor.stamp(doc.model, doc.brush, MARKER.x, MARKER.y), "e2e-pen"));
  const dirtyAfterPaint = doc.dirty;
  await doc.save();
  return { layer, dirtyAfterPaint, dirtyAfterSave: doc.dirty };
}

/** 두 맵의 타일 칸 가운데 다른 것 [레이어, 칸 번호, 전, 후] */
function mapDiff(a, b) {
  const out = [];
  a.layers.forEach((l, li) => l.data.forEach((v, i) => v !== b.layers[li].data[i] && out.push([li, i, v, b.layers[li].data[i]])));
  return out;
}

// ---- 엔진 실행 ----

function runEngine(dir, opts) {
  return runEngineIn(exe, dir, opts);
}

const report = checkList();
const check = report.check;

function cleanup(dir) {
  if (KEEP) console.log(`  작업 폴더 유지: ${dir}`);
  else fs.rmSync(dir, { recursive: true, force: true });
}

function dumpOnFailure(result, log) {
  if (result.status !== 0 || errorLines(log).length) console.log("  --- 엔진 출력 ---\n" + log.trim().split("\n").map((l) => "  " + l).join("\n"));
}

for (const language of ["lua", "ruby"]) {
  const script = language === "ruby" ? "mruby" : "lua";
  if (language === "ruby" && !hasMruby) {
    for (const t of ["empty", "flappy", "tilemap"]) console.log(`\n[${t}/${language}] SKIP: 이 엔진 빌드에 mruby 없음`);
    continue;
  }

  // 빈 프로젝트 + 에디터가 더한 오브젝트 둘
  {
    const dir = caseDir(`empty-${language}`);
    console.log(`\n[empty/${language}] ${dir}`);
    const written = await writeProject(dir, "empty", language);
    const component = addEditorObjects(dir, language);
    console.log(`  프로젝트 파일 ${written.length}개 + ${component} + 씬 오브젝트 2개`);
    const { result, log, shot } = runEngine(dir, { scene: "main", script, exitAfter: 120, shotFrame: 30 });
    for (const c of exitChecks(log, result.status)) check(c.name, c.ok, `${c.detail} signal=${result.signal}`);
    check("컴포넌트 init 호출됨 (hello:init)", log.includes("hello:init"), tail(log));
    check(`컴포넌트가 받은 params 는 선언의 기본값에 씬의 값을 덮은 것 (${PARAMS_LINE})`, log.includes(PARAMS_LINE), tail(log));
    check("씬 파일에는 정한 값만 있다", JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, "resources/scenes/main.json"), "utf8")).objects.find((o) => o.id === "world").params) === JSON.stringify({ "components/hello": { greeting: "안녕", target: "bird" } }), "");
    check("프레임 30 스크린샷", fs.existsSync(shot) && fs.statSync(shot).size > 1000, shot);
    dumpOnFailure(result, log);
    cleanup(dir);
  }

  // 플래피버드 자동 시연
  {
    const dir = caseDir(`flappy-${language}`);
    console.log(`\n[flappy/${language}] ${dir}`);
    const written = await writeProject(dir, "flappy", language);
    console.log(`  프로젝트 파일 ${written.length}개 (INITIAL2D_AUTOPLAY=1, 900틱 후 자동 종료)`);
    const { result, log, shot } = runEngine(dir, { scene: "flappy", script, exitAfter: 60000, shotFrame: 150, extraEnv: { INITIAL2D_AUTOPLAY: "1" } });
    for (const c of flappyChecks(log, result.status)) check(c.name, c.ok, c.detail);
    check("프레임 150 스크린샷", fs.existsSync(shot) && fs.statSync(shot).size > 1000, shot);
    dumpOnFailure(result, log);
    cleanup(dir);
  }

  // 타일맵: 맵 문서로 표식 한 칸을 칠해 저장하고, 시작 씬으로 돌린 화면의 그 칸을 본다
  {
    const dir = caseDir(`tilemap-${language}`);
    console.log(`\n[tilemap/${language}] ${dir}`);
    const written = await writeProject(dir, "tilemap", language);
    const game = JSON.parse(fs.readFileSync(path.join(dir, "game.json"), "utf8"));
    console.log(`  프로젝트 파일 ${written.length}개, startScene=${game.startScene}. 칸 (${MARKER.x}, ${MARKER.y}) 을 gid ${MARKER.gid} 로 칠한다`);
    const original = editor.parseMap(fs.readFileSync(path.join(dir, MAP_PATH), "utf8"));
    const paint = await paintMarker(dir);
    check("칠하면 맵 문서가 바뀜 표시, 저장하면 풀린다", paint.dirtyAfterPaint === true && paint.dirtyAfterSave === false, JSON.stringify(paint));
    const saved = editor.parseMap(fs.readFileSync(path.join(dir, MAP_PATH), "utf8"));
    const diff = mapDiff(original, saved);
    const index = MARKER.y * saved.width + MARKER.x;
    check(
      "저장한 맵은 바닥 레이어의 그 칸 하나만 표식 타일이다",
      diff.length === 1 && diff[0][0] === 0 && diff[0][1] === index && diff[0][3] === MARKER.gid,
      JSON.stringify(diff.slice(0, 5)),
    );
    const { result, log, shot } = runEngine(dir, { scene: null, script, exitAfter: 20, shotFrame: 10 });
    for (const c of exitChecks(log, result.status)) check(c.name, c.ok, `${c.detail} signal=${result.signal}`);
    const hasShot = fs.existsSync(shot) && fs.statSync(shot).size > 1000;
    check("프레임 10 스크린샷", hasShot, shot);
    if (hasShot) {
      for (const c of tilemapPixelChecks(editor.readBmp(fs.readFileSync(shot)))) check(c.name, c.ok, c.detail);
    }
    dumpOnFailure(result, log);
    cleanup(dir);
  }
}

report.finish();
