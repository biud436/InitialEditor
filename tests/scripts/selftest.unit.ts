// 자가 검사 스크립트: scripts/selftest-plan.mjs (계획), scripts/selftest-check.mjs (판정), scripts/selftest-app.mjs (띄우기).
// 판정은 가짜 작업 폴더(보고서, 실행별 로그, BMP)로 본다. 계획은 앱의 parsePlan 이 받는지까지 본다.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeBmp32 } from "../../packages/app/src/editor/selftest/bmp";
import { parsePlan } from "../../packages/app/src/editor/selftest/plan";
import { eventPlayPlan } from "../../packages/ext-rpg/src/model/play";
import { readBmp } from "../e2e/support/bmp";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const load = async <T>(rel: string) => (await import(pathToFileURL(path.join(REPO, rel)).href)) as T;

interface Plan {
  version: 1;
  workDir: string;
  report: string;
  totalTimeoutMs: number;
  showWindow: boolean;
  projects: Array<{ id: string; template?: string; root?: string; language?: string; edit?: { kind?: string; map?: string; layer?: number; x: number; y: number; gid: number }; runs: Array<Record<string, unknown> & { mode: string; check: string; optional?: boolean; env?: Record<string, string>; timeoutMs: number }> }>;
}

const planMod = await load<{
  buildPlan(o: { os: string; workDir: string; embedded?: boolean; forestRoot?: string | null; rpgRoot?: string | null; totalTimeoutMs?: number | null }): Plan;
  prepareForest(engineDir: string, dest: string, required?: string): number;
  writePlan(args: Record<string, unknown>): Plan;
  RPG_MAP: string;
  RPG_EVENT: string;
  main(argv: string[], deps?: Record<string, unknown>): number;
  FOREST_PLACEMENT: string;
  FOREST_COPY: string[];
  FOREST_EDIT: { kind: string; map: string; layer: number; x: number; y: number; gid: number };
}>("scripts/selftest-plan.mjs");
type Judged = { failures: string[]; warnings: string[]; lines: string[] };
const checkMod = await load<{ judge(plan: Plan, report: unknown, deps: { readBmp: typeof readBmp; eventPlayPlan?: typeof eventPlayPlan }): Judged; main(argv: string[], deps?: Record<string, unknown>): Promise<number> }>("scripts/selftest-check.mjs");
const appMod = await load<{ resolveApp(target: string): string; parseArgs(argv: string[]): Record<string, unknown>; main(argv: string[], deps?: Record<string, unknown>): Promise<number> }>("scripts/selftest-app.mjs");
type Rect = { x: number; y: number; width: number; height: number };
const frame = await load<{
  followCamera(x: number, w: number, h: number, mapW: number): Rect;
  placementX(log: string, re: string): number | null;
  compareMapFrame(a: unknown, b: unknown): { ratio: number; opaque: number };
  renderMapRect(map: unknown, images: Map<string, { width: number; height: number; rgba: Uint8Array }>, rect: Rect, opts?: { skipLayer?: number; cell?: { layer: number; x: number; y: number; gid: number } }): unknown;
}>("scripts/lib/frameChecks.mjs");
const pngMod = await load<{ encodePng(width: number, height: number, rgba: Uint8Array): Buffer }>("scripts/lib/png.mjs");

let tmp = "";
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "selftest-scripts-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(file: string, data: string | Uint8Array) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

