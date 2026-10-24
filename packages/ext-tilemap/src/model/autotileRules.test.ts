// 칠한 뒤의 모양 맞추기 (autotileRules.ts). 시험용 규칙은 gid 100..115 가 지형 "물"이고 gid - 100 이 네 이웃(북 1, 동 2,
// 남 4, 서 8)이 물인지의 비트다. gid 200..215 는 지형 "풀"로 같다.
import { describe, expect, it } from "vitest";
import { applyAutotile, OUTSIDE, type AutotileRule } from "./autotileRules";

function rule(base: number, terrain: string, outsideIsSame = true): AutotileRule {
  return {
    terrainOf: (gid) => (gid >= base && gid < base + 16 ? terrain : null),
    resolve: (t, n) => {
      const same = (dx: number, dy: number) => n(dx, dy) === t || (outsideIsSame && n(dx, dy) === OUTSIDE);
      return base + (same(0, -1) ? 1 : 0) + (same(1, 0) ? 2 : 0) + (same(0, 1) ? 4 : 0) + (same(-1, 0) ? 8 : 0);
    },
  };
}

const WATER = rule(100, "물");
const GRASS = rule(200, "풀");
const map = { width: 3, height: 3 };

describe("applyAutotile", () => {
  it("규칙이 없으면 붓이 정한 바뀜 그대로다", () => {
    expect(applyAutotile(map, new Array(9).fill(0), [{ index: 4, value: 7 }], [])).toEqual([{ index: 4, value: 7 }]);
  });

  it("빈 맵 가운데에 물 한 칸: 이웃이 없어 외딴 모양이다", () => {
    expect(applyAutotile(map, new Array(9).fill(0), [{ index: 4, value: 100 }], [WATER])).toEqual([{ index: 4, value: 100 }]);
  });

  it("옆에 물을 더 칠하면 칠한 칸과 이웃 물의 모양이 함께 바뀐다", () => {
    const data = [0, 0, 0, 0, 100, 0, 0, 0, 0];
    const out = applyAutotile(map, data, [{ index: 5, value: 100 }], [WATER]);
    // 가운데(4)는 동쪽이 물(2), 새 칸(5)은 서쪽이 물(8)이고 동쪽은 맵 밖이라 같은 지형으로 본다(2)
    expect(out).toEqual([
      { index: 5, value: 110 },
      { index: 4, value: 102 },
    ]);
  });

  it("다른 지형은 이어지지 않는다", () => {
    const data = [0, 0, 0, 0, 200, 0, 0, 0, 0];
    const out = applyAutotile(map, data, [{ index: 5, value: 100 }], [WATER, GRASS]);
    expect(out).toEqual([{ index: 5, value: 102 }]);
  });

  it("지우면 이웃 물의 모양도 돌아간다", () => {
    const data = [0, 0, 0, 0, 102, 110, 0, 0, 0];
    const out = applyAutotile(map, data, [{ index: 5, value: 0 }], [WATER]);
    expect(out).toEqual([
      { index: 5, value: 0 },
      { index: 4, value: 100 },
    ]);
  });

  it("맵 밖을 다른 지형으로 보는 규칙은 가장자리에서 끊긴다", () => {
    const edge = rule(100, "물", false);
    expect(applyAutotile(map, new Array(9).fill(0), [{ index: 0, value: 100 }], [edge])).toEqual([{ index: 0, value: 100 }]);
    expect(applyAutotile(map, new Array(9).fill(0), [{ index: 0, value: 100 }], [WATER])).toEqual([{ index: 0, value: 109 }]);
  });

  it("한 칸을 두 번 칠하면 나중 값으로 한 번만 돌려준다", () => {
    const out = applyAutotile(map, new Array(9).fill(0), [{ index: 4, value: 200 }, { index: 4, value: 100 }], [WATER, GRASS]);
    expect(out).toEqual([{ index: 4, value: 100 }]);
  });

  it("오토타일이 아닌 칸은 그대로 둔다", () => {
    const data = [5, 5, 5, 5, 0, 5, 5, 5, 5];
    expect(applyAutotile(map, data, [{ index: 4, value: 100 }], [WATER])).toEqual([{ index: 4, value: 100 }]);
  });
});
