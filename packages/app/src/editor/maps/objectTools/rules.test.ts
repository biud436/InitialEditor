import { parseObjectSchema, validateObjects, type MapObject } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import {
  buildPlayEnv,
  bulkEditableFields,
  groupObjects,
  mapNameFor,
  PLAY_POSITION_RULE,
  planDuplicate,
  planNewObject,
  playPosition,
  rangeAround,
  rangeFields,
  summarizeObject,
  UNKNOWN_GROUP_LABEL,
  validateRename,
  type MapGeometry,
} from "./rules";

// 엔진(알데바란)이 싣는 스키마와 같은 모양
const SCHEMA = parseObjectSchema(
  JSON.stringify({
    version: 1,
    types: [
      {
        type: "spawn",
        label: "몬스터",
        color: "danger",
        fields: [
          { name: "species", type: "enum", values: ["spider", "wolf"], label: "종" },
          { name: "minX", type: "number", role: "rangeMin", label: "순찰 왼끝" },
          { name: "maxX", type: "number", role: "rangeMax", label: "순찰 오른끝" },
          { name: "boss", type: "boolean", default: false },
          { name: "note", type: "string" },
        ],
      },
      { type: "start", label: "시작 지점", unique: true },
      { type: "checkpoint", label: "체크포인트" },
      { type: "landmark", label: "흔적", shape: "band", defaultWidth: 48, fields: [{ name: "title", type: "string" }, { name: "text", type: "text" }] },
      { type: "section", label: "구간", shape: "band", fields: [{ name: "name", type: "string", required: true }] },
      { type: "zone", label: "영역", shape: "rect", defaultWidth: 40, defaultHeight: 24 },
    ],
    play: {
      env: { INITIAL2D_SCENE: "aldebaran", INITIAL2D_SKIP_INTRO: "1", INITIAL2D_ALDEBARAN_STAGE: "{map.name}", INITIAL2D_ALDEBARAN_AT: "{x}", FILE: "{map.file}", AT_Y: "{y}" },
    },
  }),
);

const GEO: MapGeometry = { pixelWidth: 4096, pixelHeight: 448, tileWidth: 16, tileHeight: 16 };

// resources/schema/map-objects.json처럼 범위 칸이 필수이고 기본값이 없는 몬스터
const REQUIRED_RANGE = parseObjectSchema(
  JSON.stringify({
    version: 1,
    types: [
      {
        type: "spawn",
        label: "몬스터",
        fields: [
          { name: "species", type: "enum", values: ["spider", "wolf"], required: true, label: "종" },
          { name: "minX", type: "number", role: "rangeMin", required: true, label: "순찰 왼끝" },
          { name: "maxX", type: "number", role: "rangeMax", required: true, label: "순찰 오른끝" },
        ],
      },
      {
        type: "bird",
        label: "새",
        fields: [
          { name: "left", type: "number", role: "rangeMin", default: 10, label: "왼끝" },
          { name: "right", type: "number", role: "rangeMax", label: "오른끝" },
        ],
      },
    ],
  }),
);

function obj(id: string, type: string, x: number, extra: Partial<MapObject> = {}): MapObject {
  return { id, type, x, y: 400, props: {}, extra: {}, ...extra };
}

