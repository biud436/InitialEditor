#!/usr/bin/env node
// 진짜 엔진과의 씬 교차 검사 (docs/plans/e2-scene.md 마일스톤 7). "에디터가 만든 프로젝트와 씬이 게임에서 돈다"를
// 사람이 아니라 스크립트가 확인한다. Playwright 의 브라우저 모드는 프로세스를 못 띄우므로 Node 에서 직접 한다.
//
//   yarn test:engine-scene                         엔진 저장소는 INITIAL2D_DIR (기본 ../Initial2D)
//   INITIAL2D_DIR=/path/to/Initial2D node scripts/e2e-engine-scene.mjs
//
// 하는 일 (템플릿 둘 x 언어 둘):
//   1. 임시 폴더에 새 프로젝트를 만든다. 파일은 packages/app/templates/MANIFEST.json 이 정하는 목록을 그대로 복사한다
//      (scene/projectTemplates.ts 와 같은 규칙: common + 템플릿 그룹, 그 언어의 파일만). game.json 도 같은 값이다
//   2. 빈 프로젝트에는 코어가 저장하는 모양(serializeScene 과 같은 키 순서)으로 오브젝트 둘을 더 넣는다:
//      스프라이트(플래피의 새 그림)와 컴포넌트가 붙은 노드. 컴포넌트는 에디터의 컴포넌트 템플릿과 같은 꼴이고 init 에서
//      "hello:init" 을 찍는다. 그래서 스크립트 붙이기 계약(논리 이름, Ruby 는 CamelCase 클래스)까지 검사된다
//   3. <엔진>/build/Initial2D 를 헤드리스로 띄운다 (SDL_VIDEODRIVER=dummy, INITIAL2D_SCENE=<시작 씬>, INITIAL2D_EXIT_AFTER,
//      INITIAL2D_SCREENSHOT 으로 프레임 하나를 덤프). 종료 코드 0, 오류 줄 없음, 스크린샷 존재, 기대한 stdout 줄을 본다
//   4. 플래피는 INITIAL2D_AUTOPLAY=1 로 자동 시연을 돌려 상태 전이(ready → play → dead → ready)와 900틱 종료 요약을 본다
//      (엔진 저장소의 test_scene_flappy_* 와 같은 검사)
// 엔진 실행 파일이 없으면 건너뛰고 0 으로 끝난다. mruby 가 없는 빌드면 Ruby 판만 건너뛴다.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const templatesDir = path.join(repo, "packages", "app", "templates");
const manifest = JSON.parse(fs.readFileSync(path.join(templatesDir, "MANIFEST.json"), "utf8"));
const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? path.join(repo, "..", "Initial2D"));
const exe = path.join(engineDir, "build", process.platform === "win32" ? "Initial2D.exe" : "Initial2D");
const KEEP = process.env.KEEP_WORKDIR === "1";

const START_SCENE = { empty: "main", flappy: "flappy" };
const PROJECT_DIRS = ["resources/images", "resources/audio", "resources/fonts", "resources/scenes", "resources/maps"];

function skip(reason) {
  console.log(`SKIP: ${reason}`);
  process.exit(0);
}

if (!fs.existsSync(exe)) skip(`엔진 실행 파일이 없다: ${exe} (INITIAL2D_DIR 로 저장소 위치를 주거나 cmake 로 빌드한다)`);

const probe = spawnSync(exe, ["--features"], { encoding: "utf8", timeout: 30_000 });
const features = new Set((probe.stdout ?? "").split(/\s+/).filter(Boolean));
if (probe.status !== 0 || !features.has("lua")) skip(`엔진이 --features 에 답하지 않는다: ${(probe.stderr ?? "").trim() || probe.status}`);
const hasMruby = features.has("mruby");
console.log(`엔진: ${exe} (기능: ${[...features].join(" ")})`);

// ---- 프로젝트 쓰기 (scene/projectTemplates.ts 와 같은 규칙) ----

function plan(template, language) {
  return manifest.files.filter((f) => (f.groups.includes("common") || f.groups.includes(template)) && (f.language === null || f.language === language));
}

function writeProject(dir, template, language) {
  const script = language === "ruby" ? "mruby" : "lua";
  const game = { name: `e2e-${template}-${language}`, windowWidth: 768, windowHeight: 896, renderScale: 1, script, startScene: START_SCENE[template] };
  fs.writeFileSync(path.join(dir, "game.json"), JSON.stringify(game, null, 2) + "\n");
  const written = ["game.json"];
  for (const f of plan(template, language)) {
    const to = path.join(dir, f.to);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(templatesDir, f.path), to);
    written.push(f.to);
  }
  fs.writeFileSync(path.join(dir, ".gitignore"), ".initial-editor/\n");
  for (const d of PROJECT_DIRS) fs.mkdirSync(path.join(dir, d), { recursive: true });
  return written;
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

