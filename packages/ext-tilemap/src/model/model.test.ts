import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UndoStack } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { parseMap, serializeMap, MapFormatError, type MapData } from "./format";
import { MapModel, uniqueMapObjectId } from "./mapModel";
import { MapDocument, isMapPath } from "./mapDocument";
import { floodFill, lineCells, paletteBrush, pickBrush, rectFill, singleBrush, stamp, tileSource } from "./tiles";
import { defaultProps, parseObjectSchema, playEnv, validateObjects } from "./schema";

const ENGINE = path.resolve(process.env.INITIAL2D_DIR ?? path.join(__dirname, "..", "..", "..", "..", "..", "Initial2D"));

function tiny(): MapData {
  return parseMap(
    JSON.stringify({
      version: 1,
      name: "tiny",
      id: 7,
      width: 4,
      height: 3,
      tileWidth: 16,
      tileHeight: 16,
      layers: [
        { name: "ground", data: [1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1] },
        { name: "deco", data: new Array(12).fill(0), note: "보존" },
      ],
      tilesets: [
        { image: "resources/tiles/a.png", firstGid: 1, columns: 8 },
        { image: "resources/tiles/b.png", firstGid: 65, columns: 4 },
      ],
      custom: { keep: true },
    }),
  );
}

describe("맵 파일", () => {
  it("v1 을 읽고 v2 로 쓰며, 모르는 키와 레이어 이름을 보존한다", () => {
    const m = tiny();
    expect(m.collision).toBeNull();
    const text = serializeMap(m);
    const back = JSON.parse(text);
    expect(back.version).toBe(2);
    expect(back.custom).toEqual({ keep: true });
    expect(back.layers[1].note).toBe("보존");
    expect(Object.keys(back)).toEqual(["version", "name", "id", "width", "height", "tileWidth", "tileHeight", "layers", "tilesets", "custom"]);
    expect(parseMap(text)).toEqual({ ...m, version: 2 });
  });

  it("타일 배열은 맵 한 줄을 한 줄에 쓴다", () => {
    const text = serializeMap(tiny());
    expect(text).toContain('      "data": [\n        1,1,1,1,\n        1,2,2,1,\n        1,1,1,1\n      ]');
    expect(text.endsWith("\n")).toBe(true);
  });

  it("오브젝트: 폭과 높이는 있을 때만, props 는 비지 않을 때만", () => {
    const m = tiny();
    m.objects = [
      { id: "start", type: "start", x: 56, y: 384, props: {}, extra: {} },
      { id: "tracks", type: "landmark", x: 300, y: 0, width: 48, props: { text: "발자국\n여럿" }, extra: { editorOnly: 1 } },
    ];
    const back = JSON.parse(serializeMap(m));
    expect(back.objects[0]).toEqual({ id: "start", type: "start", x: 56, y: 384 });
    expect(back.objects[1]).toEqual({ id: "tracks", type: "landmark", x: 300, y: 0, width: 48, props: { text: "발자국\n여럿" }, editorOnly: 1 });
  });

  it("events: null 은 없는 키, 값이 전부 null 인 객체(빈 {} 포함)는 빈 배열로 읽고 [] 로 쓴다 (엔진 M2 3.1)", () => {
    const base = JSON.parse(serializeMap(tiny())) as Record<string, unknown>;
    const withEvents = (events: unknown) => JSON.stringify({ ...base, events });
    const none = parseMap(withEvents(null));
    expect(none.events).toBeNull();
    expect(serializeMap(none)).toBe(serializeMap(tiny()));
    for (const v of [{}, { a: null, b: null }]) {
      const m = parseMap(withEvents(v));
      expect(m.events).toEqual([]);
      const text = serializeMap(m);
      expect(text).toContain('\n  "events": [],\n');
      expect(parseMap(text).events).toEqual([]);
    }
    for (const v of [{ a: 1 }, { "0": null, "1": {} }, "x", 0, false]) expect(() => parseMap(withEvents(v))).toThrow(/events 는 배열이어야 한다/);
  });

  it("잘못된 파일은 자리를 말한다", () => {
    expect(() => parseMap('{"version": 3}')).toThrow(/모르는 맵 버전이다: 3/);
    expect(() => parseMap(JSON.stringify({ version: 1, width: 2, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [], layers: [{ name: "a", data: [1] }] }))).toThrow(/길이가 1/);
    expect(() => parseMap(JSON.stringify({ version: 1, width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [], layers: [{ name: "a", data: [-1] }] }))).toThrow(MapFormatError);
    expect(() => parseMap(JSON.stringify({ version: 2, width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [], layers: [], objects: [{ id: "", type: "x", x: 0 }] }))).toThrow(/objects\[0\]\.id/);
  });

  for (const rel of ["tests/fixtures/maps/sample_v1.json", "tests/fixtures/maps/sample_v2.json", "resources/maps/port_town.json", "resources/maps/aldebaran_forest.json", "resources/maps/aldebaran_tomb.json"]) {
    const file = path.join(ENGINE, rel);
    it.skipIf(!existsSync(file))(`엔진의 ${rel} 를 왕복해도 내용이 같다`, () => {
      const original = JSON.parse(readFileSync(file, "utf8"));
      const back = JSON.parse(serializeMap(parseMap(readFileSync(file, "utf8"))));
      expect({ ...back, version: original.version }).toEqual(original);
    });
  }
});

