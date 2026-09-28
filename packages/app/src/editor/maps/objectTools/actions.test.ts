import { LogStore } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument, parseObjectSchema } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import {
  addMapObject,
  clearObjectProps,
  deleteMapObjects,
  duplicateMapObjects,
  renameMapObject,
  selectProblem,
  setObjectsProp,
  setRangeAround,
  spawnPointFor,
  type MapObjectHost,
} from "./actions";

const MAP_PATH = "resources/maps/sample.json";
const MAP = JSON.stringify({
  version: 2,
  name: "sample",
  width: 20,
  height: 12,
  tileWidth: 16,
  tileHeight: 16,
  layers: [{ name: "ground", data: new Array(240).fill(1) }],
  tilesets: [{ image: "resources/images/checker.png", firstGid: 1, columns: 1 }],
  objects: [
    { id: "start", type: "start", x: 24, y: 160 },
    { id: "slime_1", type: "spawn", x: 120, y: 160, props: { species: "slime", minX: 80, maxX: 200 } },
    { id: "bat_1", type: "spawn", x: 240, y: 96, props: { species: "bat" } },
  ],
});

const SCHEMA = parseObjectSchema(
  JSON.stringify({
    version: 1,
    types: [
      {
        type: "spawn",
        label: "몬스터",
        fields: [
          { name: "species", type: "enum", values: ["slime", "bat"], label: "종" },
          { name: "minX", type: "number", role: "rangeMin", label: "순찰 왼끝" },
          { name: "maxX", type: "number", role: "rangeMax", label: "순찰 오른끝" },
          { name: "boss", type: "boolean" },
        ],
      },
      { type: "start", label: "시작 지점", unique: true },
      { type: "landmark", label: "흔적", shape: "band", defaultWidth: 32, fields: [{ name: "text", type: "text" }] },
    ],
  }),
);

// resources/schema/map-objects.json처럼 순찰 범위 칸이 필수이고 기본값이 없다
const REQUIRED_RANGE = parseObjectSchema(
  JSON.stringify({
    version: 1,
    types: [
      {
        type: "spawn",
        label: "몬스터",
        fields: [
          { name: "species", type: "enum", values: ["slime", "bat"], required: true, label: "종" },
          { name: "minX", type: "number", role: "rangeMin", required: true, label: "순찰 왼끝" },
          { name: "maxX", type: "number", role: "rangeMax", required: true, label: "순찰 오른끝" },
        ],
      },
      { type: "start", label: "시작 지점", unique: true },
    ],
  }),
);

async function setup(center: { x: number; y: number } | null = null, schema = SCHEMA) {
  const mem = new MemoryBackend({ [MAP_PATH]: MAP });
  await mem.open("/p");
  const doc = await MapDocument.open(mem, MAP_PATH, schema);
  const toasts: string[] = [];
  const focused: string[] = [];
  const toast = (level: string) => (text: string) => void toasts.push(`${level}: ${text}`);
  const host: MapObjectHost = {
    log: new LogStore(),
    toasts: { info: toast("info"), success: toast("success"), warn: toast("warn"), error: toast("error") },
    mapSupport: { viewCenter: () => center, focusObject: (id: string) => void focused.push(id) },
  };
  return { mem, doc, host, toasts, focused };
}

