import { DocumentRegistry, LogStore } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument, parseObjectSchema, validateObjects, type MapObject } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import { EMPTY_MAP_CLIPBOARD, MapClipboard, mapEditRouter, NEED_MAP_SELECTION, pasteAxis, planPaste, type MapEditHost } from "./mapClipboard";

const MAP_PATH = "resources/maps/sample.json";
const OTHER_PATH = "resources/maps/small.json";
const map = (name: string, width: number, height: number, objects: unknown[]) =>
  JSON.stringify({
    version: 2,
    name,
    width,
    height,
    tileWidth: 16,
    tileHeight: 8,
    layers: [{ name: "ground", data: new Array(width * height).fill(1) }],
    tilesets: [{ image: "resources/images/checker.png", firstGid: 1, columns: 1 }],
    objects,
  });

const OBJECTS = [
  { id: "start", type: "start", x: 24, y: 40 },
  { id: "slime_1", type: "spawn", x: 120, y: 40, props: { species: "slime", minX: 80, maxX: 200 } },
  { id: "sign_1", type: "landmark", x: 16, y: 0, width: 32, props: { text: "a" } },
  { id: "zone_1", type: "zone", x: 200, y: 50, width: 64, height: 16 },
];

const SCHEMA = parseObjectSchema(
  JSON.stringify({
    version: 1,
    types: [
      {
        type: "spawn",
        label: "몬스터",
        fields: [
          { name: "species", type: "enum", values: ["slime", "bat"] },
          { name: "minX", type: "number", role: "rangeMin" },
          { name: "maxX", type: "number", role: "rangeMax" },
        ],
      },
      { type: "start", label: "시작 지점", unique: true },
      { type: "landmark", label: "흔적", shape: "band", defaultWidth: 32 },
      { type: "zone", label: "구간", shape: "rect" },
    ],
  }),
);

async function setup() {
  const be = new MemoryBackend({ [MAP_PATH]: map("sample", 20, 10, OBJECTS), [OTHER_PATH]: map("small", 4, 4, []) });
  await be.open("/p");
  const doc = await MapDocument.open(be, MAP_PATH, SCHEMA);
  const other = await MapDocument.open(be, OTHER_PATH, SCHEMA);
  const documents = new DocumentRegistry();
  documents.open(other);
  documents.open(doc);
  const toasts: string[] = [];
  const toast = (level: string) => (text: string) => void toasts.push(`${level}: ${text}`);
  const log = new LogStore();
  const host: MapEditHost = { documents, log, toasts: { info: toast("info"), success: toast("success"), warn: toast("warn"), error: toast("error") } };
  const clipboard = new MapClipboard();
  const router = mapEditRouter(host, () => clipboard);
  return { doc, other, documents, toasts, log, host, clipboard, router };
}

const geometry = { pixelWidth: 320, pixelHeight: 80 };
const clip = (ids: string[]) => OBJECTS.filter((o) => ids.includes(o.id)).map((o) => ({ props: {}, extra: {}, ...o }) as MapObject);

