// 타일맵이 다른 확장에게 여는 자리 (docs/plans/e5-rpg.md 2.2): 맵 레이어의 붙이기와 다시 붙이기, 문서의 레이어 상태,
// 저장 글, 다시 읽기, 크기 바꾸기, 실행 제공자의 순서, 앱이 넣는 실행 길. 가짜 레이어는 모르는 최상위 키 "marks" 를 맡는다.
import { CommandRegistry, DocumentRegistry, type Command, ExtensionHost, ExtensionRegistries, LogStore, MemoryBackend, MenuRegistry, type Workspace } from "@initial-editor/core";
import { action, autorun, makeObservable, observable } from "mobx";
import { describe, expect, it } from "vitest";
import { NO_MAP_PLAYER, TilemapContrib, type MapLayerSpec, type MapPlayer, type PlayProviderSpec, type TilemapApi } from "./contrib";
import { tilemapExtension } from "./index";
import { MapDocument, parseMap, type MapLayerState, type ObjectProblem } from "./model";

const PATH = "resources/maps/town.json";
const OTHER = "resources/maps/other.json";

function mapText(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 2,
    name: "town",
    width: 4,
    height: 3,
    tileWidth: 16,
    tileHeight: 16,
    layers: [{ name: "ground", data: new Array(12).fill(1) }],
    tilesets: [{ image: "resources/tiles/t.png", firstGid: 1, columns: 8 }],
    ...extra,
  });
}

interface Mark {
  id: string;
  x: number;
  y: number;
}

/** 스키마 역할: 없으면 레이어가 붙지 않고, 버전이 1 이 아니면 잠긴다 */
const world = observable({ schema: null as { version: number } | null, registered: [PATH] as string[] });

class MarksState implements MapLayerState {
  items: Mark[];
  locked: string | null = null;
  disposed = false;
  refreshes = 0;
  resets: unknown[] = [];
  private hadKey: boolean;

  constructor(raw: unknown) {
    this.items = Array.isArray(raw) ? (raw as Mark[]) : [];
    this.hadKey = raw !== undefined;
    makeObservable(this, { items: observable.ref, locked: observable, refresh: action, reset: action, replace: action });
    this.refresh();
    this.refreshes = 0;
  }

  replace(items: Mark[]): void {
    this.items = items;
  }

  add(mark: Mark): Command {
    const before = this.items;
    return { label: `표식 추가: ${mark.id}`, execute: () => this.replace([...before, mark]), undo: () => this.replace(before) };
  }

  serialize(): unknown {
    return this.items.length === 0 && !this.hadKey ? undefined : this.items;
  }

  problems(): ObjectProblem[] {
    return this.items.flatMap((m, i): ObjectProblem[] =>
      m.x < 0 ? [{ severity: "error", message: `${m.id} 이(가) 맵 밖이다`, location: `marks[${i + 1}]` }] : m.id === "" ? [{ severity: "warning", message: "id 가 비었다", location: `marks[${i + 1}].id` }] : [],
    );
  }

  reset(raw: unknown): void {
    this.resets.push(raw);
    this.items = Array.isArray(raw) ? (raw as Mark[]) : [];
    this.hadKey = raw !== undefined;
  }

  refresh(): void {
    this.refreshes++;
    const s = world.schema;
    this.locked = s === null ? "스키마가 없다" : s.version !== 1 ? `모르는 스키마 버전: ${s.version}` : null;
  }

  dispose(): void {
    this.disposed = true;
  }

  shift(offset: { dx: number; dy: number }): Command {
    const before = this.items;
    const after = before.map((m) => ({ ...m, x: m.x + offset.dx, y: m.y + offset.dy }));
    return { label: "표식 옮기기", execute: () => this.replace(after), undo: () => this.replace(before) };
  }
}

function marksLayer(overrides: Partial<MapLayerSpec> = {}): MapLayerSpec & { attaches: string[] } {
  const attaches: string[] = [];
  return {
    id: "test.marks",
    label: "표식",
    section: "marks",
    toolKey: "M",
    attaches,
    attach(doc) {
      attaches.push(doc.path ?? "");
      if (!world.schema || !world.registered.includes(doc.path ?? "")) return null;
      return new MarksState(doc.model.rawSection("marks"));
    },
    hint(doc) {
      if (!world.schema) return undefined;
      return world.registered.includes(doc.path ?? "") ? undefined : "표식은 등록된 맵에만 있다";
    },
    ...overrides,
  };
}

