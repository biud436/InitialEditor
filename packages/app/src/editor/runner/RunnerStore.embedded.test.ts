// 실행 방식 나누기 (E4): 에디터 안 실행(가짜 EmbeddedEngine)과 프로세스 실행을 RunnerStore 가 고르는가.
// 엔진이 던진 값(WebAssembly.Exception 처럼 message 가 없는 것)이 콘솔과 토스트에 "undefined" 로 나오지 않는가.
// 밖의 엔진으로 보낼지는 백엔드의 capabilities.hmr이 정하고(메모리 백엔드는 늘 false), 뜨는 중의 리로드는 첫 프레임 뒤에 올린다.

import { BackendError, LogStore, MemorySettingsStorage, Project, SettingsStore, type OutputStream, type ProjectBackend, type RunHandle, type RunSpec } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { describe, expect, it, vi } from "vitest";
import {
  browserRunNotice,
  EMBEDDED_HINT,
  ENDED_RELOAD_DROPPED,
  HMR_NO_ENGINE_SKIPPED,
  RunnerStore,
  START_ENDED_RELOAD_DROPPED,
  WASM_NO_MRUBY,
  type EmbeddedEngine,
  type RunnerHost,
} from "./RunnerStore";

class FakeHandle implements RunHandle {
  id = 1;
  pid?: number;
  stopped = 0;
  private outputs = new Set<(line: string, stream: OutputStream) => void>();
  private exits = new Set<(code: number | null) => void>();
  constructor(pid?: number) {
    this.pid = pid;
  }
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
    queueMicrotask(() => this.exit(null));
  }
  emit(line: string) {
    for (const cb of this.outputs) cb(line, "stdout");
  }
  exit(code: number | null) {
    for (const cb of this.exits) cb(code);
  }
}

class FakeEmbedded implements EmbeddedEngine {
  launches: Array<Record<string, string>> = [];
  reloads: Array<readonly string[] | undefined> = [];
  handles: FakeHandle[] = [];
  aborted = 0;
  features = ["lua", "wasm"];
  description = "기능 lua wasm, 엔진 커밋 abc1234";
  /** launch 를 멈춰 두는 약속 (abort 검사) */
  gate: Promise<void> | null = null;
  /** 있으면 loadFeatures 나 launch 가 이것을 던진다 */
  featuresError: { value: unknown } | null = null;
  launchError: { value: unknown } | null = null;
  /** reload 의 결과: 스크립트 오류, 게임이 끝나는 중이라 올리지 않음, 또는 던질 값 (던지면 게임 뷰처럼 세션을 종료 코드 1 로 끝낸다) */
  reloadResult: "ok" | "scriptError" | "dropped" | { throws: unknown } = "ok";
  /** whenStepped의 결과 (기본은 바로 true: 첫 프레임을 돌았다). 약속이면 그것을 기다린다 */
  stepped: boolean | Promise<boolean> = true;
  steppedFor: RunHandle[] = [];
  async whenStepped(handle: RunHandle) {
    this.steppedFor.push(handle);
    return this.stepped;
  }
  async loadFeatures() {
    if (this.featuresError) throw this.featuresError.value;
    return this.features;
  }
  async launch(opts: { env: Record<string, string> }) {
    this.launches.push(opts.env);
    if (this.launchError) throw this.launchError.value;
    if (this.gate) await this.gate;
    if (this.aborted) {
      const e = new Error("시작 취소됨");
      e.name = "AbortError";
      throw e;
    }
    const h = new FakeHandle();
    this.handles.push(h);
    return h;
  }
  abort() {
    this.aborted++;
  }
  async reload(paths?: readonly string[]) {
    this.reloads.push(paths);
    const result = this.reloadResult;
    if (typeof result === "object") {
      this.handles.at(-1)?.exit(1);
      throw result.throws;
    }
    if (result === "dropped") return { count: 0, scriptsFailed: false, dropped: true };
    return { count: paths?.length ?? 5, scriptsFailed: result === "scriptError" };
  }
}

