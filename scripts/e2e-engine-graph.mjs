#!/usr/bin/env node
// 비주얼 스크립팅의 진짜 엔진 교차 검사 (docs/plans/visual-scripting.md 6절). 그래프에서 만든 Lua 와 Ruby 가 엔진에서 같게 돈다.
//
//   yarn test:engine-graph                                   엔진은 <INITIAL2D_DIR>/build/Initial2D (기본 ../Initial2D)
//   INITIAL2D_EXE=/path/to/Initial2D yarn test:engine-graph  엔진 실행 파일을 직접 준다
//   KEEP_WORKDIR=1 yarn test:engine-graph                    임시 프로젝트를 남긴다
//
// 새 프로젝트는 앱과 같은 함수(writeProjectTemplate)로 쓰고, 그래프는 코어의 compileGraph 로 만든다. 하는 일 (언어마다):
//   1. 플래피: bird 를 그래프(packages/core/src/graph/fixtures/flappy)에서 만든 코드로 바꿔 자동 시연을 돌린다. 템플릿의 손으로 쓴
//      bird 로 돌린 판과 flappy: 줄(상태 전이, 점수)과 요약 줄이 같아야 한다 (자동 시연은 씨앗이 고정이라 같은 판이다)
//   2. 샘플러: 빈 프로젝트에 노드 종류를 두루 쓰는 그래프(fixtures/sampler)의 컴포넌트를 붙여 돌리고 찍힌 줄을 기대값과 견준다.
//      Lua 와 Ruby 의 줄이 같아야 한다
// 엔진은 헤드리스다. 실행 파일이 없으면 건너뛰고 0 으로 끝난다. mruby 가 없는 빌드면 Ruby 판만 건너뛴다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { errorLines, flappyChecks } from "./lib/flappyChecks.mjs";
import { caseDir as tempDir, checkList, engineTarget, fsBackend, loadEditorModules, requireEngine, runEngine, tail } from "./lib/engineRun.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const templatesDir = path.join(repo, "packages", "app", "templates");
const fixtures = path.join(repo, "packages", "core", "src", "graph", "fixtures");
const target = engineTarget(repo);
const KEEP = process.env.KEEP_WORKDIR === "1";

const features = requireEngine(target, "initial-editor-graph");
console.log(`엔진: ${target.exe} (기능: ${[...features].join(" ")})`);

const editor = Object.assign({}, ...(await loadEditorModules(repo, ["/packages/app/src/editor/scene/projectTemplates.ts", "/packages/core/src/index.ts"])));

const fsSource = {
  text: (rel) => fs.readFileSync(path.join(templatesDir, rel), "utf8"),
  binary: async (rel) => new Uint8Array(fs.readFileSync(path.join(templatesDir, rel))),
};

const { check, finish } = checkList();

async function writeProject(dir, template, language) {
  return editor.writeProjectTemplate(fsBackend(dir), { template, language: language === "ruby" ? "mruby" : "lua", name: `graph-${template}-${language}` }, fsSource);
}

function put(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
}

/** 그래프(와 라이브러리)를 프로젝트에 두고 앱의 저장과 같은 compileGraph 로 만들어 쓴다 */
async function generate(dir, graphPath, files) {
  for (const [rel, src] of Object.entries(files)) put(dir, rel, fs.readFileSync(src, "utf8"));
  const read = async (rel) => (fs.existsSync(path.join(dir, rel)) ? fs.readFileSync(path.join(dir, rel), "utf8") : null);
  const result = await editor.compileGraph(graphPath, await read(graphPath), read);
  const errors = result.problems.filter((p) => p.severity === "error");
  check(`${graphPath} 검사에 오류가 없다`, errors.length === 0 && result.generated !== null, errors.map((p) => `${p.node ?? ""} ${p.message}`).join(" | "));
  if (!result.generated) return null;
  for (const f of [result.generated.lua, result.generated.ruby, result.generated.declaration]) if (f) put(dir, f.path, f.text);
  return result.generated;
}

function cleanup(dir) {
  if (KEEP) console.log(`  작업 폴더 유지: ${dir}`);
  else fs.rmSync(dir, { recursive: true, force: true });
}

function dump(result, log) {
  if (result.status !== 0 || errorLines(log).length) console.log("  --- 엔진 출력 ---\n" + log.trim().split("\n").map((l) => "  " + l).join("\n"));
}

const flappyLines = (log) => log.split("\n").filter((l) => l.startsWith("flappy:") || l.startsWith("flappyFinal"));

/** 샘플러가 찍는 줄 (씬의 count 는 3). Lua 와 Ruby 가 같다 */
const SAMPLER_LINES = [
  "label=샘플",
  "count=3",
  "mode b",
  "acc=3",
  "half=3.5",
  "div=1.5",
  "div2=1.5",
  "mod=2",
  "floor=-3",
  "abs=4",
  "clamp=10",
  "minmax=1.57",
  "sqrt=4.0",
  "trig=1.0",
  "and=true",
  "or=false",
  "cmp=truefalsetrue",
  "x=12.5",
  "hp+1=6",
  "other=other",
  "otherY=40.0",
  "id sampler",
  "width>0=true",
  "input=false",
  "phase=start",
  "start?=true",
  "rnd=4",
  "rnd01<1=true",
  'quote" hash# brace#{x} back\\slash',
  "tick one",
  "phase run",
  "tick two",
  "phase run",
  "tick three elapsed>0=true",
  "phase done",
];

