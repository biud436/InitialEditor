import { LogStore } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument, parseObjectSchema, serializeMap, parseMap } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import { applyResize, describeOffset, outsideWarnings, previewResize, resizeSourceOf } from "./resize";

const MAP_PATH = "resources/maps/sample.json";
const MAP = JSON.stringify({
  version: 2,
  name: "sample",
  width: 4,
  height: 3,
  tileWidth: 16,
  tileHeight: 16,
  layers: [{ name: "ground", data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
  collision: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  tilesets: [{ image: "resources/images/checker.png", firstGid: 1, columns: 1 }],
  events: [{ id: "e", x: 3, y: 2, commands: [] }],
  objects: [
    { id: "start", type: "start", x: 8, y: 8 },
    { id: "slime_1", type: "spawn", x: 56, y: 40, props: { species: "slime", minX: 40, maxX: 60 } },
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
          { name: "species", type: "enum", values: ["slime"] },
          { name: "minX", type: "number", role: "rangeMin" },
          { name: "maxX", type: "number", role: "rangeMax" },
        ],
      },
      { type: "start", label: "시작 지점", unique: true },
    ],
  }),
);

async function setup(map = MAP) {
  const be = new MemoryBackend({ [MAP_PATH]: map });
  await be.open("/p");
  const doc = await MapDocument.open(be, MAP_PATH, SCHEMA);
  const log = new LogStore();
  const toasts: string[] = [];
  const host = { log, toasts: { warn: (t: string) => void toasts.push(t) } };
  return { be, doc, log, toasts, host };
}

describe("맵 크기 바꾸기 (앱)", () => {
  it("미리 보기는 모델을 건드리지 않는다", async () => {
    const { doc } = await setup();
    expect(resizeSourceOf(doc)).toMatchObject({ width: 4, height: 3, tileWidth: 16, tileHeight: 16, events: [{ id: "e", x: 3, y: 2, commands: [] }] });
    const s = previewResize(doc, { width: 2, height: 2, anchor: "top-left" });
    expect(s).toEqual({ offset: { dx: 0, dy: 0 }, clips: true, objectsOutside: ["slime_1"], objectsPartlyOutside: [], eventsOutside: 1 });
    expect(describeOffset(s)).toBe("내용 이동 x 0, y 0 (타일)");
    expect(describeOffset(previewResize(doc, { width: 6, height: 1, anchor: "bottom-right" }))).toBe("내용 이동 x +2, y -2 (타일)");
    expect(doc.model.width).toBe(4);
    expect(doc.undo.depth).toBe(0);
  });

  it("바꾸면 되돌리기 한 단계, 기록, 맵 밖 오브젝트 알림, 되돌리면 파일 내용까지 원래대로", async () => {
    const { doc, log, toasts, host } = await setup();
    const original = doc.text();
    expect(applyResize(host, doc, { width: 2, height: 2, anchor: "top-left" })).toBe(true);
    expect([doc.model.width, doc.model.height]).toEqual([2, 2]);
    expect(doc.undo.depth).toBe(1);
    expect(doc.dirty).toBe(true);
    const texts = log.entries.map((e) => `${e.level}: ${e.text}`);
    expect(texts).toContain("info: 맵 크기 변경됨: sample.json 4x3 → 2x2 타일 (기준점 왼쪽 위, 내용 이동 x 0, y 0 (타일), 맵 밖으로 나간 오브젝트 1개: slime_1)");
    expect(texts).toContain("warn: 맵 밖으로 나간 이벤트 1개");
    expect(toasts).toEqual(["맵 밖으로 나간 오브젝트 1개: slime_1"]);
    // 지우지 않는다
    expect(doc.model.findObject("slime_1")).toBeDefined();
    doc.undo.undo();
    expect(doc.text()).toBe(original);
    expect(doc.dirty).toBe(false);
  });

  it("기준점에 따라 오브젝트와 순찰 범위와 통행이 함께 옮겨진다", async () => {
    const { doc, host, be } = await setup();
    applyResize(host, doc, { width: 6, height: 5, anchor: "center" });
    expect(doc.model.findObject("slime_1")).toMatchObject({ x: 72, y: 56, props: { minX: 56, maxX: 76 } });
    expect(doc.model.collision?.[1 * 6 + 4]).toBe(1);
    await doc.save();
    const saved = parseMap(await be.readText(MAP_PATH));
    expect(saved.events).toEqual([{ id: "e", x: 4, y: 3, commands: [] }]);
    expect(serializeMap(saved)).toBe(await be.readText(MAP_PATH));
  });

  it("끝이나 순찰 범위가 맵 밖까지 가는 오브젝트도 기록과 알림에 넣는다 (지우지 않는다)", async () => {
    const map = JSON.parse(MAP) as { objects: unknown[] };
    map.objects.push({ id: "slime_2", type: "spawn", x: 40, y: 8, props: { species: "slime", minX: 8, maxX: 60 } });
    const { doc, log, toasts, host } = await setup(JSON.stringify(map));
    // 3x3 (폭 48px): slime_1은 x 56이라 밖, slime_2는 x 40이라 안인데 maxX 60이 밖이다
    const s = previewResize(doc, { width: 3, height: 3, anchor: "top-left" });
    expect([s.objectsOutside, s.objectsPartlyOutside]).toEqual([["slime_1"], ["slime_2"]]);
    expect(outsideWarnings(s)).toEqual(["맵 밖으로 나간 오브젝트 1개: slime_1", "영역이나 범위가 맵 밖으로 일부 나가는 오브젝트 1개: slime_2"]);
    expect(applyResize(host, doc, { width: 3, height: 3, anchor: "top-left" })).toBe(true);
    expect(toasts).toEqual(["맵 밖으로 나간 오브젝트 1개: slime_1. 영역이나 범위가 맵 밖으로 일부 나가는 오브젝트 1개: slime_2"]);
    expect(log.entries.map((e) => e.text)).toContain(
      "맵 크기 변경됨: sample.json 4x3 → 3x3 타일 (기준점 왼쪽 위, 내용 이동 x 0, y 0 (타일), 맵 밖으로 나간 오브젝트 1개: slime_1, 영역이나 범위가 맵 밖으로 일부 나가는 오브젝트 1개: slime_2)",
    );
    expect(doc.model.findObject("slime_2")?.props).toMatchObject({ minX: 8, maxX: 60 });
    expect(outsideWarnings({ ...s, objectsOutside: [], objectsPartlyOutside: [] })).toEqual([]);
  });

  it("같은 크기나 쓸 수 없는 크기는 하지 않는다", async () => {
    const { doc, host, toasts } = await setup();
    expect(applyResize(host, doc, { width: 4, height: 3, anchor: "center" })).toBe(false);
    expect(applyResize(host, doc, { width: 0, height: 3, anchor: "center" })).toBe(false);
    expect(toasts).toEqual(["너비와 높이는 1 이상 1024 이하의 정수여야 함"]);
    expect(doc.undo.depth).toBe(0);
  });
});
