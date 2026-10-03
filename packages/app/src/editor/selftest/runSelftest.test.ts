// 자가 검사 흐름 (runSelftest) 을 가짜 에디터와 가짜 러너로 본다. 프로젝트마다 메모리 백엔드 하나, 템플릿 쓰기는 기록만,
// 러너는 계획의 실행마다 정해 둔 줄을 로그에 남기고 끝난다. 맵 편집은 진짜 MapDocument 로 한다.

import fs from "node:fs";
import { Document, LogStore, type ProjectBackend, type RunMode } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import type { MapSelftestProbe } from "@initial-editor/ext-tilemap";
import { MapDocument } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import type { EngineSource } from "../runner/engineCandidates";
import { parsePlan } from "./plan";
import { errorLines, followCamera, placementX, runSelftest, type Rect, type SelftestHost, type SelftestLanguageServer, type SelftestRunner, type SelftestShell, type TilePixels } from "./runSelftest";

const TILEMAP_MAP = fs.readFileSync(new URL("../../../templates/resources/templates/tilemap/map.json", import.meta.url), "utf8");

interface Script {
  lines?: string[];
  exitCode?: number;
  source?: EngineSource;
  fallback?: RunMode | null;
  hang?: boolean;
  startFails?: string;
}

class FakeRunner implements SelftestRunner {
  state: SelftestRunner["state"] = "idle";
  exitCode: number | null = null;
  engineSource: EngineSource = "none";
  enginePath: string | null = null;
  features: string[] | null = null;
  fallback: RunMode | null = null;
  activeMode: RunMode | null = null;
  bundled: { path: string; meta: unknown } | null = { path: "/app/Contents/MacOS/Initial2D", meta: { engineCommit: "c".repeat(40) } };
  readonly starts: Array<{ mode?: RunMode; env?: Record<string, string>; scene?: string }> = [];
  stops = 0;

  constructor(
    private readonly log: LogStore,
    private readonly script: (n: number, opts: { mode?: RunMode }) => Script,
  ) {}

  async start(opts: { mode?: RunMode; env?: Record<string, string>; scene?: string }): Promise<void> {
    this.starts.push(opts);
    const s = this.script(this.starts.length, opts);
    this.exitCode = null;
    this.fallback = s.fallback ?? null;
    this.activeMode = s.fallback ?? opts.mode ?? "process";
    this.engineSource = s.source ?? "bundled";
    this.enginePath = this.engineSource === "bundled" ? "/app/Contents/MacOS/Initial2D" : null;
    this.features = ["lua", "mruby"];
    if (s.startFails) {
      this.log.error("runner", s.startFails);
      return;
    }
    this.state = "running";
    this.log.info("runner", "엔진 시작");
    setTimeout(() => {
      for (const line of s.lines ?? []) this.log.append("info", "engine", line);
      if (s.hang) return;
      this.exitCode = s.exitCode ?? 0;
      this.state = "idle";
    }, 5);
  }

  async stop(): Promise<void> {
    this.stops++;
    this.state = "idle";
    this.exitCode = null;
  }
}

class ScriptDoc extends Document {
  constructor(
    path: string,
    readonly text = "",
  ) {
    super("script", path, path);
  }
  async save(): Promise<void> {}
  async reload(): Promise<void> {}
}

interface HostOptions {
  script?: (n: number, opts: { mode?: RunMode }) => Script;
  disks?: Record<string, Record<string, string>>;
  openFails?: string[];
  csp?: string[];
  capture?: (rect: Rect) => TilePixels | null;
  /** 이 경로를 열 때 모달을 띄운다 */
  modalOn?: string;
  probes?: Record<string, MapSelftestProbe>;
  languageServer?: SelftestLanguageServer | null;
}