describe("자가 검사 계획 (selftest-plan.mjs)", () => {
  it("mac 과 linux: 플래피 둘과 타일맵을 앱에 든 엔진으로, 에디터 안 실행은 선택. 창을 보인다. 앱의 parsePlan 이 받는다", () => {
    for (const osName of ["mac", "linux"]) {
      const plan = planMod.buildPlan({ os: osName, workDir: path.join(tmp, "run") });
      expect(plan.showWindow).toBe(true);
      expect(plan.projects.map((p) => p.id)).toEqual(["flappy-lua", "flappy-ruby", "tilemap"]);
      expect(plan.projects[0].runs.map((r) => [r.mode, r.optional ?? false])).toEqual([["process", false], ["embedded", true]]);
      for (const p of plan.projects) {
        for (const r of p.runs) if (r.mode === "process") expect(r).toMatchObject({ expectEngineSource: "bundled", env: { SDL_VIDEODRIVER: "dummy", SDL_AUDIODRIVER: "dummy" } });
      }
      expect(plan.projects[1].language).toBe("mruby");
      expect(plan.projects[2].edit).toEqual({ kind: "paintTile", map: "resources/maps/start.json", layer: 0, x: 24, y: 28, gid: 45 });
      expect(plan.projects[2].runs[0].env?.INITIAL2D_SCREENSHOT).toBe(path.join(tmp, "run", "logs", "tilemap-1.bmp"));
      expect(plan.report).toBe(path.join(tmp, "run", "report.json"));
      const parsed = parsePlan(JSON.parse(JSON.stringify(plan)));
      expect(parsed.projects).toHaveLength(3);
      // 셸(selftest.rs)이 받는 id 모양
      for (const p of plan.projects) expect(p.id).toMatch(/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/);
    }
  });

  it("windows: 플래피 Lua 하나를 프로세스 방식으로 시작해 에디터 안으로 넘어가는 것이 필수다", () => {
    const plan = planMod.buildPlan({ os: "windows", workDir: path.join(tmp, "run") });
    expect(plan.showWindow).toBe(true);
    expect(plan.projects).toEqual([
      { id: "flappy-lua", template: "flappy", language: "lua", runs: [{ mode: "process", expectEngineSource: "none", expectFallback: "embedded", check: "flappy", env: { INITIAL2D_AUTOPLAY: "1" }, timeoutMs: 150000 }] },
    ]);
    expect(parsePlan(plan).projects[0].runs[0].expectFallback).toBe("embedded");
  });

  it("local 은 프로세스 실행만이고 창을 숨긴다. --embedded 면 에디터 안 실행을 더하고 창을 보인다", () => {
    const hidden = planMod.buildPlan({ os: "local", workDir: path.join(tmp, "run") });
    expect(hidden.showWindow).toBe(false);
    expect(hidden.projects.flatMap((p) => p.runs.map((r) => r.mode))).toEqual(["process", "process", "process"]);
    const shown = planMod.buildPlan({ os: "local", workDir: path.join(tmp, "run"), embedded: true });
    expect(shown.showWindow).toBe(true);
    expect(shown.projects[0].runs.map((r) => r.mode)).toEqual(["process", "embedded"]);
    // 전체 시간은 실행 시간의 합과 프로젝트마다 1분
    expect(hidden.totalTimeoutMs).toBe(90000 + 90000 + 60000 + 3 * 60000);
  });

  it("숲: 게임에 필요한 것만 복사하고(RTP 와 점 파일은 빼고) 맵 뷰와 게임 화면을 견주는 실행을 더한다", () => {
    const engine = path.join(tmp, "engine");
    write(path.join(engine, "resources/maps/aldebaran_forest.json"), "{}");
    write(path.join(engine, "resources/aldebaran/forest16.png"), "png");
    write(path.join(engine, "resources/rtp/big.png"), "rtp");
    write(path.join(engine, "resources/RTP.zip"), "zip");
    write(path.join(engine, "scripts/lua/main.lua"), "--");
    write(path.join(engine, "scripts/lua/.DS_Store"), "x");
    write(path.join(engine, "build/Initial2D"), "exe");
    const dest = path.join(tmp, "run-forest");
    expect(planMod.prepareForest(engine, dest)).toBe(4);
    expect(fs.existsSync(path.join(dest, "resources/aldebaran/forest16.png"))).toBe(true);
    expect(fs.existsSync(path.join(dest, "resources/rtp"))).toBe(false);
    expect(fs.existsSync(path.join(dest, "resources/RTP.zip"))).toBe(false);
    expect(fs.existsSync(path.join(dest, "build"))).toBe(false);
    expect(fs.existsSync(path.join(dest, "scripts/lua/.DS_Store"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dest, "game.json"), "utf8"))).toMatchObject({ windowWidth: 768, windowHeight: 896, script: "lua" });
    expect(() => planMod.prepareForest(engine, dest)).toThrow(/이미 있다/);
    const plan = planMod.buildPlan({ os: "local", workDir: path.join(tmp, "run"), forestRoot: dest });
    const forest = plan.projects[3];
    expect(forest).toMatchObject({ id: "forest", root: dest, openMap: "resources/maps/aldebaran_forest.json" });
    expect(forest.runs[0]).toMatchObject({ check: "mapFrame", expectEngineSource: "bundled", mapCapture: { width: 384, height: 448 } });
    expect(forest.runs[0].env).toMatchObject({ INITIAL2D_SCENE: "aldebaran", INITIAL2D_ALDEBARAN_STAGE: "aldebaran_forest", INITIAL2D_NO_RTP: "1", INITIAL2D_ALDEBARAN_TRACE: "1" });
    expect(parsePlan(plan).projects[3].runs[0].mapCapture?.placement).toBe(planMod.FOREST_PLACEMENT);
  });

  it("workDir 이 이미 있으면 만들지 않는다 (셸이 새로 만든다). 인자 오류는 2", () => {
    const errors: string[] = [];
    const quiet = { log: () => {}, error: (s: string) => errors.push(s) };
    fs.mkdirSync(path.join(tmp, "run"));
    expect(planMod.main(["--os", "local", "--work", path.join(tmp, "run"), "--out", path.join(tmp, "plan.json")], quiet)).toBe(2);
    expect(errors[0]).toMatch(/이미 있다/);
    expect(planMod.main(["--os", "amiga", "--work", path.join(tmp, "x"), "--out", path.join(tmp, "p.json")], quiet)).toBe(2);
    expect(planMod.main(["--work", path.join(tmp, "x")], quiet)).toBe(2);
    expect(planMod.main(["--os", "local", "--work", path.join(tmp, "new"), "--out", path.join(tmp, "p.json")], quiet)).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(tmp, "p.json"), "utf8")).workDir).toBe(path.join(tmp, "new"));
    expect(fs.existsSync(path.join(tmp, "new"))).toBe(false);
  });
});

// ---- 판정 ----

function flappyLog(extra: string[] = []) {
  const lines = ["flappy:state:ready", "flappy:state:play"];
  for (let i = 0; i < 80; i++) lines.push(`frame ${i}`);
  lines.push("flappy:state:dead", "flappyFinal state=dead score=3 best=3 ticks=900", ...extra);
  return lines.join("\n") + "\n";
}

function runReport(over: Record<string, unknown> = {}) {
  return { mode: "process", optional: false, ok: true, exitCode: 0, fallback: null, engine: { source: "bundled", path: "/a/Initial2D", features: ["lua"], meta: null }, tail: ["frame 79"], ...over };
}

function projectReport(id: string, runs: unknown[], over: Record<string, unknown> = {}) {
  return { id, files: 20, entryScript: { path: "scripts/lua/main.lua", opened: true }, problems: [], runs, ...over };
}

function setup(plan: Plan, report: unknown, logs: Record<string, string | Uint8Array>) {
  for (const [name, data] of Object.entries(logs)) write(path.join(plan.workDir, "logs", name), data);
  if (report !== undefined) write(plan.report, JSON.stringify(report));
}

function localPlan(): Plan {
  return planMod.buildPlan({ os: "local", workDir: path.join(tmp, "run") });
}

/** 칸 하나를 색으로 채운 768x896 화면 */
function tilemapShot(cellRgb: number[], neighborRgb: number[]) {
  const w = 768;
  const h = 896;
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([0x40, 0xb0, 0x80, 255], i * 4);
  const fill = (cx: number, rgb: number[]) => {
    for (let y = 28 * 16; y < 29 * 16; y++) for (let x = cx * 16; x < cx * 16 + 16; x++) px.set([...rgb, 255], (y * w + x) * 4);
  };
  fill(24, cellRgb);
  fill(25, neighborRgb);
  return encodeBmp32(w, h, px);
}

function happy(plan: Plan) {
  const tilemap = plan.projects[2];
  return {
    report: {
      version: 1,
      ok: true,
      cspViolations: [],
      dialogs: [],
      projects: [
        projectReport("flappy-lua", [runReport()]),
        projectReport("flappy-ruby", [runReport()]),
        projectReport("tilemap", [runReport()], { edit: { ...tilemap.edit, saved: "saved", cellAfter: 45 } }),
      ],
    },
    logs: { "flappy-lua-1.log": flappyLog(), "flappy-ruby-1.log": flappyLog(), "tilemap-1.log": "tilemap ok\n", "tilemap-1.bmp": tilemapShot([0xd8, 0xc8, 0x80], [0x40, 0xb0, 0x80]) },
  };
}