async function setup(files: Record<string, string> = { [PATH]: mapText(), [OTHER]: mapText() }) {
  const backend = new MemoryBackend(files);
  await backend.open("/p");
  const documents = new DocumentRegistry();
  const warnings: string[] = [];
  const contrib = new TilemapContrib({ documents, warn: (m) => warnings.push(m) });
  const open = async (path: string) => {
    const doc = await MapDocument.open(backend, path);
    documents.open(doc);
    return doc;
  };
  return { backend, documents, contrib, open, warnings };
}

function state(doc: MapDocument): MarksState {
  const s = doc.layerState("test.marks");
  if (!(s instanceof MarksState)) throw new Error("표식 레이어가 없다");
  return s;
}

function reset(schema: { version: number } | null, registered: string[] = [PATH]) {
  action(() => {
    world.schema = schema;
    world.registered = registered;
  })();
}

describe("맵 레이어: 붙는 때와 다시 붙는 때", () => {
  it("문서가 먼저 열리고 스키마가 나중에 온다: 처음에는 상태가 없고, refreshLayer 가 붙인다", async () => {
    reset(null);
    const f = await setup();
    const layer = marksLayer();
    f.contrib.registerMapLayer(layer);
    const doc = await f.open(PATH);
    expect(layer.attaches).toEqual([PATH]);
    expect(doc.layerState("test.marks")).toBeNull();
    expect(doc.layerIds).toEqual([]);
    expect(layer.hint!(doc)).toBeUndefined();

    reset({ version: 1 });
    f.contrib.refreshLayer("test.marks");
    expect(layer.attaches).toEqual([PATH, PATH]);
    expect(doc.layerIds).toEqual(["test.marks"]);
    expect(state(doc).locked).toBeNull();
    doc.apply(state(doc).add({ id: "a", x: 1, y: 2 }));
    expect(JSON.parse(doc.text()).marks).toEqual([{ id: "a", x: 1, y: 2 }]);
    expect(doc.dirty).toBe(true);
    doc.undo.undo();
    expect(doc.text()).toBe(mapTextSaved());
  });

  it("스키마 버전이 바뀌면 붙은 상태는 그대로 두고 refresh 로 잠근다 (attach 를 다시 부르지 않는다)", async () => {
    reset({ version: 1 });
    const f = await setup({ [PATH]: mapText({ marks: [{ id: "old", x: 0, y: 0 }] }) });
    const layer = marksLayer();
    f.contrib.registerMapLayer(layer);
    const doc = await f.open(PATH);
    const s = state(doc);
    reset({ version: 2 });
    f.contrib.refreshLayer("test.marks");
    expect(doc.layerState("test.marks")).toBe(s);
    expect(layer.attaches).toEqual([PATH]);
    expect(s.refreshes).toBe(1);
    expect(s.locked).toBe("모르는 스키마 버전: 2");
    expect(s.items).toEqual([{ id: "old", x: 0, y: 0 }]);
  });

  it("스키마 파일이 지워져도 편집 중인 값을 잃지 않고 잠긴다. 저장하면 그대로 쓰인다", async () => {
    reset({ version: 1 });
    const f = await setup();
    f.contrib.registerMapLayer(marksLayer());
    const doc = await f.open(PATH);
    doc.apply(state(doc).add({ id: "kept", x: 3, y: 1 }));
    reset(null);
    f.contrib.refreshLayer("test.marks");
    expect(state(doc).locked).toBe("스키마가 없다");
    expect(doc.undo.canUndo).toBe(true);
    await doc.save();
    expect(JSON.parse(await f.backend.readText(PATH)).marks).toEqual([{ id: "kept", x: 3, y: 1 }]);
    expect(doc.dirty).toBe(false);
  });

  it("등록되지 않은 맵은 상태가 없고 hint 가 있다. 스키마가 없는 프로젝트면 hint 도 없다", async () => {
    reset({ version: 1 });
    const f = await setup();
    const layer = marksLayer();
    f.contrib.registerMapLayer(layer);
    const other = await f.open(OTHER);
    expect(other.layerState("test.marks")).toBeNull();
    expect(layer.hint!(other)).toBe("표식은 등록된 맵에만 있다");
    reset(null);
    expect(layer.hint!(other)).toBeUndefined();
  });

  it("열린 문서가 있을 때 등록해도 붙고, 등록을 거두면 값을 원본에 남기고 떼며 저장 글이 그대로다", async () => {
    reset({ version: 1 });
    const f = await setup();
    const doc = await f.open(PATH);
    const off = f.contrib.registerMapLayer(marksLayer());
    const s = state(doc);
    doc.apply(s.add({ id: "b", x: 2, y: 2 }));
    doc.setTarget({ kind: "ext", id: "test.marks" });
    const before = doc.text();
    off();
    expect(doc.layerState("test.marks")).toBeNull();
    expect(s.disposed).toBe(true);
    expect(doc.text()).toBe(before);
    expect(doc.target).toEqual({ kind: "objects" });
    expect(f.contrib.layers.has("test.marks")).toBe(false);
    off();
    expect(f.contrib.layers.size).toBe(0);
  });

  it("문서를 닫으면 상태를 dispose 한다", async () => {
    reset({ version: 1 });
    const f = await setup();
    f.contrib.registerMapLayer(marksLayer());
    const doc = await f.open(PATH);
    const s = state(doc);
    f.documents.close(doc);
    expect(s.disposed).toBe(true);
    expect(doc.layerIds).toEqual([]);
  });

  it("다시 읽으면 상태가 새 원본으로 reset 을 받는다", async () => {
    reset({ version: 1 });
    const f = await setup({ [PATH]: mapText({ marks: [{ id: "a", x: 0, y: 0 }] }) });
    f.contrib.registerMapLayer(marksLayer());
    const doc = await f.open(PATH);
    await f.backend.writeText(PATH, mapText({ marks: [{ id: "z", x: 1, y: 1 }] }));
    await doc.reload();
    expect(state(doc).resets).toEqual([[{ id: "z", x: 1, y: 1 }]]);
    expect(state(doc).items).toEqual([{ id: "z", x: 1, y: 1 }]);
    await f.backend.writeText(PATH, mapText());
    await doc.reload();
    expect(state(doc).resets[1]).toBeUndefined();
    expect(JSON.parse(doc.text()).marks).toBeUndefined();
  });

  it("attach 가 던지면 콘솔에 남기고 다른 레이어와 문서는 그대로 연다", async () => {
    reset({ version: 1 });
    const f = await setup();
    f.contrib.registerMapLayer(
      marksLayer({
        id: "test.broken",
        label: "깨짐",
        section: "broken",
        attach: () => {
          throw new Error("스키마를 읽지 못했다");
        },
      }),
    );
    f.contrib.registerMapLayer(marksLayer());
    const doc = await f.open(PATH);
    expect(doc.layerIds).toEqual(["test.marks"]);
    expect(f.warnings).toEqual([`맵 레이어 깨짐(test.broken) 을(를) ${PATH} 에 붙이지 못했다: 스키마를 읽지 못했다`]);
  });

  it("섹션은 타일맵의 키를 맡을 수 없고, 두 레이어가 한 섹션을 맡거나 같은 id 로 등록할 수 없다", async () => {
    const f = await setup();
    expect(() => f.contrib.registerMapLayer(marksLayer({ section: "layers" }))).toThrow("맵 레이어 test.marks: 섹션 layers 은(는) 타일맵이 맡는다");
    expect(() => f.contrib.registerMapLayer(marksLayer({ section: "objects" }))).toThrow(/타일맵이 맡는다/);
    expect(() => f.contrib.registerMapLayer(marksLayer({ section: " " }))).toThrow(/섹션 이름이 비었다/);
    f.contrib.registerMapLayer(marksLayer());
    expect(() => f.contrib.registerMapLayer(marksLayer())).toThrow("맵 레이어가 이미 있다: test.marks");
    expect(() => f.contrib.registerMapLayer(marksLayer({ id: "test.other" }))).toThrow("섹션 marks 은(는) 레이어 test.marks 이(가) 이미 맡았다");
    expect(() => f.contrib.registerMapLayer(marksLayer({ id: "test.events", section: "events" }))).not.toThrow();
  });

  it("레이어 순서는 order 가 큰 것이 위, 같으면 먼저 등록한 것이 아래다", async () => {
    const f = await setup();
    f.contrib.registerMapLayer(marksLayer({ id: "c", section: "c", order: 5 }));
    f.contrib.registerMapLayer(marksLayer({ id: "a", section: "a" }));
    f.contrib.registerMapLayer(marksLayer({ id: "b", section: "b" }));
    expect(f.contrib.orderedLayers().map((l) => l.id)).toEqual(["a", "b", "c"]);
  });
});

