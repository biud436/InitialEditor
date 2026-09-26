// @vitest-environment jsdom
// 게임 뷰 스토어를 가짜 웹 엔진 로더로 돌린다: 게임 탭과 canvas, 파일 스테이징과 env, 출력 모으기, 정지와 스스로 끝남,
// 핫 리로드(저장 세 번이 300ms 뒤 한 번의 reload 로).

import { DocumentRegistry, LogStore, MemorySettingsStorage, Project, SettingsStore } from "@initial-editor/core";
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
  constructor(readonly opts: BootOptions) {}
  stage() {}
  reload(files?: Record<string, StageData>) {
    this.reloads.push(files ?? {});
    this.opts.print?.("sample:frame");
  }
  quit() {
    this.quits++;
    if (this.stopsOnQuit) setTimeout(() => this.opts.printErr?.(LOOP_STOPPED_LINE), 1);
  }
  features() {
    return "lua wasm";
  }
}

function text(data: StageData | undefined): string {
  return data instanceof Uint8Array ? new TextDecoder().decode(data) : String(data);
}

async function setup(files: Record<string, string> = {}) {
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
    boot: async (opts) => {
      if (gate) await gate;
      const game = new FakeGame(opts);
      games.push(game);
      // 부팅 중에 찍는 줄 (구독자가 붙기 전이다)
      opts.printErr?.("Initial2D web: renderer=opengles2 window=320x240 scale=1 features=lua wasm");
      opts.print?.("sample:frame");
      return game;
    },
  };
  const store = new GameViewStore({ backend, project, documents, log }, { loadRuntime: async () => runtime, quitTimeoutMs: 50, concurrency: 2 });
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
    expect(await t.store.reload(["scripts/lua/main.lua", "scripts/lua/gone.lua"])).toBe(1);
    expect(Object.keys(t.games[0].reloads[0])).toEqual(["scripts/lua/main.lua"]);
    expect(text(t.games[0].reloads[0]["scripts/lua/main.lua"])).toBe("print('v2')");
    expect(await t.store.reload()).toBe(3);
    expect(Object.keys(t.games[0].reloads[1]).sort()).toEqual(["resources/maps/forest.json", "resources/scenes/title.json", "scripts/lua/main.lua"]);
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