function makeHost(opts: HostOptions = {}) {
  const log = new LogStore();
  const disks = new Map<string, MemoryBackend>();
  const disk = (root: string) => {
    if (!disks.has(root)) disks.set(root, new MemoryBackend(opts.disks?.[root] ?? {}));
    return disks.get(root)!;
  };
  let current = "";
  const backend = new Proxy(
    {},
    {
      get: (_t, key: string) => {
        if (key === "open")
          return async (root: string) => {
            current = root;
            return disk(root).open(root);
          };
        const d = disk(current) as unknown as Record<string, unknown>;
        const v = d[key];
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(d) : v;
      },
    },
  ) as unknown as ProjectBackend;
  const docs = new Map<string, Document>();
  const modals: Array<{ id: number; title: string }> = [];
  const closed: number[] = [];
  const templates: Array<{ root: string; template: string; language: string }> = [];
  const runner = new FakeRunner(log, opts.script ?? (() => ({ lines: ["ok"] })));
  let opened: string | null = null;
  const plays: Array<{ path: string; label: string; mode: RunMode; env: Record<string, string> }> = [];
  const host: SelftestHost = {
    app: { version: "2.0.0-dev", commit: "abc1234", platform: "mac", mode: "tauri", backend: "tauri" },
    backend,
    runner,
    async openProject(root) {
      if (opts.openFails?.includes(root)) return false;
      await backend.open(root);
      opened = root;
      return true;
    },
    async closeProject() {
      docs.clear();
      opened = null;
      return true;
    },
    async openPath(path) {
      if (opts.modalOn === path) modals.push({ id: modals.length + 1, title: "엔진 실행 확인" });
      if (docs.has(path)) return;
      if (path.startsWith("resources/maps/")) docs.set(path, await MapDocument.open(backend, path));
      else if (await backend.exists(path)) docs.set(path, new ScriptDoc(path, await backend.readText(path)));
    },
    findDocument: (path) => docs.get(path) ?? null,
    async saveDocument(doc) {
      await doc.save();
      return "saved";
    },
    logEntries: () => log.entries,
    modals: () => modals.filter((m) => !closed.includes(m.id)),
    closeModal: (id) => void closed.push(id),
    async writeTemplate(b, options) {
      templates.push({ root: current, template: options.template, language: options.language });
      const entry = options.language === "mruby" ? "scripts/ruby/main.rb" : "scripts/lua/main.lua";
      await b.writeText("game.json", JSON.stringify({ script: options.language }));
      await b.writeText(entry, options.language === "mruby" ? "# main\n" : '-- main\nlocal game = Json.Load("./game.json")\n');
      if (options.template === "tilemap") await b.writeText("resources/maps/start.json", TILEMAP_MAP);
      return ["game.json", entry];
    },
    mapViewStatus: () => ({ ready: true, error: null, warning: null }),
    captureMapTiles: async (_doc, rect) => opts.capture?.(rect) ?? null,
    cspViolations: () => (opts.csp ?? []).map((d) => ({ directive: d, blocked: "eval", source: null, line: null, sample: null })),
    extensionProbe: (id) => opts.probes?.[id] ?? null,
    languageServer: () => opts.languageServer ?? null,
    // 앱의 맵 실행 길처럼: 요청의 계획을 세우고 계획의 변수가 이기게 러너를 시작한다
    async playMap(doc, request, o) {
      plays.push({ path: doc.path!, label: request.label, mode: o.mode, env: o.env });
      const p = request.plan(doc);
      if (typeof p === "string") return false;
      await runner.start({ mode: o.mode, env: { ...o.env, ...p.env } });
      return true;
    },
  };
  const logs = new Map<string, string | Uint8Array>();
  const finished: Array<{ report: string; code: number }> = [];
  const steps: Array<Record<string, unknown>> = [];
  const shell: SelftestShell = {
    progress: async (s) => void steps.push(s),
    writeLog: async (name, data) => {
      logs.set(name, data);
      return `/tmp/run/logs/${name}`;
    },
    finish: async (report, code) => void finished.push({ report, code }),
  };
  return { host, shell, runner, log, logs, finished, steps, templates, closed, disk, plays, get opened() {
    return opened;
  } };
}

function flappyLines(): string[] {
  const lines = ["flappy:state:ready", "flappy:state:play"];
  for (let i = 0; i < 60; i++) lines.push(`frame ${i}`);
  lines.push("flappy:state:dead", "flappyFinal state=dead score=2 best=2 ticks=900");
  return lines;
}

const RUN = { mode: "process", expectEngineSource: "bundled", check: "flappy", env: { INITIAL2D_AUTOPLAY: "1" }, timeoutMs: 5000 };

function plan(projects: unknown[], extra: Record<string, unknown> = {}) {
  return parsePlan({ version: 1, workDir: "/tmp/run", report: "/tmp/run/report.json", totalTimeoutMs: 600000, projects, ...extra });
}

const fast = { pollMs: 2, mapViewWaitMs: 50, languageServerWaitMs: 300 };