describe("붙여넣기 계획", () => {
  it("원래 id가 맵에 있으면 새 id, x로만 한 칸 옮기고 y는 그대로, 순찰 범위는 x와 함께", () => {
    const plan = planPaste(SCHEMA, clip(["slime_1", "sign_1", "zone_1"]), clip(["slime_1", "sign_1", "zone_1"]), 16, geometry);
    expect(plan.skipped).toEqual([]);
    expect(plan.objects.map((o) => [o.id, o.x, o.y, o.width, o.height])).toEqual([
      ["slime_2", 136, 40, undefined, undefined],
      ["sign_2", 32, 0, 32, undefined],
      ["zone_2", 216, 50, 64, 16],
    ]);
    expect(plan.objects[0].props).toEqual({ species: "slime", minX: 96, maxX: 216 });
  });

  it("id는 이미 있는 것과 이번에 만든 것을 모두 피한다", () => {
    const existing = [...clip(["slime_1"]), { id: "slime_2", type: "spawn", x: 0, y: 0, props: {}, extra: {} }];
    const plan = planPaste(SCHEMA, existing, [...clip(["slime_1"]), ...clip(["slime_1"])], 16, geometry);
    expect(plan.objects.map((o) => o.id)).toEqual(["slime_3", "slime_4"]);
  });

  it("원래 id가 맵에 없으면 그대로 쓴다. 이번 붙이기에서 한 번 쓴 id는 다음 것이 피한다", () => {
    const plan = planPaste(SCHEMA, clip(["sign_1"]), [...clip(["slime_1", "zone_1"]), ...clip(["slime_1"])], 16, geometry);
    expect(plan.objects.map((o) => o.id)).toEqual(["slime_1", "zone_1", "slime_2"]);
  });

  it("하나만 두는 타입은 맵에 있으면 건너뛰고, 없으면 하나만 id 그대로 붙인다", () => {
    expect(planPaste(SCHEMA, clip(["start"]), clip(["start"]), 16, geometry)).toMatchObject({ objects: [], skipped: ["start"] });
    const twice = planPaste(SCHEMA, [], [...clip(["start"]), ...clip(["start"])], 16, geometry);
    expect(twice.objects.map((o) => [o.id, o.x, o.y])).toEqual([["start", 40, 40]]);
    expect(twice.skipped).toEqual(["start"]);
  });

  it("맵 밖이면 안으로 당기고, 순찰 범위도 실제로 옮긴 만큼만 옮긴다", () => {
    const small = { pixelWidth: 64, pixelHeight: 32 };
    const plan = planPaste(SCHEMA, [], clip(["slime_1", "sign_1", "zone_1"]), 16, small);
    expect(plan.objects.map((o) => [o.id, o.x, o.y])).toEqual([
      ["slime_1", 63, 31],
      ["sign_1", 32, 0],
      ["zone_1", 0, 16],
    ]);
    // 슬라임은 x 120 → 63 (-57)
    expect(plan.objects[0].props).toMatchObject({ minX: 23, maxX: 143 });
  });

  it("한 축: 당겨서 원래 자리로 돌아오면 반대쪽으로 옮긴다", () => {
    expect(pasteAxis(100, 16, 0, 300)).toBe(116);
    expect(pasteAxis(300, 16, 0, 300)).toBe(284);
    expect(pasteAxis(290, 16, 0, 300)).toBe(300);
    expect(pasteAxis(0, -16, 0, 300)).toBe(16);
    expect(pasteAxis(50, 0, 0, 300)).toBe(50);
    // 맵을 꽉 채우면 어느 쪽으로도 못 간다
    expect(pasteAxis(0, 16, 0, 0)).toBe(0);
  });

  it("맵 끝에 붙은 오브젝트는 원본과 겹치지 않게 반대쪽으로 붙인다 (순찰 범위도 같이)", () => {
    const edge: MapObject[] = [
      { id: "band_1", type: "landmark", x: 288, y: 0, width: 32, props: {}, extra: {} },
      { id: "slime_9", type: "spawn", x: 319, y: 79, props: { minX: 280, maxX: 320 }, extra: {} },
      { id: "slime_10", type: "spawn", x: 319, y: 20, props: { minX: 280, maxX: 320 }, extra: {} },
    ];
    const plan = planPaste(SCHEMA, edge, edge, 16, geometry);
    expect(plan.objects.map((o) => [o.id, o.x, o.y])).toEqual([
      ["band_2", 272, 0],
      ["slime_1", 303, 79],
      ["slime_2", 303, 20],
    ]);
    expect(plan.objects[1].props).toEqual({ minX: 264, maxX: 304 });
  });
});