function judge(plan: Plan): Judged {
  const report = fs.existsSync(plan.report) ? JSON.parse(fs.readFileSync(plan.report, "utf8")) : null;
  return checkMod.judge(plan, report, { readBmp });
}

describe("자가 검사 판정 (selftest-check.mjs)", () => {
  it("초반 줄이 전체 로그에만 있어도(마지막 40줄에 없어도) 통과한다", () => {
    const plan = localPlan();
    const { report, logs } = happy(plan);
    setup(plan, report, logs);
    const r = judge(plan);
    expect(r.failures).toEqual([]);
    expect(r.lines.join("\n")).toContain("PASS  flappy-lua 실행 1 (process, flappy): ready 상태로 시작 (flappy:state:ready)");
    expect(r.lines.join("\n")).toContain("칠한 칸 (24, 28) 이 표식 색 #d8c880 이다");
  });

  it("보고서가 없으면 실패", () => {
    const plan = localPlan();
    expect(judge(plan).failures).toEqual(["보고서가 없다"]);
  });

  it("셸의 시간 초과 보고서는 실패이고 마지막 단계를 보인다", () => {
    const plan = localPlan();
    setup(plan, { version: 1, ok: false, error: "total_timeout", progress: { project: "tilemap", step: "run" } }, {});
    const r = judge(plan);
    expect(r.failures[0]).toBe("보고서의 오류: total_timeout");
    expect(r.lines[0]).toContain('"project":"tilemap"');
    expect(r.failures).toContain("flappy-lua: 보고서에 없다");
  });

  it("실행 로그 파일이 없으면 실패", () => {
    const plan = localPlan();
    const { report, logs } = happy(plan);
    delete (logs as Record<string, unknown>)["flappy-ruby-1.log"];
    setup(plan, report, logs);
    expect(judge(plan).failures).toEqual(["flappy-ruby 실행 1 (process, flappy): 실행 로그가 있다"]);
  });

  it("앱의 ok 는 믿지 않는다: 로그에 요약이 없으면 보고서가 ok 라도 실패", () => {
    const plan = localPlan();
    const { report, logs } = happy(plan);
    setup(plan, report, { ...logs, "flappy-lua-1.log": "flappy:state:ready\nflappy:state:play\n" });
    const r = judge(plan);
    expect(r.failures).toEqual(expect.arrayContaining(["flappy-lua 실행 1 (process, flappy): 부딪히면 게임 오버 (flappy:state:dead)", "flappy-lua 실행 1 (process, flappy): 최종 요약 (씬 자체 종료)"]));
  });

  it("오류 줄과 0 이 아닌 종료 코드는 실패", () => {
    const plan = localPlan();
    const { report, logs } = happy(plan);
    report.projects[1].runs = [runReport({ exitCode: 1 })];
    setup(plan, report, { ...logs, "flappy-ruby-1.log": flappyLog(["mruby: uncaught exception in update"]) });
    expect(judge(plan).failures).toEqual(["flappy-ruby 실행 1 (process, flappy): 프로세스 정상 종료 (코드 0)", "flappy-ruby 실행 1 (process, flappy): 스크립트 오류 없음"]);
  });

  it("엔진 출처와 넘어감이 계획과 다르면 실패", () => {
    const plan = planMod.buildPlan({ os: "windows", workDir: path.join(tmp, "run") });
    setup(plan, { version: 1, cspViolations: [], dialogs: [], projects: [projectReport("flappy-lua", [runReport({ engine: { source: "none" }, fallback: null })])] }, { "flappy-lua-1.log": flappyLog() });
    expect(judge(plan).failures).toEqual(["flappy-lua 실행 1 (process, flappy): embedded 로 넘어갔다"]);
    setup(plan, { version: 1, cspViolations: [], dialogs: [], projects: [projectReport("flappy-lua", [runReport({ engine: { source: "none" }, fallback: "embedded" })])] }, {});
    expect(judge(plan).failures).toEqual([]);
  });

  it("CSP 위반과 뜬 모달과 앱이 적은 문제는 실패", () => {
    const plan = localPlan();
    const { report, logs } = happy(plan);
    setup(plan, { ...report, cspViolations: [{ directive: "script-src", blocked: "eval", source: "tauri://localhost/a.js", line: 3 }], dialogs: ["엔진 실행 확인"], projects: [{ ...report.projects[0], problems: ["unexpected_dialog: 엔진 실행 확인"] }, ...report.projects.slice(1)] }, logs);
    expect(judge(plan).failures).toEqual(["웹뷰 보안 정책 위반", "뜨지 말아야 할 모달이 떴다", "flappy-lua: unexpected_dialog: 엔진 실행 확인"]);
  });

  it("선택 실행의 실패는 경고뿐이다", () => {
    const plan = planMod.buildPlan({ os: "mac", workDir: path.join(tmp, "run") });
    const { report, logs } = happy(plan);
    report.projects[0].runs.push(runReport({ mode: "embedded", exitCode: null, optional: true }));
    setup(plan, report, { ...logs, "flappy-lua-2.log": "" });
    const r = judge(plan);
    expect(r.failures).toEqual([]);
    expect(r.warnings[0]).toMatch(/^flappy-lua 실행 2 \(embedded, flappy\): /);
  });

  it("타일맵: 칠한 칸이 표식 색이 아니거나 저장한 칸이 다르면 실패", () => {
    const plan = localPlan();
    const { report, logs } = happy(plan);
    report.projects[2] = projectReport("tilemap", [runReport()], { edit: { saved: "saved", cellAfter: 46 } });
    setup(plan, report, { ...logs, "tilemap-1.bmp": tilemapShot([0x40, 0xb0, 0x80], [0x40, 0xb0, 0x80]) });
    expect(judge(plan).failures).toEqual(["tilemap 실행 1 (process, tilemapPixel): 저장한 맵의 칸 (24, 28) 이 gid 45 다", "tilemap 실행 1 (process, tilemapPixel): 칠한 칸 (24, 28) 이 표식 색 #d8c880 이다"]);
  });

  it("main: 판정의 종료 코드. 보고서 경로는 계획에서", async () => {
    const plan = localPlan();
    const planFile = path.join(tmp, "plan.json");
    write(planFile, JSON.stringify(plan));
    const quiet = { log: () => {}, error: () => {}, readBmp, eventPlayPlan };
    expect(await checkMod.main(["--plan", planFile], quiet)).toBe(1);
    const { report, logs } = happy(plan);
    setup(plan, report, logs);
    expect(await checkMod.main(["--plan", planFile], quiet)).toBe(0);
    expect(await checkMod.main(["--plan", planFile, "--report", path.join(tmp, "nope.json")], quiet)).toBe(1);
    expect(await checkMod.main(["--report", plan.report], quiet)).toBe(2);
  });
});