describe("자가 검사 흐름", () => {
  it("템플릿으로 만들고 열고 진입 스크립트를 열고 돌린 뒤, 실행마다 전체 로그를 쓰고 0 으로 끝낸다", async () => {
    const t = makeHost({ script: () => ({ lines: flappyLines() }) });
    const report = await runSelftest(plan([{ id: "flappy-lua", template: "flappy", language: "lua", runs: [RUN] }]), t.host, t.shell, fast);
    expect(t.templates).toEqual([{ root: "/tmp/run/flappy-lua", template: "flappy", language: "lua" }]);
    expect(t.finished).toHaveLength(1);
    expect(t.finished[0].code).toBe(0);
    expect(JSON.parse(t.finished[0].report)).toEqual(JSON.parse(JSON.stringify(report)));
    expect(report.ok).toBe(true);
    const p = report.projects[0];
    expect(p).toMatchObject({ id: "flappy-lua", root: "/tmp/run/flappy-lua", files: 2, entryScript: { path: "scripts/lua/main.lua", opened: true }, problems: [] });
    const run = p.runs[0];
    expect(run).toMatchObject({ ok: true, exitCode: 0, fallback: null, log: "/tmp/run/logs/flappy-lua-1.log", editorLog: "/tmp/run/logs/flappy-lua-1.editor.log" });
    expect(run.engine).toMatchObject({ source: "bundled", path: "/app/Contents/MacOS/Initial2D", meta: { engineCommit: "c".repeat(40) } });
    // 전체 로그에는 초반 줄이 있고, tail 은 마지막 40줄뿐이다
    const log = t.logs.get("flappy-lua-1.log") as string;
    expect(log.split("\n")[0]).toBe("flappy:state:ready");
    expect(log).toContain("flappyFinal state=dead score=2 best=2 ticks=900\n");
    expect(run.tail).toHaveLength(40);
    expect(run.tail).not.toContain("flappy:state:ready");
    expect(run.lineCount).toBe(64);
    expect(t.logs.get("flappy-lua-1.editor.log")).toContain("info runner: 엔진 시작");
    expect(t.runner.starts).toEqual([{ mode: "process", env: { INITIAL2D_AUTOPLAY: "1" } }]);
    expect(t.opened).toBeNull();
    expect(t.steps.map((s) => s.step)).toEqual(["create", "open", "entry", "run", "close", "finish"]);
  });

  it("실행 방식은 실행마다 넘기고 넘어감 기대를 본다", async () => {
    const t = makeHost({ script: (n) => (n === 1 ? { lines: ["a"], source: "none", fallback: "embedded" } : { lines: ["b"], source: "none", fallback: null }) });
    const report = await runSelftest(
      plan([{ id: "win", template: "flappy", runs: [{ ...RUN, expectEngineSource: "none", expectFallback: "embedded" }, { ...RUN, expectEngineSource: "none", expectFallback: "embedded" }] }]),
      t.host,
      t.shell,
      fast,
    );
    const [first, second] = report.projects[0].runs;
    expect(first.ok).toBe(true);
    expect(first.activeMode).toBe("embedded");
    expect(second.ok).toBe(false);
    expect(second.problems).toContain("fallback: null (기대 embedded)");
    expect(report.ok).toBe(false);
    expect(t.finished[0].code).toBe(1);
  });

  it("앱에 든 엔진을 기대했는데 다른 출처면 실패", async () => {
    const t = makeHost({ script: () => ({ lines: ["x"], source: "sibling" }) });
    const report = await runSelftest(plan([{ id: "p", template: "flappy", runs: [RUN] }]), t.host, t.shell, fast);
    expect(report.projects[0].runs[0].problems).toContain("engine_source: sibling (기대 bundled)");
    expect(report.projects[0].runs[0].engine?.meta).toBeNull();
    expect(report.ok).toBe(false);
  });

  it("시간을 넘기면 멈추고 실패로 적는다. 선택 실행의 실패는 전체를 떨어뜨리지 않는다", async () => {
    const t = makeHost({ script: (n) => (n === 1 ? { lines: ["a"] } : { lines: ["b"], hang: true }) });
    const report = await runSelftest(plan([{ id: "p", template: "flappy", runs: [RUN, { ...RUN, mode: "embedded", optional: true, expectEngineSource: null, timeoutMs: 1000 }] }]), t.host, t.shell, fast);
    const [, optional] = report.projects[0].runs;
    expect(optional.ok).toBe(false);
    expect(optional.problems).toContain("timeout: 1000 ms");
    expect(t.runner.stops).toBe(1);
    expect(report.ok).toBe(true);
    expect(t.finished[0].code).toBe(0);
  });

  it("시작하지 못한 실행은 이유를 적는다", async () => {
    const t = makeHost({ script: () => ({ startFails: "이 엔진 빌드에 mruby 없음" }) });
    const report = await runSelftest(plan([{ id: "p", template: "flappy", language: "mruby", runs: [RUN] }]), t.host, t.shell, fast);
    const run = report.projects[0].runs[0];
    expect(run.problems).toEqual(expect.arrayContaining(["start_failed", "reason: 이 엔진 빌드에 mruby 없음", "exit_code: null"]));
    expect(report.projects[0].entryScript.path).toBe("scripts/ruby/main.rb");
  });

  it("오류 줄과 0 이 아닌 종료 코드는 실패", async () => {
    const t = makeHost({ script: () => ({ lines: ["Lua error in update: ./scripts/lua/main.lua:5: boom"], exitCode: 1 }) });
    const report = await runSelftest(plan([{ id: "p", template: "flappy", runs: [RUN] }]), t.host, t.shell, fast);
    expect(report.projects[0].runs[0].problems).toEqual(["exit_code: 1", "error_lines: 1"]);
    expect(report.projects[0].runs[0].errorLines).toEqual(["Lua error in update: ./scripts/lua/main.lua:5: boom"]);
  });

  it("모달이 뜨면 제목을 적고 닫는다. 그 자체가 실패다", async () => {
    const t = makeHost({ modalOn: "scripts/lua/main.lua" });
    const report = await runSelftest(plan([{ id: "p", template: "flappy", runs: [RUN] }]), t.host, t.shell, fast);
    expect(report.dialogs).toEqual(["엔진 실행 확인"]);
    expect(t.closed).toEqual([1]);
    expect(report.projects[0].problems).toContain("unexpected_dialog: 엔진 실행 확인");
    expect(report.ok).toBe(false);
  });

  it("CSP 위반이 하나라도 있으면 실패", async () => {
    const t = makeHost({ csp: ["script-src"] });
    const report = await runSelftest(plan([{ id: "p", template: "flappy", runs: [RUN] }]), t.host, t.shell, fast);
    expect(report.cspViolations).toHaveLength(1);
    expect(report.ok).toBe(false);
    expect(t.finished[0].code).toBe(1);
  });

  it("열지 못한 프로젝트는 실행하지 않고 실패로 적는다", async () => {
    const t = makeHost({ openFails: ["/tmp/run/p"] });
    const report = await runSelftest(plan([{ id: "p", template: "flappy", runs: [RUN] }]), t.host, t.shell, fast);
    expect(report.projects[0].problems).toEqual(["open_failed: /tmp/run/p"]);
    expect(report.projects[0].runs).toEqual([]);
    expect(t.runner.starts).toEqual([]);
  });

  it("맵 문서에서 한 칸을 펜으로 칠하고 저장한다 (되돌리기 스택, 칠하기 전 칸을 적고, 디스크에서 다시 읽어 본다)", async () => {
    const t = makeHost();
    const edit = { kind: "paintTile", map: "resources/maps/start.json", layer: 0, x: 24, y: 28, gid: 45 };
    const report = await runSelftest(plan([{ id: "tilemap", template: "tilemap", edit, runs: [{ ...RUN, check: "tilemapPixel" }] }]), t.host, t.shell, fast);
    const p = report.projects[0];
    // 템플릿 맵의 (24, 28) 은 잔디(gid 46)다
    expect(p.edit).toEqual({ ...edit, cellBefore: 46, dirtyAfterPaint: true, saved: "saved", dirtyAfterSave: false, cellAfter: 45 });
    expect(p.mapView).toMatchObject({ path: "resources/maps/start.json", ready: true, width: 48, height: 56 });
    expect(p.problems).toEqual([]);
    const saved = JSON.parse(new TextDecoder().decode(t.disk("/tmp/run/tilemap").files.get("resources/maps/start.json")!)) as { width: number; layers: Array<{ data: number[] }> };
    expect(saved.layers[0].data[28 * saved.width + 24]).toBe(45);
    expect(t.steps.map((s) => s.step)).toContain("edit");
  });

  it("실행 뒤 게임과 같은 카메라로 맵 뷰의 타일을 뽑아 BMP 로 남긴다", async () => {
    const mapText = JSON.stringify({ version: 2, name: "wide", width: 100, height: 28, tileWidth: 16, tileHeight: 16, tilesets: [{ image: "resources/t.png", firstGid: 1, columns: 8 }], layers: [{ name: "ground", data: new Array(100 * 28).fill(1) }], collision: new Array(100 * 28).fill(0), objects: [] });
    const rects: Rect[] = [];
    const t = makeHost({
      disks: { "/fixtures/forest": { "game.json": "{}", "scripts/lua/main.lua": "--", "resources/maps/wide.json": mapText } },
      script: () => ({ lines: ["알데바란: 맵 ./resources/maps/wide.json 타일 1", "알데바란: 시작 x 1200 → 1210", "frame"] }),
      capture: (rect) => {
        rects.push(rect);
        return { width: rect.width, height: rect.height, pixels: new Uint8Array(rect.width * rect.height * 4).fill(255) };
      },
    });
    const report = await runSelftest(
      plan([
        {
          id: "forest",
          root: "/fixtures/forest",
          openMap: "resources/maps/wide.json",
          runs: [{ mode: "process", check: "mapFrame", timeoutMs: 5000, mapCapture: { map: "resources/maps/wide.json", width: 384, height: 448, placement: "^알데바란: 시작 x (-?\\d+)(?: → (-?\\d+))?" } }],
        },
      ]),
      t.host,
      t.shell,
      fast,
    );
    const run = report.projects[0].runs[0];
    expect(run.problems).toEqual([]);
    expect(run.mapCapture).toEqual({ file: "/tmp/run/logs/forest-1.map.bmp", rect: { x: 1018, y: 0, width: 384, height: 448 }, placementX: 1210 });
    expect(rects).toEqual([{ x: 1018, y: 0, width: 384, height: 448 }]);
    const bmp = t.logs.get("forest-1.map.bmp") as Uint8Array;
    expect(bmp.length).toBe(122 + 384 * 448 * 4);
    expect(report.projects[0].mapView).toMatchObject({ path: "resources/maps/wide.json", pixelWidth: 1600 });
    expect(t.templates).toEqual([]);
  });

  it("자리 줄이 없거나 타일을 뽑지 못하면 실패", async () => {
    const mapText = JSON.stringify({ version: 2, name: "m", width: 30, height: 28, tileWidth: 16, tileHeight: 16, tilesets: [], layers: [{ name: "g", data: new Array(30 * 28).fill(0) }], collision: new Array(30 * 28).fill(0), objects: [] });
    const disks = { "/fx": { "game.json": "{}", "scripts/lua/main.lua": "--", "resources/maps/m.json": mapText } };
    const capture = { map: "resources/maps/m.json", width: 384, height: 448, placement: "^시작 x (\\d+)" };
    const noLine = makeHost({ disks, script: () => ({ lines: ["frame"] }) });
    const r1 = await runSelftest(plan([{ id: "f", root: "/fx", runs: [{ mode: "process", check: "mapFrame", timeoutMs: 5000, mapCapture: capture }] }]), noLine.host, noLine.shell, fast);
    expect(r1.projects[0].runs[0].problems[0]).toMatch(/위치 줄 없음/);
    const noTiles = makeHost({ disks, script: () => ({ lines: ["시작 x 100"] }), capture: () => null });
    const r2 = await runSelftest(plan([{ id: "f", root: "/fx", runs: [{ mode: "process", check: "mapFrame", timeoutMs: 5000, mapCapture: capture }] }]), noTiles.host, noTiles.shell, fast);
    expect(r2.projects[0].runs[0].problems).toEqual(["capture: 맵 뷰에서 타일 추출 실패"]);
  });
});