function mapTextSaved(): string {
  // 저장 형식의 글 (섹션 없이)
  const doc = new MapDocument(new MemoryBackend(), PATH, parseMap(mapText()));
  return doc.text();
}

describe("맵 문서의 레이어 상태", () => {
  it("문제는 doc.problems 에 레이어 id 와 함께 들어가고, 오류만 layerErrors 다", async () => {
    reset({ version: 1 });
    const f = await setup();
    f.contrib.registerMapLayer(marksLayer());
    const doc = await f.open(PATH);
    expect(doc.problems).toEqual([]);
    doc.apply(state(doc).add({ id: "out", x: -1, y: 0 }));
    doc.apply(state(doc).add({ id: "", x: 0, y: 0 }));
    expect(doc.problems).toEqual([
      { severity: "error", message: "out 이(가) 맵 밖이다", location: "marks[1]", layer: "test.marks" },
      { severity: "warning", message: "id 가 비었다", location: "marks[2].id", layer: "test.marks" },
    ]);
    expect(doc.layerErrors().map((p) => p.location)).toEqual(["marks[1]"]);
    // 맵 오브젝트 패널은 오브젝트의 문제만 본다
    expect(doc.objectProblems).toEqual([]);
  });

  it("섹션 events 도 맡을 수 있고, 상태의 값이 undefined 면 키를 쓰지 않는다. 모르는 키의 자리는 그대로다", async () => {
    reset({ version: 1 });
    const f = await setup({ [PATH]: mapText({ events: [{ id: "e", x: 1, y: 1 }], after: 1 }) });
    const events = marksLayer({ id: "test.events", section: "events", attach: (doc) => new MarksState(doc.model.rawSection("events")) });
    f.contrib.registerMapLayer(events);
    const doc = await f.open(PATH);
    const s = doc.layerState("test.events") as MarksState;
    expect(s.items).toEqual([{ id: "e", x: 1, y: 1 }]);
    doc.apply(s.add({ id: "f", x: 2, y: 2 }));
    const saved = JSON.parse(doc.text());
    expect(Object.keys(saved)).toEqual(["version", "name", "id", "width", "height", "tileWidth", "tileHeight", "layers", "tilesets", "events", "after"]);
    expect(saved.events).toEqual([
      { id: "e", x: 1, y: 1 },
      { id: "f", x: 2, y: 2 },
    ]);
    doc.apply({ label: "비우기", execute: () => s.replace([]), undo: () => {} });
    expect(JSON.parse(doc.text()).events).toEqual([]);
  });

  it("rawSection 은 사본이고 없는 키는 undefined 다", async () => {
    const f = await setup({ [PATH]: mapText({ marks: [{ id: "a", x: 0, y: 0 }], events: null }) });
    const doc = await f.open(PATH);
    const raw = doc.model.rawSection("marks") as Mark[];
    raw[0].x = 99;
    expect(doc.model.rawSection("marks")).toEqual([{ id: "a", x: 0, y: 0 }]);
    expect(doc.model.rawSection("events")).toBeUndefined();
    expect(doc.model.rawSection("nothing")).toBeUndefined();
    expect(doc.sectionValue("marks")).toEqual([{ id: "a", x: 0, y: 0 }]);
  });

  it("크기 바꾸기가 붙은 상태를 shift 로 같은 한 단계에 옮기고, 되돌리면 정확히 돌아간다", async () => {
    reset({ version: 1 });
    const f = await setup({ [PATH]: mapText({ marks: [{ id: "a", x: 1, y: 1 }] }) });
    f.contrib.registerMapLayer(marksLayer());
    const doc = await f.open(PATH);
    const before = doc.text();
    doc.apply(doc.resizeCommand(6, 5, "bottom-right"));
    expect(state(doc).items).toEqual([{ id: "a", x: 3, y: 3 }]);
    expect(doc.undo.depth).toBe(1);
    expect(doc.sectionValue("marks")).toEqual([{ id: "a", x: 3, y: 3 }]);
    doc.undo.undo();
    expect(state(doc).items).toEqual([{ id: "a", x: 1, y: 1 }]);
    expect(doc.text()).toBe(before);
    doc.undo.redo();
    expect(JSON.parse(doc.text()).marks).toEqual([{ id: "a", x: 3, y: 3 }]);
  });

  it("크기를 바꾼 뒤에 붙은 events 상태도 되돌리기에서 원래 자리로 간다 (모델이 원본 events 를 옮겼다)", async () => {
    reset(null);
    const f = await setup({ [PATH]: mapText({ events: [{ id: "a", x: 1, y: 1 }] }) });
    const events = marksLayer({ id: "test.events", section: "events", attach: (doc) => (world.schema ? new MarksState(doc.model.rawSection("events")) : null) });
    f.contrib.registerMapLayer(events);
    const doc = await f.open(PATH);
    const before = doc.text();
    doc.apply(doc.resizeCommand(6, 5, "bottom-right"));
    reset({ version: 1 });
    f.contrib.refreshLayer("test.events");
    const s = doc.layerState("test.events") as MarksState;
    // 붙을 때 이미 옮겨진 원본을 읽었다
    expect(s.items).toEqual([{ id: "a", x: 3, y: 3 }]);
    doc.undo.undo();
    expect(s.items).toEqual([{ id: "a", x: 1, y: 1 }]);
    expect(doc.text()).toBe(before);
    doc.undo.redo();
    expect(s.items).toEqual([{ id: "a", x: 3, y: 3 }]);
    doc.undo.undo();
    expect(doc.text()).toBe(before);
  });

  it("모델이 옮기지 않는 섹션은 크기를 바꾼 뒤에 붙어도 되돌리기가 옮기지 않는다", async () => {
    reset(null);
    const f = await setup({ [PATH]: mapText({ marks: [{ id: "a", x: 1, y: 1 }] }) });
    f.contrib.registerMapLayer(marksLayer());
    const doc = await f.open(PATH);
    doc.apply(doc.resizeCommand(6, 5, "bottom-right"));
    reset({ version: 1 });
    f.contrib.refreshLayer("test.marks");
    expect(state(doc).items).toEqual([{ id: "a", x: 1, y: 1 }]);
    doc.undo.undo();
    expect(state(doc).items).toEqual([{ id: "a", x: 1, y: 1 }]);
    doc.undo.redo();
    expect(state(doc).items).toEqual([{ id: "a", x: 3, y: 3 }]);
    doc.undo.undo();
    expect(state(doc).items).toEqual([{ id: "a", x: 1, y: 1 }]);
  });

  it("대상 ext 는 도구를 ext 로 하고 숨긴 레이어를 보인다. 다른 대상으로 가면 도구가 돌아온다", async () => {
    const f = await setup();
    const doc = await f.open(PATH);
    doc.toggleExtLayer("x");
    expect(doc.hiddenExtLayers.has("x")).toBe(true);
    doc.setTool("ext");
    expect(doc.tool).toBe("pen");
    doc.setTarget({ kind: "ext", id: "x" });
    expect(doc.tool).toBe("ext");
    expect(doc.hiddenExtLayers.has("x")).toBe(false);
    doc.setTarget({ kind: "layer", index: 0 });
    expect(doc.tool).toBe("pen");
    doc.setTarget({ kind: "ext", id: "x" });
    doc.setTarget({ kind: "collision" });
    expect(doc.tool).toBe("collision");
    doc.setTarget({ kind: "ext", id: "x" });
    doc.setBrush(doc.brush);
    expect([doc.tool, doc.target]).toEqual(["pen", { kind: "layer", index: 0 }]);
  });
});

