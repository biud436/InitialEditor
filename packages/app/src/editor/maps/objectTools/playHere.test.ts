import { DocumentRegistry, LogStore, type Document } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument, parseObjectSchema, type MapObjectSchema } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import type { ConfirmOptions } from "../../modals";
import { NO_PLAY_HINT, PLAY_POSITION_RULE } from "./rules";
import { NEED_MAP_TAB, playHere, playHereHint, type PlayHost } from "./playHere";

const MAP_PATH = "resources/maps/aldebaran_forest.json";
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
    { id: "wolf_1", type: "spawn", x: 700, y: 48, props: { species: "wolf" } },
  ],
});

const SCHEMA = parseObjectSchema(
  JSON.stringify({
    version: 1,
    types: [
      { type: "spawn", fields: [{ name: "species", type: "enum", values: ["wolf"] }] },
      { type: "start", unique: true },
    ],
    play: { env: { INITIAL2D_SCENE: "aldebaran", INITIAL2D_SKIP_INTRO: "1", INITIAL2D_ALDEBARAN_STAGE: "{map.name}", INITIAL2D_ALDEBARAN_AT: "{x}" } },
  }),
);

interface Fake {
  host: PlayHost;
  doc: MapDocument;
  mem: MemoryBackend;
  starts: Array<{ env?: Record<string, string> }>;
  confirms: ConfirmOptions[];
  toasts: string[];
  saved: Document[];
  support: { cursor: { x: number; y: number } | null; center: { x: number; y: number } | null; activeMap: unknown };
}

// 순찰 범위 칸이 있는 스키마 (resources/schema/map-objects.json과 같은 모양)
const RANGE_SCHEMA = parseObjectSchema(
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
    play: { env: { INITIAL2D_ALDEBARAN_STAGE: "{map.name}", INITIAL2D_ALDEBARAN_AT: "{x}" } },
  }),
);

async function fake(opts: { reason?: string | null; hint?: string; schema?: MapObjectSchema | null; confirm?: boolean } = {}): Promise<Fake> {
  const mem = new MemoryBackend({ "game.json": "{}", [MAP_PATH]: MAP });
  await mem.open("/home/u/game");
  const doc = await MapDocument.open(mem, MAP_PATH, opts.schema === undefined ? SCHEMA : opts.schema);
  const documents = new DocumentRegistry();
  documents.open(doc);
  const starts: Fake["starts"] = [];
  const confirms: ConfirmOptions[] = [];
  const toasts: string[] = [];
  const saved: Document[] = [];
  const support: Fake["support"] = { cursor: null, center: null, activeMap: doc };
  const toast = (level: string) => (text: string) => void toasts.push(`${level}: ${text}`);
  const host: PlayHost = {
    documents,
    log: new LogStore(),
    toasts: { info: toast("info"), success: toast("success"), warn: toast("warn"), error: toast("error") },
    runner: {
      unavailableReason: opts.reason ?? null,
      startHint: opts.hint,
      start: async (o) => void starts.push(o),
    },
    modals: {
      confirm: async (o) => {
        confirms.push(o);
        return opts.confirm ?? true;
      },
    },
    mapSupport: {
      get cursor() {
        return support.cursor;
      },
      get activeMap() {
        return support.activeMap;
      },
      viewCenter: () => support.center,
    },
    saveDocument: async (d) => {
      saved.push(d);
      await d.save();
    },
  };
  return { host, doc, mem, starts, confirms, toasts, saved, support };
}