describe("확장의 탐침과 확장의 실행 요청", () => {
  const MAP = "resources/maps/town.json";
  const mapText = JSON.stringify({ version: 2, name: "town", width: 8, height: 8, tileWidth: 16, tileHeight: 16, tilesets: [], layers: [{ name: "g", data: new Array(64).fill(0) }], collision: new Array(64).fill(0), objects: [] });
  const disks = { "/fx/town": { "game.json": "{}", "scripts/lua/main.lua": "--", [MAP]: mapText } };

  function probe(opts: { readyAfter?: number; refuse?: string } = {}) {
    let asked = 0;
    const requests: Array<Record<string, unknown>> = [];
    const p: MapSelftestProbe = {
      describe: (doc) => {
        asked++;
        return { ready: asked > (opts.readyAfter ?? 0), map: doc.path, count: 3 };
      },
      playRequest: (_doc, args) => {
        requests.push({ ...args });
        if (opts.refuse) return opts.refuse;
        return { label: "이 이벤트 앞에서 실행", plan: () => ({ env: { INITIAL2D_SCENE: "rpg", INITIAL2D_EXIT_AFTER: "999" }, at: { x: 3, y: 4 } }) };
      },
    };
    return { p, requests, asked: () => asked };
  }

  const probeRun = { mode: "process", check: "eventFront", timeoutMs: 5000, env: { SDL_VIDEODRIVER: "dummy", INITIAL2D_EXIT_AFTER: "60" }, play: { extension: "rpg", map: MAP, args: { event: "fishmonger" } } };

  it("probe 는 맵을 열고 describe 가 ready 일 때까지 다시 물어 마지막 결과를 적는다", async () => {
    const pr = probe({ readyAfter: 2 });
    const t = makeHost({ disks, probes: { rpg: pr.p } });
    const report = await runSelftest(plan([{ id: "town", root: "/fx/town", probe: { extension: "rpg", map: MAP }, runs: [RUN] }]), t.host, t.shell, fast);
    const p = report.projects[0];
    expect(p.probe).toMatchObject({ extension: "rpg", map: MAP, ready: true, result: { ready: true, map: MAP, count: 3 } });
    expect(pr.asked()).toBe(3);
    expect(p.problems).toEqual([]);
    expect(t.steps.map((s) => s.step)).toContain("probe");
  });

  it("끝내 ready 가 아니면 보이는 창에서만 실패다. 탐침이 없는 확장은 실패다", async () => {
    const shown = makeHost({ disks, probes: { rpg: probe({ readyAfter: 1e9 }).p } });
    const r1 = await runSelftest(plan([{ id: "town", root: "/fx/town", probe: { extension: "rpg", map: MAP }, runs: [RUN] }], { showWindow: true }), shown.host, shown.shell, fast);
    expect(r1.projects[0].probe?.ready).toBe(false);
    expect(r1.projects[0].problems).toEqual([`probe_not_ready: rpg ${MAP}`]);
    const hidden = makeHost({ disks, probes: { rpg: probe({ readyAfter: 1e9 }).p } });
    const r2 = await runSelftest(plan([{ id: "town", root: "/fx/town", probe: { extension: "rpg", map: MAP }, runs: [RUN] }]), hidden.host, hidden.shell, fast);
    expect(r2.projects[0].problems).toEqual([]);
    const none = makeHost({ disks });
    const r3 = await runSelftest(plan([{ id: "town", root: "/fx/town", probe: { extension: "rpg", map: MAP }, runs: [RUN] }]), none.host, none.shell, fast);
    expect(r3.projects[0].problems).toEqual(["error: 탐침 없음: 확장 rpg"]);
    expect(r3.ok).toBe(false);
  });

  it("play 는 탐침의 요청을 맵 실행 길로 띄운다: 계획의 mode 와 env 에 요청의 변수가 이긴다", async () => {
    const pr = probe();
    const t = makeHost({ disks, probes: { rpg: pr.p }, script: () => ({ lines: ["rpg:player:town,3,4,left"] }) });
    const report = await runSelftest(plan([{ id: "town", root: "/fx/town", runs: [probeRun] }]), t.host, t.shell, fast);
    const run = report.projects[0].runs[0];
    expect(run.problems).toEqual([]);
    expect(run.play).toEqual({ extension: "rpg", map: MAP, args: { event: "fishmonger" }, label: "이 이벤트 앞에서 실행", refused: null });
    expect(pr.requests).toEqual([{ event: "fishmonger" }]);
    expect(t.plays).toEqual([{ path: MAP, label: "이 이벤트 앞에서 실행", mode: "process", env: probeRun.env }]);
    expect(t.runner.starts).toEqual([{ mode: "process", env: { SDL_VIDEODRIVER: "dummy", INITIAL2D_EXIT_AFTER: "999", INITIAL2D_SCENE: "rpg" } }]);
    expect(t.logs.get("town-1.log")).toBe("rpg:player:town,3,4,left\n");
  });

  it("탐침이 요청을 만들지 못하면 러너를 시작하지 않고 이유를 적는다", async () => {
    const t = makeHost({ disks, probes: { rpg: probe({ refuse: "이 맵에 없는 이벤트: nobody" }).p } });
    const report = await runSelftest(plan([{ id: "town", root: "/fx/town", runs: [probeRun] }]), t.host, t.shell, fast);
    const run = report.projects[0].runs[0];
    expect(run.play?.refused).toBe("이 맵에 없는 이벤트: nobody");
    expect(run.problems).toEqual(expect.arrayContaining(["play_refused: 이 맵에 없는 이벤트: nobody", "start_failed"]));
    expect(t.runner.starts).toEqual([]);
    expect(report.ok).toBe(false);
  });
});