describe("실행 제공자", () => {
  const provider = (id: string, priority: number, applies: (doc: MapDocument) => boolean): PlayProviderSpec => ({
    id,
    priority,
    applies,
    plan: () => ({ env: { WHO: id }, at: null }),
  });

  it("priority 가 높은 것부터, 같으면 먼저 등록한 것부터 묻고 첫 applies 를 고른다. 거두면 빠진다", async () => {
    const f = await setup();
    const doc = await f.open(PATH);
    const offBase = f.contrib.registerPlayProvider(provider("base", 0, () => true));
    f.contrib.registerPlayProvider(provider("tie", 0, () => true));
    const offRpg = f.contrib.registerPlayProvider(provider("rpg", 10, (d) => d.path === PATH));
    expect(f.contrib.playProviders.map((p) => p.id)).toEqual(["rpg", "base", "tie"]);
    expect(f.contrib.providerFor(doc)?.id).toBe("rpg");
    const other = await f.open(OTHER);
    expect(f.contrib.providerFor(other)?.id).toBe("base");
    offRpg();
    expect(f.contrib.providerFor(doc)?.id).toBe("base");
    offBase();
    expect(f.contrib.playProviders.map((p) => p.id)).toEqual(["tie"]);
    expect(() => f.contrib.registerPlayProvider(provider("tie", 3, () => false))).toThrow("실행 제공자가 이미 있다: tie");
  });
});