/** 에디터의 컴포넌트 템플릿(scripting/templates.ts)과 같은 꼴에 print 하나를 더한 것 */
function componentSource(language, klass, marker) {
  if (language === "lua") {
    return `-- ${klass} 컴포넌트. 씬이 오브젝트(obj)에 붙여 계약 함수를 부른다.

local ${klass} = {}

function ${klass}.init(obj, scene)
  print("${marker}")
end

function ${klass}.update(obj, scene, elapsed)
end

function ${klass}.render(obj, scene)
end

function ${klass}.destroy(obj, scene)
end

return ${klass}
`;
  }
  return `# ${klass} 컴포넌트. 씬이 오브젝트(obj)에 붙여 계약 메서드를 부른다.

class ${klass}
  def init(obj, scene)
    puts "${marker}"
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
  fs.writeFileSync(scenePath, serializeScene(scene));
  const componentPath = language === "lua" ? "scripts/lua/components/hello.lua" : "scripts/ruby/components/hello.rb";
  fs.mkdirSync(path.dirname(path.join(dir, componentPath)), { recursive: true });
  fs.writeFileSync(path.join(dir, componentPath), componentSource(language, "Hello", "hello:init"));
  return componentPath;
}

// ---- 엔진 실행 ----

function runEngine(dir, { scene, script, exitAfter, shotFrame, extraEnv }) {
  const env = {
    ...process.env,
    SDL_VIDEODRIVER: "dummy",
    SDL_AUDIODRIVER: "dummy",
    INITIAL2D_SCRIPT: script,
    INITIAL2D_SCENE: scene,
    INITIAL2D_EXIT_AFTER: String(exitAfter),
    INITIAL2D_SCREENSHOT: path.join(dir, "shot_%04ld.bmp"),
    INITIAL2D_SCREENSHOT_FRAME: String(shotFrame),
    ...extraEnv,
  };
  delete env.INITIAL2D_HMR;
  const result = spawnSync(exe, [], { cwd: dir, env, encoding: "utf8", timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
  const log = (result.stdout ?? "") + (result.stderr ?? "");
  const shot = path.join(dir, `shot_${String(shotFrame).padStart(4, "0")}.bmp`);
  return { result, log, shot };
}

/** 엔진 테스트 러너와 같은 기준: iCCP 경고를 뺀 뒤 error 가 없어야 한다 */
function errorLines(log) {
  return log
    .split("\n")
    .filter((l) => !/iccp/i.test(l))
    .filter((l) => /error|panic|uncaught exception|scene: /i.test(l));
}

const failures = [];
let passes = 0;
function check(name, cond, detail = "") {
  if (cond) {
    passes += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}  ${detail}`);
  }
}

function tail(log, n = 400) {
  return log.slice(-n).replace(/\n/g, " | ");
}

function caseDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `initial-editor-scene-${name}-`));
}

function cleanup(dir) {
  if (KEEP) console.log(`  작업 폴더를 남겼다: ${dir}`);
  else fs.rmSync(dir, { recursive: true, force: true });
}

for (const language of ["lua", "ruby"]) {
  const script = language === "ruby" ? "mruby" : "lua";
  if (language === "ruby" && !hasMruby) {
    console.log(`\n[empty/${language}] SKIP: 이 엔진 빌드에는 mruby 가 없다`);
    console.log(`[flappy/${language}] SKIP: 이 엔진 빌드에는 mruby 가 없다`);
    continue;
  }

  // 빈 프로젝트 + 에디터가 더한 오브젝트 둘
  {
    const dir = caseDir(`empty-${language}`);
    console.log(`\n[empty/${language}] ${dir}`);
    const written = writeProject(dir, "empty", language);
    const component = addEditorObjects(dir, language);
    console.log(`  프로젝트 파일 ${written.length}개 + ${component} + 씬에 오브젝트 둘`);
    const { result, log, shot } = runEngine(dir, { scene: "main", script, exitAfter: 120, shotFrame: 30 });
    check("프로세스 정상 종료 (코드 0)", result.status === 0, `status=${result.status} signal=${result.signal} | ${tail(log)}`);
    check("스크립트 오류 없음", errorLines(log).length === 0, errorLines(log).join(" | "));
    check("컴포넌트 init 이 불렸다 (hello:init)", log.includes("hello:init"), tail(log));
    check("프레임 30 스크린샷", fs.existsSync(shot) && fs.statSync(shot).size > 1000, shot);
    if (result.status !== 0 || errorLines(log).length) console.log("  --- 엔진 출력 ---\n" + log.trim().split("\n").map((l) => "  " + l).join("\n"));
    cleanup(dir);
  }

  // 플래피버드 자동 시연
  {
    const dir = caseDir(`flappy-${language}`);
    console.log(`\n[flappy/${language}] ${dir}`);
    const written = writeProject(dir, "flappy", language);
    console.log(`  프로젝트 파일 ${written.length}개 (INITIAL2D_AUTOPLAY=1, 900틱 뒤 스스로 끝난다)`);
    const { result, log, shot } = runEngine(dir, { scene: "flappy", script, exitAfter: 60000, shotFrame: 150, extraEnv: { INITIAL2D_AUTOPLAY: "1" } });
    check("프로세스 정상 종료 (코드 0)", result.status === 0, `status=${result.status} signal=${result.signal} | ${tail(log)}`);
    check("스크립트 오류 없음", errorLines(log).length === 0, errorLines(log).join(" | "));
    check("대기에서 시작한다 (flappy:state:ready)", log.includes("flappy:state:ready"), tail(log));
    check("자동 시연이 플레이로 들어간다 (flappy:state:play)", log.includes("flappy:state:play"), tail(log));
    check("부딪히면 게임 오버 (flappy:state:dead)", log.includes("flappy:state:dead"), tail(log));
    const m = /flappyFinal state=(\w+) score=(\d+) best=(\d+) ticks=(\d+)/.exec(log);
    check("최종 요약 (씬이 스스로 끝냈다)", m !== null, tail(log));
    if (m) {
      check("파이프를 하나 이상 지난다 (best >= 1)", Number(m[3]) >= 1, m[0]);
      check("900틱에 끝낸다", Number(m[4]) === 900, m[0]);
    }
    check("프레임 150 스크린샷", fs.existsSync(shot) && fs.statSync(shot).size > 1000, shot);
    if (result.status !== 0 || errorLines(log).length) console.log("  --- 엔진 출력 ---\n" + log.trim().split("\n").map((l) => "  " + l).join("\n"));
    cleanup(dir);
  }
}

console.log(`\n결과: ${passes} PASS / ${failures.length} FAIL`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
