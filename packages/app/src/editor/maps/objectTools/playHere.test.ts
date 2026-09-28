import { DocumentRegistry, LogStore, type Document } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument, parseObjectSchema, type MapObjectSchema } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import type { ConfirmOptions } from "../../modals";
import type { PlayProviderSpec } from "@initial-editor/ext-tilemap";
import { NO_MRUBY } from "../../runner/RunnerStore";
import { NO_PLAY_HINT, PLAY_POSITION_RULE } from "./rules";
import { NEED_MAP_TAB, playHere, playHereDisabledReason, playHereHint, playHereRefusal, playRequest, runnerBlocked, type PlayHost } from "./playHere";
import { OBJECTS_PLAY_PROVIDER_ID, objectsPlayProvider } from "./playProvider";

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

describe("이 맵에서 실행", () => {
  it("선택한 오브젝트의 x 로 play.env 를 채워 러너에 넘긴다", async () => {
    const f = await fake();
    f.support.cursor = { x: 10, y: 10 };
    f.doc.select(["wolf_1"]);
    expect(playHereHint(f.host)).toBeUndefined();
    expect(await playHere(f.host)).toBe(true);
    expect(f.starts).toEqual([{ env: { INITIAL2D_SCENE: "aldebaran", INITIAL2D_SKIP_INTRO: "1", INITIAL2D_ALDEBARAN_STAGE: "forest", INITIAL2D_ALDEBARAN_AT: "700" } }]);
    expect(f.host.log.entries.some((e) => e.text.includes("이 맵에서 실행: forest x 700, y 48 (선택한 오브젝트 wolf_1)"))).toBe(true);
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
    expect(f.host.log.entries.some((e) => e.text.includes("x 592, y 48 (선택한 오브젝트 wolf_1, 범위 최소 X 640에서 48px 왼쪽)"))).toBe(true);
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
    const browser = await fake({ reason: "브라우저 모드: 엔진 프로세스 실행 미지원" });
    expect(playHereHint(browser.host)).toBe("브라우저 모드: 엔진 프로세스 실행 미지원");
    expect(await playHere(browser.host)).toBe(false);
    expect(browser.toasts).toEqual(["warn: 브라우저 모드: 엔진 프로세스 실행 미지원"]);
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

    const noEngine = await fake({ hint: "엔진 탐색 실패" });
    expect(playHereHint(noEngine.host)).toBe("엔진 탐색 실패");
  });

  it("play.maps에 맞지 않는 맵이면 켜 둔 채 누를 때 띄우지 않고 이유를 토스트와 콘솔로 알리며, 맞는 맵이면 띄운다", async () => {
    const only = (maps: string[]) => ({ ...SCHEMA, play: { ...SCHEMA.play!, maps } });
    const other = await fake({ schema: only(["aldebaran_*"]) });
    const reason = "'이 맵에서 실행' 대상이 아닌 맵: forest (스키마의 play.maps: aldebaran_*)";
    expect(playHereDisabledReason(other.host)).toBeUndefined();
    expect(playHereRefusal(other.host)).toBe(reason);
    expect(playHereHint(other.host)).toBe(reason);
    // 저장하지 않은 맵이어도 저장을 묻기 전에 멈춘다
    other.doc.apply(other.doc.model.moveObjects([{ id: "wolf_1", x: 900, y: 48 }]));
    expect(await playHere(other.host)).toBe(false);
    expect(other.toasts).toEqual([`warn: ${reason}`]);
    expect(other.host.log.entries.filter((e) => e.source === "maps").map((e) => [e.level, e.text])).toEqual([["warn", `이 맵에서 실행 불가: ${reason}`]]);
    expect(other.starts).toEqual([]);
    expect(other.confirms).toEqual([]);
    expect(other.saved).toEqual([]);

    const match = await fake({ schema: only(["aldebaran_*", "for?st"]) });
    expect(playHereRefusal(match.host)).toBeNull();
    expect(playHereHint(match.host)).toBeUndefined();
    expect(await playHere(match.host)).toBe(true);
    expect(match.starts[0].env?.INITIAL2D_ALDEBARAN_STAGE).toBe("forest");

    // 러너가 못 띄우면 그 이유가 먼저이고 꺼진다
    const browser = await fake({ reason: "브라우저 모드: 엔진 프로세스 실행 미지원", schema: only(["aldebaran_*"]) });
    expect(playHereDisabledReason(browser.host)).toBe("브라우저 모드: 엔진 프로세스 실행 미지원");
    expect(playHereHint(browser.host)).toBe("브라우저 모드: 엔진 프로세스 실행 미지원");
    expect(await playHere(browser.host)).toBe(false);
    expect(browser.toasts).toEqual(["warn: 브라우저 모드: 엔진 프로세스 실행 미지원"]);
    // 저장소의 스키마로 볼 때도 같다
    const fromStore = await fake({ schema: null });
    const storeHost = { ...fromStore.host, mapSchema: { current: only(["aldebaran_*"]) } };
    expect(playHereDisabledReason(storeHost)).toBeUndefined();
    expect(playHereHint(storeHost)).toBe(reason);
  });

  it("저장 충돌 모달의 다시 읽기가 실패하면 다시 읽지 못해 실행하지 않았다고 알린다", async () => {
    const f = await fake();
    f.doc.apply(f.doc.model.moveObjects([{ id: "wolf_1", x: 900, y: 48 }]));
    f.mem.simulateExternalChange(MAP_PATH, "modify", "{ broken");
    f.host.saveDocument = (d) =>
      d.saveChecked({ readText: (p) => f.mem.readText(p), askConflict: async () => "reload", confirmDiscard: async () => true });
    expect(await playHere(f.host)).toBe(false);
    expect(f.starts).toEqual([]);
    expect(f.toasts).toHaveLength(1);
    expect(f.toasts[0]).toMatch(/^error: aldebaran_forest\.json 다시 읽기 실패, 실행 안 함: /);
    expect(f.toasts[0]).not.toContain("저장 실패");
    expect(f.doc.reloadError).not.toBeNull();
    expect(f.doc.dirty).toBe(true);
  });

  it("문서에 스키마가 아직 없으면 저장소의 스키마를 쓴다", async () => {
    const f = await fake({ schema: null });
    const host: PlayHost = { ...f.host, mapSchema: { current: SCHEMA } };
    expect(playHereHint(host)).toBeUndefined();
    await playHere(host);
    expect(f.starts[0].env?.INITIAL2D_ALDEBARAN_STAGE).toBe("forest");
  });
});