describe("실행 길 (setPlayer, play)", () => {
  it("길이 없으면 play 는 띄우지 않고 콘솔에 남기며, playBlocked 가 그 이유다", async () => {
    const f = await setup();
    const doc = await f.open(PATH);
    const plans: string[] = [];
    expect(f.contrib.playBlocked()).toBe(NO_MAP_PLAYER);
    expect(await f.contrib.play(doc, { label: "이 표식 앞에서 실행", plan: () => (plans.push("x"), { env: {}, at: null }) })).toBe(false);
    expect(plans).toEqual([]);
    expect(f.warnings).toEqual([`이 표식 앞에서 실행: ${NO_MAP_PLAYER}`]);
  });

  it("앱이 넣은 길로 요청을 넘기고, 막힌 이유는 길의 것이다. 뺀 뒤에는 다시 길이 없다 (다른 길을 넣었으면 그대로)", async () => {
    const f = await setup();
    const doc = await f.open(PATH);
    let blocked: string | undefined = "엔진을 찾는 중이다";
    const seen: Array<[string, unknown]> = [];
    const player: MapPlayer = {
      blocked: () => blocked,
      play: async (d, req) => {
        seen.push([req.label, req.plan(d)]);
        return true;
      },
    };
    const off = f.contrib.setPlayer(player);
    expect(f.contrib.playBlocked()).toBe("엔진을 찾는 중이다");
    blocked = undefined;
    expect(f.contrib.playBlocked()).toBeUndefined();
    expect(await f.contrib.play(doc, { label: "이 표식 앞에서 실행", plan: (d) => ({ env: { MAP: d.model.name }, at: { x: 1, y: 2 } }) })).toBe(true);
    expect(seen).toEqual([["이 표식 앞에서 실행", { env: { MAP: doc.model.name }, at: { x: 1, y: 2 } }]]);
    off();
    expect(f.contrib.playBlocked()).toBe(NO_MAP_PLAYER);
    const offOther = f.contrib.setPlayer({ blocked: () => undefined, play: async () => true });
    off();
    expect(f.contrib.playBlocked()).toBeUndefined();
    offOther();
    f.contrib.setPlayer(player);
    f.contrib.dispose();
    expect(f.contrib.playBlocked()).toBe(NO_MAP_PLAYER);
  });

  it("playBlocked 는 관찰 가능하다 (길을 넣고 빼면 반응이 다시 돈다)", async () => {
    const f = await setup();
    const seen: Array<string | undefined> = [];
    const stop = autorun(() => void seen.push(f.contrib.playBlocked()));
    const off = f.contrib.setPlayer({ blocked: () => undefined, play: async () => true });
    off();
    stop();
    expect(seen).toEqual([NO_MAP_PLAYER, undefined, NO_MAP_PLAYER]);
  });
});

