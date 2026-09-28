// 진짜 엔진 교차 검사의 공용 부분. scripts/e2e-engine-scene.mjs 와 scripts/e2e-engine-map.mjs 가 같이 쓴다.
// 엔진 찾기와 --features, 에디터의 TypeScript 모듈 읽기(Vite SSR), 프로젝트 폴더 하나를 보는 ProjectBackend,
// 헤드리스 실행(SDL_VIDEODRIVER=dummy, SDL_AUDIODRIVER=dummy, INITIAL2D_EXIT_AFTER), PASS 와 FAIL 세기.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "vite";

export function skip(reason) {
  console.log(`SKIP: ${reason}`);
  process.exit(0);
}

export function die(reason) {
  console.error(`FAIL: ${reason}`);
  process.exit(1);
}

/** 엔진 저장소(INITIAL2D_DIR, 기본 <repo>/../Initial2D)와 실행 파일(INITIAL2D_EXE, 기본 저장소의 build/Initial2D) */
export function engineTarget(repo) {
  const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? path.join(repo, "..", "Initial2D"));
  const explicitExe = process.env.INITIAL2D_EXE ? path.resolve(process.env.INITIAL2D_EXE) : null;
  const exe = explicitExe ?? path.join(engineDir, "build", process.platform === "win32" ? "Initial2D.exe" : "Initial2D");
  return { engineDir, explicitExe, exe };
}