// 엔진의 알데바란 맵은 에디터와 같은 고정 형식으로 쓰인다 (엔진 tools/mapfile.py). 다시 써도 바이트가 같아야
// 에디터로 열고 저장만 한 파일이 git 에서 바뀌지 않는다
describe("엔진 맵과 같은 고정 형식", () => {
  for (const rel of ["resources/maps/aldebaran_forest.json", "resources/maps/aldebaran_tomb.json"]) {
    const file = path.join(ENGINE, rel);
    const text = existsSync(file) ? readFileSync(file, "utf8") : "";
    it.skipIf(!text.includes('"objects"'))(`${rel} 를 읽고 다시 쓰면 바이트가 같다`, () => {
      expect(serializeMap(parseMap(text))).toBe(text);
    });
  }
});

// 엔진의 스키마로 알데바란 맵을 검사하면 문제가 없다 (흔적의 제목과 글이 다 차 있다)
describe("엔진 맵과 엔진 스키마", () => {
  const schemaFile = path.join(ENGINE, "resources/schema/map-objects.json");
  for (const rel of ["resources/maps/aldebaran_forest.json", "resources/maps/aldebaran_tomb.json"]) {
    const file = path.join(ENGINE, rel);
    it.skipIf(!existsSync(file) || !existsSync(schemaFile))(`${rel}의 오브젝트는 검사에 걸리지 않는다`, () => {
      const map = parseMap(readFileSync(file, "utf8"));
      expect(map.objects.length).toBeGreaterThan(0);
      expect(validateObjects(map.objects, parseObjectSchema(readFileSync(schemaFile, "utf8")))).toEqual([]);
    });
  }
});

describe("타일 계산", () => {
  const m = tiny();
  it("gid 에서 타일셋과 원본 위치", () => {
    expect(tileSource(m.tilesets, 0, 16, 16)).toBeNull();
    expect(tileSource(m.tilesets, 1, 16, 16)).toMatchObject({ tilesetIndex: 0, local: 0, sx: 0, sy: 0 });
    expect(tileSource(m.tilesets, 10, 16, 16)).toMatchObject({ tilesetIndex: 0, local: 9, sx: 16, sy: 16 });
    expect(tileSource(m.tilesets, 70, 16, 16)).toMatchObject({ tilesetIndex: 1, local: 5, sx: 16, sy: 16 });
  });

  it("도장, 선, 사각형, 채우기, 스포이드, 팔레트 붓", () => {
    const b = paletteBrush(m.tilesets[0], 1, 0, 2, 1);
    expect(b).toEqual({ width: 2, height: 2, gids: [[2, 3], [10, 11]] });
    expect(stamp(m, b, 3, 2)).toEqual([{ index: 11, value: 2 }]);
    expect(lineCells(0, 0, 3, 1)).toEqual([[0, 0], [1, 0], [2, 1], [3, 1]]);
    expect(rectFill(m, singleBrush(5), 1, 1, 0, 0).map((c) => c.index)).toEqual([0, 1, 4, 5]);
    const fill = floodFill(m, m.layers[0].data, singleBrush(9), 0, 0);
    expect(fill.length).toBe(10);
    expect(fill.every((c) => c.value === 9)).toBe(true);
    expect(floodFill(m, m.layers[0].data, singleBrush(1), 0, 0)).toEqual([]);
    expect(pickBrush(m, m.layers[0].data, 1, 1, 2, 1)).toEqual({ width: 2, height: 1, gids: [[2, 2]] });
  });
});

