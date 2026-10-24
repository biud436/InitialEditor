// 오토타일 규칙과 칠한 뒤의 모양 맞추기. 전부 순수 함수다.
//
// 오토타일 칸의 gid 는 "지형"과 "모양"을 함께 담는다. 붓이 칸을 바꾸면, 바뀐 칸과 그 이웃 8칸 가운데 오토타일인 칸의
// 모양을 이웃의 지형을 보고 다시 고른다. 어떤 gid 가 어느 지형이고 이웃에 따라 어떤 gid 가 되는지는 규칙이 안다.
// 규칙은 타일셋마다 확장이 만든다 (RPG Maker 2000 ChipSet 은 ext-rm2k, 6행 8열 blob 시트는 autotile.ts).

import type { MapData } from "./format";
import { cellIndex, inBounds, type CellChange } from "./tiles";

/** 맵 칸에서 본 지형. null 은 오토타일이 아닌 칸이나 빈 칸, OUTSIDE 는 맵 밖 */
export type Terrain = string | null;

/** 맵 밖의 이웃. 같은 지형으로 볼지는 규칙이 정한다 (RPG Maker 2000 은 대개 같은 지형으로 본다) */
export const OUTSIDE = "\u0000outside";

export interface AutotileRule {
  /** 이 gid 가 이 규칙의 오토타일이면 지형 이름, 아니면 null */
  terrainOf(gid: number): string | null;
  /**
   * 지형 terrain 인 칸의 gid. neighbor(dx, dy) 는 이웃 칸의 지형이다 (어느 규칙의 것이든, 오토타일이 아니면 null, 맵 밖은
   * OUTSIDE). 모양을 바꿀 수 없으면 current 를 돌려준다
   */
  resolve(terrain: string, neighbor: (dx: number, dy: number) => Terrain, current: number): number;
}

export const NEIGHBORS_8: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

function terrainOf(rules: readonly AutotileRule[], gid: number): { rule: AutotileRule; terrain: string } | null {
  if (gid <= 0) return null;
  for (const rule of rules) {
    const terrain = rule.terrainOf(gid);
    if (terrain !== null) return { rule, terrain };
  }
  return null;
}

/**
 * 붓이 정한 바뀜(changes)을 레이어 data 에 얹고, 바뀐 칸과 그 이웃 8칸 가운데 오토타일인 칸의 모양을 맞춘 바뀜을 돌려준다.
 * 돌려주는 목록에는 붓이 정한 칸(모양을 맞춘 값으로)과, 모양이 달라진 이웃 칸이 들어 있다. 규칙이 없으면 changes 그대로다
 */
export function applyAutotile(map: Pick<MapData, "width" | "height">, data: readonly number[], changes: readonly CellChange[], rules: readonly AutotileRule[]): CellChange[] {
  if (rules.length === 0 || changes.length === 0) return [...changes];
  const next = data.slice();
  for (const c of changes) next[c.index] = c.value;

  const affected = new Set<number>();
  for (const c of changes) {
    affected.add(c.index);
    const x = c.index % map.width;
    const y = Math.floor(c.index / map.width);
    for (const [dx, dy] of NEIGHBORS_8) {
      if (inBounds(map, x + dx, y + dy)) affected.add(cellIndex(map, x + dx, y + dy));
    }
  }

  // 모양을 고르는 동안 이웃의 지형은 바뀌지 않는다 (지형은 모양과 상관없이 같다). 그래서 한 번에 고를 수 있다
  const resolved = new Map<number, number>();
  for (const index of affected) {
    const own = terrainOf(rules, next[index]);
    if (!own) continue;
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    const neighbor = (dx: number, dy: number): Terrain => {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) return OUTSIDE;
      return terrainOf(rules, next[cellIndex(map, nx, ny)])?.terrain ?? null;
    };
    const gid = own.rule.resolve(own.terrain, neighbor, next[index]);
    if (gid !== next[index]) resolved.set(index, gid);
  }

  const out: CellChange[] = [];
  const seen = new Set<number>();
  for (const c of changes) {
    if (seen.has(c.index)) continue;
    seen.add(c.index);
    out.push({ index: c.index, value: resolved.get(c.index) ?? next[c.index] });
  }
  for (const [index, value] of resolved) {
    if (seen.has(index)) continue;
    if (value !== data[index]) out.push({ index, value });
  }
  return out;
}