function withRun(mem: MemoryBackend, onRun: (spec: RunSpec) => Promise<RunHandle>): ProjectBackend {
  return Object.assign(Object.create(mem) as MemoryBackend, { kind: "tauri", capabilities: { run: true, pickFolder: true, watch: true, hmr: true }, run: onRun });
}

/** 브리지처럼: 엔진은 못 띄우고 밖의 엔진으로는 보낸다 (kind는 bridge 그대로, hmrPush는 mem.pushed에 남는다) */
function bridgeLike(mem: MemoryBackend): MemoryBackend {
  return Object.assign(Object.create(mem) as MemoryBackend, { capabilities: { run: false, pickFolder: false, watch: true, hmr: true } });
}

/** 웹판의 브라우저 폴더처럼 (FsAccessBackend의 kind와 capabilities) */
function browserLike(mem: MemoryBackend): MemoryBackend {
  return Object.assign(Object.create(mem) as MemoryBackend, { kind: "browser", capabilities: { run: false, pickFolder: true, watch: true, hmr: false } });
}

/** 브리지 서버가 엔진 포트에 연결하지 못했을 때의 502 */
const REFUSED = "HMR push failed (127.0.0.1:5959): connect ECONNREFUSED 127.0.0.1:5959 (게임이 INITIAL2D_HMR=1 로 실행 중이어야 합니다)";

/** 기본은 브리지처럼 (bridgeLike). memory 면 메모리 백엔드 그대로 (메모리 모드와 웹판의 샘플, 엔진이 없다) */
async function setup(opts: { tauri?: boolean; memory?: boolean; browser?: boolean; runMode?: "process" | "embedded"; script?: "lua" | "mruby" } = {}) {
  const mem = new MemoryBackend({
    "game.json": JSON.stringify({ windowWidth: 320, windowHeight: 240, renderScale: 1, script: opts.script ?? "lua" }),
    "scripts/lua/main.lua": "print('main')",
  });
  const specs: RunSpec[] = [];
  const backend = opts.tauri
    ? withRun(mem, async (spec) => {
        specs.push(spec);
        return new FakeHandle(4321);
      })
    : opts.memory
      ? mem
      : opts.browser
        ? browserLike(mem)
        : bridgeLike(mem);
  const project = new Project(backend);
  const settings = new SettingsStore(new MemorySettingsStorage());
  if (opts.runMode) settings.update({ runMode: opts.runMode }, false);
  const log = new LogStore();
  const toasts: string[] = [];
  const toast = (level: string) => (text: string) => void toasts.push(`${level}: ${text}`);
  const host: RunnerHost = { backend, project, settings, log, platform: "mac", toasts: { info: toast("info"), success: toast("success"), warn: toast("warn"), error: toast("error") } };
  await project.open("/home/u/game");
  const embedded = new FakeEmbedded();
  const runner = new RunnerStore(host, {
    embedded,
    unavailableReason: "브라우저 모드: 엔진 프로세스 실행 미지원",
    probe: opts.tauri ? async () => ["lua"] : undefined,
    // 프로젝트의 build/ 를 엔진으로 쓴다 (신뢰 확인에 허용으로 답한다. 규칙 자체는 RunnerStore.trust.test.ts)
    askTrust: async () => "allow",
    stopTimeoutMs: 200,
  });
  return { runner, embedded, specs, log, toasts, settings, mem, backend };
}

const texts = (log: LogStore) => log.entries.map((e) => `${e.level}/${e.source}: ${e.text}`);

function wasmException(): unknown {
  const ns = WebAssembly as unknown as { Tag: new (t: { parameters: string[] }) => object; Exception: new (tag: object, payload: unknown[]) => object };
  return new ns.Exception(new ns.Tag({ parameters: [] }), []);
}