describe("MapModel 명령", () => {
  it("붓질 한 번은 되돌리기 한 단계이고, 되돌리면 붓질 전 값으로 간다", () => {
    const model = new MapModel(tiny());
    const undo = new UndoStack();
    const events: number[][] = [];
    model.events.on("cells", (e) => events.push(e.indices));
    undo.push(model.paintCells(0, [{ index: 0, value: 7 }], "stroke-1"));
    undo.push(model.paintCells(0, [{ index: 1, value: 7 }, { index: 0, value: 8 }], "stroke-1"));
    expect(model.layers[0].data.slice(0, 2)).toEqual([8, 7]);
    expect(undo.depth).toBe(1);
    undo.undo();
    expect(model.layers[0].data.slice(0, 2)).toEqual([1, 1]);
    undo.redo();
    expect(model.layers[0].data.slice(0, 2)).toEqual([8, 7]);
    expect(events.length).toBe(4);
  });

  it("통행이 없는 맵에 칠하면 만들고, 되돌리면 없앤다", () => {
    const model = new MapModel(tiny());
    const undo = new UndoStack();
    undo.push(model.paintCells("collision", [{ index: 5, value: 1 }]));
    expect(model.collision?.[5]).toBe(1);
    expect(model.toData().collision?.length).toBe(12);
    undo.undo();
    expect(model.collision).toBeNull();
  });

  it("레이어 추가, 이름, 순서, 삭제", () => {
    const model = new MapModel(tiny());
    const undo = new UndoStack();
    undo.push(model.addLayer("over"));
    undo.push(model.renameLayer(2, "위"));
    undo.push(model.moveLayer(2, 0));
    expect(model.layers.map((l) => l.name)).toEqual(["위", "ground", "deco"]);
    undo.push(model.removeLayer(0));
    expect(model.layers.map((l) => l.name)).toEqual(["ground", "deco"]);
    for (let i = 0; i < 4; i++) undo.undo();
    expect(model.layers.map((l) => l.name)).toEqual(["ground", "deco"]);
  });

  it("오브젝트: 추가, 끌기 합치기, 속성, 이름, 순서, 여러 개 삭제", () => {
    const model = new MapModel(tiny());
    const undo = new UndoStack();
    undo.push(model.addObject({ id: "spawn_1", type: "spawn", x: 10, y: 20, props: { species: "wolf" }, extra: {} }));
    undo.push(model.addObject({ id: "spawn_2", type: "spawn", x: 30, y: 20, props: {}, extra: {} }));
    undo.push(model.moveObjects([{ id: "spawn_1", x: 11, y: 20 }], "drag"));
    undo.push(model.moveObjects([{ id: "spawn_1", x: 15, y: 22 }], "drag"));
    expect(model.findObject("spawn_1")).toMatchObject({ x: 15, y: 22 });
    undo.undo();
    expect(model.findObject("spawn_1")).toMatchObject({ x: 10, y: 20 });
    undo.push(model.setObjectProp("spawn_1", "species", "spider", "typing"));
    undo.push(model.setObjectField("spawn_1", "width", 48));
    undo.push(model.renameObject("spawn_1", "첫거미"));
    undo.push(model.reorderObject(1, 0));
    expect(model.objectIds()).toEqual(["spawn_2", "첫거미"]);
    expect(model.findObject("첫거미")).toMatchObject({ width: 48, props: { species: "spider" } });
    undo.push(model.removeObjects(["spawn_2", "첫거미"]));
    expect(model.objects.length).toBe(0);
    undo.undo();
    expect(model.objectIds()).toEqual(["spawn_2", "첫거미"]);
    expect(uniqueMapObjectId("spawn", ["spawn_1", "spawn_2"])).toBe("spawn_3");
  });
});

