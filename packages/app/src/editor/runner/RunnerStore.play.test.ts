// 확장의 실행 제공자가 정한 변수가 프로세스 실행의 RunSpec.env 에 그대로 실린다 (docs/plans/e5-rpg.md 5.2, 마일스톤 6).
// Playwright 는 프로세스 모드를 볼 수 없으므로(브라우저의 백엔드는 엔진을 못 띄운다) 여기서 가짜 백엔드로 본다:
// 앱과 같은 길(확장 호스트에 타일맵과 RPG 확장, 타일맵의 실행 길에 playRequest)로 여기서 실행과 이벤트 실행 명령을 누르고,
// Tauri 처럼 run 을 받는 메모리 백엔드가 받은 RunSpec 을 본다. game.json 은 mruby 이고 엔진 빌드에는 mruby 가 없다:
// RPG 실행은 INITIAL2D_SCRIPT 를 lua 로 덮으므로 언어 검사를 통과해야 한다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CommandRegistry,
  DocumentRegistry,
  Emitter,
  ExtensionHost,
  ExtensionRegistries,
  LogStore,
  MemorySettingsStorage,
  MenuRegistry,
  Project,
  SettingsStore,
  type OutputStream,
  type ProjectBackend,
  type RunHandle,
  type RunSpec,
  type Workspace,
} from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { EVENT_PLAY_COMMAND_IDS, eventsStateOf, rpgExtension, type RpgExports } from "@initial-editor/ext-rpg";
import { TILEMAP_EXTENSION_ID, tilemapExtension, type TilemapApi } from "@initial-editor/ext-tilemap";
import { MapDocument } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it, vi } from "vitest";
import type { ConfirmOptions } from "../modals";
import { playHere, playRequest, runnerBlocked, type PlayHost } from "../maps/objectTools/playHere";
import { NO_MRUBY, RunnerStore, type RunnerHost } from "./RunnerStore";

const FIXTURES = fileURLToPath(new URL("../../../../ext-rpg/test/fixtures/", import.meta.url));
const ENGINE = "/home/u/Initial2D/build/Initial2D";
const PORT = "resources/maps/port_town.json";
const TEXT_FILES = ["resources/schema/event-commands.json", "resources/data/rpg-game.json", "resources/data/items.json", PORT, "resources/maps/inn.json"];

class FakeHandle implements RunHandle {
  id = 1;
  pid = 4321;
  constructor(readonly spec: RunSpec) {}
  onOutput(_cb: (line: string, stream: OutputStream) => void) {
    return () => {};
  }
  onExit(_cb: (code: number | null) => void) {
    return () => {};
  }
  async stop() {}
}

