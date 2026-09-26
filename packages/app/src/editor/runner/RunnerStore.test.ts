import {
  BackendError,
  LogStore,
  MemorySettingsStorage,
  Project,
  SettingsStore,
  type OutputStream,
  type ProjectBackend,
  type RunHandle,
  type RunSpec,
} from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { describe, expect, it } from "vitest";
import { engineCandidates } from "./engineCandidates";
import { formatElapsed, NO_MRUBY, RunnerStore, type RunnerHost } from "./RunnerStore";

// 가짜 엔진 프로세스: 테스트가 출력과 종료를 직접 넣는다
class FakeHandle implements RunHandle {
  id = 1;
  pid = 4321;
  stopped = 0;
  private outputs = new Set<(line: string, stream: OutputStream) => void>();
  private exits = new Set<(code: number | null) => void>();
  constructor(readonly spec: RunSpec) {}
  onOutput(cb: (line: string, stream: OutputStream) => void) {
    this.outputs.add(cb);
    return () => void this.outputs.delete(cb);
  }
  onExit(cb: (code: number | null) => void) {
    this.exits.add(cb);
    return () => void this.exits.delete(cb);
  }
  async stop() {
    this.stopped++;
    // 백엔드가 SIGTERM 을 보내면 곧 종료 이벤트가 따라온다
    queueMicrotask(() => this.exit(null));
  }
  emit(line: string, stream: OutputStream = "stdout") {
    for (const cb of this.outputs) cb(line, stream);
  }
  exit(code: number | null) {
    for (const cb of this.exits) cb(code);
  }
}

/** 메모리 백엔드에 Tauri 처럼 run 을 붙인 것 (kind 와 capabilities 만 다르다) */
function tauriLike(mem: MemoryBackend, onRun: (spec: RunSpec) => Promise<RunHandle>): ProjectBackend {
  return {
    kind: "tauri",
    capabilities: { run: true, pickFolder: true, watch: true },
    open: (root) => mem.open(root),
    list: (rel) => mem.list(rel),
    readText: (rel) => mem.readText(rel),
    readBinary: (rel) => mem.readBinary(rel),
    writeText: (rel, text) => mem.writeText(rel, text),
    writeBinary: (rel, data) => mem.writeBinary(rel, data),
    mkdir: (rel) => mem.mkdir(rel),
    remove: (rel) => mem.remove(rel),
    rename: (a, b) => mem.rename(a, b),
    exists: (rel) => mem.exists(rel),
    watch: (h) => mem.watch(h),
    hmrPush: (files, target) => mem.hmrPush(files, target),
    run: onRun,
    pickFolder: () => mem.pickFolder(),
    close: () => mem.close(),
  };
}

interface Harness {
  host: RunnerHost;
  mem: MemoryBackend;
  log: LogStore;
  toasts: string[];
  handles: FakeHandle[];
  probed: string[];
}

async function harness(opts: { files?: Record<string, string>; tauri?: boolean; enginePath?: string; open?: boolean } = {}): Promise<Harness> {
  const mem = new MemoryBackend({
    "game.json": '{ "windowWidth": 320, "windowHeight": 240, "renderScale": 1, "script": "lua" }',
    "scripts/lua/main.lua": "print('main')",
    ...(opts.files ?? {}),
  });
  const handles: FakeHandle[] = [];
  const backend = opts.tauri === false
    ? mem
    : tauriLike(mem, async (spec) => {
        const h = new FakeHandle(spec);
        handles.push(h);
        return h;
      });
  const project = new Project(backend);
  const settings = new SettingsStore(new MemorySettingsStorage());
  if (opts.enginePath !== undefined) settings.update({ enginePath: opts.enginePath }, false);
  const log = new LogStore();
  const toasts: string[] = [];
  const toast = (level: string) => (text: string) => void toasts.push(`${level}: ${text}`);
  const host: RunnerHost = { backend, project, settings, log, platform: "mac", toasts: { info: toast("info"), success: toast("success"), warn: toast("warn"), error: toast("error") } };
  if (opts.open !== false) await project.open("/home/u/game");
  return { host, mem, log, toasts, handles, probed: [] };
}