describe("타일맵 확장의 내보내기", () => {
  it("다른 확장이 exportsOf 로 TilemapApi 를 받아 레이어를 붙이고, 해제하면 뗀다", async () => {
    reset({ version: 1 });
    const backend = new MemoryBackend({ [PATH]: mapText() });
    await backend.open("/p");
    const documents = new DocumentRegistry();
    const workspace: Workspace = {
      backend: () => backend,
      project: { isOpen: true, root: "/p", onOpened: () => () => {}, onClosed: () => () => {}, onFileChange: () => () => {} },
      documents,
      log: new LogStore(),
      toasts: { info: () => {}, success: () => {}, warn: () => {}, error: () => {} },
      openPath: async () => {},
    };
    const host = new ExtensionHost({ commands: new CommandRegistry({ platform: "mac" }), menus: new MenuRegistry(), registries: new ExtensionRegistries(), workspace });
    await host.activateAll([
      tilemapExtension,
      {
        id: "test",
        name: "테스트",
        dependsOn: ["tilemap"],
        activate(api) {
          api.exportsOf<TilemapApi>("tilemap").registerMapLayer(marksLayer());
        },
      },
    ]);
    const tilemap = host.exportsOf<TilemapApi>("tilemap")!;
    expect([...tilemap.layers.keys()]).toEqual(["test.marks"]);
    const doc = await MapDocument.open(backend, PATH);
    documents.open(doc);
    const s = state(doc);
    await host.deactivate("tilemap");
    expect(s.disposed).toBe(true);
    expect(doc.layerIds).toEqual([]);
    expect(host.active.size).toBe(0);
  });
});
