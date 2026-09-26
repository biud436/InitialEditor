// @vitest-environment jsdom
// 게임 뷰 스토어를 가짜 웹 엔진 로더로 돌린다: 게임 탭과 canvas, 파일 스테이징과 env, 출력 모으기, 정지와 스스로 끝남,
// 핫 리로드(저장 세 번이 300ms 뒤 한 번의 reload 로), 엔진이 죽는 길(예외, onExit, 스크립트 오류), FPS, 화면 읽기.
// 가짜 로더는 로더 계약(onExit, frames, errorText, reload 의 true 와 false)을 따르지 않는 빌드와 따르는 빌드 둘 다 흉내 낸다.
// step 과 scriptError 는 엔진의 프레임 루프를 흉내 낸다: reload 밖의 스크립트 오류는 줄을 찍고 루프에 종료를 요청하고,
// 요청은 다음 프레임에 루프를 내리며, 성공한 reload 는 요청을 지우지 않는다.

import { DocumentRegistry, LogStore, MemorySettingsStorage, Project, SettingsStore, type RunHandle } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveReloader, shouldReloadOnSave } from "../runner/reloadOnSave";
import { ENDED_RELOAD_DROPPED, RunnerStore, START_ENDED_RELOAD_DROPPED } from "../runner/RunnerStore";
import type { BootOptions, EngineGame, EngineRuntime, StageData } from "./engineAssets";
import { GAME_KIND, GameDocument } from "./GameDocument";
import { GameSession, LOOP_STOPPED_LINE } from "./GameSession";
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
  /** 엔진 흉내: 스크립트가 오류로 멈춰 있다 (Script_Failed, 종료 코드가 된다) */
  scriptFailed = false;
  /** 엔진 흉내: 루프에 종료를 요청해 두었다 (App::Quit 의 SDL_QUIT, 다음 프레임에 본다) */
  quitRequested = false;
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
      // 재시작 중의 오류는 스크립트만 멈추고 종료를 요청하지 않는다
      this.opts.printErr?.("Lua error in reload: scripts/lua/main.lua:1: unexpected symbol near 'x'");
      this.scriptFailed = true;
      return false;
    }
    // 새 VM 이 떴다. 걸어 둔 종료 요청은 그대로다
    this.scriptFailed = false;
    this.opts.print?.("sample:frame");
    return result;
  }
  /** reload 밖(init, update, render)의 스크립트 오류: 줄을 찍고 루프에 종료를 요청한다 (ScriptRuntime.cpp 의 MarkFailed) */
  scriptError(where: string) {
    this.opts.printErr?.(`Lua error in ${where}: ./scripts/lua/main.lua:2: boom in ${where}`);
    this.scriptFailed = true;
    this.quitRequested = true;
  }
  /** 프레임 하나 (WebMain.cpp 의 Frame): 종료 요청이 있으면 프레임 수를 올리고 루프를 내린다. 아니면 update 와 render 를 돈다 */
  step(error?: "update" | "render") {
    const running = !this.quitRequested;
    if (running && error) this.scriptError(error);
    this.frameCount++;
    if (running) return;
    this.opts.printErr?.(LOOP_STOPPED_LINE);
    if (this.newLoader) this.opts.onExit?.(this.scriptFailed ? 1 : 0);
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

async function setup(files: Record<string, string> = {}, opts: { newLoader?: boolean; quitTimeoutMs?: number; onBoot?: (game: FakeGame) => void } = {}) {
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
      opts.onBoot?.(game);
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
        shouldReloadOnSave({ path, reloadOnSave: settings.settings.reloadOnSave, canSpawn: false, running: runner.state === "running", embeddedActive: runner.embeddedActive }),
      reload: (paths) => void runner.reload(paths, { fromSave: true }),
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

  /** 실행기, 저장 리로더, 게임 뷰를 잇는다. 메모리 백엔드(밖의 엔진이 없다, capabilities.hmr이 false)의 연결과 같다 */
  function wire(t: Awaited<ReturnType<typeof setup>>) {
    const settings = new SettingsStore(new MemorySettingsStorage());
    const toasts: string[] = [];
    const toast = (level: string) => (text: string) => void toasts.push(`${level}: ${text}`);
    const runner = new RunnerStore(
      { backend: t.backend, project: t.project, settings, log: t.log, toasts: { info: toast("info"), success: toast("success"), warn: toast("warn"), error: toast("error") }, platform: "mac" },
      { embedded: t.store },
    );
    const saves = new SaveReloader(
      {
        accepts: (path) =>
          shouldReloadOnSave({ path, reloadOnSave: true, canSpawn: false, running: runner.state === "running", embeddedActive: runner.embeddedActive, canPush: runner.canPush }),
        reload: (paths) => void runner.reload(paths, { fromSave: true }),
      },
      10,
    );
    return { runner, saves, toasts };
  }

  it("파일을 올리는 중에 저장하면(그 파일은 이미 읽었다) 백엔드로 보내지 않고 엔진이 뜬 뒤 새 글로 다시 올린다", async () => {
    const t = await setup({ "scripts/lua/title.lua": "-- t" });
    const { runner, saves, toasts } = wire(t);
    // main.lua 를 읽은 뒤의 파일은 멈춰 있다 (큰 프로젝트의 긴 스테이징)
    const read = t.backend.readBinary.bind(t.backend);
    const readPaths: string[] = [];
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    t.backend.readBinary = async (p: string) => {
      const data = await read(p);
      const late = readPaths.includes("scripts/lua/main.lua");
      readPaths.push(p);
      if (late) await slow;
      return data;
    };
    const starting = runner.start();
    await vi.waitFor(() => expect(readPaths).toContain("scripts/lua/main.lua"));
    expect(t.store.phase).toBe("staging");
    await t.backend.writeText("scripts/lua/main.lua", "print('v2')");
    saves.onSaved("scripts/lua/main.lua");
    await vi.waitFor(() => expect(saves.pending).toBe(false));
    await Promise.resolve();
    expect(t.backend.pushed).toEqual([]);
    expect(t.log.entries.some((e) => e.text.startsWith("핫 리로드: 에디터 안 엔진이 뜨는 중이다"))).toBe(true);

    release();
    await starting;
    expect(runner.state).toBe("running");
    const game = t.games[0];
    expect(text(game.opts.files?.["scripts/lua/main.lua"])).toBe("print('main')");
    await vi.waitFor(() => expect(game.reloads).toHaveLength(1));
    expect(Object.keys(game.reloads[0])).toEqual(["scripts/lua/main.lua"]);
    expect(text(game.reloads[0]["scripts/lua/main.lua"])).toBe("print('v2')");
    expect(t.backend.pushed).toEqual([]);
    expect(t.log.entries.some((e) => e.text.includes("개 파일을 보냈다"))).toBe(false);
    expect(toasts).toEqual([]);
    await runner.stop();
    runner.dispose();
  });

  it("엔진을 띄우는 중(부팅)에 저장해도 뜬 뒤 그 파일을 다시 올린다", async () => {
    const t = await setup();
    const { runner, saves } = wire(t);
    const open = t.hold();
    const starting = runner.start();
    await vi.waitFor(() => expect(t.store.phase).toBe("booting"));
    await t.backend.writeText("scripts/lua/main.lua", "print('v3')");
    saves.onSaved("scripts/lua/main.lua");
    await vi.waitFor(() => expect(saves.pending).toBe(false));
    expect(t.games).toHaveLength(0);
    open();
    await starting;
    await vi.waitFor(() => expect(t.games[0].reloads).toHaveLength(1));
    expect(text(t.games[0].reloads[0]["scripts/lua/main.lua"])).toBe("print('v3')");
    expect(t.backend.pushed).toEqual([]);
    await runner.stop();
    runner.dispose();
  });

  it("메모리 모드에서 게임이 끝난 뒤 저장하면 리로드하지 않고 리로드했다고 적지 않는다", async () => {
    const t = await setup();
    const { runner, saves, toasts } = wire(t);
    await runner.start();
    await runner.stop();
    expect(t.store.phase).toBe("ended");
    const before = t.log.entries.length;
    saves.onSaved("scripts/lua/main.lua");
    expect(saves.pending).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(t.backend.pushed).toEqual([]);
    expect(t.log.entries.slice(before).filter((e) => e.text.includes("리로드"))).toEqual([]);
    expect(toasts.filter((x) => x.includes("리로드"))).toEqual([]);
    runner.dispose();
  });
  it("시작 스크립트의 오류로 첫 프레임에 끝나는 게임이 부팅 중에 받은 저장은 올리지 않고 한 줄 남기며, F5는 저장한 글로 돈다 (새 로더)", async () => {
    const t = await setup({}, { newLoader: true });
    const { runner, saves, toasts } = wire(t);
    expect(runner.canPush).toBe(false);
    const open = t.hold();
    const starting = runner.start();
    await vi.waitFor(() => expect(t.store.phase).toBe("booting"));
    await t.backend.writeText("scripts/lua/main.lua", "print('fixed')");
    saves.onSaved("scripts/lua/main.lua");
    await vi.waitFor(() => expect(saves.pending).toBe(false));
    open();
    await starting;
    expect(runner.state).toBe("running");
    const game = t.games[0];
    // 엔진은 시작 스크립트의 오류를 찍고 종료를 요청해 두었다. 아직 첫 프레임 전이라 고침을 올리지 않는다
    game.opts.printErr?.("Lua error in init: ./scripts/lua/main.lua:2: boom in init");
    await new Promise((r) => setTimeout(r, 50));
    expect(game.reloads).toEqual([]);
    // 첫 프레임: 엔진은 프레임 수를 올리고 같은 콜백에서 루프를 내린다
    game.frameCount = 1;
    game.opts.printErr?.(LOOP_STOPPED_LINE);
    game.opts.onExit?.(1);
    await vi.waitFor(() => expect(runner.state).toBe("idle"));
    await new Promise((r) => setTimeout(r, 30));
    expect(game.reloads).toEqual([]);
    expect(runner.exitCode).toBe(1);
    expect(t.store.phase).toBe("ended");
    expect(t.log.entries.filter((e) => e.text === START_ENDED_RELOAD_DROPPED)).toHaveLength(1);
    expect(t.log.entries.some((e) => e.text.includes("다시 올렸다"))).toBe(false);
    expect(t.backend.pushed).toEqual([]);
    expect(toasts).toEqual(["error: 엔진이 종료 코드 1 로 끝났다. 콘솔을 본다"]);

    // 다시 실행하면 저장한 글을 처음부터 올린다
    await runner.start();
    expect(runner.state).toBe("running");
    expect(text(t.games[1].opts.files?.["scripts/lua/main.lua"])).toBe("print('fixed')");
    await runner.stop();
    runner.dispose();
  });

  it("부팅 중과 첫 프레임 전에 받은 저장은 엔진이 첫 프레임을 돌고 아직 돌 때 한 번에 올린다 (새 로더)", async () => {
    const t = await setup({}, { newLoader: true });
    const { runner, saves, toasts } = wire(t);
    const open = t.hold();
    const starting = runner.start();
    await vi.waitFor(() => expect(t.store.phase).toBe("booting"));
    await t.backend.writeText("scripts/lua/main.lua", "print('v4')");
    saves.onSaved("scripts/lua/main.lua");
    await vi.waitFor(() => expect(saves.pending).toBe(false));
    open();
    await starting;
    const game = t.games[0];
    await new Promise((r) => setTimeout(r, 50));
    expect(game.reloads).toEqual([]);
    // 뜬 뒤 첫 프레임 전의 저장도 모은다
    await t.backend.writeText("resources/maps/forest.json", '{"v":2}');
    saves.onSaved("resources/maps/forest.json");
    await vi.waitFor(() => expect(saves.pending).toBe(false));
    await new Promise((r) => setTimeout(r, 30));
    expect(game.reloads).toEqual([]);
    game.frameCount = 1;
    await vi.waitFor(() => expect(game.reloads).toHaveLength(1));
    expect(Object.keys(game.reloads[0]).sort()).toEqual(["resources/maps/forest.json", "scripts/lua/main.lua"]);
    expect(text(game.reloads[0]["scripts/lua/main.lua"])).toBe("print('v4')");
    await vi.waitFor(() => expect(t.log.entries.some((e) => e.text.startsWith("핫 리로드: 에디터 안 엔진, 2개 파일을 다시 올렸다"))).toBe(true));
    expect(t.log.entries.some((e) => e.text === START_ENDED_RELOAD_DROPPED)).toBe(false);
    expect(toasts).toEqual([]);
    await runner.stop();
    runner.dispose();
  });

  const MAIN = "scripts/lua/main.lua";
  const lineCount = (t: Awaited<ReturnType<typeof setup>>, line: string) => t.log.entries.filter((e) => e.text === line).length;

  /** 버린 리로드 말고는 리로드를 적지 않았고, 오류는 엔진이 준 종료 코드 1 의 알림뿐이다 */
  function expectOnlyDropped(t: Awaited<ReturnType<typeof setup>>, toasts: string[], label: string) {
    const runnerLines = t.log.entries.filter((e) => e.source === "runner");
    expect(runnerLines.some((e) => e.text.includes("다시 올렸다")), label).toBe(false);
    expect(runnerLines.some((e) => e.text.startsWith("핫 리로드 실패")), label).toBe(false);
    expect(runnerLines.filter((e) => e.level === "error").map((e) => e.text), label).toEqual([expect.stringMatching(/^엔진 종료 코드 1 /)]);
    expect(toasts, label).toEqual(["error: 엔진이 종료 코드 1 로 끝났다. 콘솔을 본다"]);
    // 가짜 엔진은 부팅과 성공한 reload 에서 sample:frame 을 찍는다
    expect(t.log.entries.filter((e) => e.source === "engine" && e.text === "sample:frame"), label).toHaveLength(1);
    expect(t.backend.pushed, label).toEqual([]);
  }

  it("시작 스크립트의 오류 줄이 오면 첫 프레임을 기다리지 않고 부팅 중의 저장을 버리고, 루프가 멈추기 전의 저장도 올리지 않는다 (새 로더)", async () => {
    const t = await setup({}, { newLoader: true, onBoot: (game) => game.scriptError("init") });
    const { runner, saves, toasts } = wire(t);
    const open = t.hold();
    const starting = runner.start();
    await vi.waitFor(() => expect(t.store.phase).toBe("booting"));
    await t.backend.writeText(MAIN, "print('fixed')");
    saves.onSaved(MAIN);
    await vi.waitFor(() => expect(saves.pending).toBe(false));
    open();
    await starting;
    const game = t.games[0];
    expect(runner.state).toBe("running");
    expect(game.frameCount).toBe(0);
    // 오류 줄만으로 끝나는 중이다: 첫 프레임 전에 버리고 한 줄
    await vi.waitFor(() => expect(lineCount(t, START_ENDED_RELOAD_DROPPED)).toBe(1));
    expect(game.reloads).toEqual([]);
    // 루프가 멈추기 전에 한 번 더 저장해도 올리지 않고, 끝나는 게임의 한 줄을 남긴다
    saves.onSaved(MAIN);
    await vi.waitFor(() => expect(lineCount(t, ENDED_RELOAD_DROPPED)).toBe(1));
    expect(game.reloads).toEqual([]);
    expect(runner.state).toBe("running");
    // 첫 프레임: 걸어 둔 종료 요청으로 루프를 내린다
    game.step();
    await vi.waitFor(() => expect(runner.state).toBe("idle"));
    expect(runner.exitCode).toBe(1);
    expect(t.store.lastExitCode).toBe(1);
    expect(game.reloads).toEqual([]);
    expect(lineCount(t, START_ENDED_RELOAD_DROPPED)).toBe(1);
    expect(lineCount(t, ENDED_RELOAD_DROPPED)).toBe(1);
    expectOnlyDropped(t, toasts, "init");
    runner.dispose();
  });

  it("첫 update 나 render 의 오류로 끝나는 게임이 부팅 중에 받은 저장은 첫 프레임 뒤에도 올리지 않고 한 줄 남기며, 종료 코드는 엔진이 준 1이다 (새 로더)", async () => {
    for (const where of ["update", "render"] as const) {
      const t = await setup({}, { newLoader: true });
      const { runner, saves, toasts } = wire(t);
      const open = t.hold();
      const starting = runner.start();
      await vi.waitFor(() => expect(t.store.phase).toBe("booting"));
      await t.backend.writeText(MAIN, "print('fixed')");
      saves.onSaved(MAIN);
      await vi.waitFor(() => expect(saves.pending).toBe(false));
      open();
      await starting;
      const game = t.games[0];
      await new Promise((r) => setTimeout(r, 40));
      expect(game.reloads, where).toEqual([]);
      // 첫 프레임: 오류 줄을 찍고 종료를 요청한다. 프레임 수는 1 이고 루프는 아직 돈다
      game.step(where);
      expect(game.frameCount, where).toBe(1);
      await vi.waitFor(() => expect(lineCount(t, START_ENDED_RELOAD_DROPPED), where).toBe(1));
      await new Promise((r) => setTimeout(r, 40));
      expect(game.reloads, where).toEqual([]);
      expect(runner.state, where).toBe("running");
      // 다음 프레임에 루프가 멈춘다
      game.step();
      await vi.waitFor(() => expect(runner.state, where).toBe("idle"));
      expect(runner.exitCode, where).toBe(1);
      expect(t.store.lastExitCode, where).toBe(1);
      expect(t.store.message, where).toContain("게임이 오류로 끝났다 (종료 코드 1)");
      expect(game.reloads, where).toEqual([]);
      expect(lineCount(t, START_ENDED_RELOAD_DROPPED), where).toBe(1);
      expectOnlyDropped(t, toasts, where);

      // F5는 저장한 글을 처음부터 올린다
      await runner.start();
      expect(text(t.games[1].opts.files?.[MAIN]), where).toBe("print('fixed')");
      await runner.stop();
      runner.dispose();
    }
  });

  it("실행 중 update 의 오류와 루프가 멈추는 프레임 사이에 든 저장은 올리지 않고 한 줄 남긴다. 파일을 읽는 사이에 오류가 나거나 게임이 끝나도 같다 (새 로더)", async () => {
    for (const order of ["error then save", "error while reading", "ended while reading"] as const) {
      const t = await setup({}, { newLoader: true });
      const { runner, saves, toasts } = wire(t);
      await runner.start();
      const game = t.games[0];
      game.step();
      game.step();
      game.step();
      await new Promise((r) => setTimeout(r, 40));
      await t.backend.writeText(MAIN, "print('fixed')");
      if (order === "error then save") {
        game.step("update");
        saves.onSaved(MAIN);
      } else {
        // 리로드가 파일을 읽는 동안 멈춰 둔다
        const read = t.backend.readBinary.bind(t.backend);
        let reading = false;
        let release!: () => void;
        const held = new Promise<void>((r) => (release = r));
        t.backend.readBinary = async (p: string) => {
          reading = true;
          await held;
          return read(p);
        };
        saves.onSaved(MAIN);
        await vi.waitFor(() => expect(reading, order).toBe(true));
        game.step("update");
        if (order === "ended while reading") {
          game.step();
          await vi.waitFor(() => expect(runner.state, order).toBe("idle"));
        }
        release();
      }
      await vi.waitFor(() => expect(lineCount(t, ENDED_RELOAD_DROPPED), order).toBe(1));
      expect(game.reloads, order).toEqual([]);
      if (order !== "ended while reading") {
        expect(runner.state, order).toBe("running");
        game.step();
      }
      await vi.waitFor(() => expect(runner.state, order).toBe("idle"));
      expect(runner.exitCode, order).toBe(1);
      expect(game.reloads, order).toEqual([]);
      expect(lineCount(t, ENDED_RELOAD_DROPPED), order).toBe(1);
      expect(lineCount(t, START_ENDED_RELOAD_DROPPED), order).toBe(0);
      expect(t.log.entries.find((e) => e.text === ENDED_RELOAD_DROPPED)?.level, order).toBe("info");
      expectOnlyDropped(t, toasts, order);
      runner.dispose();
    }
  });

  it("실행 중 저장한 문법 오류(reload 안에서 찍힌 오류 줄)는 게임을 끝내지 않아 고친 저장을 다시 올린다 (새 로더)", async () => {
    const t = await setup({}, { newLoader: true });
    const { runner, saves, toasts } = wire(t);
    await runner.start();
    const session = t.store.session!;
    const game = t.games[0];
    game.step();
    game.step();
    await new Promise((r) => setTimeout(r, 40));
    const runnerTexts = () => t.log.entries.filter((e) => e.source === "runner").map((e) => e.text);

    game.reloadResult = false;
    await t.backend.writeText(MAIN, "local = = =");
    saves.onSaved(MAIN);
    await vi.waitFor(() => expect(game.reloads).toHaveLength(1));
    await vi.waitFor(() => expect(runnerTexts().some((x) => x.includes("스크립트 오류로 VM 이 다시 뜨지 못했다"))).toBe(true));
    expect(t.log.entries.some((e) => e.source === "engine" && e.text.startsWith("Lua error in reload"))).toBe(true);
    expect(session.ending).toBe(false);
    // 게임은 돈다 (스크립트만 멈췄다)
    game.step();
    game.step();
    expect(runner.state).toBe("running");

    game.reloadResult = true;
    await t.backend.writeText(MAIN, "print('fixed')");
    saves.onSaved(MAIN);
    await vi.waitFor(() => expect(game.reloads).toHaveLength(2));
    expect(text(game.reloads[1][MAIN])).toBe("print('fixed')");
    await vi.waitFor(() => expect(runnerTexts().filter((x) => x.startsWith("핫 리로드: 에디터 안 엔진, 1개 파일을 다시 올렸다"))).toHaveLength(1));
    game.step();
    expect(runner.state).toBe("running");
    expect(session.ending).toBe(false);
    expect(lineCount(t, ENDED_RELOAD_DROPPED)).toBe(0);
    expect(lineCount(t, START_ENDED_RELOAD_DROPPED)).toBe(0);
    expect(runnerTexts().some((x) => x.startsWith("핫 리로드 실패"))).toBe(false);
    expect(toasts).toEqual(["warn: 핫 리로드: 스크립트 오류. 콘솔의 오류 줄을 본다"]);
    await runner.stop();
    expect(runner.exitCode).toBeNull();
    runner.dispose();
  });
});