describe("맵 클립보드", () => {
  it("복사는 되돌리기에 들어가지 않고, 붙여넣기는 한 단계이며 붙인 것을 고른다. 거듭 붙이면 한 칸씩 더 간다", async () => {
    const { doc, clipboard, host, log } = await setup();
    doc.select(["slime_1", "sign_1"]);
    expect(clipboard.copy(doc)).toBe(2);
    expect(doc.undo.depth).toBe(0);
    expect(clipboard.paste(host, doc)).toEqual(["slime_2", "sign_2"]);
    expect(doc.undo.depth).toBe(1);
    expect(doc.selectedIds).toEqual(["slime_2", "sign_2"]);
    expect(doc.model.findObject("slime_2")).toMatchObject({ x: 136, y: 40 });
    expect(doc.undo.undoLabel).toContain("오브젝트 2개 붙여넣기");
    expect(clipboard.paste(host, doc)).toEqual(["slime_3", "sign_3"]);
    expect(doc.model.findObject("slime_3")).toMatchObject({ x: 152, y: 40 });
    expect(log.entries.at(-1)?.text).toBe("오브젝트 붙여넣기: slime_3, sign_3");
    doc.undo.undo();
    doc.undo.undo();
    expect(doc.model.objectIds()).toEqual(["start", "slime_1", "sign_1", "zone_1"]);
    // 다시 복사하면 옮김이 처음으로 돌아간다
    doc.select(["zone_1"]);
    clipboard.copy(doc);
    clipboard.paste(host, doc);
    expect(doc.model.findObject("zone_2")).toMatchObject({ x: 216, y: 50 });
    expect(doc.undo.undoLabel).toContain("붙여넣기: zone_2");
  });

  it("클립보드는 복사한 순간의 값이다 (원본을 고쳐도 그대로)", async () => {
    const { doc, clipboard, host } = await setup();
    doc.select(["slime_1"]);
    clipboard.copy(doc);
    doc.apply(doc.model.setObjectProp("slime_1", "species", "bat"));
    clipboard.paste(host, doc);
    expect(doc.model.findObject("slime_2")?.props.species).toBe("slime");
  });

  it("붙인 것끼리 props를 나눠 갖지 않는다 (깊은 복사)", () => {
    const nested: MapObject = { id: "note_1", type: "note", x: 0, y: 0, props: { data: { a: 1 } }, extra: {} };
    const plan = planPaste(null, [], [nested, nested], 16, geometry);
    expect(plan.objects[0].props.data).toEqual({ a: 1 });
    expect(plan.objects[0].props.data).not.toBe(nested.props.data);
    expect(plan.objects[0].props.data).not.toBe(plan.objects[1].props.data);
  });

  it("잘라내기는 복사와 삭제이고 되돌리기 한 단계다. 다른 맵에 붙일 수 있다", async () => {
    const { doc, other, clipboard, host } = await setup();
    doc.select(["slime_1", "zone_1"]);
    expect(clipboard.cut(doc)).toBe(2);
    expect(doc.model.objectIds()).toEqual(["start", "sign_1"]);
    expect(doc.selectedIds).toEqual([]);
    expect(doc.undo.depth).toBe(1);
    expect(doc.undo.undoLabel).toContain("오브젝트 2개 잘라내기");
    doc.undo.undo();
    expect(doc.model.objectIds()).toEqual(["start", "slime_1", "sign_1", "zone_1"]);
    expect(clipboard.paste(host, other)).toEqual(["slime_1", "zone_1"]);
    // 작은 맵(64x32 px) 안으로 당긴다
    expect(other.model.findObject("zone_1")).toMatchObject({ x: 0, y: 16 });
    expect(other.selectedIds).toEqual(["slime_1", "zone_1"]);
  });

  it("잘라내고 붙이면 옮기기다: 원래 id(시작 지점은 start), x로 한 칸, y는 그대로. 다시 붙이면 새 id", async () => {
    const { doc, clipboard, host, toasts } = await setup();
    doc.select(["start", "slime_1"]);
    expect(clipboard.cut(doc)).toBe(2);
    expect(clipboard.paste(host, doc)).toEqual(["start", "slime_1"]);
    expect(doc.model.objectIds()).toEqual(["sign_1", "zone_1", "start", "slime_1"]);
    expect(doc.model.findObject("start")).toMatchObject({ x: 40, y: 40 });
    expect(doc.model.findObject("slime_1")).toMatchObject({ x: 136, y: 40, props: { minX: 96, maxX: 216 } });
    expect(doc.selectedIds).toEqual(["start", "slime_1"]);
    expect(validateObjects(doc.model.objects, SCHEMA)).toEqual([]);
    // 한 번 더 붙이면 원래 id가 맵에 있으므로 새 id이고, 시작 지점은 붙이지 않는다
    expect(clipboard.paste(host, doc)).toEqual(["slime_2"]);
    expect(doc.model.findObject("slime_2")).toMatchObject({ x: 152, y: 40 });
    expect(toasts).toEqual(["warn: 하나만 둘 수 있는 타입이라 붙이지 않았다: start"]);
    // 되돌리면 잘라내기 전으로 간다
    doc.undo.undo();
    doc.undo.undo();
    doc.undo.undo();
    expect(doc.model.objectIds()).toEqual(["start", "slime_1", "sign_1", "zone_1"]);
    expect(doc.model.findObject("start")).toMatchObject({ x: 24, y: 40 });
  });

  it("맵 오른쪽 끝의 띠는 붙일 때마다 왼쪽으로 한 칸씩 더 간다", async () => {
    const { doc, clipboard, host } = await setup();
    doc.apply(doc.model.addObject({ id: "section_1", type: "landmark", x: 288, y: 0, width: 32, props: {}, extra: {} }));
    doc.select(["section_1"]);
    clipboard.copy(doc);
    expect(clipboard.paste(host, doc)).toEqual(["section_2"]);
    expect(clipboard.paste(host, doc)).toEqual(["section_3"]);
    expect(["section_1", "section_2", "section_3"].map((id) => doc.model.findObject(id)?.x)).toEqual([288, 272, 256]);
  });

  it("고른 것이 없으면 복사와 잘라내기는 아무것도 하지 않는다", async () => {
    const { doc, clipboard, host } = await setup();
    expect(clipboard.copy(doc)).toBe(0);
    expect(clipboard.cut(doc)).toBe(0);
    expect(clipboard.paste(host, doc)).toEqual([]);
    expect(doc.undo.depth).toBe(0);
  });

  it("하나만 두는 타입만 붙이면 알리고 명령을 넣지 않는다", async () => {
    const { doc, clipboard, host, toasts } = await setup();
    doc.select(["start"]);
    clipboard.copy(doc);
    expect(clipboard.paste(host, doc)).toEqual([]);
    expect(toasts).toEqual(["warn: 하나만 둘 수 있는 타입이라 붙이지 않았다: start"]);
    expect(doc.undo.depth).toBe(0);
  });
});