describe("여기서 실행: 실행 제공자", () => {
  const plan = (env: Record<string, string>, at: { x: number; y: number } | null, note?: string) => ({ env, at, note });

  it("priority 가 높은 제공자가 이 맵을 받으면 그 plan 으로 띄우고, 기본 제공자는 묻지 않는다", async () => {
    const f = await fake();
    const seen: Array<{ cursor: unknown; viewCenter: unknown }> = [];
    f.support.cursor = { x: 30, y: 20 };
    f.support.center = { x: 64, y: 32 };
    const rpg: PlayProviderSpec = {
      id: "rpg",
      priority: 10,
      applies: (doc) => doc.path === MAP_PATH,
      plan: (_doc, ctx) => {
        seen.push(ctx);
        return plan({ INITIAL2D_SCENE: "rpg", INITIAL2D_RPG_AT: "3,4,up" }, { x: 3, y: 4 }, "이벤트 captain 앞");
      },
    };
    const host: PlayHost = { ...f.host, tilemap: { playProviders: [rpg, objectsPlayProvider(() => SCHEMA)] } };
    expect(playHereHint(host)).toBeUndefined();
    expect(await playHere(host)).toBe(true);
    expect(f.starts).toEqual([{ env: { INITIAL2D_SCENE: "rpg", INITIAL2D_RPG_AT: "3,4,up" } }]);
    expect(seen).toEqual([{ cursor: { x: 30, y: 20 }, viewCenter: { x: 64, y: 32 } }]);
    expect(host.log.entries.some((e) => e.text === "이 맵에서 실행: forest x 3, y 4 (이벤트 captain 앞) INITIAL2D_SCENE=rpg INITIAL2D_RPG_AT=3,4,up")).toBe(true);
  });

  it("높은 제공자가 받지 않는 맵은 다음 제공자(기본)로 띄운다. 위치 없는 plan 은 위치를 적지 않는다", async () => {
    const f = await fake();
    f.doc.select(["wolf_1"]);
    const other: PlayProviderSpec = { id: "rpg", priority: 10, applies: () => false, hint: () => "rpg-game.json 에 없는 맵이다", plan: () => null };
    const host: PlayHost = { ...f.host, tilemap: { playProviders: [other, objectsPlayProvider(() => SCHEMA)] } };
    expect(playHereRefusal(host)).toBeNull();
    await playHere(host);
    expect(f.starts[0].env?.INITIAL2D_ALDEBARAN_AT).toBe("700");
    const bare: PlayProviderSpec = { id: "bare", priority: 5, applies: () => true, plan: () => plan({ A: "1" }, null) };
    const host2: PlayHost = { ...f.host, tilemap: { playProviders: [bare] } };
    await playHere(host2);
    expect(f.host.log.entries.some((e) => e.text === "이 맵에서 실행: forest A=1")).toBe(true);
  });

  it("받는 제공자가 없으면 이유를 말한 제공자들의 이유를 priority 순으로 이어 알리고, 아무도 말하지 않으면 끈다", async () => {
    const f = await fake({ schema: { ...SCHEMA, play: { ...SCHEMA.play!, maps: ["aldebaran_*"] } } });
    const rpg: PlayProviderSpec = { id: "rpg", priority: 10, applies: () => false, hint: () => "이 맵은 rpg-game.json 에 없다", plan: () => null };
    const host: PlayHost = { ...f.host, tilemap: { playProviders: [rpg, objectsPlayProvider((d) => d.schema)] } };
    const reason = "이 맵은 rpg-game.json 에 없다. '이 맵에서 실행' 대상이 아닌 맵: forest (스키마의 play.maps: aldebaran_*)";
    expect(playHereDisabledReason(host)).toBeUndefined();
    expect(playHereRefusal(host)).toBe(reason);
    expect(await playHere(host)).toBe(false);
    expect(f.toasts).toEqual([`warn: ${reason}`]);

    const silent: PlayProviderSpec = { id: "rpg", priority: 10, applies: () => false, hint: () => undefined, plan: () => null };
    const none = await fake({ schema: null });
    const host2: PlayHost = { ...none.host, tilemap: { playProviders: [silent, objectsPlayProvider((d) => d.schema)] } };
    expect(playHereDisabledReason(host2)).toBe(NO_PLAY_HINT);
    expect(playHereRefusal(host2)).toBeNull();
    expect(await playHere(host2)).toBe(false);
    expect(none.toasts).toEqual([`warn: ${NO_PLAY_HINT}`]);
  });

  it("제공자가 plan 을 못 정하면 띄우지 않고 이유를 알린다", async () => {
    const f = await fake();
    const empty: PlayProviderSpec = { id: "e", priority: 1, applies: () => true, plan: () => null };
    const host: PlayHost = { ...f.host, tilemap: { playProviders: [empty] } };
    expect(await playHere(host)).toBe(false);
    expect(f.starts).toEqual([]);
    expect(f.toasts).toEqual([`warn: ${NO_PLAY_HINT}`]);
  });
});

