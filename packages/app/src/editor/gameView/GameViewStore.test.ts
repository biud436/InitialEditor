// @vitest-environment jsdom
// 게임 뷰 스토어를 가짜 웹 엔진 로더로 돌린다: 게임 탭과 canvas, 파일 스테이징과 env, 출력 모으기, 정지와 스스로 끝남,
// 핫 리로드(저장 세 번이 300ms 뒤 한 번의 reload 로), 엔진이 죽는 길(예외, onExit, 스크립트 오류), FPS, 화면 읽기.
// 가짜 로더는 로더 계약(onExit, frames, errorText, reload 의 true 와 false)을 따르지 않는 빌드와 따르는 빌드 둘 다 흉내 낸다.

import { DocumentRegistry, LogStore, MemorySettingsStorage, Project, SettingsStore, type RunHandle } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveReloader, shouldReloadOnSave } from "../runner/reloadOnSave";
import { RunnerStore } from "../runner/RunnerStore";
import type { BootOptions, EngineGame, EngineRuntime, StageData } from "./engineAssets";
import { GAME_KIND, GameDocument } from "./GameDocument";
import { LOOP_STOPPED_LINE, type GameSession } from "./GameSession";
import { GameViewStore } from "./GameViewStore";

class FakeGame implements EngineGame {
  module = { FS: { readFile: () => new Uint8Array(), writeFile: () => {} } };
  exitCode = 0;
  quits = 0;
  reloads: Array<Record<string, StageData>> = [];
  /** quit 뒤 루프가 멈춘 줄을 찍는가 (false 면 시간 제한으로 정리한다) */
  stopsOnQuit = true;
  /** 다음 reload 가 돌려줄 것 (계약을 따르지 않는 로더는 undefined) 이나 던질 것 */
  reloadResult: boolean | undefined | { throws: unknown } = undefined;
  /** 계약을 따르는 로더: 엔진이 돈 프레임 수 */
  frameCount = 0;
  frames?: () => number;
  errorText?: (e: unknown) => string;
  constructor(
    readonly opts: BootOptions,
    readonly newLoader: boolean,
  ) {
    if (newLoader) {
      this.frames = () => this.frameCount;
      this.errorText = (e) => `loader: ${String((e as Error)?.message ?? "C++ 예외 std::runtime_error: boom")}`;
    }
  }
  stage() {}
  reload(files?: Record<string, StageData>): boolean | void {
    this.reloads.push(files ?? {});
    const result = this.reloadResult;
    if (result && typeof result === "object") throw result.throws;
    if (result === false) {
      this.opts.printErr?.("Lua error in reload: scripts/lua/main.lua:1: unexpected symbol near 'x'");
      return false;
    }
    this.opts.print?.("sample:frame");
    return result;
  }
  quit() {
    this.quits++;
    if (this.stopsOnQuit)
      setTimeout(() => {
        this.opts.printErr?.(LOOP_STOPPED_LINE);
        if (this.newLoader) this.opts.onExit?.(0);
      }, 1);
  }
  features() {
    return "lua wasm";
  }
}

function wasmException(): unknown {
  const ns = WebAssembly as unknown as { Tag: new (t: { parameters: string[] }) => object; Exception: new (tag: object, payload: unknown[]) => object };
  return new ns.Exception(new ns.Tag({ parameters: [] }), []);
}

function errorEvent(error: unknown, filename = ""): Event {
  return new ErrorEvent("error", { error, message: "Uncaught", filename });
}

function rejectionEvent(reason: unknown): Event {
  const ev = new Event("unhandledrejection");
  Object.defineProperty(ev, "reason", { value: reason });
  return ev;
}

/** requestAnimationFrame 을 손으로 돌린다 */
function manualFrames() {
  let queue: Array<FrameRequestCallback> = [];
  let now = 0;
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.push(cb);
    return ++id;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(performance, "now").mockImplementation(() => now);
  return {
    step(ms: number) {
      now += ms;
      const run = queue;
      queue = [];
      for (const cb of run) cb(now);
    },
  };
}

function text(data: StageData | undefined): string {
  return data instanceof Uint8Array ? new TextDecoder().decode(data) : String(data);
}