describe("언어 서버", () => {
  function server(states: string[], answers: { completion?: string[]; hover?: string; symbols?: string[] } = {}) {
    let i = 0;
    const calls: Array<[string, string, number, number]> = [];
    const s: SelftestLanguageServer & { calls: typeof calls } = {
      calls,
      get state() {
        const v = states[Math.min(i, states.length - 1)];
        i++;
        return v;
      },
      version: "3.19.1",
      reason: "",
      completion: async (path, line, character) => {
        calls.push(["completion", path, line, character]);
        return answers.completion ?? ["Load(path)", "Save(path, value)"];
      },
      hover: async (path, line, character) => {
        calls.push(["hover", path, line, character]);
        return answers.hover ?? "function Json.Load(path: string)\nJSON 파일을 읽는다";
      },
      symbols: async (path) => {
        calls.push(["symbols", path, 0, 0]);
        return answers.symbols ?? ["init", "update", "render", "destroy"];
      },
    };
    return s;
  }
  const LS_PROJECT = { id: "flappy-lua", template: "flappy", language: "lua", languageServer: true, runs: [RUN] };

  it("진입 스크립트를 연 뒤 서버가 뜨기를 기다려 \"Json.\" 뒤의 완성과 호버를 묻는다", async () => {
    const ls = server(["starting", "starting", "running"]);
    const t = makeHost({ script: () => ({ lines: flappyLines() }), languageServer: ls });
    const report = await runSelftest(plan([LS_PROJECT]), t.host, t.shell, fast);
    const p = report.projects[0];
    expect(p.problems).toEqual([]);
    expect(p.languageServer).toMatchObject({ state: "running", version: "3.19.1", at: { line: 1, character: 18 }, completion: ["Load(path)", "Save(path, value)"] });
    expect(ls.calls).toEqual([
      ["completion", "scripts/lua/main.lua", 1, 18],
      ["hover", "scripts/lua/main.lua", 1, 19],
    ]);
    expect(t.steps.map((x) => x.step)).toContain("language-server");
    expect(report.ok).toBe(true);
  });

  it("서버가 뜨지 않거나, 없거나, 답이 틀리면 실패로 적는다", async () => {
    const failed = makeHost({ script: () => ({ lines: flappyLines() }), languageServer: server(["starting", "failed"]) });
    const r1 = await runSelftest(plan([LS_PROJECT]), failed.host, failed.shell, fast);
    expect(r1.projects[0].problems[0]).toMatch(/^language_server_not_running: failed/);
    expect(r1.ok).toBe(false);

    const none = makeHost({ script: () => ({ lines: flappyLines() }), languageServer: null });
    const r2 = await runSelftest(plan([LS_PROJECT]), none.host, none.shell, fast);
    expect(r2.projects[0].problems[0]).toMatch(/^language_server_missing/);

    const wrong = makeHost({ script: () => ({ lines: flappyLines() }), languageServer: server(["running"], { completion: ["foo"], hover: "" }) });
    const r3 = await runSelftest(plan([LS_PROJECT]), wrong.host, wrong.shell, fast);
    expect(r3.projects[0].problems.map((x) => x.split(":")[0])).toEqual(["language_server_completion", "language_server_hover"]);

    const loading = server(["running"], { completion: [], hover: "Workspace loading: 0 / 0" });
    const r5 = await runSelftest(plan([LS_PROJECT]), makeHost({ script: () => ({ lines: flappyLines() }), languageServer: loading }).host, makeHost().shell, fast);
    expect(loading.calls.length).toBeGreaterThan(2);
    expect(r5.projects[0].problems.map((x) => x.split(":")[0])).toEqual(["language_server_completion", "language_server_hover"]);

    const slow = makeHost({ script: () => ({ lines: flappyLines() }), languageServer: server(["starting"]) });
    const r4 = await runSelftest(plan([LS_PROJECT]), slow.host, slow.shell, { ...fast, languageServerWaitMs: 20 });
    expect(r4.projects[0].problems[0]).toMatch(/^language_server_not_running: starting/);
  });

  it("서버가 작업 공간을 읽는 동안의 빈 답은 다시 묻는다", async () => {
    let n = 0;
    const ls = server(["running"]);
    const answers = ls.completion;
    // 작업 공간을 읽기 전에는 빈 목록, 그다음은 문서의 낱말 목록
    ls.completion = async (...a) => (++n === 1 ? [] : n === 2 ? ["scripts", "main", "game"] : answers(...a));
    const t = makeHost({ script: () => ({ lines: flappyLines() }), languageServer: ls });
    const report = await runSelftest(plan([LS_PROJECT]), t.host, t.shell, fast);
    expect(n).toBe(3);
    expect(report.projects[0].problems).toEqual([]);
  });

  it("Ruby 는 Ruby 서버에 진입 스크립트의 문서 기호를 묻는다", async () => {
    const ls = server(["starting", "running"]);
    const asked: string[] = [];
    const t = makeHost({ script: () => ({ lines: flappyLines() }), languageServer: ls });
    const host = { ...t.host, languageServer: (language: "lua" | "mruby") => (asked.push(language), ls) };
    const report = await runSelftest(plan([{ ...LS_PROJECT, id: "flappy-ruby", language: "mruby" }]), host, t.shell, fast);
    expect(asked).toEqual(["mruby"]);
    expect(report.projects[0].problems).toEqual([]);
    expect(report.projects[0].languageServer).toMatchObject({ state: "running", symbols: ["init", "update", "render", "destroy"], completion: [] });
    expect(ls.calls).toEqual([["symbols", "scripts/ruby/main.rb", 0, 0]]);

    const empty = server(["running"], { symbols: [] });
    const t2 = makeHost({ script: () => ({ lines: flappyLines() }), languageServer: empty });
    const r2 = await runSelftest(plan([{ ...LS_PROJECT, id: "flappy-ruby", language: "mruby" }]), t2.host, t2.shell, fast);
    expect(r2.projects[0].problems[0]).toMatch(/^language_server_symbols: scripts\/ruby\/main.rb 의 문서 기호에 update 가 없습니다/);
  });

  it("계획에 languageServer 가 없으면 묻지 않는다", async () => {
    const ls = server(["running"]);
    const t = makeHost({ script: () => ({ lines: flappyLines() }), languageServer: ls });
    const report = await runSelftest(plan([{ ...LS_PROJECT, languageServer: undefined }]), t.host, t.shell, fast);
    expect(report.projects[0].languageServer).toBeNull();
    expect(ls.calls).toEqual([]);
  });
});