describe("여기서 실행", () => {
  it("선택한 오브젝트의 x 로 play.env 를 채워 러너에 넘긴다", async () => {
    const f = await fake();
    f.support.cursor = { x: 10, y: 10 };
    f.doc.select(["wolf_1"]);
    expect(playHereHint(f.host)).toBeUndefined();
    expect(await playHere(f.host)).toBe(true);
    expect(f.starts).toEqual([{ env: { INITIAL2D_SCENE: "aldebaran", INITIAL2D_SKIP_INTRO: "1", INITIAL2D_ALDEBARAN_STAGE: "forest", INITIAL2D_ALDEBARAN_AT: "700" } }]);
    expect(f.host.log.entries.some((e) => e.text.includes("여기서 실행: forest x 700, y 48 (선택한 오브젝트 wolf_1)"))).toBe(true);
  });

  it("고른 것이 없으면 커서, 그다음 화면 가운데, 그다음 시작 지점", async () => {
    const f = await fake();
    f.support.cursor = { x: 333.3, y: 20 };
    f.support.center = { x: 512, y: 32 };
    await playHere(f.host);
    f.support.cursor = null;
    await playHere(f.host);
    f.support.center = null;
    await playHere(f.host);
    expect(f.starts.map((s) => s.env?.INITIAL2D_ALDEBARAN_AT)).toEqual(["333", "512", "56"]);
  });

  it("맵 밖에 남은 커서와 다른 맵의 커서는 쓰지 않고 화면 가운데로 간다", async () => {
    const f = await fake();
    f.support.center = { x: 512, y: 32 };
    f.support.cursor = { x: -74, y: 32 };
    await playHere(f.host);
    f.support.cursor = { x: 4300, y: 32 };
    await playHere(f.host);
    f.support.cursor = { x: 138, y: -31 };
    await playHere(f.host);
    f.support.cursor = { x: 300, y: 20 };
    f.support.activeMap = null;
    await playHere(f.host);
    f.support.activeMap = f.doc;
    await playHere(f.host);
    expect(f.starts.map((s) => s.env?.INITIAL2D_ALDEBARAN_AT)).toEqual(["512", "512", "512", "512", "300"]);
  });

  it("순찰 범위가 있는 몬스터를 고르면 범위 왼끝에서 48px 왼쪽에서 시작한다", async () => {
    const f = await fake({ schema: RANGE_SCHEMA });
    f.doc.apply(f.doc.model.setObjectProp("wolf_1", "minX", 640));
    f.doc.select(["wolf_1"]);
    await playHere(f.host);
    expect(f.starts[0].env?.INITIAL2D_ALDEBARAN_AT).toBe("592");
    expect(f.host.log.entries.some((e) => e.text.includes("x 592, y 48 (선택한 오브젝트 wolf_1, 순찰 범위 왼끝 640에서 48px 왼쪽)"))).toBe(true);
    f.doc.select(["start"]);
    await playHere(f.host);
    expect(f.starts[1].env?.INITIAL2D_ALDEBARAN_AT).toBe("56");
  });

  it("저장하지 않은 맵은 저장할지 묻고, 저장하고 실행을 고르면 저장한 뒤 띄운다", async () => {
    const f = await fake();
    f.doc.apply(f.doc.model.moveObjects([{ id: "wolf_1", x: 900, y: 48 }]));
    f.doc.select(["wolf_1"]);
    expect(f.doc.dirty).toBe(true);
    await playHere(f.host);
    expect(f.confirms.map((c) => [c.okLabel, c.cancelLabel])).toEqual([["저장하고 실행", "취소"]]);
    expect(f.saved).toEqual([f.doc]);
    expect(f.doc.dirty).toBe(false);
    expect(JSON.parse(await f.mem.readText(MAP_PATH)).objects[1].x).toBe(900);
    expect(f.starts[0].env?.INITIAL2D_ALDEBARAN_AT).toBe("900");
  });

  it("취소하면 저장도 실행도 하지 않는다", async () => {
    const f = await fake({ confirm: false });
    f.doc.apply(f.doc.model.moveObjects([{ id: "wolf_1", x: 900, y: 48 }]));
    expect(await playHere(f.host)).toBe(false);
    expect(f.saved).toEqual([]);
    expect(f.starts).toEqual([]);
    expect(f.doc.dirty).toBe(true);
  });

  it("밖에서 바뀐 맵의 저장 충돌 모달에서 취소하면 디스크를 두고 실행하지 않는다", async () => {
    const f = await fake();
    f.doc.apply(f.doc.model.moveObjects([{ id: "wolf_1", x: 900, y: 48 }]));
    const outside = MAP.replace('"x":700', '"x":745');
    expect(outside).not.toBe(MAP);
    f.mem.simulateExternalChange(MAP_PATH, "modify", outside);
    const asked: string[] = [];
    f.host.saveDocument = (d) =>
      d.saveChecked({
        readText: (p) => f.mem.readText(p),
        askConflict: async (_doc, conflict) => {
          asked.push(conflict.kind);
          return "cancel";
        },
        confirmDiscard: async () => true,
      });
    expect(await playHere(f.host)).toBe(false);
    expect(asked).toEqual(["changed"]);
    expect(f.starts).toEqual([]);
    expect(await f.mem.readText(MAP_PATH)).toBe(outside);
    expect(f.doc.dirty).toBe(true);
    expect(f.toasts).toEqual([]);
  });

  it("브라우저 모드는 러너의 이유, 맵 탭이 아니면 맵 안내, 스키마에 play 가 없으면 더하는 법", async () => {
    const browser = await fake({ reason: "브라우저 모드에서는 엔진을 띄울 수 없다" });
    expect(playHereHint(browser.host)).toBe("브라우저 모드에서는 엔진을 띄울 수 없다");
    expect(await playHere(browser.host)).toBe(false);
    expect(browser.toasts).toEqual(["warn: 브라우저 모드에서는 엔진을 띄울 수 없다"]);
    expect(browser.starts).toEqual([]);

    const noTab = await fake();
    noTab.host.documents.activate(null);
    expect(playHereHint(noTab.host)).toBe(NEED_MAP_TAB);
    expect(NEED_MAP_TAB).toContain(PLAY_POSITION_RULE);

    const noPlay = await fake({ schema: { ...SCHEMA, play: null } });
    expect(playHereHint(noPlay.host)).toBe(NO_PLAY_HINT);
    expect(NO_PLAY_HINT).toContain('"play"');
    const noSchema = await fake({ schema: null });
    expect(playHereHint(noSchema.host)).toBe(NO_PLAY_HINT);

    const noEngine = await fake({ hint: "엔진을 찾지 못했다" });
    expect(playHereHint(noEngine.host)).toBe("엔진을 찾지 못했다");
  });

  it("문서에 스키마가 아직 없으면 저장소의 스키마를 쓴다", async () => {
    const f = await fake({ schema: null });
    const host: PlayHost = { ...f.host, mapSchema: { current: SCHEMA } };
    expect(playHereHint(host)).toBeUndefined();
    await playHere(host);
    expect(f.starts[0].env?.INITIAL2D_ALDEBARAN_STAGE).toBe("forest");
  });
});