describe("맵 뷰와 게임 화면 견주기 (mapFrame)", () => {
  const W = 384;
  const H = 448;
  const TILESET = "resources/aldebaran/forest16.png";
  const MAP_W = 256;
  const MAP_H = 28;
  const RECT = { x: 1008, y: 0, width: W, height: H };
  const BACKGROUND = [10, 10, 40];

  /** 128x80 타일셋 (8열 5줄, 타일 40). 타일마다 다른 무늬이고 gid 5 (번호 4)는 왼쪽 절반이 투명하다 */
  function tilesetPng() {
    const tw = 128;
    const th = 80;
    const rgba = new Uint8Array(tw * th * 4);
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const t = Math.floor(y / 16) * 8 + Math.floor(x / 16);
        const alpha = t === 4 && x % 16 < 8 ? 0 : 255;
        rgba.set([(t * 37 + (x % 16) * 5) & 255, (t * 91 + (y % 16) * 7) & 255, (t * 13 + 60) & 255, alpha], (y * tw + x) * 4);
      }
    }
    return { png: pngMod.encodePng(tw, th, rgba), image: { width: tw, height: th, rgba } };
  }

  /** 숲 흉내: ground 는 20줄부터 gid 1..4, deco 는 카메라 안 (65..70, 19) 에 gid 5, edited 면 계획의 칸에 그 gid */
  function forestMap(opts: { edited?: boolean; decoData?: "empty" } = {}) {
    const ground = new Array(MAP_W * MAP_H).fill(0);
    const deco = new Array(MAP_W * MAP_H).fill(0);
    for (let y = 20; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) ground[y * MAP_W + x] = 1 + ((x + y) % 4);
    for (let x = 65; x <= 70; x++) deco[19 * MAP_W + x] = 5;
    const edit = planMod.FOREST_EDIT;
    if (opts.edited !== false) deco[edit.y * MAP_W + edit.x] = edit.gid;
    return {
      version: 2,
      name: "forest",
      width: MAP_W,
      height: MAP_H,
      tileWidth: 16,
      tileHeight: 16,
      tilesets: [{ image: TILESET, firstGid: 1, columns: 8 }],
      layers: [
        { name: "ground", data: ground },
        { name: "deco", data: opts.decoData === "empty" ? new Array(MAP_W * MAP_H).fill(0) : deco },
      ],
      collision: new Array(MAP_W * MAP_H).fill(0),
      objects: [{ id: "a" }, { id: "b" }],
    };
  }

  function forestPlan(saved = forestMap()): Plan {
    const root = path.join(tmp, "run-forest");
    write(path.join(root, "resources/maps/aldebaran_forest.json"), JSON.stringify(saved));
    write(path.join(root, TILESET), tilesetPng().png);
    return planMod.buildPlan({ os: "local", workDir: path.join(tmp, "run"), forestRoot: root });
  }

  type Img = { width: number; height: number; rgba: Uint8Array };
  const images = () => new Map([[TILESET, tilesetPng().image]]);

  /** 맵 뷰 뽑기: 타일 레이어만 1배 (투명한 곳은 알파 0) */
  function captureOf(map: unknown) {
    const img = frame.renderMapRect(map, images(), RECT) as Img;
    return encodeBmp32(img.width, img.height, img.rgba);
  }

  /** 게임 화면: 배경 위에 타일을 2배로, 주인공 자리에 땅을 조금 가리는 스프라이트 하나 (12x20) */
  function gameOf(map: unknown, opts: { skipLayer?: number; noise?: number; holes?: Array<[number, number]> } = {}) {
    const tiles = frame.renderMapRect(map, images(), RECT, opts.skipLayer === undefined ? {} : { skipLayer: opts.skipLayer }) as Img;
    const out = new Uint8Array(W * 2 * H * 2 * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let rgb = tiles.rgba[i + 3] === 255 ? [tiles.rgba[i], tiles.rgba[i + 1], tiles.rgba[i + 2]] : BACKGROUND;
        if (x >= 186 && x < 198 && y >= 310 && y < 330) rgb = [250, 0, 250];
        if (opts.noise && (y * W + x) % 100 < opts.noise && tiles.rgba[i + 3] === 255) rgb = [255 - rgb[0], 0, 0];
        // 게임이 빼먹은 칸 (맵 칸 좌표): 바탕색으로
        if (opts.holes?.some(([cx, cy]) => Math.floor((x + RECT.x) / 16) === cx && Math.floor((y + RECT.y) / 16) === cy)) rgb = BACKGROUND;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) out.set([...rgb, 255], ((y * 2 + dy) * W * 2 + x * 2 + dx) * 4);
      }
    }
    return encodeBmp32(W * 2, H * 2, out);
  }

  function forestReport(plan: Plan, rect: unknown, edit: Record<string, unknown> | null = { ...planMod.FOREST_EDIT, cellBefore: 0, saved: "saved", cellAfter: planMod.FOREST_EDIT.gid }) {
    const { report } = happy(plan);
    report.projects.push(
      projectReport("forest", [runReport({ mapCapture: { file: "x", rect, placementX: 1200 } })], { edit, mapView: { path: "resources/maps/aldebaran_forest.json", ready: true, width: MAP_W, height: MAP_H, objects: 2 } }),
    );
    return report;
  }

  const LOG = "알데바란: 맵 ./resources/maps/aldebaran_forest.json 타일 1\n알데바란: 시작 x 1200 (y 320)\n";
  const failuresOf = (r: Judged) => r.failures.map((f) => f.replace(/^forest 실행 1 \(process, mapFrame\): /, ""));

  it("계획: 숲은 deco 레이어의 빈 하늘 칸 하나를 칠해 저장하고, 그 칸은 게임의 카메라 안이다", () => {
    const plan = forestPlan();
    const forest = plan.projects[3];
    expect(forest.edit).toEqual({ kind: "paintTile", map: "resources/maps/aldebaran_forest.json", layer: 1, x: 80, y: 8, gid: 36 });
    expect(parsePlan(plan).projects[3].edit).toEqual(forest.edit);
    const cam = frame.followCamera(1200, W, H, MAP_W * 16);
    expect(80 * 16).toBeGreaterThanOrEqual(cam.x);
    expect(81 * 16).toBeLessThanOrEqual(cam.x + cam.width);
  });

  it("통과: 카메라는 자리 줄에서 셈하고, 맵 뷰와 게임 화면, 저장한 맵으로 그린 기준이 레이어마다, 칠한 칸까지 같다", () => {
    const plan = forestPlan();
    const { logs } = happy(plan);
    const map = forestMap();
    setup(plan, forestReport(plan, RECT), { ...logs, "forest-1.log": LOG, "forest-1.map.bmp": captureOf(map), "forest-1.bmp": gameOf(map) });
    const r = judge(plan);
    expect(r.failures).toEqual([]);
    const text = r.lines.join("\n");
    expect(text).toMatch(/PASS {2}forest 실행 1 \(process, mapFrame\): 맵 뷰의 타일 픽셀이 게임 화면과 같다 .* 같음 \d+ \(99\.\d+%\)/);
    expect(text).toContain("PASS  forest 실행 1 (process, mapFrame): 맵 뷰가 저장한 맵을 그렸다");
    expect(text).toMatch(/PASS {2}forest 실행 1 \(process, mapFrame\): 레이어 ground 가 게임 화면에 있다 .* \(99\.\d+%\)/);
    // deco 만 보이는 픽셀: gid 5 여섯 칸의 오른쪽 절반(128 x 6)과 칠한 칸(256)
    expect(text).toContain("레이어 deco 가 게임 화면에 있다 (그 레이어만 보이는 픽셀 64 개 이상, 90% 이상)  1024/1024 (100.00%)");
    expect(text).toContain("칠한 칸 (80, 8) 이 게임 화면에 있다 (칠하기 전 gid 0 와 다른 픽셀 64 개 이상, 90% 이상)  256/256 (100.00%)");
  });

  it("실패: 게임이 deco 레이어를 그리지 않으면 (맵 뷰 뽑기와의 비율은 넘어도) 레이어 검사에서 떨어진다", () => {
    const plan = forestPlan();
    const { logs } = happy(plan);
    const map = forestMap();
    setup(plan, forestReport(plan, RECT), { ...logs, "forest-1.log": LOG, "forest-1.map.bmp": captureOf(map), "forest-1.bmp": gameOf(map, { skipLayer: 1 }) });
    const r = judge(plan);
    // 뽑기와 게임 화면의 비율 검사는 deco 몫(1024/약 55000)이 작아 통과한다. 그것만으로는 모자랐던 이유다
    expect(r.lines.join("\n")).toMatch(/PASS {2}forest 실행 1 \(process, mapFrame\): 맵 뷰의 타일 픽셀이 게임 화면과 같다/);
    expect(failuresOf(r)).toEqual([
      "칸마다 게임 화면이 저장한 맵과 같다 (칸의 75% 이상, 어긋난 칸 2 개 이하)",
      "레이어 deco 가 게임 화면에 있다 (그 레이어만 보이는 픽셀 64 개 이상, 90% 이상)",
      "칠한 칸 (80, 8) 이 게임 화면에 있다 (칠하기 전 gid 0 와 다른 픽셀 64 개 이상, 90% 이상)",
    ]);
  });

  it("실패: 게임이 바닥 타일 세 칸을 빼먹으면 전체 비율은 넘어도 칸 검사에서 떨어진다. 두 칸까지는 스프라이트 몫이다", () => {
    const plan = forestPlan();
    const { logs } = happy(plan);
    const map = forestMap();
    const run = (holes: Array<[number, number]>) => {
      setup(plan, forestReport(plan, RECT), { ...logs, "forest-1.log": LOG, "forest-1.map.bmp": captureOf(map), "forest-1.bmp": gameOf(map, { holes }) });
      return judge(plan);
    };
    const three = run([[64, 22], [65, 22], [66, 22]]);
    expect(three.lines.join("\n")).toMatch(/PASS {2}forest 실행 1 \(process, mapFrame\): 게임 화면이 저장한 맵의 타일과 같다/);
    expect(failuresOf(three)).toEqual(["칸마다 게임 화면이 저장한 맵과 같다 (칸의 75% 이상, 어긋난 칸 2 개 이하)"]);
    expect(three.lines.join("\n")).toContain("64,22 65,22 66,22");
    // 빠진 칸이 하나면 스프라이트 몫(두 칸) 안이라 통과
    expect(failuresOf(run([[64, 22]]))).toEqual([]);
  });

  it("실패: 저장한 맵의 deco 가 비었으면(판정이 그 파일로 그린다) 레이어를 증명할 수 없고 칠한 칸도 없다", () => {
    const plan = forestPlan(forestMap({ decoData: "empty" }));
    const { logs } = happy(plan);
    const map = forestMap({ decoData: "empty" });
    setup(plan, forestReport(plan, RECT), { ...logs, "forest-1.log": LOG, "forest-1.map.bmp": captureOf(map), "forest-1.bmp": gameOf(map) });
    expect(failuresOf(judge(plan))).toEqual([
      "저장한 맵 파일의 칸 (80, 8) 이 gid 36 다 (레이어 deco)",
      "레이어 deco 가 게임 화면에 있다 (그 레이어만 보이는 픽셀 64 개 이상, 90% 이상)",
      "칠한 칸 (80, 8) 이 게임 화면에 있다 (칠하기 전 gid 0 와 다른 픽셀 64 개 이상, 90% 이상)",
    ]);
  });

  it("실패: 게임이 칠하기 전 맵을 돌렸으면 칠한 칸 검사에서 떨어진다 (저장한 파일과 맵 뷰는 칠한 것)", () => {
    const plan = forestPlan();
    const { logs } = happy(plan);
    setup(plan, forestReport(plan, RECT), { ...logs, "forest-1.log": LOG, "forest-1.map.bmp": captureOf(forestMap()), "forest-1.bmp": gameOf(forestMap({ edited: false })) });
    expect(failuresOf(judge(plan))).toEqual([
      "레이어 deco 가 게임 화면에 있다 (그 레이어만 보이는 픽셀 64 개 이상, 90% 이상)",
      "칠한 칸 (80, 8) 이 게임 화면에 있다 (칠하기 전 gid 0 와 다른 픽셀 64 개 이상, 90% 이상)",
    ]);
  });

  it("실패: 저장하지 못했거나(파일이 칠하기 전) 보고서에 칠하기 전 칸이 없으면", () => {
    const plan = forestPlan(forestMap({ edited: false }));
    const { logs } = happy(plan);
    const map = forestMap();
    setup(plan, forestReport(plan, RECT, { ...planMod.FOREST_EDIT, saved: "saved", cellAfter: 36 }), { ...logs, "forest-1.log": LOG, "forest-1.map.bmp": captureOf(map), "forest-1.bmp": gameOf(map) });
    expect(failuresOf(judge(plan))).toEqual([
      "저장한 맵 파일의 칸 (80, 8) 이 gid 36 다 (레이어 deco)",
      "칠하기 전 칸이 gid 36 가 아니었다 (칠한 것이 그림을 바꾼다)",
      "맵 뷰가 저장한 맵을 그렸다 (뽑기와 기준의 불투명 픽셀 99.9% 이상)",
    ]);
  });

  it("실패: 타일이 많이 다르거나 사각형이 카메라가 아니거나 맵 뷰의 오브젝트 수가 다르거나 타일셋 그림이 없으면", () => {
    const plan = forestPlan();
    const { logs } = happy(plan);
    const map = forestMap();
    const report = forestReport(plan, { x: 1000, y: 0, width: 384, height: 448 });
    (report.projects[3] as unknown as { mapView: { objects: number } }).mapView.objects = 1;
    setup(plan, report, { ...logs, "forest-1.log": LOG, "forest-1.map.bmp": captureOf(map), "forest-1.bmp": gameOf(map, { noise: 20 }) });
    expect(failuresOf(judge(plan))).toEqual([
      "맵 뷰가 맵을 열었다 (오브젝트 2개)",
      "뽑은 사각형이 게임의 카메라다 (x 1008)",
      "맵 뷰의 타일 픽셀이 게임 화면과 같다 (97% 이상, 채널마다 ±8)",
      "게임 화면이 저장한 맵의 타일과 같다 (레이어 전부, 97% 이상)",
      "레이어 ground 가 게임 화면에 있다 (그 레이어만 보이는 픽셀 64 개 이상, 90% 이상)",
      "레이어 deco 가 게임 화면에 있다 (그 레이어만 보이는 픽셀 64 개 이상, 90% 이상)",
      "칠한 칸 (80, 8) 이 게임 화면에 있다 (칠하기 전 gid 0 와 다른 픽셀 64 개 이상, 90% 이상)",
    ]);
    fs.rmSync(path.join(tmp, "run-forest", TILESET));
    expect(failuresOf(judge(plan))).toContain("저장한 맵과 타일셋으로 기준을 그린다");
  });

  it("기준 그리기: 앞 레이어부터 알파로 겹치고, 레이어를 빼거나 칸 하나를 바꿔 그린다", () => {
    const tiles = new Uint8Array(2 * 1 * 4 * 4);
    // 2x1 픽셀 타일 둘: gid 1 은 빨강 불투명, gid 2 는 왼쪽 파랑 반투명(128), 오른쪽 투명
    const ts = { width: 4, height: 1, rgba: tiles };
    tiles.set([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 128, 0, 0, 0, 0]);
    const map = { width: 2, height: 1, tileWidth: 2, tileHeight: 1, tilesets: [{ image: "t.png", firstGid: 1, columns: 2 }], layers: [{ data: [1, 0] }, { data: [2, 2] }] };
    const img = frame.renderMapRect(map, new Map([["t.png", ts]]), { x: 0, y: 0, width: 4, height: 1 }) as Img;
    expect(Array.from(img.rgba)).toEqual([127, 0, 128, 255, 255, 0, 0, 255, 0, 0, 255, 128, 0, 0, 0, 0]);
    const noTop = frame.renderMapRect(map, new Map([["t.png", ts]]), { x: 0, y: 0, width: 4, height: 1 }, { skipLayer: 1 }) as Img;
    expect(Array.from(noTop.rgba)).toEqual([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
    const cell = frame.renderMapRect(map, new Map([["t.png", ts]]), { x: 1, y: 0, width: 2, height: 1 }, { cell: { layer: 0, x: 1, y: 0, gid: 1 } }) as Img;
    expect(Array.from(cell.rgba)).toEqual([255, 0, 0, 255, 127, 0, 128, 255]);
    expect(() => frame.renderMapRect({ ...map, tilesets: [] }, new Map(), { x: 0, y: 0, width: 4, height: 1 })).toThrow(/타일셋이 없다/);
  });

  it("셈: 자리 줄과 카메라와 배율 검사", () => {
    expect(frame.placementX("알데바란: 시작 x 1200 (y 320)\n", planMod.FOREST_PLACEMENT)).toBe(1200);
    expect(frame.followCamera(1200, 384, 448, 4096)).toEqual({ x: 1008, y: 0, width: 384, height: 448 });
    const small = encodeBmp32(2, 2, new Uint8Array(16).fill(255));
    const odd = encodeBmp32(3, 3, new Uint8Array(36).fill(255));
    expect(() => frame.compareMapFrame(readBmp(small), readBmp(odd))).toThrow(/정수배/);
  });
});