async function setup(files: Record<string, string> = {}, opts: { newLoader?: boolean; quitTimeoutMs?: number } = {}) {
  const backend = new MemoryBackend({
    "game.json": JSON.stringify({ windowWidth: 320, windowHeight: 240, renderScale: 1, script: "lua" }),
    "scripts/lua/main.lua": "print('main')",
    "resources/maps/forest.json": "{}",
    "resources/rtp/big.png": "x",
    ...files,
  });
  const project = new Project(backend);
  await project.open("memory://t");
  const documents = new DocumentRegistry();
  const log = new LogStore();
  const games: FakeGame[] = [];
  let gate: Promise<void> | null = null;
  const runtime: EngineRuntime = {
    manifest: { engineCommit: "abc1234def", features: ["lua", "wasm"], files: [] },
    boot: async (bootOpts) => {
      if (gate) await gate;
      const game = new FakeGame(bootOpts, opts.newLoader ?? false);
      games.push(game);
      // 부팅 중에 찍는 줄 (구독자가 붙기 전이다)
      bootOpts.printErr?.("Initial2D web: renderer=opengles2 window=320x240 scale=1 features=lua wasm");
      bootOpts.print?.("sample:frame");
      return game;
    },
  };
  const errors = new EventTarget();
  const store = new GameViewStore(
    { backend, project, documents, log },
    { loadRuntime: async () => runtime, quitTimeoutMs: opts.quitTimeoutMs ?? 50, concurrency: 2, errorTarget: errors },
  );
  const host = document.createElement("div");
  document.body.appendChild(host);
  const detach = store.attachHost(host);
  return {
    backend,
    project,
    documents,
    log,
    store,
    host,
    games,
    detach,
    errors,
    hold: () => {
      let open!: () => void;
      gate = new Promise((r) => (open = r));
      return () => {
        gate = null;
        open();
      };
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("GameViewStore", () => {
  it("게임 탭을 열고 canvas 를 붙이고, 파일을 올려 env 와 함께 부팅한다", async () => {
    const t = await setup();
    const session = await t.store.launch({ env: { INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "forest" } });
    const doc = t.documents.active;
    expect(doc).toBeInstanceOf(GameDocument);
    expect(doc?.title).toBe("게임");
    const canvas = t.host.querySelector("canvas");
    expect(canvas?.id).toBe("canvas");
    expect(canvas?.width).toBe(320);
    expect(canvas?.height).toBe(240);
    expect(t.store.phase).toBe("running");
    expect(t.store.gameSize).toEqual({ width: 320, height: 240 });

    const boot = t.games[0].opts;
    expect(boot.canvas).toBe(canvas);
    expect(boot.env).toEqual({ INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "forest" });
    expect(Object.keys(boot.files ?? {}).sort()).toEqual(["game.json", "resources/maps/forest.json", "scripts/lua/main.lua"]);
    expect(text(boot.files?.["scripts/lua/main.lua"])).toBe("print('main')");
    expect(t.log.entries.some((e) => /^에디터 안 엔진: 3개 파일/.test(e.text))).toBe(true);

    // 부팅 중의 줄은 첫 구독자에게 순서대로
    const lines: string[] = [];
    session.onOutput((line, stream) => lines.push(`${stream}: ${line}`));
    expect(lines).toEqual(["stderr: Initial2D web: renderer=opengles2 window=320x240 scale=1 features=lua wasm", "stdout: sample:frame"]);

    // 두 번째 실행도 같은 게임 탭 하나이고 canvas 는 새것이다
    const exits: Array<number | null> = [];
    session.onExit((code) => exits.push(code));
    await t.store.launch({ env: { INITIAL2D_SCRIPT: "lua" } });
    expect(exits).toEqual([null]);
    expect(t.games[0].quits).toBe(1);
    expect(t.documents.documents.filter((d) => d.kind === GAME_KIND)).toHaveLength(1);
    const second = t.host.querySelectorAll("canvas");
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(canvas);
  });

  it("정지: quit 뒤 루프가 멈춘 줄을 기다리고, canvas 를 떼고 끝난 글을 보인다", async () => {
    const t = await setup();
    const session = await t.store.launch({ env: {} });
    const exits: Array<number | null> = [];
    session.onExit((code) => exits.push(code));
    await session.stop();
    expect(t.games[0].quits).toBe(1);
    expect(exits).toEqual([null]);
    expect(t.host.querySelector("canvas")).toBeNull();
    expect(t.store.canvas).toBeNull();
    expect(t.store.phase).toBe("ended");
    expect(t.store.message).toContain("정지했다");
  });

  it("루프가 멈춘 줄이 오지 않아도 시간 제한 뒤 정리한다", async () => {
    const t = await setup();
    const session = (await t.store.launch({ env: {} })) as GameSession;
    t.games[0].stopsOnQuit = false;
    await session.stop();
    expect(session.ended).toBe(true);
    expect(t.store.phase).toBe("ended");
  });

  it("Lua 오류로 스스로 끝나면 종료 코드 1, 그냥 끝나면 0", async () => {
    const t = await setup();
    const session = await t.store.launch({ env: {} });
    const exits: Array<number | null> = [];
    session.onExit((code) => exits.push(code));
    t.games[0].opts.printErr?.("Lua error in update: scripts/lua/main.lua:3: boom");
    t.games[0].opts.printErr?.(LOOP_STOPPED_LINE);
    await vi.waitFor(() => expect(exits).toEqual([1]));
    expect(t.store.phase).toBe("ended");
    expect(t.store.message).toContain("종료 코드 1");

    const next = await t.store.launch({ env: {} });
    const codes: Array<number | null> = [];
    next.onExit((code) => codes.push(code));
    t.games[1].opts.printErr?.(LOOP_STOPPED_LINE);
    await vi.waitFor(() => expect(codes).toEqual([0]));
  });

  it("시작 중에 abort 하면 띄운 것을 바로 멈추고 canvas 를 버린다", async () => {
    const t = await setup();
    const release = t.hold();
    const launching = t.store.launch({ env: {} });
    await vi.waitFor(() => expect(t.store.phase).toBe("booting"));
    t.store.abort();
    release();
    await expect(launching).rejects.toMatchObject({ name: "AbortError" });
    expect(t.store.phase).toBe("idle");
    expect(t.host.querySelector("canvas")).toBeNull();
  });

  it("엔진 파일이 없으면 실패를 보이고 던진다", async () => {
    const t = await setup();
    const broken = new GameViewStore(
      { backend: t.backend, project: t.project, documents: t.documents, log: t.log },
      { loadRuntime: async () => Promise.reject(new Error("웹 엔진 파일이 없다")) },
    );
    broken.attachHost(t.host);
    await expect(broken.launch({ env: {} })).rejects.toThrow("웹 엔진 파일이 없다");
    expect(broken.phase).toBe("failed");
    expect(broken.message).toContain("웹 엔진 파일이 없다");
    expect(t.host.querySelector("canvas")).toBeNull();
  });

  it("reload: 준 경로(지워진 것은 빼고)나 scripts 와 씬과 맵을 다시 올린다", async () => {
    const t = await setup({ "resources/scenes/title.json": "{}", "resources/images/a.png": "p" });
    await t.store.launch({ env: {} });
    await t.backend.writeText("scripts/lua/main.lua", "print('v2')");
    expect(await t.store.reload(["scripts/lua/main.lua", "scripts/lua/gone.lua"])).toEqual({ count: 1, scriptsFailed: false });
    expect(Object.keys(t.games[0].reloads[0])).toEqual(["scripts/lua/main.lua"]);
    expect(text(t.games[0].reloads[0]["scripts/lua/main.lua"])).toBe("print('v2')");
    expect(await t.store.reload()).toEqual({ count: 3, scriptsFailed: false });
    expect(Object.keys(t.games[0].reloads[1]).sort()).toEqual(["resources/maps/forest.json", "resources/scenes/title.json", "scripts/lua/main.lua"]);
  });
});

describe("엔진이 죽는 길", () => {
  const lines = (session: RunHandle) => {
    const out: string[] = [];
    session.onOutput((line, stream) => out.push(`${stream}: ${line}`));
    return out;
  };
  const exitsOf = (session: RunHandle) => {
    const out: Array<number | null> = [];
    session.onExit((code) => out.push(code));
    return out;
  };

  it("부팅이 WebAssembly.Exception 을 던지면 읽는 글로 실패를 보이고 읽는 글로 던진다", async () => {
    const t = await setup();
    const broken = new GameViewStore(
      { backend: t.backend, project: t.project, documents: t.documents, log: t.log },
      {
        loadRuntime: async () => ({
          manifest: { engineCommit: null, features: ["lua", "wasm"], files: [] },
          boot: async () => {
            throw wasmException();
          },
        }),
        errorTarget: null,
      },
    );
    broken.attachHost(t.host);
    const error = await broken.launch({ env: {} }).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain("C++ 예외");
    expect(broken.phase).toBe("failed");
    expect(broken.message).toContain("C++ 예외");
    expect(broken.message).not.toContain("undefined");
  });

  it("부팅하는 사이 엔진의 예외가 window 에 오면 실패로 끝내고 남은 루프를 멈춘다", async () => {
    const t = await setup();
    const release = t.hold();
    const launching = t.store.launch({ env: {} });
    await vi.waitFor(() => expect(t.store.session).not.toBeNull());
    t.errors.dispatchEvent(errorEvent(wasmException(), "http://127.0.0.1/engine/Initial2D.js"));
    release();
    await expect(launching).rejects.toThrow(/C\+\+ 예외/);
    expect(t.store.phase).toBe("failed");
    expect(t.store.message).toMatch(/^실행하지 못했다: C\+\+ 예외/);
    expect(t.games[0].quits).toBe(1);
    expect(t.host.querySelector("canvas")).toBeNull();
  });

  it("reload 가 false 면 스크립트 오류: 세션은 살아 있고 결과에 적는다. true 면 이전 스크립트 오류를 잊는다", async () => {
    const t = await setup({}, { newLoader: true });
    const session = await t.store.launch({ env: {} });
    const out = lines(session);
    const exits = exitsOf(session);
    t.games[0].reloadResult = false;
    expect(await t.store.reload(["scripts/lua/main.lua"])).toEqual({ count: 1, scriptsFailed: true });
    expect(out).toContain("stderr: Lua error in reload: scripts/lua/main.lua:1: unexpected symbol near 'x'");
    expect(t.store.phase).toBe("running");
    expect(t.store.session).toBe(session);

    t.games[0].reloadResult = true;
    expect(await t.store.reload(["scripts/lua/main.lua"])).toEqual({ count: 1, scriptsFailed: false });
    // 게임이 스스로 끝나면 엔진이 준 코드다 (앞의 스크립트 오류 줄로 1 이 되지 않는다)
    t.games[0].opts.printErr?.(LOOP_STOPPED_LINE);
    t.games[0].opts.onExit?.(0);
    await vi.waitFor(() => expect(exits).toEqual([0]));
  });

  it("reload 가 던지면 세션을 종료 코드 1 로 끝내고 fatal 줄과 상태 띠를 읽는 글로 남긴다", async () => {
    const t = await setup();
    const session = await t.store.launch({ env: {} });
    const out = lines(session);
    const exits = exitsOf(session);
    t.games[0].reloadResult = { throws: wasmException() };
    const error = await t.store.reload(["scripts/lua/main.lua"]).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(error?.message).toMatch(/^엔진이 예외로 멈췄다: C\+\+ 예외/);
    expect(exits).toEqual([1]);
    expect(out.at(-1)).toMatch(/^stderr: fatal: C\+\+ 예외/);
    expect(out.join("\n")).not.toContain("undefined");
    expect(t.store.phase).toBe("ended");
    expect(t.store.lastExitCode).toBe(1);
    expect(t.store.message).toContain("엔진이 예외로 멈췄다 (종료 코드 1)");
    expect(t.store.canvas).toBeNull();
    // 루프가 아직 돌고 있을 수 있어 한 번 quit 한다. 죽은 엔진의 정지는 다시 부르지도 기다리지도 않는다
    expect(t.games[0].quits).toBe(1);
    const started = Date.now();
    await session.stop();
    expect(Date.now() - started).toBeLessThan(20);
    expect(t.games[0].quits).toBe(1);
  });

  it("실행 중 window 까지 올라온 엔진의 오류는 세션을 종료 코드 1 로 끝낸다. 로더의 errorText 를 쓴다", async () => {
    const t = await setup({}, { newLoader: true });
    const session = await t.store.launch({ env: {} });
    const out = lines(session);
    const exits = exitsOf(session);
    // 에디터 자신의 오류는 엔진의 죽음이 아니다
    const own = new Error("editor bug");
    own.stack = "Error: editor bug\n    at http://127.0.0.1/assets/index.js:1:1";
    t.errors.dispatchEvent(errorEvent(own, "http://127.0.0.1/assets/index.js"));
    expect(t.store.phase).toBe("running");

    t.errors.dispatchEvent(errorEvent(wasmException(), "http://127.0.0.1/engine/Initial2D.js"));
    expect(exits).toEqual([1]);
    expect(out.at(-1)).toBe("stderr: fatal: loader: C++ 예외 std::runtime_error: boom");
    expect(t.store.message).toContain("loader: C++ 예외 std::runtime_error: boom");
    // 끝난 뒤의 오류는 듣지 않는다
    t.errors.dispatchEvent(errorEvent(wasmException()));
    expect(out.filter((l) => l.includes("fatal:"))).toHaveLength(1);
  });

  it("처리되지 않은 거부(엔진의 트랩)도 세션을 끝낸다", async () => {
    const t = await setup();
    const session = await t.store.launch({ env: {} });
    const exits = exitsOf(session);
    const out = lines(session);
    t.errors.dispatchEvent(rejectionEvent(new Error("ordinary")));
    expect(exits).toEqual([]);
    t.errors.dispatchEvent(rejectionEvent(new WebAssembly.RuntimeError("memory access out of bounds")));
    expect(exits).toEqual([1]);
    expect(out.at(-1)).toBe("stderr: fatal: RuntimeError: memory access out of bounds");
  });

  it("로더의 onExit 가 준 코드를 따른다 (루프가 멈춘 줄만 보고 짐작하지 않는다)", async () => {
    const t = await setup({}, { newLoader: true });
    const session = await t.store.launch({ env: {} });
    const exits = exitsOf(session);
    t.games[0].opts.printErr?.("fatal: std::bad_alloc");
    t.games[0].opts.onExit?.(1);
    t.games[0].opts.printErr?.(LOOP_STOPPED_LINE);
    await vi.waitFor(() => expect(exits).toEqual([1]));
    expect(t.store.lastExitCode).toBe(1);

    const next = await t.store.launch({ env: {} });
    const codes = exitsOf(next);
    t.games[1].opts.printErr?.("Lua error in update: scripts/lua/main.lua:3: boom");
    t.games[1].opts.onExit?.(0);
    await vi.waitFor(() => expect(codes).toEqual([0]));
    expect(t.store.lastExitCode).toBe(0);
    expect(t.store.message).toContain("게임이 끝났다");
  });

  it("quit 뒤 엔진 프레임이 더 돌지 않으면(이미 죽은 루프) 시간 제한을 기다리지 않는다", async () => {
    const t = await setup({}, { newLoader: true, quitTimeoutMs: 5000 });
    const session = (await t.store.launch({ env: {} })) as GameSession;
    t.games[0].stopsOnQuit = false;
    t.games[0].frameCount = 42;
    const started = Date.now();
    await session.stop();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(session.ended).toBe(true);
    expect(t.store.phase).toBe("ended");
  });

  it("FPS 는 로더에 frames() 가 있으면 엔진 프레임 수, 없으면 페이지의 requestAnimationFrame 수", async () => {
    const frames = manualFrames();
    const t = await setup({}, { newLoader: true });
    await t.store.launch({ env: {} });
    // 페이지는 60번 돌았지만 엔진은 12 프레임만 돌았다
    for (let i = 0; i < 59; i++) frames.step(1000 / 60);
    t.games[0].frameCount = 12;
    frames.step(1000 / 60 + 1);
    expect(t.store.fps).toBe(12);
    // 엔진이 멈추면 0
    for (let i = 0; i < 60; i++) frames.step(1000 / 60 + 0.1);
    expect(t.store.fps).toBe(0);

    const old = await setup();
    await old.store.launch({ env: {} });
    for (let i = 0; i < 60; i++) frames.step(1000 / 60 + 0.1);
    expect(old.store.fps).toBe(60);
  });

  it("capture: 그 프레임 전에 게임이 끝났거나 canvas 크기가 0 이면 null, 읽지 못하면 알아보는 오류", async () => {
    const frames = manualFrames();
    const t = await setup();
    const session = (await t.store.launch({ env: {} })) as GameSession;
    const canvas = t.store.canvas!;

    // SDL 이 창을 닫아 canvas 크기가 0 이 되었다
    canvas.width = 0;
    const zero = t.store.capture();
    frames.step(16);
    await expect(zero).resolves.toBeNull();

    // 읽는 중에 DOM 이 던지는 오류는 알아보는 글로 감싼다
    canvas.width = 320;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new DOMException("The image argument is a canvas element with a width or height of 0.", "InvalidStateError");
    });
    const failing = t.store.capture();
    frames.step(16);
    await expect(failing).rejects.toThrow(/^게임 화면을 읽지 못했다: InvalidStateError: The image argument/);

    // 캡처를 건 뒤 그 프레임 전에 게임이 스스로 끝났다
    const late = t.store.capture();
    t.games[0].opts.printErr?.(LOOP_STOPPED_LINE);
    await vi.waitFor(() => expect(session.ended).toBe(true));
    frames.step(16);
    await expect(late).resolves.toBeNull();
    // 끝난 뒤에는 바로 null
    await expect(t.store.capture()).resolves.toBeNull();
  });

  it("focusCanvas 는 실행 중인 canvas 에 초점을 준다", async () => {
    manualFrames();
    const t = await setup();
    await t.store.launch({ env: {} });
    const other = document.createElement("button");
    document.body.appendChild(other);
    other.focus();
    expect(document.activeElement).toBe(other);
    t.store.focusCanvas();
    expect(document.activeElement).toBe(t.store.canvas);
  });
});

describe("저장 시 핫 리로드 (실행기 + 게임 뷰 + 가짜 로더)", () => {
  it("300ms 안의 저장 셋은 한 번의 reload 로 그 파일들만 다시 올린다", async () => {
    const t = await setup({ "scripts/lua/title.lua": "-- t" });
    const settings = new SettingsStore(new MemorySettingsStorage());
    const toasts = { info: () => {}, success: () => {}, warn: () => {}, error: () => {} };
    const runner = new RunnerStore({ backend: t.backend, project: t.project, settings, log: t.log, toasts, platform: "mac" }, { embedded: t.store });
    const saves = new SaveReloader({
      accepts: (path) =>
        shouldReloadOnSave({ path, reloadOnSave: settings.settings.reloadOnSave, canSpawn: false, running: runner.state === "running", embeddedRunning: runner.embeddedRunning }),
      reload: (paths) => void runner.reload(paths),
    });
    await runner.start();
    expect(runner.embeddedRunning).toBe(true);

    vi.useFakeTimers();
    saves.onSaved("scripts/lua/main.lua");
    await vi.advanceTimersByTimeAsync(150);
    saves.onSaved("scripts/lua/title.lua");
    saves.onSaved("resources/maps/forest.json");
    saves.onSaved("resources/images/a.png"); // 대상 밖
    await vi.advanceTimersByTimeAsync(299);
    expect(t.games[0].reloads).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    await vi.waitFor(() => expect(t.games[0].reloads).toHaveLength(1));
    expect(Object.keys(t.games[0].reloads[0]).sort()).toEqual(["resources/maps/forest.json", "scripts/lua/main.lua", "scripts/lua/title.lua"]);
    await vi.waitFor(() => expect(t.log.entries.some((e) => e.text.startsWith("핫 리로드: 에디터 안 엔진, 3개 파일"))).toBe(true));

    // 설정을 끄면 보내지 않는다
    settings.update({ reloadOnSave: false }, false);
    saves.onSaved("scripts/lua/main.lua");
    expect(saves.pending).toBe(false);
    await runner.stop();
    runner.dispose();
  });
});
