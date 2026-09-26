// 실행 방식 나누기 (E4): 에디터 안 실행(가짜 EmbeddedEngine)과 프로세스 실행을 RunnerStore 가 고르는가.

import { LogStore, MemorySettingsStorage, Project, SettingsStore, type OutputStream, type ProjectBackend, type RunHandle, type RunSpec } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { describe, expect, it } from "vitest";
import { EMBEDDED_HINT, RunnerStore, WASM_NO_MRUBY, type EmbeddedEngine, type RunnerHost } from "./RunnerStore";

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
  async loadFeatures() {
    return this.features;
  }
  async launch(opts: { env: Record<string, string> }) {
    this.launches.push(opts.env);
    if (this.gate) await this.gate;
    if (this.aborted) {
      const e = new Error("실행을 그만뒀다");
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
    return paths?.length ?? 5;
  }
}

function withRun(mem: MemoryBackend, onRun: (spec: RunSpec) => Promise<RunHandle>): ProjectBackend {
  return Object.assign(Object.create(mem) as MemoryBackend, { kind: "tauri", capabilities: { run: true, pickFolder: true, watch: true }, run: onRun });
}

async function setup(opts: { tauri?: boolean; runMode?: "process" | "embedded"; script?: "lua" | "mruby" } = {}) {
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
    : mem;
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
    unavailableReason: "브라우저 모드에서는 엔진을 띄울 수 없다",
    probe: opts.tauri ? async () => ["lua"] : undefined,
    stopTimeoutMs: 200,
  });
  return { runner, embedded, specs, log, toasts, settings };
}

const texts = (log: LogStore) => log.entries.map((e) => `${e.level}/${e.source}: ${e.text}`);

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
    expect(runner.statusText).toBe("엔진 (에디터 안): 대기");
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
    expect(runner.statusText).toBe("엔진 (에디터 안): 실행 중 00:00");
    expect(runner.indicatorText).toBe("에디터 안 00:00");
    expect(texts(log)).toContainEqual("info/runner: 엔진 시작: 에디터 안 (웹 엔진, lua wasm), 언어 lua, 씬 flappy (INITIAL2D_SAMPLE_AT=8,48)");

    // 출력은 콘솔의 engine 으로, 정지는 핸들의 stop
    embedded.handles[0].emit("Lua error in update: scripts/lua/main.lua:3: boom");
    expect(texts(log)).toContainEqual("error/engine: Lua error in update: scripts/lua/main.lua:3: boom");
    await runner.stop();
    expect(embedded.handles[0].stopped).toBe(1);
    expect(runner.state).toBe("idle");
    expect(runner.statusText).toBe("엔진 (에디터 안): 대기");
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
    expect(t.runner.statusText).toBe("엔진 (에디터 안): 실행 중 00:00");
  });

  it("game.json 이 mruby 면 웹 엔진은 띄우지 않고 이유를 알린다", async () => {
    const { runner, embedded, toasts, log } = await setup({ script: "mruby" });
    await runner.start();
    expect(embedded.launches).toEqual([]);
    expect(runner.state).toBe("idle");
    expect(toasts[0]).toBe(`error: ${WASM_NO_MRUBY} (프로세스 실행은 데스크톱 앱에서)`);
    expect(texts(log)).toContainEqual(`error/runner: ${WASM_NO_MRUBY} (프로세스 실행은 데스크톱 앱에서)`);
    // 기능에 mruby 가 있으면 띄운다
    embedded.features = ["lua", "mruby", "wasm"];
    await runner.start();
    expect(embedded.launches).toEqual([{ INITIAL2D_SCRIPT: "mruby" }]);
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
    expect(texts(log)).toContainEqual("info/runner: 실행을 그만뒀다");
  });

  it("리로드: 에디터 안 엔진이 돌면 저장한 경로를 그쪽으로, 아니면 백엔드로 push", async () => {
    const { runner, embedded, log } = await setup();
    // 돌지 않을 때 브라우저 모드는 백엔드(브리지 서버)로 보낸다
    expect(runner.canReload).toBe(true);
    expect(await runner.reload(["scripts/lua/main.lua"])).toEqual({ count: 0 });
    expect(embedded.reloads).toEqual([]);

    await runner.start();
    expect(runner.embeddedRunning).toBe(true);
    expect(await runner.reload(["scripts/lua/main.lua", "resources/maps/a.json"])).toEqual({ count: 2 });
    expect(await runner.reload()).toEqual({ count: 5 });
    expect(embedded.reloads).toEqual([["scripts/lua/main.lua", "resources/maps/a.json"], undefined]);
    expect(runner.lastReload?.count).toBe(5);
    expect(texts(log)).toContainEqual("info/runner: 핫 리로드: 에디터 안 엔진, 2개 파일을 다시 올렸다. VM 을 다시 시작한다 (씬 상태는 처음으로)");
  });

  it("웹판(브라우저 폴더)은 밖으로 보낼 길이 없어 게임이 돌 때만 리로드한다", async () => {
    const { runner, embedded } = await setup();
    const host = (runner as unknown as { host: { backend: object } }).host;
    Object.defineProperty(host.backend, "kind", { value: "browser" });
    expect(runner.canPush).toBe(false);
    expect(runner.canReload).toBe(false);
    expect(runner.reloadHint).toBe("게임 탭에서 실행 중일 때 다시 읽는다");
    expect(await runner.reload()).toBeNull();
    await runner.start();
    expect(runner.canReload).toBe(true);
    expect(await runner.reload()).toEqual({ count: 5 });
    expect(embedded.reloads).toEqual([undefined]);
  });

  it("게임이 스스로 끝나면 종료 코드를 상태 바에 남긴다", async () => {
    const { runner, embedded, toasts } = await setup();
    await runner.start();
    embedded.handles[0].exit(1);
    expect(runner.state).toBe("idle");
    expect(runner.exitCode).toBe(1);
    expect(runner.statusText).toBe("엔진 (에디터 안): 종료 코드 1");
    expect(toasts.at(-1)).toContain("종료 코드 1");
  });
});