describe("확장의 실행 길 (playRequest: 타일맵의 play 가 부른다)", () => {
  it("요청의 plan 을 저장한 뒤에 부르고, 요청의 이름으로 콘솔에 한 줄을 남기고 러너에 넘긴다", async () => {
    const f = await fake();
    f.doc.apply(f.doc.model.moveObjects([{ id: "wolf_1", x: 900, y: 48 }]));
    const seen: Array<{ dirty: boolean; x: number | undefined }> = [];
    const ok = await playRequest(f.host, f.doc, {
      label: "이 표식 앞에서 실행",
      plan: (doc) => {
        seen.push({ dirty: doc.dirty, x: doc.model.findObject("wolf_1")?.x });
        return { env: { INITIAL2D_SCENE: "rpg", INITIAL2D_RPG_AT: "3,4,up" }, at: { x: 3, y: 4 }, note: "표식 wolf_1 앞" };
      },
    });
    expect(ok).toBe(true);
    expect(f.confirms.map((c) => [c.title, c.okLabel])).toEqual([["이 표식 앞에서 실행", "저장하고 실행"]]);
    expect(seen).toEqual([{ dirty: false, x: 900 }]);
    expect(f.starts).toEqual([{ env: { INITIAL2D_SCENE: "rpg", INITIAL2D_RPG_AT: "3,4,up" } }]);
    expect(f.host.log.entries.some((e) => e.text === "이 표식 앞에서 실행: forest x 3, y 4 (표식 wolf_1 앞) INITIAL2D_SCENE=rpg INITIAL2D_RPG_AT=3,4,up")).toBe(true);
  });

  it("계획에 watch 가 있으면 러너에 실행마다 새로 만드는 watch 를 넘긴다", async () => {
    const f = await fake();
    let made = 0;
    const watch = () => {
      made++;
      return { line: () => undefined };
    };
    expect(await playRequest(f.host, f.doc, { label: "이 표식 자동 재생", plan: () => ({ env: { A: "1" }, at: null, watch }) })).toBe(true);
    expect(f.starts).toHaveLength(1);
    const start = f.starts[0] as { env?: Record<string, string>; watch?: () => unknown };
    expect(start.env).toEqual({ A: "1" });
    expect(typeof start.watch).toBe("function");
    start.watch!();
    start.watch!();
    expect(made).toBe(2);
  });

  it("plan 이 이유를 주면 띄우지 않고 그 이유를 토스트와 콘솔로 알린다", async () => {
    const f = await fake();
    expect(await playRequest(f.host, f.doc, { label: "이 표식 자동 재생", plan: () => "parallel 은 끝나지 않는다" })).toBe(false);
    expect(f.starts).toEqual([]);
    expect(f.toasts).toEqual(["warn: parallel 은 끝나지 않는다"]);
    expect(f.host.log.entries.map((e) => [e.level, e.text])).toContainEqual(["warn", "이 표식 자동 재생: 실행 불가 (parallel 은 끝나지 않는다)"]);
  });

  it("러너가 못 띄우면 저장도 묻지 않고 plan 도 부르지 않는다. 취소하면 plan 을 부르지 않는다", async () => {
    const browser = await fake({ reason: "브라우저 모드: 엔진 프로세스 실행 미지원" });
    const noEngine = await fake({ hint: "엔진 탐색 실패" });
    expect(runnerBlocked(browser.host)).toBe("브라우저 모드: 엔진 프로세스 실행 미지원");
    expect(runnerBlocked(noEngine.host)).toBe("엔진 탐색 실패");
    const plans: string[] = [];
    const request = { label: "이 표식 앞에서 실행", plan: () => (plans.push("plan"), { env: {}, at: null }) };
    browser.doc.apply(browser.doc.model.moveObjects([{ id: "wolf_1", x: 900, y: 48 }]));
    expect(await playRequest(browser.host, browser.doc, request)).toBe(false);
    expect(browser.confirms).toEqual([]);
    expect(browser.toasts).toEqual(["warn: 브라우저 모드: 엔진 프로세스 실행 미지원"]);
    const cancel = await fake({ confirm: false });
    expect(runnerBlocked(cancel.host)).toBeUndefined();
    cancel.doc.apply(cancel.doc.model.moveObjects([{ id: "wolf_1", x: 900, y: 48 }]));
    expect(await playRequest(cancel.host, cancel.doc, request)).toBe(false);
    expect(cancel.saved).toEqual([]);
    expect(plans).toEqual([]);
    expect([...browser.starts, ...cancel.starts]).toEqual([]);
  });

  it("게임 설정의 언어만 막는 이유(NO_MRUBY)면 켜 둔다: 맵의 실행 변수가 INITIAL2D_SCRIPT 를 덮고, 러너가 띄울 때 다시 본다", async () => {
    const f = await fake({ hint: NO_MRUBY });
    expect(runnerBlocked(f.host)).toBeUndefined();
    expect(playHereDisabledReason(f.host)).toBeUndefined();
    expect(await playRequest(f.host, f.doc, { label: "이 표식 앞에서 실행", plan: () => ({ env: { INITIAL2D_SCRIPT: "lua" }, at: null }) })).toBe(true);
    expect(await playHere(f.host)).toBe(true);
    expect(f.starts.map((s) => s.env?.INITIAL2D_SCRIPT ?? "(game.json)")).toEqual(["lua", "(game.json)"]);
  });
});

