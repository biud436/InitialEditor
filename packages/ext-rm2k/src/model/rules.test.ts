// 칠한 뒤의 모양 맞추기 (rules.ts). ext-tilemap 의 applyAutotile 에 이 규칙을 넣어 실제로 칠하는 길로 본다.
import { describe, expect, it } from "vitest";
import { applyAutotile, type CellChange } from "@initial-editor/ext-tilemap/model";
import { animLocal, chipAt, D_SAMPLE, dLocal, eLocal, waterLocal } from "./atlas";
import { rm2kAutotileRule, SAMPLE_LOCALS } from "./rules";
import { blobVariant, waterTuple } from "./shapes";
import type { WaterKind } from "./chipset";

const FIRST = 1;
const rule = rm2kAutotileRule(FIRST);
const g = (local: number) => FIRST + local;

/** 문자 그림으로 맵을 만든다: . 하층 타일 E0, d 땅 D1, 0/1/2 물 A1/A2/깊은 물, c 애니메이션 타일 C1 */
function grid(rows: string[]): { map: { width: number; height: number }; data: number[] } {
  const height = rows.length;
  const width = rows[0].length;
  const data: number[] = [];
  for (const row of rows) {
    for (const ch of row) {
      if (ch === ".") data.push(g(eLocal(0)));
      else if (ch === "d") data.push(g(SAMPLE_LOCALS.d(0)));
      else if (ch === "c") data.push(g(SAMPLE_LOCALS.anim(0)));
      else data.push(g(SAMPLE_LOCALS.water(Number(ch) as WaterKind)));
    }
  }
  return { map: { width, height }, data };
}

/** 칸을 모두 다시 맞춘 결과 (모든 칸을 그 값으로 다시 칠한 것과 같다) */
function settle(rows: string[]): { width: number; data: number[] } {
  const { map, data } = grid(rows);
  const changes: CellChange[] = data.map((value, index) => ({ index, value }));
  const out = data.slice();
  for (const c of applyAutotile(map, data, changes, [rule])) out[c.index] = c.value;
  return { width: map.width, data: out };
}

function at(r: { width: number; data: number[] }, x: number, y: number): number {
  return r.data[y * r.width + x];
}

describe("땅 오토타일", () => {
  it("빈 땅 가운데의 한 칸은 외딴 모양(46)이다", () => {
    expect(at(settle(["...", ".d.", "..."]), 1, 1)).toBe(g(dLocal(0, 46)));
  });

  it("맵 밖은 같은 지형으로 본다: 맵을 다 덮으면 모두 가운데 모양(0)이다", () => {
    const r = settle(["dd", "dd"]);
    expect(r.data).toEqual(new Array(4).fill(g(dLocal(0, 0))));
  });

  it("3x3 땅의 칸마다 이웃에 맞는 모양이다", () => {
    const r = settle([".....", ".ddd.", ".ddd.", ".ddd.", "....."]);
    expect(at(r, 1, 1)).toBe(g(dLocal(0, 34))); // 북과 서
    expect(at(r, 2, 1)).toBe(g(dLocal(0, 20))); // 북
    expect(at(r, 3, 1)).toBe(g(dLocal(0, 36))); // 북과 동
    expect(at(r, 2, 2)).toBe(g(dLocal(0, 0)));
    expect(at(r, 3, 3)).toBe(g(dLocal(0, 38))); // 남과 동
  });

  it("다른 D 종류는 이어지지 않는다", () => {
    const { map, data } = grid(["dd"]);
    data[1] = g(SAMPLE_LOCALS.d(1));
    const out = applyAutotile(map, data, [{ index: 0, value: data[0] }, { index: 1, value: data[1] }], [rule]);
    expect(out).toEqual([
      { index: 0, value: g(dLocal(0, 24)) }, // 동쪽만 다름 (맵 밖은 같음)
      { index: 1, value: g(dLocal(1, 16)) }, // 서쪽만 다름
    ]);
  });

  it("칸을 지우면 이웃 땅의 모양이 돌아간다", () => {
    const settled = settle(["ddd"]).data;
    const out = applyAutotile({ width: 3, height: 1 }, settled, [{ index: 1, value: 0 }], [rule]);
    expect([...out].sort((p, q) => p.index - q.index)).toEqual([
      { index: 0, value: g(dLocal(0, 24)) },
      { index: 1, value: 0 },
      { index: 2, value: g(dLocal(0, 16)) },
    ]);
  });
});

describe("물", () => {
  const water = (r: { width: number; data: number[] }, x: number, y: number) => {
    const chip = chipAt(at(r, x, y) - FIRST);
    if (!chip || chip.kind !== "water") throw new Error(`물이 아님 (${x}, ${y})`);
    return chip;
  };

  it("물가 모양은 땅과 같은 47 모양이고 물 A1, A2, 깊은 물, 애니메이션 타일이 서로 이어진다", () => {
    const r = settle([".....", ".012.", ".c00.", "....."]);
    // (1, 1) 물 A1: 북과 서가 땅, 동(A2)과 남(C)은 물
    expect(water(r, 1, 1).tuple).toBe(waterTuple(34, 0));
    // 애니메이션 타일은 첫 프레임으로 맞춘다
    expect(at(r, 1, 2)).toBe(g(animLocal(0)));
  });

  it("얕은 물 한가운데의 깊은 물 한 칸은 네 모서리 모두 얕은 모서리다", () => {
    const r = settle(["000", "020", "000"]);
    expect(at(r, 1, 1)).toBe(g(waterLocal(2, 0, 15)));
    // 둘레의 얕은 물은 깊은 물과 곧은 경계라 모서리가 없다
    expect(water(r, 0, 1).tuple).toBe(waterTuple(0, 0));
  });

  it("깊은 물이 두 변을 감싼 얕은 물은 그 모서리에 깊은 모서리가 든다", () => {
    // (1, 1) 얕은 물: 동(2, 1)과 남(1, 2)이 깊은 물, 그 사이 대각선(2, 2)도 물 → 오른쪽 아래 비트(8)
    const r = settle(["0000", "0022", "0222", "0222"]);
    expect(water(r, 1, 1).tuple).toBe(waterTuple(0, 8));
    // 깊은 물 (2, 1): 북(2, 0)과 서(1, 1)와 북서(1, 0)가 모두 얕은 물 → 왼쪽 위 비트(1)
    expect(water(r, 2, 1).tuple).toBe(waterTuple(0, 1));
  });

  it("맵 밖은 물로 본다 (가장자리에 물가가 생기지 않는다)", () => {
    const r = settle(["00", "00"]);
    for (let i = 0; i < 4; i++) expect(r.data[i]).toBe(g(waterLocal(0, 0, 0)));
  });
});

describe("규칙의 지형", () => {
  it("하층 타일과 상층 타일은 오토타일이 아니다", () => {
    expect(rule.terrainOf(g(eLocal(5)))).toBeNull();
    expect(rule.terrainOf(0)).toBeNull();
  });

  it("타일셋이 다르면 지형도 다르다 (firstGid 로 가른다)", () => {
    const other = rm2kAutotileRule(5000);
    expect(other.terrainOf(5000 + dLocal(0, 3))).not.toBe(rule.terrainOf(g(dLocal(0, 3))));
  });

  it("견본 칸도 모양 칸도 같은 지형이다", () => {
    expect(rule.terrainOf(g(dLocal(3, D_SAMPLE)))).toBe(rule.terrainOf(g(dLocal(3, blobVariant(() => true)))));
  });
});