describe("앱 띄우기 (selftest-app.mjs)", () => {
  it(".app 은 Info.plist 의 실행 파일로, 파일은 그대로", () => {
    const app = path.join(tmp, "InitialEditor.app");
    write(path.join(app, "Contents/Info.plist"), "<plist><dict><key>CFBundleExecutable</key>\n<string>initial-editor</string></dict></plist>");
    write(path.join(app, "Contents/MacOS/initial-editor"), "bin");
    expect(appMod.resolveApp(app)).toBe(path.join(app, "Contents/MacOS/initial-editor"));
    write(path.join(tmp, "InitialEditor.AppImage"), "bin");
    expect(appMod.resolveApp(path.join(tmp, "InitialEditor.AppImage"))).toBe(path.join(tmp, "InitialEditor.AppImage"));
    expect(() => appMod.resolveApp(path.join(tmp, "nope"))).toThrow(/없다/);
  });

  it("인자: --plan 과 계획 인자는 같이 주지 않는다", () => {
    expect(appMod.parseArgs(["a.app", "--embedded"])).toMatchObject({ app: "a.app", embedded: true, check: true });
    expect(() => appMod.parseArgs(["a.app", "--plan", "p.json", "--os", "mac"])).toThrow(/같이/);
    expect(() => appMod.parseArgs([])).toThrow(/앱 경로/);
  });

  it("계획을 만들어 앱을 환경 변수로 띄우고 판정한다", async () => {
    write(path.join(tmp, "app-bin"), "bin");
    const calls: Array<{ exe: string; plan: string }> = [];
    const checks: string[][] = [];
    const code = await appMod.main([path.join(tmp, "app-bin"), "--work", path.join(tmp, "work", "run")], {
      log: () => {},
      error: () => {},
      runApp: async (exe: string, plan: string) => {
        calls.push({ exe, plan });
        return 0;
      },
      check: async (argv: string[]) => {
        checks.push(argv);
        return 1;
      },
    });
    expect(code).toBe(1);
    expect(calls[0].exe).toBe(path.join(tmp, "app-bin"));
    const plan = JSON.parse(fs.readFileSync(calls[0].plan, "utf8"));
    expect(plan).toMatchObject({ workDir: path.join(tmp, "work", "run"), showWindow: false });
    expect(checks).toEqual([["--plan", calls[0].plan]]);
  });
});