/** 주어진 경로만 응답하는 probe. 부른 순서를 기록한다 */
function probeFor(h: Harness, available: Record<string, string[]>) {
  return async (exe: string) => {
    h.probed.push(exe);
    const features = available[exe];
    if (!features) throw new BackendError(`엔진 실행 파일이 없다: ${exe}`, "engine_not_found", exe);
    return features;
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const logTexts = (log: LogStore) => log.entries.map((e) => `${e.level}/${e.source}: ${e.text}`);

describe("engineCandidates", () => {
  it("설정 > .initial-editor/engine > 프로젝트 build/ > 형제 폴더 순서이고 같은 경로는 한 번", () => {
    const list = engineCandidates({ root: "/home/u/game", settingsPath: " /opt/engine/Initial2D ", projectFile: "# 주석\n../engines/Initial2D\n", platform: "mac" });
    expect(list).toEqual([
      { source: "settings", path: "/opt/engine/Initial2D" },
      { source: "project-file", path: "/home/u/game/../engines/Initial2D" },
      { source: "project-build", path: "/home/u/game/build/Initial2D" },
      { source: "sibling", path: "/home/u/Initial2D/build/Initial2D" },
    ]);
    const dup = engineCandidates({ root: "/home/u/game", settingsPath: "/home/u/game/build/Initial2D", projectFile: null, platform: "mac" });
    expect(dup.map((c) => c.source)).toEqual(["settings", "sibling"]);
  });

  it("Windows 는 역슬래시와 .exe", () => {
    const list = engineCandidates({ root: "C:\\Users\\u\\game", settingsPath: "", projectFile: "D:\\engine\\Initial2D.exe", platform: "win" });
    expect(list.map((c) => c.path)).toEqual(["D:\\engine\\Initial2D.exe", "C:\\Users\\u\\game\\build\\Initial2D.exe", "C:\\Users\\u\\Initial2D\\build\\Initial2D.exe"]);
  });

  it("루트 바로 아래 프로젝트의 형제는 루트 아래다", () => {
    const list = engineCandidates({ root: "/game", settingsPath: "", projectFile: null, platform: "linux" });
    expect(list.map((c) => c.path)).toEqual(["/game/build/Initial2D", "/Initial2D/build/Initial2D"]);
  });
});

describe("RunnerStore 엔진 탐색", () => {
  it("설정의 경로가 있으면 그것부터 찔러 보고 처음 응답하는 것을 쓴다", async () => {
    const h = await harness({ enginePath: "/opt/engine/Initial2D", files: { ".initial-editor/engine": "/proj/engines/Initial2D\n" } });
    const runner = new RunnerStore(h.host, { probe: probeFor(h, { "/opt/engine/Initial2D": ["lua", "mruby"] }) });
    expect(await runner.resolveEngine()).toBe("/opt/engine/Initial2D");
    expect(h.probed).toEqual(["/opt/engine/Initial2D"]);
    expect(runner.engineSource).toBe("settings");
    expect(runner.features).toEqual(["lua", "mruby"]);
    expect(runner.canRun).toBe(true);
    expect(runner.statusText).toBe("엔진: 대기");
    expect(logTexts(h.log)).toContainEqual("info/runner: 엔진: /opt/engine/Initial2D (설정의 엔진 경로, 기능: lua mruby)");
  });

  it("설정이 비면 .initial-editor/engine, 그다음 build/, 그다음 형제 폴더 순서로", async () => {
    const h = await harness({ files: { ".initial-editor/engine": "/proj/engines/Initial2D\n" } });
    const runner = new RunnerStore(h.host, { probe: probeFor(h, { "/home/u/Initial2D/build/Initial2D": ["lua"] }) });
    await runner.resolveEngine();
    expect(h.probed).toEqual(["/proj/engines/Initial2D", "/home/u/game/build/Initial2D", "/home/u/Initial2D/build/Initial2D"]);
    expect(runner.enginePath).toBe("/home/u/Initial2D/build/Initial2D");
    expect(runner.engineSource).toBe("sibling");
  });

  it(".initial-editor/engine 의 상대 경로는 프로젝트 루트 기준이다", async () => {
    const h = await harness({ files: { ".initial-editor/engine": "tools/Initial2D" } });
    const runner = new RunnerStore(h.host, { probe: probeFor(h, { "/home/u/game/tools/Initial2D": ["lua"] }) });
    await runner.resolveEngine();
    expect(runner.enginePath).toBe("/home/u/game/tools/Initial2D");
    expect(runner.engineSource).toBe("project-file");
  });

  it("아무것도 없으면 찾아본 곳을 힌트와 콘솔에 남기고 실행 버튼은 꺼진다", async () => {
    const h = await harness();
    const runner = new RunnerStore(h.host, { probe: probeFor(h, {}) });
    await runner.resolveEngine();
    expect(runner.enginePath).toBeNull();
    expect(runner.engineSource).toBe("none");
    expect(runner.canRun).toBe(false);
    expect(runner.startHint).toContain("찾아본 곳: /home/u/game/build/Initial2D, /home/u/Initial2D/build/Initial2D");
    expect(runner.statusText).toBe("엔진: 없음");
    expect(logTexts(h.log).some((t) => t.startsWith("warn/runner: 엔진을 찾지 못했다"))).toBe(true);
  });

  it("브라우저 모드는 이유를 들고 있고 찾지 않는다", async () => {
    const h = await harness({ tauri: false });
    const runner = new RunnerStore(h.host, { unavailableReason: "브라우저 모드에서는 엔진을 띄울 수 없다" });
    expect(await runner.resolveEngine()).toBeNull();
    expect(runner.unavailableReason).toBe("브라우저 모드에서는 엔진을 띄울 수 없다");
    expect(runner.startHint).toBe("브라우저 모드에서는 엔진을 띄울 수 없다");
    expect(runner.canRun).toBe(false);
    expect(runner.statusText).toBe("엔진: 없음");
    expect(runner.statusTitle).toBe("브라우저 모드에서는 엔진을 띄울 수 없다");
    // 브리지 모드의 리로드는 프로젝트만 열려 있으면 된다
    expect(runner.canReload).toBe(true);
  });

  it("프로젝트가 닫혀 있으면 실행도 리로드도 안 된다", async () => {
    const h = await harness({ open: false });
    const runner = new RunnerStore(h.host, { probe: probeFor(h, {}) });
    expect(runner.startHint).toBe("프로젝트를 먼저 연다");
    expect(runner.canReload).toBe(false);
  });
});

describe("RunnerStore 실행", () => {
  const ENGINE = "/home/u/Initial2D/build/Initial2D";

  it("프로젝트 루트를 작업 폴더로, INITIAL2D_HMR=1 과 언어를 환경 변수로 띄우고 출력을 콘솔에 흘린다", async () => {
    let t = 1_000_000;
    const h = await harness();
    const runner = new RunnerStore(h.host, { probe: probeFor(h, { [ENGINE]: ["lua", "mruby"] }), now: () => t });
    await runner.start();
    expect(h.handles).toHaveLength(1);
    const handle = h.handles[0];
    expect(handle.spec).toEqual({ exe: ENGINE, cwd: "/home/u/game", env: { INITIAL2D_HMR: "1", INITIAL2D_SCRIPT: "lua" }, args: [] });
    expect(runner.state).toBe("running");
    expect(runner.pid).toBe(4321);
    expect(runner.isRunning).toBe(true);
    expect(runner.canReload).toBe(true);
    t += 42_000;
    runner.tick();
    expect(runner.elapsedText).toBe("00:42");
    expect(runner.statusText).toBe("엔진: 실행 중 PID 4321 00:42");

    handle.emit("HotReload: listening on 127.0.0.1:5959 (tools/hmr_push.py)", "stderr");
    handle.emit("PANIC: unprotected error in call to Lua API (./scripts/lua/main.lua:3: attempt to index a nil value (local 't'))", "stderr");
    handle.emit("SetAppIcon: cannot load ./resources/icons/icon.png (Couldn't open ./resources/icons/icon.png: No such file or directory)", "stderr");
    const engineLines = h.log.entries.filter((e) => e.source === "engine").map((e) => e.level);
    expect(engineLines).toEqual(["info", "error", "warn"]);

    handle.exit(134);
    expect(runner.state).toBe("idle");
    expect(runner.exitCode).toBe(134);
    expect(runner.pid).toBeNull();
    expect(runner.statusText).toBe("엔진: 종료 코드 134");
    expect(h.toasts).toContainEqual("error: 엔진이 종료 코드 134 로 끝났다. 콘솔을 본다");
    expect(logTexts(h.log).some((l) => l.startsWith("error/runner: 엔진 종료 코드 134"))).toBe(true);
    runner.dispose();
  });

  it("씬을 주면 INITIAL2D_SCENE 을 더하고 mruby 프로젝트는 INITIAL2D_SCRIPT=mruby", async () => {
    const h = await harness({ files: { "game.json": '{ "script": "mruby" }' } });
    const runner = new RunnerStore(h.host, { probe: probeFor(h, { [ENGINE]: ["lua", "mruby"] }) });
    await runner.start({ scene: "title" });
    expect(h.handles[0].spec.env).toEqual({ INITIAL2D_HMR: "1", INITIAL2D_SCRIPT: "mruby", INITIAL2D_SCENE: "title" });
    runner.dispose();
  });

  it("env 를 주면 기본 변수 뒤에 덧씌우고, 다시 시작해도 같은 변수로 띄운다", async () => {
    const h = await harness();
    const runner = new RunnerStore(h.host, { probe: probeFor(h, { [ENGINE]: ["lua"] }) });
    await runner.start({ env: { INITIAL2D_SCENE: "aldebaran", INITIAL2D_ALDEBARAN_AT: "320", INITIAL2D_HMR: "0" } });
    expect(h.handles[0].spec.env).toEqual({ INITIAL2D_HMR: "0", INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "aldebaran", INITIAL2D_ALDEBARAN_AT: "320" });
    expect(logTexts(h.log).some((l) => l.includes("INITIAL2D_ALDEBARAN_AT=320"))).toBe(true);
    await runner.restart();
    expect(h.handles[1].spec.env).toEqual(h.handles[0].spec.env);
    runner.dispose();
  });

  it("mruby 프로젝트인데 빌드에 mruby 가 없으면 띄우지 않고 알린다", async () => {
    const h = await harness({ files: { "game.json": '{ "script": "mruby" }' } });
    const runner = new RunnerStore(h.host, { probe: probeFor(h, { [ENGINE]: ["lua"] }) });
    await runner.resolveEngine();
    expect(runner.canRun).toBe(false);
    expect(runner.startHint).toBe(NO_MRUBY);
    await runner.start();
    expect(h.handles).toHaveLength(0);
    expect(runner.state).toBe("idle");
    expect(h.toasts).toContainEqual(`error: ${NO_MRUBY}`);
    expect(logTexts(h.log).some((l) => l.startsWith(`error/runner: ${NO_MRUBY}`))).toBe(true);
  });

  it("실행 중에 다시 start 하면 먼저 것을 정지하고 새로 띄운다", async () => {
    const h = await harness();
    const runner = new RunnerStore(h.host, { probe: probeFor(h, { [ENGINE]: ["lua"] }) });
    await runner.start();
    const first = h.handles[0];
    await runner.start();
    expect(first.stopped).toBe(1);
    expect(h.handles).toHaveLength(2);
    expect(runner.handle).toBe(h.handles[1]);
    expect(runner.state).toBe("running");
    // 먼저 것의 늦은 종료 이벤트는 무시한다
    first.exit(0);
    expect(runner.state).toBe("running");
    await runner.stop();
    expect(runner.state).toBe("idle");
    expect(runner.exitCode).toBeNull();
    expect(runner.statusText).toBe("엔진: 대기");
    runner.dispose();
  });

  it("정지 뒤 종료 이벤트가 오지 않으면 시간 제한 뒤 상태를 정리한다", async () => {
    const h = await harness();
    const runner = new RunnerStore(h.host, { probe: probeFor(h, { [ENGINE]: ["lua"] }), stopTimeoutMs: 10 });
    await runner.start();
    const handle = h.handles[0];
    handle.stop = async () => {
      handle.stopped++;
    };
    await runner.stop();
    expect(handle.stopped).toBe(1);
    expect(runner.state).toBe("idle");
    expect(logTexts(h.log)).toContainEqual("warn/runner: 종료 이벤트가 오지 않아 상태를 정리한다");
    runner.dispose();
  });

  it("엔진 실행 파일이 사라졌으면 엔진 정보를 지우고 알린다", async () => {
    const h = await harness();
    const probe = probeFor(h, { [ENGINE]: ["lua"] });
    const runner = new RunnerStore(h.host, { probe });
    await runner.resolveEngine();
    h.host.backend.run = async () => {
      throw new BackendError("엔진 실행 파일이 없다", "engine_not_found", ENGINE);
    };
    await runner.start();
    expect(runner.state).toBe("idle");
    expect(runner.enginePath).toBeNull();
    expect(h.toasts).toContainEqual(`error: 엔진 실행 파일이 없다: ${ENGINE}`);
  });

  it("프로젝트를 닫으면 실행 중인 엔진을 정지한다", async () => {
    const h = await harness();
    const runner = new RunnerStore(h.host, { probe: probeFor(h, { [ENGINE]: ["lua"] }) });
    await runner.start();
    await runner.onProjectClosed();
    expect(h.handles[0].stopped).toBe(1);
    expect(runner.state).toBe("idle");
    expect(runner.enginePath).toBeNull();
    runner.dispose();
  });
});

describe("RunnerStore 핫 리로드", () => {
  it("Tauri 는 묶음을 모아 보낸다 (.lua .rb 와 씬 json)", async () => {
    const h = await harness({ files: { "scripts/ruby/main.rb": "puts 1", "resources/scenes/title.json": "{}", "resources/images/a.png": "x" } });
    const runner = new RunnerStore(h.host, { probe: probeFor(h, {}) });
    const result = await runner.reload();
    expect(result).toEqual({ count: 3 });
    expect(h.mem.pushed[0].map((f) => f.path)).toEqual(["resources/scenes/title.json", "scripts/lua/main.lua", "scripts/ruby/main.rb"]);
    expect(runner.lastReload?.count).toBe(3);
    expect(logTexts(h.log).some((l) => l.startsWith("info/runner: 핫 리로드: 3개 파일을 보냈다"))).toBe(true);
  });

  it("브리지는 빈 목록을 보낸다 (서버가 모은다)", async () => {
    const h = await harness({ tauri: false });
    const runner = new RunnerStore(h.host);
    await runner.reload();
    expect(h.mem.pushed).toEqual([[]]);
  });

  it("엔진이 안 떠 있으면 INITIAL2D_HMR=1 안내를 남긴다", async () => {
    const h = await harness({ tauri: false });
    h.host.backend.hmrPush = async () => {
      throw new BackendError("connection refused", "hmr_unreachable");
    };
    const runner = new RunnerStore(h.host);
    expect(await runner.reload()).toBeNull();
    expect(h.toasts).toContainEqual("error: 핫 리로드 실패: 게임이 INITIAL2D_HMR=1 로 실행 중인지 확인 (connection refused)");
  });

  it("Tauri 에서 보낼 파일이 없으면 보내지 않는다", async () => {
    const h = await harness();
    await h.mem.remove("scripts");
    const runner = new RunnerStore(h.host, { probe: probeFor(h, {}) });
    expect(await runner.reload()).toBeNull();
    expect(h.mem.pushed).toEqual([]);
    expect(logTexts(h.log)).toContainEqual("warn/runner: 보낼 스크립트가 없다 (scripts/ 아래의 .lua 와 .rb)");
  });
});

describe("formatElapsed", () => {
  it("분:초, 한 시간 넘으면 시:분:초", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(42_000)).toBe("00:42");
    expect(formatElapsed(3_723_000)).toBe("01:02:03");
    expect(formatElapsed(-5)).toBe("00:00");
  });
});

// 종료 이벤트가 microtask 로 오는 경우도 상태가 정리되는지 (FakeHandle.stop 의 경로)
describe("RunnerStore 정지", () => {
  it("stop 은 종료 이벤트를 기다린다", async () => {
    const h = await harness();
    const runner = new RunnerStore(h.host, { probe: probeFor(h, { "/home/u/Initial2D/build/Initial2D": ["lua"] }) });
    await runner.start();
    const stopping = runner.stop();
    expect(runner.state).toBe("stopping");
    expect(runner.startHint).toBe("정지하는 중이다");
    await stopping;
    await flush();
    expect(runner.state).toBe("idle");
    expect(logTexts(h.log).some((l) => l.startsWith("info/runner: 엔진 정지"))).toBe(true);
    runner.dispose();
  });
});
