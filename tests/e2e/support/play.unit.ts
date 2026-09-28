import { describe, expect, it } from "vitest";
import type { MapObject } from "../../../packages/ext-tilemap/src/model/format";
import { parseObjectSchema } from "../../../packages/ext-tilemap/src/model/schema";
import * as rules from "../../../packages/app/src/editor/maps/objectTools/rules";
import { expectedRangePlayX, PLAY_MIN_X, PLAY_RANGE_GAP } from "./play";

// 엔진의 resources/schema/map-objects.json 중 spawn의 순찰 범위
const SCHEMA = parseObjectSchema(
  JSON.stringify({
    version: 1,
    types: [
      {
        type: "spawn",
        label: "몬스터",
        shape: "point",
        fields: [
          { name: "species", type: "enum", values: ["spider", "wolf"], required: true },
          { name: "minX", type: "number", role: "rangeMin", required: true },
          { name: "maxX", type: "number", role: "rangeMax", required: true },
        ],
      },
    ],
  }),
);
const GEOMETRY = { pixelWidth: 4096, pixelHeight: 448, tileWidth: 16, tileHeight: 16 };

function editorX(minX: number): number {
  const o: MapObject = { id: "spawn_8", type: "spawn", x: minX + 40, y: 304, props: { species: "wolf", minX, maxX: minX + 80 }, extra: {} };
  return rules.playPosition({ objects: [o], selectedIds: [o.id], cursor: null, viewCenter: null, geometry: GEOMETRY, schema: SCHEMA }).x;
}

describe("여기서 실행의 기대 위치 (rules.ts와 같은가)", () => {
  it("상수가 rules.ts와 같다", () => {
    expect([PLAY_RANGE_GAP, PLAY_MIN_X]).toEqual([rules.PLAY_RANGE_GAP, rules.PLAY_MIN_X]);
    expect(rules.PLAY_POSITION_RULE).toContain(`최소 X에서 ${PLAY_RANGE_GAP}px 왼쪽, ${PLAY_MIN_X} 이상`);
  });

  for (const minX of [2014, 1950, 64, 40, 0, 63.6, 1000.4]) {
    it(`순찰 왼끝 ${minX}`, () => {
      expect(expectedRangePlayX(minX)).toBe(editorX(minX));
    });
  }

  it("알데바란 숲의 첫 늑대를 64px 옮긴 뒤 (왼끝 1950 → 2014)", () => {
    expect(expectedRangePlayX(2014)).toBe(1966);
  });
});