const SAMPLER_SCENE = {
  version: 1,
  name: "main",
  objects: [
    { id: "sampler", type: "node", x: 0, y: 0, props: {}, scripts: ["components/graphtest/sampler"], params: { "components/graphtest/sampler": { count: 3 } } },
    { id: "other", type: "node", x: 0, y: 0, props: {}, scripts: [] },
  ],
};

const samplerOut = {};

for (const language of ["lua", "ruby"]) {
  const script = language === "ruby" ? "mruby" : "lua";
  if (language === "ruby" && !features.has("mruby")) {
    console.log(`\n[${language}] SKIP: 이 엔진 빌드에 mruby 없음`);
    continue;
  }

  // 1. 플래피: 손으로 쓴 bird 와 그래프의 bird
  {
    const dir = tempDir("initial-editor-graph", `flappy-${language}`);
    console.log(`\n[flappy/${language}] ${dir}`);
    await writeProject(dir, "flappy", language);
    const hand = runEngine(target.exe, dir, { scene: "flappy", script, exitAfter: 60000, extraEnv: { INITIAL2D_AUTOPLAY: "1" } });
    check("손으로 쓴 bird 의 자동 시연이 끝난다", hand.result.status === 0 && flappyLines(hand.log).some((l) => l.startsWith("flappyFinal")), tail(hand.log));
    const generated = await generate(dir, "scripts/components/flappy/bird.graph.json", {
      "scripts/components/flappy/bird.graph.json": path.join(fixtures, "flappy", "bird.graph.json"),
      "scripts/components/flappy/common.nodes.json": path.join(fixtures, "flappy", "common.nodes.json"),
    });
    if (generated) {
      const file = language === "lua" ? generated.lua : generated.ruby;
      check(`생성한 bird 가 템플릿의 bird 를 바꾼다 (${file.path})`, fs.readFileSync(path.join(dir, file.path), "utf8").startsWith(language === "lua" ? "-- 그래프에서 만든 파일" : "# 그래프에서 만든 파일"));
      const run = runEngine(target.exe, dir, { scene: "flappy", script, exitAfter: 60000, extraEnv: { INITIAL2D_AUTOPLAY: "1" } });
      for (const c of flappyChecks(run.log, run.result.status)) check(`그래프의 bird: ${c.name}`, c.ok, c.detail);
      const a = flappyLines(hand.log);
      const b = flappyLines(run.log);
      check(`손으로 쓴 bird 와 같은 판이다 (flappy: 줄 ${b.length}개와 요약)`, a.length > 3 && JSON.stringify(a) === JSON.stringify(b), `손 ${a.length}줄 ${a.at(-1)} | 그래프 ${b.length}줄 ${b.at(-1)}`);
      dump(run.result, run.log);
    }
    cleanup(dir);
  }

  // 2. 샘플러
  {
    const dir = tempDir("initial-editor-graph", `sampler-${language}`);
    console.log(`\n[sampler/${language}] ${dir}`);
    await writeProject(dir, "empty", language);
    const generated = await generate(dir, "scripts/components/graphtest/sampler.graph.json", {
      "scripts/components/graphtest/sampler.graph.json": path.join(fixtures, "sampler", "sampler.graph.json"),
    });
    check("매개변수 선언 파일을 만든다", generated?.declaration?.path === "scripts/components/graphtest/sampler.json" && fs.existsSync(path.join(dir, "scripts/components/graphtest/sampler.json")));
    put(dir, "resources/scenes/main.json", JSON.stringify(SAMPLER_SCENE, null, 2) + "\n");
    const run = runEngine(target.exe, dir, { scene: "main", script, exitAfter: 100000 });
    check("정상 종료 (그래프의 게임 종료 노드)", run.result.status === 0, `status ${run.result.status} ${tail(run.log)}`);
    check("오류 줄이 없다", errorLines(run.log).length === 0, errorLines(run.log).slice(0, 3).join(" | "));
    const lines = run.log.split("\n").filter((l) => l !== "" && !/^\[|^Initial2D|^SDL|^INFO|^엔진/.test(l));
    const got = lines.filter((l) => SAMPLER_LINES.includes(l) || /^(label|count|mode|acc|half|div|mod|floor|abs|clamp|minmax|sqrt|trig|and|or|cmp|x|hp|other|id|width|input|phase|start|rnd|quote|tick)/.test(l));
    samplerOut[language] = got;
    check(`찍은 줄이 기대값과 같다 (${SAMPLER_LINES.length}줄)`, JSON.stringify(got) === JSON.stringify(SAMPLER_LINES), got.map((l, k) => (l === SAMPLER_LINES[k] ? "" : `${k}: ${l} != ${SAMPLER_LINES[k]}`)).filter(Boolean).slice(0, 5).join(" | ") || `${got.length}줄`);
    dump(run.result, run.log);
    cleanup(dir);
  }
}

if (samplerOut.lua && samplerOut.ruby) {
  console.log("\n[lua/ruby]");
  check("샘플러의 Lua 와 Ruby 가 같은 줄을 찍는다", JSON.stringify(samplerOut.lua) === JSON.stringify(samplerOut.ruby));
}

finish();