describe("편집 커맨드의 맵 쪽", () => {
  it("활성 문서가 맵이 아니면 받지 않는다", async () => {
    const { documents, router } = await setup();
    documents.activate(null);
    expect(router.active()).toBeNull();
    for (const a of ["copy", "cut", "paste", "duplicate", "delete"] as const) expect(router.enabled(a)).toBe(false);
  });

  it("켜짐과 안내: 선택이 있어야 복사, 잘라내기, 복제, 삭제. 붙여넣기는 클립보드가 차 있어야", async () => {
    const { doc, router } = await setup();
    expect(router.active()).toBe(doc);
    expect(router.enabled("copy")).toBe(false);
    expect(router.hint("copy")).toBe(NEED_MAP_SELECTION);
    expect(router.hint("paste")).toBe(EMPTY_MAP_CLIPBOARD);
    doc.select(["slime_1"]);
    for (const a of ["copy", "cut", "duplicate", "delete"] as const) {
      expect(router.enabled(a)).toBe(true);
      expect(router.hint(a)).toBeUndefined();
    }
    expect(router.enabled("paste")).toBe(false);
  });

  it("복사, 붙여넣기, 복제, 삭제, 잘라내기가 고른 오브젝트에 돈다", async () => {
    const { doc, router, toasts } = await setup();
    doc.select(["slime_1"]);
    router.run("copy");
    expect(toasts).toEqual(["info: 맵 오브젝트 1개를 복사했다"]);
    expect(router.enabled("paste")).toBe(true);
    router.run("paste");
    expect(doc.selectedIds).toEqual(["slime_2"]);
    router.run("duplicate");
    expect(doc.selectedIds).toEqual(["slime_3"]);
    // 복제와 붙여넣기는 같은 모양이다: x로 한 칸(타일 폭 16, 높이는 8), y는 그대로, 순찰 범위가 x와 함께 옮겨진다
    expect(doc.model.findObject("slime_2")).toMatchObject({ x: 136, y: 40, props: { minX: 96, maxX: 216 } });
    expect(doc.model.findObject("slime_3")).toMatchObject({ x: 152, y: 40, props: { minX: 112, maxX: 232 } });
    router.run("delete");
    expect(doc.model.findObject("slime_3")).toBeUndefined();
    doc.select(["slime_2"]);
    router.run("cut");
    expect(doc.model.findObject("slime_2")).toBeUndefined();
    expect(doc.undo.depth).toBe(4);
    // 꺼진 동작은 아무것도 하지 않는다
    router.run("delete");
    expect(doc.undo.depth).toBe(4);
  });
});