describe("GameSession.whenStepped", () => {
  function session() {
    const ended: Array<number | null> = [];
    const s = new GameSession({ id: 1, onEnded: (_s, code) => void ended.push(code) });
    return { s, ended };
  }
  const game = (frames?: () => number) =>
    ({ module: { FS: { readFile: () => new Uint8Array(), writeFile: () => {} } }, exitCode: 0, stage() {}, reload() {}, quit() {}, features: () => "lua wasm", frames }) as EngineGame;

  it("엔진이 프레임을 하나 이상 돌았고 루프가 돌면 true", async () => {
    const { s } = session();
    let n = 0;
    s.attach(game(() => n));
    let result: boolean | null = null;
    void s.whenStepped(5).then((v) => (result = v));
    await new Promise((r) => setTimeout(r, 30));
    expect(result).toBeNull();
    n = 1;
    await vi.waitFor(() => expect(result).toBe(true));
  });

  it("첫 프레임에서 루프가 멈추면(프레임 수는 1) false, 세션이 끝났거나 붙은 엔진이 없어도 false", async () => {
    const { s } = session();
    let n = 0;
    s.attach(game(() => n));
    const waiting = s.whenStepped(5);
    n = 1;
    s.printErr(LOOP_STOPPED_LINE);
    expect(await waiting).toBe(false);
    expect(await s.whenStepped(5)).toBe(false);
    expect(await session().s.whenStepped(5)).toBe(false);
  });

  it("frames()가 없는 로더는 알 수 없어서 바로 true", async () => {
    const { s } = session();
    s.attach(game());
    expect(await s.whenStepped(5)).toBe(true);
  });

  it("reload 밖에서 stderr 로 온 스크립트 오류 줄이면 끝나는 중(ending)이라 첫 프레임 뒤에도 false. reloadWith 안의 줄, 게임이 print 한 글, 리로드 실패 알림은 아니다", async () => {
    const { s, ended } = session();
    let n = 0;
    s.attach(game(() => n));
    s.print("Lua error in update: 게임이 print 한 글");
    s.reloadWith(() => s.printErr("Lua error in scripts/lua/main.lua: ./scripts/lua/main.lua:1: unexpected symbol near '='"));
    s.printErr("HotReload: reload failed (web, script error), scripts stopped until the next reload");
    expect(s.ending).toBe(false);
    // reloadWith 안에서 던져도 표시는 되돌린다
    expect(() =>
      s.reloadWith(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    n = 1;
    expect(await s.whenStepped(5)).toBe(true);

    n = 2;
    s.printErr("Lua error in update: ./scripts/lua/main.lua:23: boom in update");
    expect(s.ending).toBe(true);
    expect(s.dead).toBe(false);
    expect(s.ended).toBe(false);
    expect(await s.whenStepped(5)).toBe(false);
    expect(ended).toEqual([]);
  });

  it("시작 스크립트의 오류 줄(부팅 중, 첫 프레임 전)이면 프레임을 기다리지 않고 false. frames()가 없는 로더도 같다", async () => {
    for (const frames of [() => 0, undefined]) {
      const { s } = session();
      s.printErr("mruby: uncaught exception in init");
      s.attach(game(frames));
      expect(s.ending).toBe(true);
      expect(await s.whenStepped(5)).toBe(false);
    }
  });
});