/** 메모리 백엔드에 Tauri 처럼 run 을 붙인 것 */
function tauriLike(mem: MemoryBackend, specs: RunSpec[]): ProjectBackend {
  return new Proxy(mem, {
    get(target, key) {
      if (key === "kind") return "tauri";
      if (key === "capabilities") return { run: true, pickFolder: true, watch: true, hmr: true };
      if (key === "run") {
        return async (spec: RunSpec) => {
          specs.push(spec);
          return new FakeHandle(spec);
        };
      }
      const v = Reflect.get(target, key, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  }) as unknown as ProjectBackend;
}

async function setup() {
  const files: Record<string, string> = { "game.json": '{ "script": "mruby" }', "scripts/lua/maps/port_town.lua": "return {}\n" };
  for (const rel of TEXT_FILES) files[rel] = readFileSync(`${FIXTURES}${rel}`, "utf8");
  const mem = new MemoryBackend(files);
  const specs: RunSpec[] = [];
  const backend = tauriLike(mem, specs);
  const project = new Project(backend);
  await project.open("/home/u/game");
  const log = new LogStore();
  const toasts: string[] = [];
  const toast = (level: string) => (text: string) => void toasts.push(`${level}: ${text}`);
  const toastsApi = { info: toast("info"), success: toast("success"), warn: toast("warn"), error: toast("error") };
  const runnerHost: RunnerHost = { backend, project, settings: new SettingsStore(new MemorySettingsStorage()), log, platform: "mac", toasts: toastsApi };
  const runner = new RunnerStore(runnerHost, { probe: async (exe) => (exe === ENGINE ? ["lua"] : Promise.reject(new Error("없다"))) });
  expect(await runner.resolveEngine()).toBe(ENGINE);
  // 게임의 언어(mruby)만 보면 막히지만, 맵의 실행은 덮은 INITIAL2D_SCRIPT 로 다시 본다
  expect(runner.startHint).toBe(NO_MRUBY);

  const documents = new DocumentRegistry();
  const opened = new Emitter<{ opened: void }>();
  const workspace: Workspace = {
    backend: () => backend,
    project: { isOpen: true, root: "/home/u/game", onOpened: (l) => opened.on("opened", () => l()), onClosed: () => () => {}, onFileChange: (l) => mem.watch(l) },
    documents,
    log,
    toasts: toastsApi,
    openPath: async () => {},
  };
  const commands = new CommandRegistry({ platform: "mac" });
  const extensions = new ExtensionHost({ commands, menus: new MenuRegistry(), registries: new ExtensionRegistries(), workspace });
  await extensions.activateAll([tilemapExtension, rpgExtension]);
  const tilemap = extensions.exportsOf<TilemapApi>(TILEMAP_EXTENSION_ID)!;
  const rpg = extensions.exportsOf<RpgExports>("rpg")!;
  await vi.waitFor(() => expect(rpg.store.loaded).toBe(true));

  const confirms: ConfirmOptions[] = [];
  const support = { cursor: null as { x: number; y: number } | null, center: null as { x: number; y: number } | null, activeMap: null as unknown };
  const host: PlayHost = {
    documents,
    log,
    toasts: toastsApi,
    runner,
    tilemap,
    modals: { confirm: async (o) => (confirms.push(o), true) },
    mapSupport: {
      get cursor() {
        return support.cursor;
      },
      get activeMap() {
        return support.activeMap;
      },
      viewCenter: () => support.center,
    },
    saveDocument: async (d) => void (await d.save()),
  };
  // 앱의 Editor.installTilemapPlaces 와 같은 길
  tilemap.setPlayer({ blocked: () => runnerBlocked(host), play: (d, r) => playRequest(host, d, r) });
  const doc = await MapDocument.open(backend, PORT);
  documents.open(doc);
  support.activeMap = doc;
  const state = eventsStateOf(doc)!;
  expect(state).not.toBeNull();
  return { mem, specs, runner, commands, tilemap, rpg, host, doc, state, support, confirms, toasts, log };
}

const BASE = { INITIAL2D_SCRIPT: "lua", INITIAL2D_SCENE: "rpg", INITIAL2D_MAP: "port_town", INITIAL2D_RPG_TRACE: "1" };

describe("프로세스 실행: 실행 제공자의 plan.env 가 RunSpec.env 에 그대로 실린다", () => {
  it("여기서 실행(고른 이벤트 앞): 러너의 기본 변수 위에 rpgPlay 의 plan.env 를 덮고, mruby 없는 빌드로 lua 가 뜬다", async () => {
    const t = await setup();
    t.state.select([t.state.section.indexOfId("captain")]);
    const plan = t.tilemap.playProviders[0].plan(t.doc, { cursor: null, viewCenter: null })!;
    expect(plan.env).toEqual({ ...BASE, INITIAL2D_RPG_AT: "16,43,down" });
    expect(await playHere(t.host)).toBe(true);
    expect(t.toasts).toEqual([]);
    expect(t.specs).toEqual([{ exe: ENGINE, cwd: "/home/u/game", env: { INITIAL2D_HMR: "1", ...plan.env }, args: [] }]);
    expect(t.runner.state).toBe("running");
    const lines = t.log.entries.map((e) => e.text);
    expect(lines).toContain("여기서 실행: 항구 마을 x 16, y 43 (이벤트 captain 앞) INITIAL2D_SCRIPT=lua INITIAL2D_SCENE=rpg INITIAL2D_MAP=port_town INITIAL2D_RPG_AT=16,43,down INITIAL2D_RPG_TRACE=1");
    expect(lines.some((l) => l.startsWith(`엔진 시작: PID 4321, ${ENGINE}, 언어 lua `))).toBe(true);
  });

  it("이 이벤트 자동 재생 명령: play.probe 와 시작 상태까지 실린다", async () => {
    const t = await setup();
    await t.rpg.store.setStartState(PORT, "arrived,item:shell=1");
    t.state.select([t.state.section.indexOfId("inn_door")]);
    expect(t.commands.isEnabled(EVENT_PLAY_COMMAND_IDS.probe)).toBe(true);
    await t.commands.execute(EVENT_PLAY_COMMAND_IDS.probe);
    expect(t.specs.map((s) => s.env)).toEqual([
      { INITIAL2D_HMR: "1", ...BASE, INITIAL2D_RPG_AT: "13,30,up", INITIAL2D_RPG_STATE: "arrived,item:shell=1", INITIAL2D_AUTOPLAY: "1", INITIAL2D_RPG_ROUTE: "up" },
    ]);
  });

  it("저장하지 않은 맵은 저장할지 묻고, 저장한 파일의 자리로 띄운다 (옮긴 이벤트의 앞 칸)", async () => {
    const t = await setup();
    const kid = t.state.section.indexOfId("kid");
    expect(t.state.run((ed) => ed.moveEvents([kid], 1, 0)).ok).toBe(true);
    t.state.select([kid]);
    expect(t.doc.dirty).toBe(true);
    await t.commands.execute(EVENT_PLAY_COMMAND_IDS.play);
    expect(t.confirms.map((c) => [c.title, c.okLabel])).toEqual([["이 이벤트 앞에서 실행", "저장하고 실행"]]);
    expect(t.doc.dirty).toBe(false);
    const saved = JSON.parse(await t.mem.readText(PORT)) as { events: Array<{ id: string; x: number; y: number }> };
    expect(saved.events.find((e) => e.id === "kid")).toMatchObject({ x: 15, y: 20 });
    expect(t.specs.map((s) => s.env?.INITIAL2D_RPG_AT)).toEqual(["15,21,up"]);
    expect(t.specs[0].env).not.toHaveProperty("INITIAL2D_AUTOPLAY");
  });
});