describe("목록 묶음과 요약", () => {
  it("스키마 타입 순서로 묶고, 빈 타입도 자리를 두며, 모르는 타입은 맨 뒤 한 묶음", () => {
    const objects = [obj("wolf_1", "spawn", 300), obj("start", "start", 56), obj("npc_1", "npc", 10), obj("spider_1", "spawn", 700)];
    const groups = groupObjects(objects, SCHEMA);
    expect(groups.map((g) => [g.label, g.objects.map((o) => o.id)])).toEqual([
      ["몬스터", ["wolf_1", "spider_1"]],
      ["시작 지점", ["start"]],
      ["체크포인트", []],
      ["흔적", []],
      ["구간", []],
      ["영역", []],
      [UNKNOWN_GROUP_LABEL, ["npc_1"]],
    ]);
    expect(groupObjects(objects, null).map((g) => g.label)).toEqual([UNKNOWN_GROUP_LABEL]);
  });

  it("요약은 첫 enum 값, 띠는 x..x+width, 사각형은 자리와 크기", () => {
    const spawn = SCHEMA.types[0];
    expect(summarizeObject(obj("a", "spawn", 300, { props: { species: "wolf" } }), spawn)).toBe("wolf");
    expect(summarizeObject(obj("b", "landmark", 300, { width: 48 }), SCHEMA.types[3])).toBe("300..348");
    expect(summarizeObject(obj("c", "zone", 10, { y: 20, width: 40, height: 24 }), SCHEMA.types[5])).toBe("10,20 40x24");
    expect(summarizeObject(obj("d", "start", 56), SCHEMA.types[1])).toBe("56, 400");
    expect(summarizeObject(obj("e", "npc", 5, { width: 10 }), undefined)).toBe("5..15");
  });

  it("범위 칸 한 쌍과 여럿을 함께 고칠 칸", () => {
    const r = rangeFields(SCHEMA.types[0]);
    expect([r?.min.name, r?.max.name]).toEqual(["minX", "maxX"]);
    expect(rangeFields(SCHEMA.types[3])).toBeNull();
    expect(bulkEditableFields(SCHEMA.types[0]).map((f) => f.name)).toEqual(["species", "boss"]);
  });
});

describe("오브젝트 추가 규칙", () => {
  it("defaultProps 와 겹치지 않는 id (타입_번호), 점은 그 자리, 범위 칸은 x 기준 ±64", () => {
    const plan = planNewObject(SCHEMA, "spawn", [obj("spawn_1", "spawn", 1)], { x: 120.4, y: 399.6 }, GEO);
    expect(plan).toEqual({ ok: true, object: { id: "spawn_2", type: "spawn", x: 120, y: 400, props: { species: "spider", minX: 56, maxX: 184, boss: false }, extra: {} } });
  });

  it("범위 칸이 필수이고 기본값이 없어도 새 몬스터는 제자리 기준 범위로 순찰한다 (0..0이 아니다)", () => {
    const plan = planNewObject(REQUIRED_RANGE, "spawn", [], { x: 2000, y: 300 }, GEO);
    expect(plan.ok && plan.object.props).toEqual({ species: "spider", minX: 1936, maxX: 2064 });
    expect(validateObjects([plan.ok ? plan.object : obj("x", "spawn", 0)], REQUIRED_RANGE)).toEqual([]);
    const left = planNewObject(REQUIRED_RANGE, "spawn", [], { x: 20, y: 300 }, GEO);
    expect(left.ok && left.object.props).toMatchObject({ minX: 0, maxX: 84 });
    const right = planNewObject(REQUIRED_RANGE, "spawn", [], { x: 4080, y: 300 }, GEO);
    expect(right.ok && right.object.props).toMatchObject({ minX: 4016, maxX: 4096 });
  });

  it("스키마 기본값이 있는 범위 칸은 기본값을 둔다", () => {
    const plan = planNewObject(REQUIRED_RANGE, "bird", [], { x: 500, y: 100 }, GEO);
    expect(plan.ok && plan.object.props).toEqual({ left: 10, right: 564 });
  });

  it("범위 도우미: x 기준 ±radius, 맵 폭 안으로 자른다", () => {
    expect(rangeAround(2000, 4096)).toEqual({ min: 1936, max: 2064 });
    expect(rangeAround(10.6, 4096, 100)).toEqual({ min: 0, max: 111 });
    expect(rangeAround(4090, 4096)).toEqual({ min: 4026, max: 4096 });
  });

  it("띠는 defaultWidth 로 가운데에 놓고 맵 안으로 자른다, 없으면 두 칸 폭. 사각형은 높이도", () => {
    const band = planNewObject(SCHEMA, "landmark", [], { x: 500, y: 300 }, GEO);
    expect(band.ok && band.object).toMatchObject({ id: "landmark_1", x: 476, y: 0, width: 48, props: {} });
    const edge = planNewObject(SCHEMA, "landmark", [], { x: 4090, y: 0 }, GEO);
    expect(edge.ok && edge.object.x).toBe(4096 - 48);
    const section = planNewObject(SCHEMA, "section", [], { x: 100, y: 0 }, GEO);
    expect(section.ok && section.object).toMatchObject({ width: 32, props: { name: "" } });
    const zone = planNewObject(SCHEMA, "zone", [], { x: 100, y: 100 }, GEO);
    expect(zone.ok && zone.object).toMatchObject({ x: 80, y: 88, width: 40, height: 24 });
  });

  it("unique 타입은 둘째를 거부하고, 스키마에 없는 타입도 거부한다", () => {
    expect(planNewObject(SCHEMA, "start", [], { x: 0, y: 0 }, GEO).ok).toBe(true);
    expect(planNewObject(SCHEMA, "start", [obj("start", "start", 56)], { x: 0, y: 0 }, GEO)).toEqual({ ok: false, reason: "시작 지점 은(는) 하나만 둘 수 있다" });
    expect(planNewObject(SCHEMA, "npc", [], { x: 0, y: 0 }, GEO)).toEqual({ ok: false, reason: "스키마에 없는 타입이다: npc" });
    expect(planNewObject(null, "spawn", [], { x: 0, y: 0 }, GEO).ok).toBe(false);
  });

  it("복제는 새 id 로 16px 옆, props 는 깊은 복사, unique 타입은 건너뛴다", () => {
    const src = obj("wolf_1", "spawn", 300, { props: { species: "wolf", nested: { a: 1 } } });
    const plan = planDuplicate(SCHEMA, [src, obj("start", "start", 56), obj("wolf_2", "spawn", 1)], ["wolf_1", "start"]);
    expect(plan.skipped).toEqual(["start"]);
    expect(plan.copies).toHaveLength(1);
    expect(plan.copies[0].after).toBe("wolf_1");
    expect(plan.copies[0].object).toMatchObject({ id: "wolf_3", x: 316, y: 400, props: { species: "wolf", nested: { a: 1 } } });
    expect(plan.copies[0].object.props.nested).not.toBe(src.props.nested);
  });

  it("이름 바꾸기 검사: 비움과 겹침을 거부하고 그대로면 통과", () => {
    expect(validateRename("a", " a ", ["a", "b"])).toBeNull();
    expect(validateRename("a", "", ["a", "b"])).toBe("id 는 비울 수 없다");
    expect(validateRename("a", "b", ["a", "b"])).toBe("이미 있는 id 다: b");
    expect(validateRename("a", "c", ["a", "b"])).toBeNull();
  });
});