const SCHEMA = JSON.stringify({
  version: 1,
  types: [
    {
      type: "spawn",
      label: "몬스터",
      shape: "point",
      color: "danger",
      fields: [
        { name: "species", type: "enum", values: ["spider", "wolf"], label: "종" },
        { name: "minX", type: "number", role: "rangeMin", label: "순찰 왼끝" },
        { name: "maxX", type: "number", role: "rangeMax", label: "순찰 오른끝" },
        { name: "boss", type: "boolean" },
      ],
    },
    { type: "start", label: "시작 지점", unique: true },
    { type: "landmark", label: "흔적", shape: "band", defaultWidth: 48, fields: [{ name: "text", type: "text", required: true }] },
  ],
  play: { env: { INITIAL2D_ALDEBARAN_STAGE: "{map.name}", INITIAL2D_ALDEBARAN_START: "{x},{y}" } },
});

describe("오브젝트 스키마", () => {
  it("읽기와 기본값", () => {
    const s = parseObjectSchema(SCHEMA);
    expect(s.types.map((t) => [t.type, t.shape, t.color, t.unique])).toEqual([
      ["spawn", "point", "danger", false],
      ["start", "point", "accent", true],
      ["landmark", "band", "accent", false],
    ]);
    expect(defaultProps(s.types[0])).toEqual({ species: "spider" });
    expect(defaultProps(s.types[2])).toEqual({ text: "" });
    expect(() => parseObjectSchema('{"version": 1, "types": [{"type": "a"}, {"type": "a"}]}')).toThrow(/겹친다/);
    expect(() => parseObjectSchema('{"version": 1, "types": [{"type": "a", "fields": [{"name": "k", "type": "enum"}]}]}')).toThrow(/values/);
  });

  it("검사: 종 목록, 순찰 범위, 하나만 두는 타입, 띠의 폭, 모르는 타입", () => {
    const s = parseObjectSchema(SCHEMA);
    const problems = validateObjects(
      [
        { id: "a", type: "spawn", x: 50, y: 0, props: { species: "dragon", minX: 60, maxX: 40 }, extra: {} },
        { id: "b", type: "spawn", x: 10, y: 0, props: { minX: 20, maxX: 40 }, extra: {} },
        { id: "s1", type: "start", x: 0, y: 0, props: {}, extra: {} },
        { id: "s2", type: "start", x: 0, y: 0, props: {}, extra: {} },
        { id: "t", type: "landmark", x: 0, y: 0, props: {}, extra: {} },
        { id: "q", type: "mystery", x: 0, y: 0, props: {}, extra: {} },
        { id: "q", type: "mystery", x: 0, y: 0, props: {}, extra: {} },
      ],
      s,
    );
    const msgs = problems.map((p) => `${p.severity}:${p.location}`);
    expect(msgs).toContain("error:objects[0].props.species");
    expect(msgs).toContain("error:objects[0].props.minX");
    expect(msgs).toContain("warning:objects[1].x");
    expect(msgs).toContain("error:objects[4].width");
    expect(msgs).toContain("error:objects[4].props.text");
    expect(msgs).toContain("warning:objects[5].type");
    expect(msgs).toContain("error:objects[6].id");
    expect(msgs).toContain("error:objects");
  });

  it("검사: 필수 글 칸이 비었거나 공백뿐이면 비어 있다고 알린다. 필수가 아닌 빈 글과 필수 숫자 0은 괜찮다", () => {
    const s = parseObjectSchema(
      JSON.stringify({
        version: 1,
        types: [
          {
            type: "landmark",
            label: "흔적",
            shape: "band",
            fields: [
              { name: "title", type: "string", required: true, label: "제목" },
              { name: "text", type: "text", required: true, label: "글" },
              { name: "note", type: "string", label: "메모" },
              { name: "count", type: "integer", required: true, label: "수" },
            ],
          },
        ],
      }),
    );
    const landmark = (id: string, props: Record<string, unknown>) => ({ id, type: "landmark", x: 0, y: 0, width: 48, props, extra: {} });
    // 목록에서 새로 더한 흔적은 기본값으로 시작한다: 필수 글은 "", 필수 수는 0
    expect(defaultProps(s.types[0])).toEqual({ title: "", text: "", count: 0 });
    const problems = validateObjects(
      [
        landmark("fresh", defaultProps(s.types[0])),
        landmark("spaces", { title: "  \t", text: "\n \n", note: "", count: 1 }),
        landmark("filled", { title: "돌무더기", text: "누군가 쌓았다", note: "   ", count: 0 }),
      ],
      s,
    );
    expect(problems.map((p) => [p.location, p.message])).toEqual([
      ["objects[0].props.title", "fresh: 제목이(가) 비어 있다"],
      ["objects[0].props.text", "fresh: 글이(가) 비어 있다"],
      ["objects[1].props.title", "spaces: 제목이(가) 비어 있다"],
      ["objects[1].props.text", "spaces: 글이(가) 비어 있다"],
    ]);
    expect(problems.every((p) => p.severity === "error")).toBe(true);
  });

  it("실행 환경 변수 채우기", () => {
    const s = parseObjectSchema(SCHEMA);
    expect(playEnv(s, { mapName: "aldebaran_forest", mapFile: "resources/maps/aldebaran_forest.json", x: 1990.4, y: 304 })).toEqual({
      INITIAL2D_ALDEBARAN_STAGE: "aldebaran_forest",
      INITIAL2D_ALDEBARAN_START: "1990,304",
    });
    expect(playEnv(null, { mapName: "a", mapFile: "b", x: 0, y: 0 })).toEqual({});
  });
});