describe("RunnerStore 실행 방식", () => {
  it("프로세스를 못 띄우는 백엔드는 늘 에디터 안이고 실행 버튼이 켜진다", async () => {
    const { runner, settings } = await setup();
    expect(runner.mode).toBe("embedded");
    settings.update({ runMode: "process" }, false);
    expect(runner.mode).toBe("embedded");
    expect(runner.unavailableReason).toBeNull();
    expect(runner.canRun).toBe(true);
    expect(runner.startHint).toBeUndefined();
    expect(runner.modeHint).toBe(EMBEDDED_HINT);
    expect(runner.statusText).toBe("엔진 (게임 탭): 대기");
    expect(runner.statusTitle).toBe(`${EMBEDDED_HINT}. 기능 lua wasm, 엔진 커밋 abc1234`);
  });

  it("에디터 안: launch 에 INITIAL2D_SCRIPT, 씬, 덧씌운 변수를 넘기고 프로세스는 띄우지 않는다", async () => {
    const { runner, embedded, specs, log } = await setup();
    await runner.start({ scene: "flappy", env: { INITIAL2D_SAMPLE_AT: "8,48" } });
    expect(specs).toEqual([]);
    expect(embedded.launches).toEqual([{ INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "flappy", INITIAL2D_SAMPLE_AT: "8,48" }]);
    expect(runner.state).toBe("running");
    expect(runner.activeMode).toBe("embedded");
    expect(runner.pid).toBeNull();
    expect(runner.statusText).toBe("엔진 (게임 탭): 실행 중 00:00");
    expect(runner.indicatorText).toBe("게임 탭 00:00");
    expect(texts(log)).toContainEqual("info/runner: 엔진 시작: 게임 탭 (웹 엔진, lua wasm), 언어 lua, 씬 flappy (INITIAL2D_SAMPLE_AT=8,48)");

    // 출력은 콘솔의 engine 으로, 정지는 핸들의 stop
    embedded.handles[0].emit("Lua error in update: scripts/lua/main.lua:3: boom");
    expect(texts(log)).toContainEqual("error/engine: Lua error in update: scripts/lua/main.lua:3: boom");
    await runner.stop();
    expect(embedded.handles[0].stopped).toBe(1);
    expect(runner.state).toBe("idle");
    expect(runner.statusText).toBe("엔진 (게임 탭): 대기");
  });

  it("Tauri 는 설정을 따른다: process 면 엔진 프로세스, embedded 면 게임 탭", async () => {
    const t = await setup({ tauri: true, runMode: "process" });
    expect(t.runner.mode).toBe("process");
    expect(t.runner.modeHint).toBeUndefined();
    await t.runner.start();
    expect(t.specs).toHaveLength(1);
    expect(t.specs[0].env).toEqual({ INITIAL2D_HMR: "1", INITIAL2D_SCRIPT: "lua" });
    expect(t.embedded.launches).toEqual([]);
    expect(t.runner.statusText).toBe("엔진 (프로세스): 실행 중 PID 4321 00:00");

    // 실행 중에 설정을 바꿔도 지금 실행의 방식은 그대로, 다음 실행부터 바뀐다
    t.settings.update({ runMode: "embedded" }, false);
    expect(t.runner.mode).toBe("embedded");
    expect(t.runner.statusText).toBe("엔진 (프로세스): 실행 중 PID 4321 00:00");
    await t.runner.restart();
    expect(t.embedded.launches).toHaveLength(1);
    expect(t.runner.activeMode).toBe("embedded");
    expect(t.runner.statusText).toBe("엔진 (게임 탭): 실행 중 00:00");
  });

  it("game.json 이 mruby 면 웹 엔진은 띄우지 않고 이유를 알린다", async () => {
    const { runner, embedded, toasts, log } = await setup({ script: "mruby" });
    await runner.start();
    expect(embedded.launches).toEqual([]);
    expect(runner.state).toBe("idle");
    expect(toasts[0]).toBe(`error: ${WASM_NO_MRUBY} (프로세스 실행은 데스크톱 앱 전용)`);
    expect(texts(log)).toContainEqual(`error/runner: ${WASM_NO_MRUBY} (프로세스 실행은 데스크톱 앱 전용)`);
    // 기능에 mruby 가 있으면 띄운다
    embedded.features = ["lua", "mruby", "wasm"];
    await runner.start();
    expect(embedded.launches).toEqual([{ INITIAL2D_SCRIPT: "mruby" }]);
  });

  it("언어 검사는 덧씌운 INITIAL2D_SCRIPT 로 한다: game.json 이 mruby 여도 lua 로 덮으면 mruby 없는 웹 엔진으로 띄운다", async () => {
    const { runner, embedded, toasts, log } = await setup({ script: "mruby" });
    await runner.start({ env: { INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "rpg" } });
    expect(toasts).toEqual([]);
    expect(embedded.launches).toEqual([{ INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "rpg" }]);
    expect(texts(log)).toContainEqual("info/runner: 엔진 시작: 게임 탭 (웹 엔진, lua wasm), 언어 lua (INITIAL2D_SCRIPT=lua INITIAL2D_SCENE=rpg)");
    await runner.stop();
    // 거꾸로 lua 프로젝트를 mruby 로 덮으면 거절한다
    const lua = await setup();
    await lua.runner.start({ env: { INITIAL2D_SCRIPT: "mruby" } });
    expect(lua.embedded.launches).toEqual([]);
    expect(lua.toasts[0]).toBe(`error: ${WASM_NO_MRUBY} (프로세스 실행은 데스크톱 앱 전용)`);
  });

  it("Tauri 에서 mruby 를 거부할 때는 프로세스 실행을 권한다", async () => {
    const { runner, toasts } = await setup({ tauri: true, runMode: "embedded", script: "mruby" });
    await runner.start();
    expect(toasts[0]).toBe(`error: ${WASM_NO_MRUBY}`);
  });

  it("파일을 올리는 중에 정지하면 abort 하고 조용히 멈춘다", async () => {
    const { runner, embedded, toasts, log } = await setup();
    let open!: () => void;
    embedded.gate = new Promise((r) => (open = r));
    const starting = runner.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(runner.state).toBe("starting");
    const stopping = runner.stop();
    expect(embedded.aborted).toBe(1);
    open();
    await starting;
    await stopping;
    expect(runner.state).toBe("idle");
    expect(toasts).toEqual([]);
    expect(texts(log)).toContainEqual("info/runner: 시작 취소됨");
  });

  it("리로드: 에디터 안 엔진이 돌면 저장한 경로를 그쪽으로, 아니면 백엔드로 push", async () => {
    const { runner, embedded, log, mem } = await setup();
    // 돌지 않을 때 브리지 모드는 백엔드(브리지 서버)로 보낸다
    expect(runner.canReload).toBe(true);
    expect(await runner.reload(["scripts/lua/main.lua"])).toEqual({ count: 0 });
    expect(mem.pushed).toEqual([[]]);
    expect(embedded.reloads).toEqual([]);

    await runner.start();
    expect(runner.embeddedRunning).toBe(true);
    expect(await runner.reload(["scripts/lua/main.lua", "resources/maps/a.json"])).toEqual({ count: 2 });
    expect(await runner.reload()).toEqual({ count: 5 });
    expect(embedded.reloads).toEqual([["scripts/lua/main.lua", "resources/maps/a.json"], undefined]);
    expect(runner.lastReload?.count).toBe(5);
    expect(texts(log)).toContainEqual("info/runner: 핫 리로드: 웹 엔진에 파일 2개를 다시 복사했습니다. VM을 다시 시작하여 씬 상태가 초기화됩니다.");
  });

  it("웹판(브라우저 폴더)은 밖으로 보낼 길이 없어 게임이 돌 때만 리로드한다", async () => {
    const { runner, embedded } = await setup({ browser: true });
    expect(runner.canPush).toBe(false);
    expect(runner.canReload).toBe(false);
    expect(runner.reloadHint).toBe("게임 탭에서 실행 중인 게임 없음");
    expect(await runner.reload()).toBeNull();
    await runner.start();
    expect(runner.canReload).toBe(true);
    expect(await runner.reload()).toEqual({ count: 5 });
    expect(embedded.reloads).toEqual([undefined]);
  });

  it("메모리 백엔드는 엔진이 없어 보내지 않는다: 게임 전에도 끝난 뒤에도 리로드했다고 적지 않는다", async () => {
    const { runner, embedded, mem, log, toasts } = await setup({ memory: true });
    // 모드가 아니라 백엔드가 정한다: 웹판의 샘플도 메모리 백엔드이고 kind는 브리지와 같다
    expect(mem.kind).toBe("bridge");
    expect(mem.capabilities.hmr).toBe(false);
    expect(runner.canPush).toBe(false);
    expect(runner.canReload).toBe(false);
    expect(runner.reloadHint).toBe("게임 탭에서 실행 중인 게임 없음");
    expect(await runner.reload(["scripts/lua/main.lua"], { fromSave: true })).toBeNull();
    expect(await runner.reload()).toBeNull();

    await runner.start();
    embedded.handles[0].exit(1);
    expect(runner.state).toBe("idle");
    const before = log.entries.length;
    expect(await runner.reload(["scripts/lua/main.lua"], { fromSave: true })).toBeNull();
    expect(mem.pushed).toEqual([]);
    expect(embedded.reloads).toEqual([]);
    expect(texts(log).slice(before)).toEqual([]);
    expect(toasts.filter((t) => t.includes("리로드"))).toEqual([]);
  });

  it("브리지: 저장 시 리로드가 엔진 포트의 연결 거부로 실패하면 토스트 없이 조용한 한 줄만 남긴다", async () => {
    const { runner, embedded, backend, log, toasts } = await setup();
    let pushes = 0;
    let failure = new BackendError(REFUSED, "hmr_unreachable");
    backend.hmrPush = async () => {
      pushes++;
      throw failure;
    };
    // 게임이 끝난 뒤 고쳐 저장한다
    await runner.start();
    embedded.handles[0].exit(1);
    toasts.length = 0;
    const before = log.entries.length;
    expect(await runner.reload(["scripts/lua/games/aldebaran/title.lua"], { fromSave: true })).toBeNull();
    expect(pushes).toBe(1);
    expect(toasts).toEqual([]);
    expect(texts(log).slice(before)).toEqual([`info/runner: ${HMR_NO_ENGINE_SKIPPED}`]);

    // 수동 리로드는 사용자가 누른 것이라 전처럼 알린다
    expect(await runner.reload()).toBeNull();
    expect(toasts).toEqual([`error: 핫 리로드 실패: 게임이 INITIAL2D_HMR=1로 실행 중인지 확인하세요 (${REFUSED})`]);

    // 연결 거부가 아닌 실패(응답 시간 초과, 브리지 서버가 없음)는 저장 시에도 알린다
    failure = new BackendError("HMR push failed (127.0.0.1:5959): HMR push timed out after 5000ms", "hmr_unreachable");
    await runner.reload(["scripts/lua/main.lua"], { fromSave: true });
    failure = new BackendError("브리지 서버(http://127.0.0.1:5960)에 연결할 수 없다", "network");
    await runner.reload(["scripts/lua/main.lua"], { fromSave: true });
    expect(toasts).toHaveLength(3);
    expect(texts(log).filter((l) => l === `info/runner: ${HMR_NO_ENGINE_SKIPPED}`)).toHaveLength(1);
  });

  it("Tauri 의 프로세스 실행은 그대로: 저장 시 리로드의 실패도 알린다", async () => {
    const { runner, backend, toasts } = await setup({ tauri: true, runMode: "process" });
    backend.hmrPush = async () => {
      throw new BackendError("Connection refused (os error 61)", "hmr_unreachable");
    };
    await runner.start();
    expect(runner.state).toBe("running");
    expect(await runner.reload(["scripts/lua/main.lua"], { fromSave: true })).toBeNull();
    expect(toasts.at(-1)).toBe("error: 핫 리로드 실패: 게임이 INITIAL2D_HMR=1로 실행 중인지 확인하세요 (Connection refused (os error 61))");
  });

  it("게임 탭이 뜨는 중(파일 올리는 중, 부팅 중)의 리로드는 백엔드로 보내지 않고 모았다가 뜬 뒤 한 번에 올린다", async () => {
    const { runner, embedded, mem, log, toasts } = await setup();
    let open!: () => void;
    embedded.gate = new Promise((r) => (open = r));
    const starting = runner.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(runner.state).toBe("starting");
    expect(runner.embeddedActive).toBe(true);
    expect(runner.embeddedRunning).toBe(false);
    expect(runner.canReload).toBe(true);
    expect(await runner.reload(["scripts/lua/main.lua"], { fromSave: true })).toBeNull();
    expect(await runner.reload(["resources/maps/a.json", "scripts/lua/main.lua"], { fromSave: true })).toBeNull();
    expect(mem.pushed).toEqual([]);
    expect(embedded.reloads).toEqual([]);
    expect(texts(log)).toContainEqual("info/runner: 핫 리로드: 웹 엔진이 시작 중입니다. 시작되면 변경된 파일을 다시 복사합니다.");
    open();
    await starting;
    expect(runner.state).toBe("running");
    // 첫 프레임 뒤 (가짜는 바로 첫 프레임을 돈다)
    await vi.waitFor(() => expect(embedded.reloads).toEqual([["scripts/lua/main.lua", "resources/maps/a.json"]]));
    expect(embedded.steppedFor).toEqual([embedded.handles[0]]);
    await vi.waitFor(() => expect(texts(log)).toContainEqual("info/runner: 핫 리로드: 웹 엔진에 파일 2개를 다시 복사했습니다. VM을 다시 시작하여 씬 상태가 초기화됩니다."));
    expect(mem.pushed).toEqual([]);
    expect(toasts).toEqual([]);

    // 뜨는 중의 수동 리로드(경로 없음)는 전부 다시 올린다
    await runner.stop();
    embedded.gate = new Promise((r) => (open = r));
    const again = runner.start();
    await Promise.resolve();
    await Promise.resolve();
    await runner.reload(["scripts/lua/main.lua"]);
    await runner.reload();
    open();
    await again;
    await vi.waitFor(() => expect(embedded.reloads).toHaveLength(2));
    expect(embedded.reloads.at(-1)).toBeUndefined();
    expect(mem.pushed).toEqual([]);
  });

  it("떴지만 첫 프레임 전의 리로드도 모았다가 엔진이 첫 프레임을 돈 뒤에 올린다", async () => {
    const { runner, embedded, mem, log } = await setup({ memory: true });
    let step!: (ok: boolean) => void;
    embedded.stepped = new Promise((r) => (step = r));
    await runner.start();
    expect(runner.state).toBe("running");
    expect(runner.embeddedRunning).toBe(true);
    expect(await runner.reload(["scripts/lua/main.lua"], { fromSave: true })).toBeNull();
    expect(await runner.reload(["resources/maps/a.json"], { fromSave: true })).toBeNull();
    expect(embedded.reloads).toEqual([]);
    expect(texts(log).filter((l) => l.includes("핫 리로드: 웹 엔진이 시작 중입니다"))).toHaveLength(2);
    step(true);
    await vi.waitFor(() => expect(embedded.reloads).toEqual([["scripts/lua/main.lua", "resources/maps/a.json"]]));
    // 첫 프레임 뒤의 리로드는 바로 간다
    expect(await runner.reload(["scripts/lua/main.lua"])).toEqual({ count: 1 });
    expect(embedded.reloads).toHaveLength(2);
    expect(mem.pushed).toEqual([]);
    expect(texts(log)).not.toContainEqual(`info/runner: ${START_ENDED_RELOAD_DROPPED}`);
  });

  it("첫 프레임 전에 게임이 끝나면(시작 스크립트의 오류) 모아 둔 리로드를 버리고 한 줄 남긴다. 다음 실행은 새로 올린 글로 돈다", async () => {
    for (const order of ["exit first", "stepped first"] as const) {
      const { runner, embedded, mem, log, toasts } = await setup({ memory: true });
      let open!: () => void;
      embedded.gate = new Promise((r) => (open = r));
      let step!: (ok: boolean) => void;
      embedded.stepped = new Promise((r) => (step = r));
      const starting = runner.start();
      await vi.waitFor(() => expect(embedded.launches).toHaveLength(1));
      // 부팅 중에 고쳐 저장한다
      expect(await runner.reload(["scripts/lua/main.lua"], { fromSave: true })).toBeNull();
      open();
      await starting;
      expect(runner.state).toBe("running");
      if (order === "exit first") {
        // 엔진이 첫 프레임에서 루프를 내린다 (시작 때의 오류가 종료를 요청해 두었다)
        embedded.handles[0].exit(1);
        step(false);
      } else {
        step(false);
        await vi.waitFor(() => expect(texts(log)).toContainEqual(`info/runner: ${START_ENDED_RELOAD_DROPPED}`));
        embedded.handles[0].exit(1);
      }
      await vi.waitFor(() => expect(runner.state).toBe("idle"));
      await new Promise((r) => setTimeout(r, 10));
      expect(runner.exitCode, order).toBe(1);
      expect(embedded.reloads, order).toEqual([]);
      expect(mem.pushed, order).toEqual([]);
      expect(texts(log).filter((l) => l === `info/runner: ${START_ENDED_RELOAD_DROPPED}`), order).toHaveLength(1);
      expect(texts(log).some((l) => l.includes("다시 올렸다")), order).toBe(false);
      expect(toasts, order).toEqual(["error: 엔진이 종료되었습니다 (종료 코드 1). 콘솔을 확인하세요."]);

      // 버린 리로드는 다음 실행에 남지 않는다 (F5는 저장한 글을 처음부터 올린다)
      embedded.gate = null;
      embedded.stepped = true;
      await runner.start();
      await new Promise((r) => setTimeout(r, 10));
      expect(runner.state, order).toBe("running");
      expect(embedded.reloads, order).toEqual([]);
      await runner.stop();
    }
  });

  it("게임 뷰가 게임이 끝나는 중이라 올리지 않은 리로드는 정보 한 줄만 남긴다: 뜨는 중에 모은 것은 뜨는 중에 끝났다는 줄, 그 밖은 끝났다는 줄", async () => {
    const { runner, embedded, mem, log, toasts } = await setup({ memory: true });
    let open!: () => void;
    embedded.gate = new Promise((r) => (open = r));
    embedded.reloadResult = "dropped";
    const starting = runner.start();
    await vi.waitFor(() => expect(embedded.launches).toHaveLength(1));
    expect(await runner.reload(["scripts/lua/main.lua"], { fromSave: true })).toBeNull();
    open();
    await starting;
    // 첫 프레임은 돌았지만 올리려는 사이 끝나는 중이 되었다
    await vi.waitFor(() => expect(embedded.reloads).toEqual([["scripts/lua/main.lua"]]));
    await vi.waitFor(() => expect(texts(log)).toContainEqual(`info/runner: ${START_ENDED_RELOAD_DROPPED}`));
    expect(await runner.reload(["scripts/lua/main.lua"], { fromSave: true })).toBeNull();
    expect(await runner.reload()).toBeNull();
    expect(texts(log).filter((l) => l === `info/runner: ${ENDED_RELOAD_DROPPED}`)).toHaveLength(2);
    expect(texts(log).filter((l) => l === `info/runner: ${START_ENDED_RELOAD_DROPPED}`)).toHaveLength(1);
    expect(runner.lastReload).toBeNull();
    expect(texts(log).some((l) => l.includes("다시 올렸다") || l.includes("핫 리로드 실패"))).toBe(false);
    expect(toasts).toEqual([]);
    expect(mem.pushed).toEqual([]);
  });

  it("모아 둔 리로드가 없으면 첫 프레임 전에 끝나도 줄을 남기지 않는다", async () => {
    const { runner, embedded, log } = await setup({ memory: true });
    embedded.stepped = new Promise(() => {});
    await runner.start();
    embedded.handles[0].exit(1);
    await new Promise((r) => setTimeout(r, 10));
    expect(runner.state).toBe("idle");
    expect(texts(log)).not.toContainEqual(`info/runner: ${START_ENDED_RELOAD_DROPPED}`);
  });

  it("엔진을 못 띄우는 백엔드의 시작 안내는 밖의 엔진으로 보낼 길이 있을 때만 수동 리로드를 적는다", () => {
    expect(browserRunNotice(true)).toBe(
      "브라우저 모드에서는 실행(F5)에 게임 탭의 웹 엔진을 사용합니다. 터미널에서 INITIAL2D_HMR=1로 실행한 엔진에 수동 리로드(Ctrl+Shift+R)를 전송할 수 있습니다.",
    );
    expect(browserRunNotice(false)).toBe("브라우저 모드에서는 실행(F5)에 게임 탭의 웹 엔진을 사용합니다. 외부 엔진에는 전송하지 않습니다. 저장한 파일은 게임 탭에서 실행 중일 때만 반영됩니다.");
    expect(browserRunNotice(false)).not.toContain("수동 리로드");
  });

  it("뜨는 중에 그만두면 모아 둔 리로드는 버린다", async () => {
    const { runner, embedded, mem } = await setup();
    let open!: () => void;
    embedded.gate = new Promise((r) => (open = r));
    const starting = runner.start();
    await Promise.resolve();
    await Promise.resolve();
    await runner.reload(["scripts/lua/main.lua"], { fromSave: true });
    const stopping = runner.stop();
    open();
    await starting;
    await stopping;
    expect(runner.state).toBe("idle");
    embedded.gate = null;
    embedded.aborted = 0;
    await runner.start();
    expect(runner.state).toBe("running");
    expect(embedded.reloads).toEqual([]);
    expect(mem.pushed).toEqual([]);
  });

  it("게임이 스스로 끝나면 종료 코드를 상태 바에 남긴다", async () => {
    const { runner, embedded, toasts } = await setup();
    await runner.start();
    embedded.handles[0].exit(1);
    expect(runner.state).toBe("idle");
    expect(runner.exitCode).toBe(1);
    expect(runner.statusText).toBe("엔진 (게임 탭): 종료 코드 1");
    expect(toasts.at(-1)).toContain("종료 코드 1");
  });

  it("엔진이 던진 값이 message 가 없어도 콘솔과 토스트는 읽는 글이다", async () => {
    const { runner, embedded, toasts, log } = await setup();
    embedded.launchError = { value: wasmException() };
    await runner.start();
    expect(runner.state).toBe("idle");
    expect(toasts.at(-1)).toMatch(/^error: 웹 엔진 시작 실패: C\+\+ 예외/);
    embedded.launchError = null;
    embedded.featuresError = { value: undefined };
    await runner.start();
    expect(toasts.at(-1)).toMatch(/^error: 알 수 없는 오류/);
    for (const line of [...toasts, ...texts(log)]) expect(line).not.toContain("undefined");
  });

  it("리로드가 스크립트 오류면 경고만 하고 게임은 계속 돈다", async () => {
    const { runner, embedded, toasts, log } = await setup();
    await runner.start();
    embedded.reloadResult = "scriptError";
    expect(await runner.reload(["scripts/lua/main.lua"])).toEqual({ count: 1 });
    expect(runner.state).toBe("running");
    expect(texts(log)).toContainEqual(
      "warn/runner: 핫 리로드: 웹 엔진에 파일 1개를 다시 복사했지만 스크립트 오류로 VM을 다시 시작하지 못했습니다. 위 오류 줄을 클릭하면 해당 파일의 줄로 이동합니다.",
    );
    expect(toasts.at(-1)).toBe("warn: 핫 리로드: 스크립트 오류가 발생했습니다. 콘솔의 오류 줄을 확인하세요.");
  });

  it("리로드에서 엔진이 예외로 죽으면 읽는 글로 남기고 토스트는 종료 알림 하나다", async () => {
    const { runner, embedded, toasts, log } = await setup();
    await runner.start();
    embedded.reloadResult = { throws: wasmException() };
    expect(await runner.reload(["scripts/lua/main.lua"])).toBeNull();
    expect(runner.state).toBe("idle");
    expect(runner.exitCode).toBe(1);
    expect(texts(log).find((l) => l.startsWith("error/runner: 핫 리로드 실패: "))).toMatch(/C\+\+ 예외/);
    expect(toasts.filter((t) => t.startsWith("error:"))).toEqual(["error: 엔진이 종료되었습니다 (종료 코드 1). 콘솔을 확인하세요."]);
    for (const line of texts(log)) expect(line).not.toContain("undefined");
  });
});