describe("RPG 이벤트 (probe, eventFront, eventProbe)", () => {
  const FIXTURES = path.join(REPO, "packages/ext-rpg/test/fixtures");
  type Ev = { id: string; x: number; y: number; charset?: unknown };

  /** ext-rpg 픽스처(엔진 파일의 사본)로 엔진 저장소 모양의 폴더를 만든다 */
  function engineRepo(): string {
    const dir = path.join(tmp, "engine");
    fs.cpSync(path.join(FIXTURES, "resources"), path.join(dir, "resources"), { recursive: true });
    write(path.join(dir, "scripts/lua/main.lua"), "-- main\n");
    return dir;
  }

  function rpgPlan() {
    const root = path.join(tmp, "run-rpg");
    planMod.prepareForest(engineRepo(), root, planMod.RPG_MAP);
    const plan = planMod.buildPlan({ os: "local", workDir: path.join(tmp, "run"), rpgRoot: root });
    plan.projects = plan.projects.filter((p) => p.id === "rpg-port");
    return { plan, root };
  }

  function disk(root: string) {
    const map = JSON.parse(fs.readFileSync(path.join(root, planMod.RPG_MAP), "utf8")) as { width: number; height: number; tileWidth: number; tileHeight: number; collision: number[]; events: Ev[] };
    return map;
  }

  /** 게임의 그리기 규칙대로 그린 표식 (맞는 뷰) */
  function goodProbe(root: string) {
    const map = disk(root);
    const events = map.events.map((e, index) => ({ index, id: e.id, x: e.x, y: e.y, charset: e.charset !== undefined }));
    const drawn = events.map((e) =>
      e.charset
        ? { index: e.index, kind: "sprite", x: e.x * 16 - 4, y: (e.y + 1) * 16 - 32, sheet: "resources/charsets/placeholder.png", frame: { x: 24, y: 64, w: 24, h: 32 } }
        : { index: e.index, kind: "badge", x: e.x * 16, y: e.y * 16 },
    );
    return { extension: "rpg", map: planMod.RPG_MAP, ready: true, waitedMs: 120, result: { ready: true, loaded: true, attached: true, locked: null, errors: 0, tileWidth: 16, tileHeight: 16, events, view: { drawn, failedSheets: [] as string[] } } };
  }

  function playerLine(root: string, mode: "play" | "probe") {
    const map = disk(root);
    const i = map.events.findIndex((e) => e.id === planMod.RPG_EVENT);
    const r = eventPlayPlan({ width: map.width, height: map.height, collision: map.collision }, map.events, i, mode);
    if (!r.ok || !r.plan.at) throw new Error(r.ok ? "자리 없음" : r.reason);
    return `rpg:player:port_town,${r.plan.at.x},${r.plan.at.y},${r.plan.at.dir}`;
  }

  function goodRun(label: string, over: Record<string, unknown> = {}) {
    return runReport({ play: { extension: "rpg", map: planMod.RPG_MAP, args: {}, label, refused: null }, ...over });
  }

  function happyRpg(root: string, probe = goodProbe(root)) {
    const n = disk(root).events.length;
    return {
      report: { version: 1, ok: true, cspViolations: [], dialogs: [], projects: [projectReport("rpg-port", [goodRun("이 이벤트 앞에서 실행"), goodRun("이 이벤트 자동 재생")], { probe, mapView: { path: planMod.RPG_MAP, ready: true } })] },
      logs: {
        "rpg-port-1.log": `rpg:map:port_town events:${n} skipped:0\n${playerLine(root, "play")}\n`,
        "rpg-port-2.log": `rpg:map:port_town events:${n} skipped:0\n${playerLine(root, "probe")}\nrpg:hold:${planMod.RPG_EVENT}\nrpg:event:${planMod.RPG_EVENT}\nrpg:route:done\n`,
      } as Record<string, string>,
    };
  }

  const judgeRpg = (plan: Plan) => checkMod.judge(plan, JSON.parse(fs.readFileSync(plan.report, "utf8")), { readBmp, eventPlayPlan });

  it("계획: 항구 마을을 탐침으로 보고, 물고기 장수 앞에서 실행과 자동 재생을 앱에 든 엔진으로. 앱의 parsePlan 이 받는다", () => {
    const { plan, root } = rpgPlan();
    const p = plan.projects[0] as Plan["projects"][number] & { probe: unknown; openMap: string };
    expect(p).toMatchObject({ id: "rpg-port", root, openMap: planMod.RPG_MAP, probe: { extension: "rpg", map: planMod.RPG_MAP } });
    expect(p.runs.map((r) => [r.check, (r.play as { args: unknown }).args])).toEqual([
      ["eventFront", { event: "fishmonger", mode: "play" }],
      ["eventProbe", { event: "fishmonger", mode: "probe" }],
    ]);
    expect(p.runs.every((r) => r.expectEngineSource === "bundled" && r.env?.INITIAL2D_NO_RTP === "1")).toBe(true);
    expect(parsePlan(plan).projects[0].runs[1].play).toEqual({ extension: "rpg", map: planMod.RPG_MAP, args: { event: "fishmonger", mode: "probe" } });
    expect(fs.existsSync(path.join(root, "resources/charsets/placeholder.png"))).toBe(true);
    expect(fs.existsSync(path.join(root, "resources/data/rpg-game.json"))).toBe(true);
  });

  it("--forest 와 --rpg 가 같은 저장소면 사본 하나를 함께 쓴다", () => {
    const engine = engineRepo();
    write(path.join(engine, "resources/maps/aldebaran_forest.json"), "{}");
    const work = path.join(tmp, "w");
    const plan = planMod.writePlan({ os: "local", work, out: path.join(tmp, "p.json"), embedded: false, forest: engine, rpg: engine, totalTimeout: null });
    const roots = plan.projects.filter((p) => p.root).map((p) => [p.id, p.root]);
    expect(roots).toEqual([["forest", `${work}-forest`], ["rpg-port", `${work}-forest`]]);
    expect(fs.existsSync(`${work}-rpg`)).toBe(false);
  });

  it("통과: 탐침의 표식이 게임의 그리기 자리에 있고, 선 자리가 판정이 셈한 자리이며, 자동 재생이 이벤트를 돌렸다", () => {
    const { plan, root } = rpgPlan();
    const { report, logs } = happyRpg(root);
    setup(plan, report, logs);
    const r = judgeRpg(plan);
    expect(r.failures).toEqual([]);
    expect(r.lines.join("\n")).toContain("뷰가 표식 17개를 그렸다");
    expect(r.lines.join("\n")).toContain("외형 그림 1장이 프로젝트에 있다");
  });

  it("실패: 표식 하나가 한 픽셀 어긋나거나, 하나를 그리지 않았거나, 외형 그림을 읽지 못했거나, 레이어가 잠겼다", () => {
    const cases: Array<[(p: ReturnType<typeof goodProbe>) => void, string]> = [
      [(p) => (p.result.view.drawn[2].y += 1), "표식이 게임의 그리기 규칙 자리에 있다"],
      [(p) => p.result.view.drawn.pop(), "뷰가 표식 17개를 그렸다"],
      [(p) => p.result.view.failedSheets.push("resources/charsets/placeholder.png"), "읽지 못한 외형 그림이 없다"],
      [(p) => ((p.result as Record<string, unknown>).locked = "스키마 버전 2"), "이벤트 레이어가 붙었고"],
      [(p) => (p.result.events[0].x = 99), "탐침의 이벤트가 맵 파일의 이벤트 17개와 같다"],
      [(p) => (p.result.ready = false), "탐침이 ready 다"],
    ];
    for (const [mutate, expected] of cases) {
      fs.rmSync(path.join(tmp, "run"), { recursive: true, force: true });
      fs.rmSync(path.join(tmp, "run-rpg"), { recursive: true, force: true });
      fs.rmSync(path.join(tmp, "engine"), { recursive: true, force: true });
      const { plan, root } = rpgPlan();
      const probe = goodProbe(root);
      mutate(probe);
      const { report, logs } = happyRpg(root, probe);
      setup(plan, report, logs);
      expect(judgeRpg(plan).failures.join("\n"), expected).toContain(expected);
    }
  });

  it("보이는 창이면 맵 뷰가 그릴 준비가 돼야 한다", () => {
    const { plan, root } = rpgPlan();
    plan.showWindow = true;
    const { report, logs } = happyRpg(root);
    setup(plan, report, logs);
    expect(judgeRpg(plan).failures).toEqual([]);
    (report.projects[0] as Record<string, unknown>).mapView = { path: planMod.RPG_MAP, ready: false };
    setup(plan, report, logs);
    expect(judgeRpg(plan).failures).toEqual(["rpg-port: 맵 뷰가 그릴 준비가 됐다 (WebGL)"]);
  });

  it("실패: 다른 자리에 섰거나, 게임이 이벤트를 덜 읽었거나, 자동 재생이 이벤트를 돌리지 않았거나, 탐침이 요청을 거절했다", () => {
    const { plan, root } = rpgPlan();
    const { report, logs } = happyRpg(root);
    const n = disk(root).events.length;
    logs["rpg-port-1.log"] = `rpg:map:port_town events:${n - 1} skipped:1\nrpg:player:port_town,1,1,down\n`;
    logs["rpg-port-2.log"] = logs["rpg-port-2.log"].replace(`rpg:event:${planMod.RPG_EVENT}\n`, "");
    report.projects[0].runs[1] = goodRun("이 이벤트 자동 재생", { play: { extension: "rpg", map: planMod.RPG_MAP, args: {}, label: null, refused: "이 맵에 없는 이벤트: fishmonger" } });
    setup(plan, report, logs);
    const f = judgeRpg(plan).failures;
    expect(f).toEqual(
      expect.arrayContaining([
        `rpg-port 실행 1 (process, eventFront): 게임이 맵의 이벤트 ${n}개를 다 읽었다`,
        `rpg-port 실행 1 (process, eventFront): 플레이어가 이벤트 앞에 섰다 (${playerLine(root, "play")})`,
        "rpg-port 실행 2 (process, eventProbe): 탐침이 실행 요청을 만들었다",
        `rpg-port 실행 2 (process, eventProbe): 자동 재생이 이벤트를 돌렸다 (rpg:event:${planMod.RPG_EVENT})`,
      ]),
    );
  });
});