describe("MapDocument", () => {
  it("열고, 칠하고, 저장하면 파일이 v2 가 되고, 되돌리면 dirty 가 풀린다", async () => {
    const be = new MemoryBackend({ "resources/maps/tiny.json": serializeMap(tiny()).replace('"version": 2', '"version": 1') });
    await be.open("/mem");
    expect(isMapPath("resources/maps/tiny.json")).toBe(true);
    expect(isMapPath("resources/maps/sub/tiny.json")).toBe(false);
    const doc = await MapDocument.open(be, "resources/maps/tiny.json", parseObjectSchema(SCHEMA));
    expect(doc.kind).toBe("map");
    doc.apply(doc.model.paintCells(0, [{ index: 0, value: 3 }]));
    doc.apply(doc.model.addObject({ id: "start", type: "start", x: 8, y: 8, props: {}, extra: {} }));
    expect(doc.dirty).toBe(true);
    await doc.save();
    const saved = JSON.parse(await be.readText("resources/maps/tiny.json"));
    expect(saved.version).toBe(2);
    expect(saved.layers[0].data[0]).toBe(3);
    expect(saved.objects).toEqual([{ id: "start", type: "start", x: 8, y: 8 }]);
    expect(doc.problems).toEqual([]);
    doc.undo.undo();
    expect(doc.dirty).toBe(true);
  });

  it("저장, 되돌리기, 다른 칸 칠하기와 저장 뒤 합쳐진 속성 입력은 dirty 로 남는다", async () => {
    const be = new MemoryBackend({ "resources/maps/tiny.json": serializeMap(tiny()) });
    await be.open("/mem");
    const doc = await MapDocument.open(be, "resources/maps/tiny.json");
    doc.apply(doc.model.paintCells(0, [{ index: 0, value: 7 }]));
    await doc.save();
    doc.undo.undo();
    doc.apply(doc.model.paintCells(0, [{ index: 1, value: 9 }]));
    expect(doc.dirty).toBe(true);
    await doc.save();
    expect(JSON.parse(await be.readText("resources/maps/tiny.json")).layers[0].data.slice(0, 2)).toEqual([1, 9]);

    doc.apply(doc.model.addObject({ id: "start", type: "start", x: 8, y: 8, props: {}, extra: {} }));
    doc.apply(doc.model.setObjectProp("start", "title", "a", "field#1"));
    await doc.save();
    doc.apply(doc.model.setObjectProp("start", "title", "ab", "field#1"));
    expect(doc.dirty).toBe(true);
  });

  it("쓰는 동안 칠한 칸은 저장 뒤에도 dirty", async () => {
    const be = new MemoryBackend({ "resources/maps/tiny.json": serializeMap(tiny()) });
    await be.open("/mem");
    const doc = await MapDocument.open(be, "resources/maps/tiny.json");
    doc.apply(doc.model.paintCells(0, [{ index: 0, value: 7 }]));
    let release!: () => void;
    const write = be.writeText.bind(be);
    be.writeText = async (rel, text) => {
      await new Promise<void>((r) => (release = r));
      return write(rel, text);
    };
    const saving = doc.save();
    doc.apply(doc.model.paintCells(0, [{ index: 3, value: 12 }]));
    release();
    await saving;
    expect(doc.dirty).toBe(true);
    expect(JSON.parse(await be.readText("resources/maps/tiny.json")).layers[0].data[3]).toBe(1);
  });

  it("밖에서 바뀐 파일을 다시 읽지 못하면 저장을 막아 디스크의 새 내용을 지킨다", async () => {
    const path = "resources/maps/tiny.json";
    const be = new MemoryBackend({ [path]: serializeMap(tiny()) });
    await be.open("/mem");
    const doc = await MapDocument.open(be, path);
    const newer = serializeMap(tiny()).replace('"version": 2', '"version": 3').replace('"name": "tiny"', '"name": "tiny", "newThing": 1');
    be.simulateExternalChange(path, "modify", newer);
    await expect(doc.reloadFromDisk()).rejects.toBeInstanceOf(MapFormatError);
    expect(doc.externallyChanged).toBe(true);
    expect(doc.reloadError).toContain("모르는 맵 버전이다: 3");
    doc.apply(doc.model.paintCells(0, [{ index: 0, value: 5 }]));
    await expect(doc.save()).rejects.toThrow(/저장을 막았다/);
    expect(await be.readText(path)).toBe(newer);

    // 쓰다 만 파일이 다시 온전해지면 다시 읽기가 막힘을 푼다
    const broken = serializeMap(tiny()).replace('"tileWidth"', '"tileWidth" "x": 1,');
    be.simulateExternalChange(path, "modify", broken);
    await expect(doc.reloadFromDisk()).rejects.toThrow(/JSON 이 아니다/);
    const fixed = serializeMap({ ...tiny(), name: "outside" });
    be.simulateExternalChange(path, "modify", fixed);
    await doc.reloadFromDisk();
    expect(doc.model.name).toBe("outside");
    expect(doc.saveBlocked).toBe(false);
    expect(doc.externallyChanged).toBe(false);
    expect(doc.dirty).toBe(false);

    // 다시 실패한 뒤 내 것으로 덮어쓰기를 고르면 지금 내용이 저장된다
    be.simulateExternalChange(path, "modify", newer);
    await expect(doc.reloadFromDisk()).rejects.toThrow();
    doc.allowOverwrite();
    expect(doc.dirty).toBe(true);
    await doc.save();
    const saved = JSON.parse(await be.readText(path));
    expect(saved.version).toBe(2);
    expect(saved.name).toBe("outside");
    expect(doc.dirty).toBe(false);
  });

  it("도구와 대상", async () => {
    const be = new MemoryBackend({ "resources/maps/tiny.json": serializeMap(tiny()) });
    await be.open("/mem");
    const doc = await MapDocument.open(be, "resources/maps/tiny.json");
    doc.setTool("collision");
    expect(doc.target).toEqual({ kind: "collision" });
    expect(doc.showCollision).toBe(true);
    doc.setTool("object");
    expect(doc.target).toEqual({ kind: "objects" });
    doc.setBrush(singleBrush(4));
    expect(doc.tool).toBe("pen");
    expect(doc.target).toEqual({ kind: "layer", index: 0 });
  });

  it("저장 직전 확인: 연 내용, 저장한 내용, 다시 읽은 내용을 기준으로 밖에서 바뀐 것을 잡는다", async () => {
    const path = "resources/maps/tiny.json";
    const be = new MemoryBackend({ [path]: serializeMap(tiny()) });
    await be.open("/mem");
    const doc = await MapDocument.open(be, path);
    const read = (p: string) => be.readText(p);
    doc.apply(doc.model.paintCells(0, [{ index: 0, value: 3 }]));
    expect(await doc.findSaveConflict(read)).toBeNull();
    // 맵 생성기가 밖에서 다시 쓴 맵
    const regenerated = serializeMap({ ...tiny(), name: "regenerated" });
    be.simulateExternalChange(path, "modify", regenerated);
    expect(await doc.findSaveConflict(read)).toEqual({ kind: "changed" });
    await doc.reloadFromDisk();
    expect(doc.model.name).toBe("regenerated");
    expect(await doc.findSaveConflict(read)).toBeNull();
    doc.apply(doc.model.paintCells(0, [{ index: 1, value: 4 }]));
    await doc.save();
    expect(await doc.findSaveConflict(read)).toBeNull();
    be.simulateExternalChange(path, "delete");
    expect(await doc.findSaveConflict(read)).toEqual({ kind: "missing" });
  });
});