describe("맵 오브젝트 조작", () => {
  it("추가: 화면 가운데(없으면 맵 가운데)에 defaultProps 로, 새 오브젝트를 고르고 되돌리면 사라진다", async () => {
    const { doc, host } = await setup({ x: 100, y: 50 });
    const spawn = addMapObject(host, doc, "spawn");
    expect(spawn).toMatchObject({ id: "spawn_1", x: 100, y: 50, props: { species: "slime" } });
    expect(doc.selectedIds).toEqual(["spawn_1"]);
    const band = addMapObject(host, doc, "landmark");
    expect(band).toMatchObject({ id: "landmark_1", x: 84, y: 0, width: 32 });
    doc.undo.undo();
    expect(doc.model.findObject("landmark_1")).toBeUndefined();

    const noView = await setup(null);
    expect(spawnPointFor(noView.host, noView.doc)).toEqual({ x: 160, y: 96 });
    expect(spawnPointFor({}, noView.doc)).toEqual({ x: 160, y: 96 });
  });

  it("추가한 몬스터는 순찰 범위가 제자리 기준 ±64이고 검사에 걸리지 않는다", async () => {
    const { doc, host } = await setup({ x: 250, y: 100 }, REQUIRED_RANGE);
    const before = doc.problems.length;
    const spawn = addMapObject(host, doc, "spawn");
    expect(spawn?.props).toEqual({ species: "slime", minX: 186, maxX: 314 });
    expect(doc.problems.filter((p) => p.objectId === spawn?.id)).toEqual([]);
    expect(doc.problems).toHaveLength(before);
    // 맵 끝 가까이면 맵 폭(320) 안으로 자른다
    const edge = addMapObject(host, doc, "spawn", { x: 300, y: 100 });
    expect(edge?.props).toMatchObject({ minX: 236, maxX: 320 });
  });

  it("unique 타입은 둘째를 토스트로 거부한다", async () => {
    const { doc, host, toasts } = await setup();
    expect(addMapObject(host, doc, "start")).toBeNull();
    expect(toasts).toEqual(["warn: 시작 지점: 맵당 1개만 허용"]);
    expect(doc.model.objects.filter((o) => o.type === "start")).toHaveLength(1);
    expect(doc.undo.depth).toBe(0);
  });

  it("이름 바꾸기: 겹치면 거부, 되면 선택이 새 id 로 옮긴다", async () => {
    const { doc, host, toasts } = await setup();
    doc.select(["slime_1"]);
    expect(renameMapObject(host, doc, "slime_1", "start")).toBe(false);
    expect(toasts).toEqual(["warn: 이미 있는 id: start"]);
    expect(renameMapObject(host, doc, "slime_1", " slime_boss ")).toBe(true);
    expect(doc.selectedIds).toEqual(["slime_boss"]);
    expect(doc.model.findObject("slime_boss")?.props.species).toBe("slime");
  });

  it("복제와 삭제는 되돌리기 한 단계이고, 복제본은 원본 바로 뒤에 온다", async () => {
    const { doc, host, toasts } = await setup();
    const created = duplicateMapObjects(host, doc, ["slime_1", "bat_1", "start"]);
    expect(created).toEqual(["slime_2", "bat_2"]);
    expect(toasts).toEqual(["warn: 맵당 1개만 허용되는 타입이라 복제 제외: start"]);
    expect(doc.model.objectIds()).toEqual(["start", "slime_1", "slime_2", "bat_1", "bat_2"]);
    expect(doc.selectedIds).toEqual(["slime_2", "bat_2"]);
    // 한 칸(16px) 오른쪽, y는 그대로
    expect(doc.model.findObject("slime_2")).toMatchObject({ x: 136, y: 160, props: { minX: 96, maxX: 216 } });
    expect(doc.model.findObject("bat_2")).toMatchObject({ x: 256, y: 96 });
    expect(doc.undo.depth).toBe(1);
    expect(deleteMapObjects(doc, ["slime_2", "bat_2", "nope"])).toBe(2);
    expect(doc.selectedIds).toEqual([]);
    doc.undo.undo();
    expect(doc.model.objectIds()).toEqual(["start", "slime_1", "slime_2", "bat_1", "bat_2"]);
  });

  it("속성: 한 세션의 타이핑은 한 단계, 여럿은 묶음 명령 하나, 지우기", async () => {
    const { doc } = await setup();
    setObjectsProp(doc, ["slime_1"], "minX", 1, "s#1");
    setObjectsProp(doc, ["slime_1"], "minX", 10, "s#1");
    expect(doc.undo.depth).toBe(1);
    setObjectsProp(doc, ["slime_1", "bat_1"], "species", "bat");
    expect(doc.model.objects.filter((o) => o.props.species === "bat")).toHaveLength(2);
    expect(doc.undo.depth).toBe(2);
    doc.undo.undo();
    expect(doc.model.findObject("slime_1")?.props.species).toBe("slime");
    clearObjectProps(doc, "slime_1", ["minX", "maxX", "boss"]);
    expect(doc.model.findObject("slime_1")?.props).toEqual({ species: "slime" });
    expect(doc.undo.depth).toBe(2);
  });

  it("범위를 x 기준 ±64 로 (맵 폭 안으로), 뒤집힌 범위는 검사에 나오고 누르면 그 오브젝트를 고른다", async () => {
    const { doc, host, focused } = await setup();
    expect(setRangeAround(doc, "slime_1")).toBe(true);
    expect(doc.model.findObject("slime_1")?.props).toMatchObject({ minX: 56, maxX: 184 });
    expect(setRangeAround(doc, "bat_1", 100)).toBe(true);
    expect(doc.model.findObject("bat_1")?.props).toMatchObject({ minX: 140, maxX: 320 });
    expect(setRangeAround(doc, "start")).toBe(false);

    setObjectsProp(doc, ["slime_1"], "minX", 300);
    const problem = doc.problems.find((p) => p.objectId === "slime_1");
    expect(problem).toMatchObject({ severity: "error", message: "slime_1: 순찰 왼끝 값은 순찰 오른끝 값 이하여야 합니다", location: "objects[1].props.minX" });
    selectProblem(host, doc, problem!);
    expect(doc.selectedIds).toEqual(["slime_1"]);
    expect(focused).toEqual(["slime_1"]);
  });
});

describe("인스펙터로 x 를 고치면 순찰 범위도 같이 간다", () => {
  it("타이핑 한 세션이 되돌리기 한 단계이고 범위가 같은 만큼 움직인다", async () => {
    const { MapDocument, parseMap, parseObjectSchema } = await import("@initial-editor/ext-tilemap/model");
    const { MemoryBackend } = await import("@initial-editor/core/testing");
    const { setObjectGeometry } = await import("./actions");
    const schema = parseObjectSchema(JSON.stringify({ version: 1, types: [{ type: "spawn", fields: [{ name: "minX", type: "number", role: "rangeMin" }, { name: "maxX", type: "number", role: "rangeMax" }] }] }));
    const map = parseMap(JSON.stringify({ version: 2, name: "m", width: 20, height: 4, tileWidth: 16, tileHeight: 16, tilesets: [], layers: [{ name: "g", data: new Array(80).fill(0) }], objects: [{ id: "w", type: "spawn", x: 100, y: 32, props: { minX: 60, maxX: 140 } }] }));
    const doc = new MapDocument(new MemoryBackend(), "resources/maps/m.json", map, schema);
    setObjectGeometry(doc, "w", "x", 1, "typing");
    setObjectGeometry(doc, "w", "x", 12, "typing");
    setObjectGeometry(doc, "w", "x", 120, "typing");
    expect(doc.model.findObject("w")).toMatchObject({ x: 120, props: { minX: 80, maxX: 160 } });
    expect(doc.undo.depth).toBe(1);
    doc.undo.undo();
    expect(doc.model.findObject("w")).toMatchObject({ x: 100, props: { minX: 60, maxX: 140 } });
    doc.undo.redo();
    expect(doc.model.findObject("w")).toMatchObject({ x: 120, props: { minX: 80, maxX: 160 } });
  });
});
