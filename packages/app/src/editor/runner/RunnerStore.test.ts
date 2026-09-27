import {
  BackendError,
  LogStore,
  type BackendCapabilities,
  type BackendKind,
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

/** 메모리 백엔드에 kind와 capabilities와 run만 바꿔 씌운 것 */
function delegating(mem: MemoryBackend, kind: BackendKind, capabilities: BackendCapabilities, onRun: (spec: RunSpec) => Promise<RunHandle>): ProjectBackend {
  return {
    kind,
    capabilities,
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

/** 메모리 백엔드에 Tauri 처럼 run 을 붙인 것 (kind 와 capabilities 만 다르다) */
function tauriLike(mem: MemoryBackend, onRun: (spec: RunSpec) => Promise<RunHandle>): ProjectBackend {
  return delegating(mem, "tauri", { run: true, pickFolder: true, watch: true, hmr: true }, onRun);
}

/** 브리지처럼: 엔진은 못 띄우고 밖의 엔진으로는 보낸다 (hmrPush는 mem.pushed에 남는다) */
function bridgeLike(mem: MemoryBackend): ProjectBackend {
  return delegating(mem, "bridge", { run: false, pickFolder: false, watch: true, hmr: true }, (spec) => mem.run(spec));
}

interface Harness {
  host: RunnerHost;
  mem: MemoryBackend;
  log: LogStore;
  toasts: string[];
  handles: FakeHandle[];
  probed: string[];
}

/** 기본은 Tauri처럼, tauri: false면 브리지처럼, memory면 메모리 백엔드 그대로 (메모리 모드와 웹판의 샘플) */
async function harness(opts: { files?: Record<string, string>; tauri?: boolean; memory?: boolean; enginePath?: string; open?: boolean } = {}): Promise<Harness> {
  const mem = new MemoryBackend({
    "game.json": '{ "windowWidth": 320, "windowHeight": 240, "renderScale": 1, "script": "lua" }',
    "scripts/lua/main.lua": "print('main')",
    ...(opts.files ?? {}),
  });
  const handles: FakeHandle[] = [];
  const backend = opts.memory
    ? mem
    : opts.tauri === false
      ? bridgeLike(mem)
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

/** 프로젝트가 가리키는 엔진을 묻는 모달에 늘 허용으로 답한다 (신뢰 규칙 자체는 RunnerStore.trust.test.ts) */
const trusting = { askTrust: async () => "allow" as const };

const flush = () => new Promise((r) => setTimeout(r, 0));
const logTexts = (log: LogStore) => log.entries.map((e) => `${e.level}/${e.source}: ${e.text}`);

describe("engineCandidates", () => {
  it("설정 > .initial-editor/engine > 프로젝트 build/ > 앱에 든 엔진 > 형제 폴더 순서이고 같은 경로는 한 번", () => {
    const list = engineCandidates({
      root: "/home/u/game",
      settingsPath: " /opt/engine/Initial2D ",
      projectFile: "# 주석\n../engines/Initial2D\n",
      platform: "mac",
      bundledPath: "/Applications/InitialEditor.app/Contents/MacOS/Initial2D",
    });
    expect(list).toEqual([
      { source: "settings", path: "/opt/engine/Initial2D", needsTrust: false },
      { source: "project-file", path: "/home/u/game/../engines/Initial2D", needsTrust: true },
      { source: "project-build", path: "/home/u/game/build/Initial2D", needsTrust: true },
      { source: "bundled", path: "/Applications/InitialEditor.app/Contents/MacOS/Initial2D", needsTrust: false },
      { source: "sibling", path: "/home/u/Initial2D/build/Initial2D", needsTrust: true },
    ]);
    const dup = engineCandidates({ root: "/home/u/game", settingsPath: "/home/u/game/build/Initial2D", projectFile: null, platform: "mac" });
    expect(dup.map((c) => c.source)).toEqual(["settings", "sibling"]);
    expect(dup[0].needsTrust).toBe(false);
  });

  it("앱에 든 엔진이 없으면(개발 빌드) 그 후보가 없다", () => {
    for (const bundledPath of [undefined, null, " "]) {
      const list = engineCandidates({ root: "/home/u/game", settingsPath: "", projectFile: null, platform: "mac", bundledPath });
      expect(list.map((c) => c.source)).toEqual(["project-build", "sibling"]);
    }
  });

  it("프로젝트가 앱에 든 엔진을 가리키면 그 자리의 후보가 앱에 든 엔진이다 (신뢰를 묻지 않고 시간 제한과 판도 그것의 것)", () => {
    const bundled = "/Applications/InitialEditor.app/Contents/MacOS/Initial2D";
    const list = engineCandidates({ root: "/home/u/game", settingsPath: "", projectFile: bundled, platform: "mac", bundledPath: bundled });
    expect(list).toEqual([
      { source: "bundled", path: bundled, needsTrust: false },
      { source: "project-build", path: "/home/u/game/build/Initial2D", needsTrust: true },
      { source: "sibling", path: "/home/u/Initial2D/build/Initial2D", needsTrust: true },
    ]);
    // 설정이 번들 안 경로를 적어도 같다
    const fromSettings = engineCandidates({ root: "/home/u/game", settingsPath: bundled, projectFile: null, platform: "mac", bundledPath: bundled });
    expect(fromSettings.map((c) => [c.source, c.path])).toEqual([
      ["bundled", bundled],
      ["project-build", "/home/u/game/build/Initial2D"],
      ["sibling", "/home/u/Initial2D/build/Initial2D"],
    ]);
    // Windows 는 구분자와 대소문자가 달라도 같은 파일이다
    const winBundled = "C:\\Users\\u\\AppData\\Local\\InitialEditor\\Initial2D.exe";
    const win = engineCandidates({ root: "C:\\Users\\u\\game", settingsPath: "", projectFile: "c:/users/u/appdata/local/initialeditor/initial2d.exe", platform: "win", bundledPath: winBundled });
    expect(win.map((c) => [c.source, c.path, c.needsTrust])).toEqual([
      ["bundled", winBundled, false],
      ["project-build", "C:\\Users\\u\\game\\build\\Initial2D.exe", true],
      ["sibling", "C:\\Users\\u\\Initial2D\\build\\Initial2D.exe", true],
    ]);
    // macOS 와 Linux 는 대소문자를 가린다 (다른 파일로 보고 신뢰를 묻는다)
    const upper = engineCandidates({ root: "/home/u/game", settingsPath: "", projectFile: bundled.toUpperCase(), platform: "linux", bundledPath: bundled });
    expect(upper.map((c) => c.source)).toEqual(["project-file", "project-build", "bundled", "sibling"]);
  });

  it("Windows 는 역슬래시와 .exe", () => {
    const list = engineCandidates({
      root: "C:\\Users\\u\\game",
      settingsPath: "",
      projectFile: "D:\\engine\\Initial2D.exe",
      platform: "win",
      bundledPath: "C:\\Users\\u\\AppData\\Local\\InitialEditor\\Initial2D.exe",
    });
    expect(list.map((c) => c.path)).toEqual([
      "D:\\engine\\Initial2D.exe",
      "C:\\Users\\u\\game\\build\\Initial2D.exe",
      "C:\\Users\\u\\AppData\\Local\\InitialEditor\\Initial2D.exe",
      "C:\\Users\\u\\Initial2D\\build\\Initial2D.exe",
    ]);
    expect(list.map((c) => c.needsTrust)).toEqual([true, true, false, true]);
  });

  it("Linux 의 AppImage 는 마운트 경로 안의 사이드카다", () => {
    const list = engineCandidates({ root: "/home/u/game", settingsPath: "", projectFile: null, platform: "linux", bundledPath: "/tmp/.mount_InitiaXYZ/usr/bin/Initial2D" });
    expect(list.map((c) => [c.source, c.path])).toEqual([
      ["project-build", "/home/u/game/build/Initial2D"],
      ["bundled", "/tmp/.mount_InitiaXYZ/usr/bin/Initial2D"],
      ["sibling", "/home/u/Initial2D/build/Initial2D"],
    ]);
  });

  it("루트 바로 아래 프로젝트의 형제는 루트 아래다", () => {
    const list = engineCandidates({ root: "/game", settingsPath: "", projectFile: null, platform: "linux" });
    expect(list.map((c) => c.path)).toEqual(["/game/build/Initial2D", "/Initial2D/build/Initial2D"]);
  });
});

describe("RunnerStore 엔진 탐색", () => {
  it("설정의 경로가 있으면 그것부터 찔러 보고 처음 응답하는 것을 쓴다", async () => {
    const h = await harness({ enginePath: "/opt/engine/Initial2D", files: { ".initial-editor/engine": "/proj/engines/Initial2D\n" } });
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { "/opt/engine/Initial2D": ["lua", "mruby"] }) });
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
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { "/home/u/Initial2D/build/Initial2D": ["lua"] }) });
    await runner.resolveEngine();
    expect(h.probed).toEqual(["/proj/engines/Initial2D", "/home/u/game/build/Initial2D", "/home/u/Initial2D/build/Initial2D"]);
    expect(runner.enginePath).toBe("/home/u/Initial2D/build/Initial2D");
    expect(runner.engineSource).toBe("sibling");
  });

  it(".initial-editor/engine 의 상대 경로는 프로젝트 루트 기준이다", async () => {
    const h = await harness({ files: { ".initial-editor/engine": "tools/Initial2D" } });
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { "/home/u/game/tools/Initial2D": ["lua"] }) });
    await runner.resolveEngine();
    expect(runner.enginePath).toBe("/home/u/game/tools/Initial2D");
    expect(runner.engineSource).toBe("project-file");
  });

  it("아무것도 없으면 찾아본 곳을 힌트와 콘솔에 남기고 실행 버튼은 꺼진다", async () => {
    const h = await harness();
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, {}) });
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
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, {}) });
    expect(runner.startHint).toBe("프로젝트를 먼저 연다");
    expect(runner.canReload).toBe(false);
  });
});