describe("여기서 실행", () => {
  const objects = [obj("start", "start", 56, { y: 384 }), obj("wolf_1", "spawn", 1200, { y: 380 })];
  const base = { objects, selectedIds: [] as string[], cursor: null, viewCenter: null, geometry: GEO };

  it("위치: 하나만 고른 오브젝트, 커서, 화면 가운데, 시작 지점, 맵 가운데 순서", () => {
    expect(playPosition({ ...base, selectedIds: ["wolf_1"], cursor: { x: 5, y: 5 } })).toEqual({ x: 1200, y: 380, source: "selection", objectId: "wolf_1" });
    expect(playPosition({ ...base, selectedIds: ["wolf_1", "start"], cursor: { x: 5.4, y: 6.6 } })).toEqual({ x: 5, y: 7, source: "cursor" });
    expect(playPosition({ ...base, viewCenter: { x: 2048, y: 224 } })).toEqual({ x: 2048, y: 224, source: "view" });
    expect(playPosition({ ...base, cursor: { x: Number.NaN, y: 1 } })).toEqual({ x: 56, y: 384, source: "start", objectId: "start" });
    expect(playPosition({ ...base, objects: [objects[1]] })).toEqual({ x: 2048, y: 224, source: "center" });
  });

  it("맵 밖의 커서는 쓰지 않고 화면 가운데로, 화면 가운데와 나머지도 맵 안으로 자른다", () => {
    const view = { x: 2048, y: 224 };
    expect(playPosition({ ...base, cursor: { x: -18, y: 30 }, viewCenter: view })).toEqual({ x: 2048, y: 224, source: "view" });
    expect(playPosition({ ...base, cursor: { x: 4096 + 200, y: 30 }, viewCenter: view })).toEqual({ x: 2048, y: 224, source: "view" });
    expect(playPosition({ ...base, cursor: { x: 138, y: -31 }, viewCenter: view })).toEqual({ x: 2048, y: 224, source: "view" });
    expect(playPosition({ ...base, cursor: { x: 0, y: 447 }, viewCenter: view })).toEqual({ x: 0, y: 447, source: "cursor" });
    expect(playPosition({ ...base, viewCenter: { x: -74, y: 900 } })).toEqual({ x: 0, y: 447, source: "view" });
    expect(playPosition({ ...base, viewCenter: { x: 5000, y: -3 } })).toEqual({ x: 4095, y: 0, source: "view" });
    expect(playPosition({ ...base, objects: [obj("far", "checkpoint", 9000)], selectedIds: ["far"] })).toMatchObject({ x: 4095, source: "selection" });
  });

  it("순찰 범위가 있는 오브젝트를 고르면 범위 왼끝에서 48px 왼쪽(16 이상), 다른 오브젝트는 그 x", () => {
    const spawn = obj("spider_1", "spawn", 1056, { y: 300, props: { minX: 1010, maxX: 1120 } });
    const nearEdge = obj("spider_2", "spawn", 80, { y: 300, props: { minX: 40, maxX: 120 } });
    const noRange = obj("wolf_2", "spawn", 700, { y: 300 });
    const cp = obj("checkpoint_1", "checkpoint", 1552, { y: 384 });
    const input = { ...base, objects: [spawn, nearEdge, noRange, cp], schema: SCHEMA };
    expect(playPosition({ ...input, selectedIds: ["spider_1"] })).toMatchObject({ x: 962, y: 300, source: "selection", objectId: "spider_1" });
    expect(playPosition({ ...input, selectedIds: ["spider_2"] })).toMatchObject({ x: 16, source: "selection" });
    // 범위 칸이 비었으면 엔진처럼 x - 64를 왼끝으로 본다
    expect(playPosition({ ...input, selectedIds: ["wolf_2"] })).toMatchObject({ x: 700 - 64 - 48, source: "selection" });
    expect(playPosition({ ...input, selectedIds: ["checkpoint_1"] })).toEqual({ x: 1552, y: 384, source: "selection", objectId: "checkpoint_1" });
    // 스키마를 모르면 범위 칸도 모르므로 그 x
    expect(playPosition({ ...input, schema: null, selectedIds: ["spider_1"] })).toMatchObject({ x: 1056, source: "selection" });
    expect(PLAY_POSITION_RULE).toContain("48px 왼쪽");
  });

  it("환경 변수: play.env 의 자리표시자를 맵 이름, 파일, x, y 로 채운다", () => {
    const env = buildPlayEnv(SCHEMA, { name: "forest", path: "resources/maps/aldebaran_forest.json" }, { x: 1200.4, y: 380 });
    expect(env).toEqual({
      INITIAL2D_SCENE: "aldebaran",
      INITIAL2D_SKIP_INTRO: "1",
      INITIAL2D_ALDEBARAN_STAGE: "forest",
      INITIAL2D_ALDEBARAN_AT: "1200",
      FILE: "resources/maps/aldebaran_forest.json",
      AT_Y: "380",
    });
    expect(buildPlayEnv({ ...SCHEMA, play: null }, { name: "forest", path: null }, { x: 0, y: 0 })).toBeNull();
    expect(buildPlayEnv(null, { name: "forest", path: null }, { x: 0, y: 0 })).toBeNull();
  });

  it("맵 이름이 비었으면 파일 이름에서 .json 을 뺀 것", () => {
    expect(mapNameFor("forest", "resources/maps/x.json")).toBe("forest");
    expect(mapNameFor("", "resources/maps/aldebaran_tomb.json")).toBe("aldebaran_tomb");
    expect(mapNameFor(" ", null)).toBe("");
  });
});
