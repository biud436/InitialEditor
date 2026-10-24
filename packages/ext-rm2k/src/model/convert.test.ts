// RPG Maker 2000 맵 옮기기: 타일 번호 → 아틀라스 번호, 통행(EasyRPG Player 의 IsPassableTile) → 0 과 1, 별 타일은 위 레이어.
import { describe, expect, it } from "vitest";
import { animLocal, D_SAMPLE, dLocal, eLocal, fLocal, waterLocal } from "./atlas";
import { convertLayers, lowerLocal, passes, upperLocal } from "./convert";
import { PASS, type LcfChipset, type LcfMap } from "./lcf";
import { D_SOURCE, D_VARIANT_SOURCES } from "./shapes";

describe("타일 번호", () => {
  it("물: 1000 마다 A1, A2, 깊은 물, 그 안에서 50 * 모서리 비트 + 물가 모양", () => {
    expect(lowerLocal(0)).toBe(waterLocal(0, 0, 0));
    expect(lowerLocal(1034)).toBe(waterLocal(1, 34, 0));
    expect(lowerLocal(2000 + 15 * 50 + 46)).toBe(waterLocal(2, 46, 15));
    expect(lowerLocal(16 * 50)).toBeNull();
    expect(lowerLocal(47)).toBeNull();
  });

  it("애니메이션 타일, 땅, 하층 타일", () => {
    expect(lowerLocal(3050)).toBe(animLocal(1));
    expect(lowerLocal(3051)).toBeNull();
    expect(lowerLocal(3150)).toBeNull();
    expect(lowerLocal(4000 + 2 * 50 + 5)).toBe(dLocal(2, 5));
    expect(lowerLocal(5143)).toBe(eLocal(143));
    expect(lowerLocal(5144)).toBeNull();
    expect(lowerLocal(4600)).toBeNull();
    expect(lowerLocal(-1)).toBeNull();
  });

  it("땅 모양 47, 48 은 가운데 타일, 49 는 견본이다 (EasyRPG Player 의 BlockD_Subtiles_IDS 47..49)", () => {
    expect(lowerLocal(4047)).toBe(dLocal(0, 0));
    expect(lowerLocal(4098)).toBe(dLocal(1, 0));
    expect(lowerLocal(4049)).toBe(dLocal(0, D_SAMPLE));
    // 모양 0 은 네 조각 모두 가운데(C = 덩어리의 (1, 2)), 견본은 (0, 0)
    expect(D_VARIANT_SOURCES[0]).toBe("CCCC");
    expect([D_SOURCE.C, D_SOURCE.S]).toEqual([
      { tx: 1, ty: 2 },
      { tx: 0, ty: 0 },
    ]);
  });

  it("상층: 10000 은 빈 타일, 10001..10143 은 F1..F143, 그 밖은 모르는 번호", () => {
    expect(upperLocal(10000)).toBeNull();
    expect(upperLocal(10001)).toBe(fLocal(1));
    expect(upperLocal(10143)).toBe(fLocal(143));
    expect(upperLocal(10144)).toBeUndefined();
    expect(upperLocal(5000)).toBeUndefined();
  });
});

/** 하층: A1 막힘, D1 지나감, D2 벽(방향 없음), E0 지나감, E1 별, E2 아래로만. 상층: F1 막음, F2 지나감, F3 별, F4 별이고 막음 */
function chipset(): LcfChipset {
  const lower = new Uint8Array(162).fill(15);
  lower[0] = 0;
  lower[7] = PASS.wall;
  lower[19] = PASS.above | 15;
  lower[20] = PASS.down;
  const upper = new Uint8Array(144).fill(15);
  upper[0] = 31;
  upper[1] = 0;
  upper[3] = PASS.above | 15;
  upper[4] = PASS.above;
  return { id: 1, name: new Uint8Array(), file: new Uint8Array(), lower, upper, animationType: 0, animationSpeed: 0 };
}

const map = (lower: number[], upper: number[]): LcfMap => ({ chipsetId: 1, width: lower.length, height: 1, lower: Int16Array.from(lower), upper: Int16Array.from(upper), parallax: false, events: 0 });

describe("통행과 그리는 순서", () => {
  const cases: Array<[string, number, number, 0 | 1]> = [
    ["물(통행 0)", 0, 10000, 1],
    ["땅", 4000, 10000, 0],
    ["벽 D2 의 가운데", 4050, 10000, 1],
    ["벽 D2 의 윗면(모양 20)", 4070, 10000, 0],
    ["상층 F1 이 막는다", 5000, 10001, 1],
    ["별 없는 상층 F2 가 정한다 (물 위의 다리)", 0, 10002, 0],
    ["별 있는 상층 F3 은 하층이 정한다", 0, 10003, 1],
    ["별 있고 막는 상층 F4", 4000, 10004, 1],
    ["아래로만 지나가는 E2 는 막히지 않은 타일이다", 5002, 10000, 0],
  ];
  for (const [label, lower, upper, blocked] of cases) {
    it(label, () => {
      expect(convertLayers(map([lower], [upper]), chipset()).collision).toEqual([blocked]);
    });
  }

  it("한 방향의 통행", () => {
    const c = chipset();
    expect([PASS.down, PASS.left, PASS.right, PASS.up].map((bit) => passes(c, 5002, 10000, bit))).toEqual([true, false, false, false]);
  });

  it("별이 있는 타일은 위 레이어로, 한두 방향만 막힌 타일과 모르는 번호를 센다", () => {
    const out = convertLayers(map([5001, 5000, 5002, 9999], [10003, 10002, 10000, 10500]), chipset(), 1);
    expect(out.layers.map((l) => l.name)).toEqual(["lower", "upper", "lower_over", "upper_over"]);
    const [lower, upper, lowerOver, upperOver] = out.layers.map((l) => l.data);
    expect(lower).toEqual([0, 1 + eLocal(0), 1 + eLocal(2), 0]);
    expect(lowerOver).toEqual([1 + eLocal(1), 0, 0, 0]);
    expect(upper).toEqual([0, 1 + fLocal(2), 0, 0]);
    expect(upperOver).toEqual([1 + fLocal(3), 0, 0, 0]);
    expect(out.stats).toEqual({ unknownTiles: 2, partialPassage: 1, overTiles: 2 });
  });

  it("위에 그릴 타일이 없으면 레이어는 lower 와 upper 둘이다. firstGid 만큼 옮긴다", () => {
    const out = convertLayers(map([0, 4000], [10000, 10001]), chipset(), 101);
    expect(out.layers.map((l) => l.name)).toEqual(["lower", "upper"]);
    expect(out.layers[0].data).toEqual([101 + waterLocal(0, 0, 0), 101 + dLocal(0, 0)]);
    expect(out.layers[1].data).toEqual([0, 101 + fLocal(1)]);
  });
});