describe("자가 검사 도우미", () => {
  it("엔진 러너와 같은 오류 줄 기준", () => {
    expect(errorLines(["libpng warning: iCCP: known incorrect sRGB profile", "Lua error in update", "mruby: uncaught exception", "scene: bad", "ok"])).toEqual(["Lua error in update", "mruby: uncaught exception", "scene: bad"]);
  });

  it("자리 줄은 옮긴 자리가 있으면 그것, 마지막 줄을 쓴다", () => {
    const re = "^알데바란: 시작 x (-?\\d+(?:\\.\\d+)?)(?: → (-?\\d+(?:\\.\\d+)?))?";
    expect(placementX(["알데바란: 시작 x 1200 (y 320)"], re)).toBe(1200);
    expect(placementX(["알데바란: 시작 x 1200 → 1210"], re)).toBe(1210);
    expect(placementX(["알데바란: 시작 x 10", "알데바란: 시작 x 20"], re)).toBe(20);
    expect(placementX(["없음"], re)).toBeNull();
  });

  it("카메라는 x 를 가운데에 두고 맵 안으로 자른다 (알데바란의 camX)", () => {
    const spec = { width: 384, height: 448 };
    expect(followCamera(1200, spec, 4096)).toEqual({ x: 1008, y: 0, width: 384, height: 448 });
    expect(followCamera(56, spec, 4096)).toEqual({ x: 0, y: 0, width: 384, height: 448 });
    expect(followCamera(4090, spec, 4096)).toEqual({ x: 3712, y: 0, width: 384, height: 448 });
    expect(followCamera(1200.5, spec, 4096).x).toBe(1008);
  });
});