describe("RunnerStore 실행", () => {
  const ENGINE = "/home/u/Initial2D/build/Initial2D";

  it("프로젝트 루트를 작업 폴더로, INITIAL2D_HMR=1 과 언어를 환경 변수로 띄우고 출력을 콘솔에 흘린다", async () => {
    let t = 1_000_000;
    const h = await harness();
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { [ENGINE]: ["lua", "mruby"] }), now: () => t });
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
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { [ENGINE]: ["lua", "mruby"] }) });
    await runner.start({ scene: "title" });
    expect(h.handles[0].spec.env).toEqual({ INITIAL2D_HMR: "1", INITIAL2D_SCRIPT: "mruby", INITIAL2D_SCENE: "title" });
    runner.dispose();
  });

  it("env 를 주면 기본 변수 뒤에 덧씌우고, 다시 시작해도 같은 변수로 띄운다", async () => {
    const h = await harness();
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { [ENGINE]: ["lua"] }) });
    await runner.start({ env: { INITIAL2D_SCENE: "aldebaran", INITIAL2D_ALDEBARAN_AT: "320", INITIAL2D_HMR: "0" } });
    expect(h.handles[0].spec.env).toEqual({ INITIAL2D_HMR: "0", INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "aldebaran", INITIAL2D_ALDEBARAN_AT: "320" });
    expect(logTexts(h.log).some((l) => l.includes("INITIAL2D_ALDEBARAN_AT=320"))).toBe(true);
    await runner.restart();
    expect(h.handles[1].spec.env).toEqual(h.handles[0].spec.env);
    runner.dispose();
  });

  it("watch 를 주면 줄마다 넘기고, 멈출 이유가 오면 콘솔과 알림에 남기고 멈춘다 (한 번만). 그 실행의 exit 는 부르지 않는다", async () => {
    const h = await harness();
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { [ENGINE]: ["lua"] }) });
    const seen: string[] = [];
    const exits: Array<number | null> = [];
    let made = 0;
    const watch = () => {
      made++;
      return {
        line: (text: string) => {
          seen.push(text);
          return text === "again" ? "게임이 처음부터 다시 시작해서 멈췄다" : undefined;
        },
        exit: (code: number | null) => {
          exits.push(code);
          return "불리면 안 된다";
        },
      };
    };
    await runner.start({ env: { A: "1" }, watch });
    const handle = h.handles[0];
    handle.emit("rpg:map:port_town");
    handle.emit("again");
    handle.emit("again");
    await flush();
    await flush();
    expect(seen).toEqual(["rpg:map:port_town", "again"]);
    expect(handle.stopped).toBe(1);
    expect(runner.state).toBe("idle");
    expect(logTexts(h.log)).toContainEqual("warn/runner: 게임이 처음부터 다시 시작해서 멈췄다");
    expect(h.toasts).toContainEqual("warn: 게임이 처음부터 다시 시작해서 멈췄다");
    expect(exits).toEqual([]);
    // 다시 시작하면 새로 만든다
    await runner.restart();
    expect(made).toBe(2);
    runner.dispose();
  });

  it("스스로 끝난 실행은 watch 의 exit 가 알린 실패를 오류 줄과 알림으로 남긴다. 핫 리로드는 restarted 를 먼저 부른다", async () => {
    const h = await harness();
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { [ENGINE]: ["lua"] }) });
    const calls: string[] = [];
    await runner.start({
      watch: () => ({
        line: () => undefined,
        exit: (code) => (code === 0 ? "이벤트 kid 가 돌지 않았다" : undefined),
        restarted: () => void calls.push("restarted"),
      }),
    });
    await runner.reload();
    expect(calls).toEqual(["restarted"]);
    h.handles[0].exit(0);
    expect(logTexts(h.log)).toContainEqual("error/runner: 이벤트 kid 가 돌지 않았다");
    expect(h.toasts).toContainEqual("warn: 이벤트 kid 가 돌지 않았다");
    // watch 없는 실행은 그대로다
    await runner.start();
    h.handles[1].exit(0);
    expect(logTexts(h.log).filter((l) => l.includes("돌지 않았다"))).toHaveLength(1);
    runner.dispose();
  });

  it("mruby 프로젝트인데 빌드에 mruby 가 없으면 띄우지 않고 알린다", async () => {
    const h = await harness({ files: { "game.json": '{ "script": "mruby" }' } });
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { [ENGINE]: ["lua"] }) });
    await runner.resolveEngine();
    expect(runner.canRun).toBe(false);
    expect(runner.startHint).toBe(NO_MRUBY);
    await runner.start();
    expect(h.handles).toHaveLength(0);
    expect(runner.state).toBe("idle");
    expect(h.toasts).toContainEqual(`error: ${NO_MRUBY}`);
    expect(logTexts(h.log).some((l) => l.startsWith(`error/runner: ${NO_MRUBY}`))).toBe(true);
  });

  it("언어 검사는 덧씌운 INITIAL2D_SCRIPT 로 한다: mruby 프로젝트라도 lua 로 덮은 실행은 mruby 없는 빌드로 띄운다", async () => {
    const h = await harness({ files: { "game.json": '{ "script": "mruby" }' } });
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { [ENGINE]: ["lua"] }) });
    await runner.start({ env: { INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "rpg" } });
    expect(h.toasts).toEqual([]);
    expect(h.handles).toHaveLength(1);
    expect(h.handles[0].spec.env).toEqual({ INITIAL2D_HMR: "1", INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "rpg" });
    expect(logTexts(h.log)).toContainEqual(`info/runner: 엔진 시작: PID 4321, ${ENGINE}, 언어 lua (INITIAL2D_HMR=1, INITIAL2D_SCRIPT=lua INITIAL2D_SCENE=rpg)`);
    await runner.stop();
    // 덮지 않은 실행은 여전히 막고, lua 프로젝트를 mruby 로 덮은 실행도 막는다
    await runner.start();
    await runner.start({ env: { INITIAL2D_SCRIPT: "mruby" } });
    const lua = await harness();
    const other = new RunnerStore(lua.host, { ...trusting, probe: probeFor(lua, { [ENGINE]: ["lua"] }) });
    await other.start({ env: { INITIAL2D_SCRIPT: "mruby" } });
    expect(h.handles).toHaveLength(1);
    expect(lua.handles).toHaveLength(0);
    expect(h.toasts.filter((t) => t.startsWith(`error: ${NO_MRUBY}`))).toHaveLength(2);
    expect(lua.toasts).toEqual([`error: ${NO_MRUBY}`]);
  });

  it("실행 중에 다시 start 하면 먼저 것을 정지하고 새로 띄운다", async () => {
    const h = await harness();
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { [ENGINE]: ["lua"] }) });
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
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { [ENGINE]: ["lua"] }), stopTimeoutMs: 10 });
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
    const runner = new RunnerStore(h.host, { ...trusting, probe });
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
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { [ENGINE]: ["lua"] }) });
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
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, {}) });
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

  it("메모리 백엔드(메모리 모드, 웹판의 샘플)는 kind가 브리지와 같아도 밖으로 보내지 않고 수동 리로드를 꺼 둔다", async () => {
    const h = await harness({ memory: true });
    expect(h.host.backend.kind).toBe("bridge");
    const runner = new RunnerStore(h.host);
    expect(runner.canPush).toBe(false);
    expect(runner.canReload).toBe(false);
    expect(runner.reloadHint).toBe("게임 탭에서 실행 중일 때 다시 읽는다");
    expect(await runner.reload()).toBeNull();
    expect(await runner.reload(["scripts/lua/main.lua"], { fromSave: true })).toBeNull();
    expect(h.mem.pushed).toEqual([]);
    expect(logTexts(h.log).filter((l) => l.includes("핫 리로드"))).toEqual([]);
    expect(h.toasts).toEqual([]);
  });

  it("Tauri 에서 보낼 파일이 없으면 보내지 않는다", async () => {
    const h = await harness();
    await h.mem.remove("scripts");
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, {}) });
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
    const runner = new RunnerStore(h.host, { ...trusting, probe: probeFor(h, { "/home/u/Initial2D/build/Initial2D": ["lua"] }) });
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