/** 임시 폴더 하나 (os.tmpdir() 아래 <prefix>-<name>-XXXXXX) */
export function caseDir(prefix, name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-${name}-`));
}

/**
 * 실행 파일이 있고 --features 가 lua 를 답하는지 본다. 기능 집합을 돌려준다.
 * 실행 파일이 없거나 답이 틀리면 SKIP 으로 끝낸다. INITIAL2D_EXE 로 직접 준 파일이면 FAIL 이다.
 * --features 는 버리는 작업 폴더에서 부른다 (인자를 모르는 옛 엔진이 게임을 띄워도 저장소에 config.setting 을 쓰지 않게)
 */
export function requireEngine({ exe, explicitExe }, prefix) {
  if (!fs.existsSync(exe)) {
    if (explicitExe) die(`INITIAL2D_EXE 의 파일이 없다: ${exe}`);
    skip(`엔진 실행 파일 없음: ${exe} (INITIAL2D_DIR로 저장소 위치 지정 또는 cmake로 빌드, INITIAL2D_EXE로 직접 지정 가능)`);
  }
  const probeDir = caseDir(prefix, "probe");
  const probe = spawnSync(exe, ["--features"], {
    cwd: probeDir,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, SDL_VIDEODRIVER: "dummy", SDL_AUDIODRIVER: "dummy", INITIAL2D_EXIT_AFTER: "1" },
  });
  fs.rmSync(probeDir, { recursive: true, force: true });
  const features = new Set((probe.stdout ?? "").split(/\s+/).filter(Boolean));
  if (probe.status !== 0 || !features.has("lua")) {
    const why = `엔진 --features 확인 실패 (lua 없음 또는 오류): ${(probe.stderr ?? "").trim() || probe.status}`;
    if (explicitExe) die(why);
    skip(why);
  }
  return features;
}

/** 에디터의 TypeScript 모듈을 Vite 의 SSR 로 읽는다. paths 는 저장소 루트 기준 "/packages/..." 이고, 같은 순서의 모듈 배열을 돌려준다 */
export async function loadEditorModules(repo, paths) {
  const vite = await createServer({
    configFile: false,
    root: repo,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { dedupe: ["mobx"] },
  });
  const out = [];
  try {
    for (const p of paths) out.push(await vite.ssrLoadModule(p));
  } finally {
    await vite.close();
  }
  return out;
}

/** 프로젝트 폴더 하나를 보는 ProjectBackend (새 프로젝트 쓰기, 새 맵, 맵 문서와 씬 문서가 부르는 것만) */
export function fsBackend(root) {
  const abs = (rel) => {
    const p = path.resolve(root, rel);
    if (p !== root && !p.startsWith(root + path.sep)) throw new Error(`루트 밖의 경로다: ${rel}`);
    return p;
  };
  const write = (rel, data) => {
    fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
    fs.writeFileSync(abs(rel), data);
  };
  return {
    exists: async (rel) => fs.existsSync(abs(rel)),
    readText: async (rel) => fs.readFileSync(abs(rel), "utf8"),
    readBinary: async (rel) => new Uint8Array(fs.readFileSync(abs(rel))),
    writeText: async (rel, text) => write(rel, text),
    writeBinary: async (rel, data) => write(rel, data),
    mkdir: async (rel) => void fs.mkdirSync(abs(rel), { recursive: true }),
    list: async (rel) =>
      fs.readdirSync(abs(rel), { withFileTypes: true }).map((d) => ({
        name: d.name,
        path: rel ? `${rel}/${d.name}` : d.name,
        kind: d.isDirectory() ? "dir" : "file",
      })),
  };
}

/**
 * 엔진을 헤드리스로 한 번 돌린다. scene 이 null 이면 진입 파일이 game.json 의 startScene 을 연다.
 * shotFrame 을 주면 그 프레임을 <dir>/shot_NNNN.bmp 로 찍는다. 돌려주는 것: { result, log, shot }
 */
export function runEngine(exe, dir, { scene = null, script, exitAfter, shotFrame = null, extraEnv = {}, timeout = 180_000 }) {
  const env = {
    ...process.env,
    SDL_VIDEODRIVER: "dummy",
    SDL_AUDIODRIVER: "dummy",
    INITIAL2D_EXIT_AFTER: String(exitAfter),
    ...extraEnv,
  };
  delete env.INITIAL2D_HMR;
  if (script) env.INITIAL2D_SCRIPT = script;
  if (shotFrame !== null) {
    env.INITIAL2D_SCREENSHOT = path.join(dir, "shot_%04ld.bmp");
    env.INITIAL2D_SCREENSHOT_FRAME = String(shotFrame);
  }
  if (scene) env.INITIAL2D_SCENE = scene;
  else delete env.INITIAL2D_SCENE;
  const result = spawnSync(exe, [], { cwd: dir, env, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
  const log = (result.stdout ?? "") + (result.stderr ?? "");
  const shot = shotFrame === null ? null : path.join(dir, `shot_${String(shotFrame).padStart(4, "0")}.bmp`);
  return { result, log, shot };
}

/** 찍은 스크린샷이 있고 비어 있지 않은가 */
export function hasShot(shot) {
  return !!shot && fs.existsSync(shot) && fs.statSync(shot).size > 1000;
}

export function tail(log, n = 400) {
  return String(log).slice(-n).replace(/\n/g, " | ");
}

/**
 * PASS 와 FAIL 을 세고 찍는다. check 는 실패할 때만 detail 을 찍고, measure 는 통과해도 찍는다 (잰 값을 남기는 검사).
 * finish() 가 요약을 찍고 실패가 있으면 1 로 끝낸다
 */
export function checkList() {
  const failures = [];
  let passes = 0;
  const record = (name, cond, detail, always) => {
    if (cond) {
      passes += 1;
      console.log(always && detail !== "" ? `  PASS  ${name}  ${detail}` : `  PASS  ${name}`);
    } else {
      failures.push(name);
      console.log(`  FAIL  ${name}  ${detail}`);
    }
    return !!cond;
  };
  return {
    check: (name, cond, detail = "") => record(name, cond, detail, false),
    measure: (name, cond, detail = "") => record(name, cond, detail, true),
    get passes() {
      return passes;
    },
    get failures() {
      return failures;
    },
    finish() {
      console.log(`\n결과: ${passes} PASS / ${failures.length} FAIL`);
      if (failures.length) {
        for (const f of failures) console.log(`  - ${f}`);
        process.exit(1);
      }
    },
  };
}