describe("기본 실행 제공자 (map-objects.json 의 play)", () => {
  it("priority 0 이고, play 가 있고 play.maps 가 받으면 applies 다. hint 는 play.maps 의 거절 이유뿐이다", async () => {
    const f = await fake();
    let schema: MapObjectSchema | null = SCHEMA;
    const p = objectsPlayProvider(() => schema);
    expect([p.id, p.priority]).toEqual([OBJECTS_PLAY_PROVIDER_ID, 0]);
    expect(p.applies(f.doc)).toBe(true);
    expect(p.hint!(f.doc)).toBeUndefined();
    schema = { ...SCHEMA, play: { ...SCHEMA.play!, maps: ["aldebaran_*"] } };
    expect(p.applies(f.doc)).toBe(false);
    expect(p.hint!(f.doc)).toBe("'이 맵에서 실행' 대상이 아닌 맵: forest (스키마의 play.maps: aldebaran_*)");
    schema = { ...SCHEMA, play: null };
    expect(p.applies(f.doc)).toBe(false);
    expect(p.hint!(f.doc)).toBeUndefined();
    schema = null;
    expect(p.applies(f.doc)).toBe(false);
    expect(p.plan(f.doc, { cursor: null, viewCenter: null })).toBeNull();
  });

  it("plan 은 위치 규칙과 play.env 를 쓰고 설명은 로그의 괄호 안 글이다", async () => {
    const f = await fake({ schema: RANGE_SCHEMA });
    f.doc.apply(f.doc.model.setObjectProp("wolf_1", "minX", 640));
    f.doc.select(["wolf_1"]);
    const p = objectsPlayProvider((d) => d.schema);
    expect(p.plan(f.doc, { cursor: { x: 1, y: 1 }, viewCenter: null })).toEqual({
      env: { INITIAL2D_ALDEBARAN_STAGE: "forest", INITIAL2D_ALDEBARAN_AT: "592" },
      at: { x: 592, y: 48 },
      note: "선택한 오브젝트 wolf_1, 범위 최소 X 640에서 48px 왼쪽",
    });
    f.doc.clearSelection();
    expect(p.plan(f.doc, { cursor: { x: 100.4, y: 10 }, viewCenter: null })).toMatchObject({ at: { x: 100, y: 10 }, note: "커서" });
  });
});
