// 모양 표 (shapes.ts). 땅의 표(D_VARIANT_SOURCES)와 물의 표(WATER_SHORE)는 따로 옮겨 적은 것이라, 이웃 256가지마다
// 원리로 정한 조각의 분류와 두 표가 같은지 견준다. 조각의 분류는 그 조각에 닿는 세로 이웃, 가로 이웃, 대각선으로 정한다:
//   둘 다 다름 → 바깥 모서리(0), 세로 이웃만 다름 → 가로 물가(2), 가로 이웃만 다름 → 세로 물가(1),
//   둘 다 같고 대각선이 다름 → 안쪽 모서리(3), 그 밖 → 몸통(-1)
import { describe, expect, it } from "vitest";
import { blobVariant, D_VARIANT_SOURCES, QUARTERS, VARIANTS, WATER_SHORE, WATER_TUPLES, waterKey, waterQuarters, waterTuple } from "./shapes";

const OFFSETS: Array<[number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function sameFrom(mask: number) {
  return (dx: number, dy: number) => {
    const i = OFFSETS.findIndex(([x, y]) => x === dx && y === dy);
    return ((mask >> i) & 1) === 1;
  };
}

/** 조각 q 의 분류 (위 머리글의 규칙) */
function expectedClass(same: (dx: number, dy: number) => boolean, q: number): number {
  const { qx, qy } = QUARTERS[q];
  const sx = qx === 0 ? -1 : 1;
  const sy = qy === 0 ? -1 : 1;
  const vertical = same(0, sy);
  const horizontal = same(sx, 0);
  if (!vertical && !horizontal) return 0;
  if (!vertical) return 2;
  if (!horizontal) return 1;
  return same(sx, sy) ? -1 : 3;
}

/** 땅 원본 타일 글자를 조각 자리 q 에 두었을 때의 분류 */
function dClass(symbol: string, q: number): number {
  const { qx, qy } = QUARTERS[q];
  switch (symbol) {
    case "C":
      return -1;
    case "I":
      return 3;
    case "L":
      return qx === 0 ? 1 : -1;
    case "R":
      return qx === 1 ? 1 : -1;
    case "T":
      return qy === 0 ? 2 : -1;
    case "B":
      return qy === 1 ? 2 : -1;
  }
  // 모서리 타일: 그 모서리 자리는 바깥 모서리, 같은 줄은 가로 물가, 같은 열은 세로 물가, 맞은편은 몸통
  const corner = { a: [0, 0], b: [1, 0], c: [0, 1], d: [1, 1] }[symbol];
  if (!corner) throw new Error(`모르는 글자 ${symbol}`);
  const [cx, cy] = corner;
  if (qx === cx && qy === cy) return 0;
  if (qy === cy) return 2;
  if (qx === cx) return 1;
  return -1;
}

describe("blobVariant 와 모양 표", () => {
  it("이웃 256가지마다 원리의 분류, 물의 표, 땅의 표가 같다", () => {
    const seen = new Set<number>();
    for (let mask = 0; mask < 256; mask++) {
      const same = sameFrom(mask);
      const v = blobVariant(same);
      seen.add(v);
      for (let q = 0; q < 4; q++) {
        const want = expectedClass(same, q);
        expect(WATER_SHORE[v][q], `mask ${mask} 모양 ${v} 조각 ${q} (물)`).toBe(want);
        expect(dClass(D_VARIANT_SOURCES[v][q], q), `mask ${mask} 모양 ${v} 조각 ${q} (땅 ${D_VARIANT_SOURCES[v]})`).toBe(want);
      }
    }
    expect(seen.size).toBe(VARIANTS);
  });

  it("사방이 같으면 0, 외딴 칸이면 46", () => {
    expect(blobVariant(() => true)).toBe(0);
    expect(blobVariant(() => false)).toBe(46);
  });
});

describe("물 칸 묶음", () => {
  it("그림이 다른 (a, b) 는 306가지이고 b 가 0 이면 번호가 a 다", () => {
    expect(WATER_TUPLES.keys.length).toBe(306);
    for (let a = 0; a < VARIANTS; a++) expect(waterTuple(a, 0)).toBe(a);
  });

  it("모서리 비트가 선 조각은 물가보다 앞선다", () => {
    // 46(외딴 물)의 네 조각은 바깥 모서리다. 왼쪽 위 비트(1)를 세우면 그 조각만 모서리 몸통이 된다
    expect(waterQuarters(46, 1)).toEqual([{ body: true }, { shore: 0 }, { shore: 0 }, { shore: 0 }]);
    expect(waterKey(0, 15)).toBe("BBBB");
    expect(waterKey(0, 0)).toBe("bbbb");
  });
});
