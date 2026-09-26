import { DocumentRegistry, LogStore, MemorySettingsStorage, Project, SettingsStore } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument, parseObjectSchema } from "@initial-editor/ext-tilemap/model";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { playHere, type PlayHost } from "../../../packages/app/src/editor/maps/objectTools/playHere";
import { RunnerStore } from "../../../packages/app/src/editor/runner/RunnerStore";
import { installRunCapture, type RunStartOptions } from "./runCapture";

const REASON = "브라우저 모드에서는 엔진을 띄울 수 없다";
const MAP_PATH = "resources/maps/forest.json";
const MAP = JSON.stringify({
  version: 2,
  name: "forest",
  width: 64,
  height: 4,
  tileWidth: 16,
  tileHeight: 16,
  layers: [{ name: "ground", data: new Array(256).fill(1) }],
  tilesets: [{ image: "resources/images/a.png", firstGid: 1, columns: 1 }],
  objects: [
    { id: "start", type: "start", x: 56, y: 48 },
    { id: "wolf_1", type: "spawn", x: 700, y: 48, props: { species: "wolf", minX: 660, maxX: 740 } },
  ],
});
const SCHEMA = parseObjectSchema(
  JSON.stringify({
    version: 1,
    types: [
      {
        type: "spawn",
        fields: [
          { name: "species", type: "enum", values: ["wolf"] },
          { name: "minX", type: "number", role: "rangeMin", required: true },
          { name: "maxX", type: "number", role: "rangeMax", required: true },
        ],
      },
      { type: "start", unique: true },
    ],
    play: { env: { INITIAL2D_SCENE: "aldebaran", INITIAL2D_ALDEBARAN_STAGE: "{map.name}", INITIAL2D_ALDEBARAN_AT: "{x}" } },
  }),
);

type Holder = Omit<PlayHost, "runner"> & { runner: object };

/** 브라우저 모드처럼 엔진을 못 띄우는 실제 러너와, 늑대를 고른 맵 문서를 든 에디터 흉내 */
async function browserEditor(): Promise<{ holder: Holder; runner: RunnerStore; toasts: string[] }> {
  const mem = new MemoryBackend({ "game.json": '{ "script": "lua" }', [MAP_PATH]: MAP });
  const project = new Project(mem);
  await project.open("/home/u/game");
  const toasts: string[] = [];
  const toast = (level: string) => (text: string) => void toasts.push(`${level}: ${text}`);
  const log = new LogStore();
  const toastSink = { info: toast("info"), success: toast("success"), warn: toast("warn"), error: toast("error") };
  const runner = new RunnerStore({ backend: mem, project, settings: new SettingsStore(new MemorySettingsStorage()), log, toasts: toastSink, platform: "mac" }, { unavailableReason: REASON });
  const doc = await MapDocument.open(mem, MAP_PATH, SCHEMA);
  const documents = new DocumentRegistry();
  documents.open(doc);
  doc.select(["wolf_1"]);
  const holder: Holder = {
    documents,
    log,
    toasts: toastSink,
    runner,
    modals: { confirm: async () => true },
    saveDocument: async (d) => d.save(),
  };
  return { holder, runner, toasts };
}

const play = (holder: Holder) => playHere(holder as PlayHost);

describe("installRunCapture", () => {
  it("브라우저 모드의 러너로는 여기서 실행이 멈추고, 감싸면 에디터가 만든 옵션을 모으며 엔진은 띄우지 않는다", async () => {
    const { holder, runner, toasts } = await browserEditor();
    expect(runnerHints(runner)).toEqual({ reason: REASON, hint: REASON });
    expect(await play(holder)).toBe(false);
    expect(toasts).toEqual([`warn: ${REASON}`]);

    const sink: RunStartOptions[] = [];
    const restore = installRunCapture(holder, sink);
    expect(holder.runner).not.toBe(runner);
    expect(await play(holder)).toBe(true);
    expect(sink).toEqual([{ env: { INITIAL2D_SCENE: "aldebaran", INITIAL2D_ALDEBARAN_STAGE: "forest", INITIAL2D_ALDEBARAN_AT: "612" } }]);
    expect(runner.state).toBe("idle");
    expect(holder.log.entries.some((e) => e.text.includes("여기서 실행: forest x 612, y 48 (선택한 오브젝트 wolf_1"))).toBe(true);

    restore();
    expect(holder.runner).toBe(runner);
    expect(await play(holder)).toBe(false);
    expect(sink).toHaveLength(1);
  });

  it("모은 옵션은 사본이다 (넘긴 뒤 바꿔도 그대로)", async () => {
    const holder = { runner: { start: async () => {} } };
    const sink: RunStartOptions[] = [];
    installRunCapture(holder, sink);
    const opts = { env: { A: "1" } };
    await (holder.runner as { start(o: RunStartOptions): Promise<void> }).start(opts);
    opts.env.A = "2";
    await (holder.runner as { start(): Promise<void> }).start();
    expect(sink).toEqual([{ env: { A: "1" } }, {}]);
  });

  it("나머지 멤버는 원래 러너가 답한다 (MobX 계산 값과 메서드)", async () => {
    const { holder, runner } = await browserEditor();
    installRunCapture(holder, []);
    const wrapped = holder.runner as RunnerStore;
    expect(wrapped.state).toBe("idle");
    expect(wrapped.statusText).toBe(runner.statusText);
    expect(wrapped.statusTitle).toBe(REASON);
    expect(wrapped.canRun).toBe(false);
    const before = runner.now;
    wrapped.tick();
    expect(runner.now).toBeGreaterThanOrEqual(before);
  });

  it("소스만으로 돈다 (page.evaluate에 문자열로 넘긴다)", async () => {
    const fn = runInNewContext(`(${installRunCapture.toString()})`) as typeof installRunCapture;
    const holder = { runner: { unavailableReason: "x", startHint: "y", state: "idle" } };
    const sink: RunStartOptions[] = [];
    const restore = fn(holder, sink);
    const wrapped = holder.runner as { unavailableReason: unknown; startHint: unknown; state: string; start(o: RunStartOptions): Promise<void> };
    expect([wrapped.unavailableReason, wrapped.startHint, wrapped.state]).toEqual([null, undefined, "idle"]);
    await wrapped.start({ env: { INITIAL2D_ALDEBARAN_AT: "1966" } });
    expect(JSON.stringify(sink)).toBe('[{"env":{"INITIAL2D_ALDEBARAN_AT":"1966"}}]');
    restore();
    expect(holder.runner.unavailableReason).toBe("x");
  });
});

function runnerHints(runner: RunnerStore): { reason: string | null; hint: string | undefined } {
  return { reason: runner.unavailableReason, hint: runner.startHint };
}
