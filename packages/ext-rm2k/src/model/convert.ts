// RPG Maker 2000 맵(LcfMap)을 아틀라스(판 1)를 쓰는 맵 레이어와 통행으로 옮긴다.
//
// 타일 번호 (EasyRPG Player 의 BLOCK_*):
//   0..2999     물. 1000 마다 A1, A2, 깊은 물이고, 그 안에서 50 * 모서리 비트 + 물가 모양
//   3000..3999  애니메이션 타일. 3000 + 50 * n
//   4000..4599  땅 D1..D12. 4000 + 50 * n + 모양 (47, 48 은 가운데, 49 는 견본)
//   5000..5143  하층 타일 E
//   10000..10143 상층 타일 F (10000 은 빈 타일)
// 그리는 순서 (EasyRPG Player 의 TilemapLayer): 통행에 별(Above)이 없는 하층과 상층은 캐릭터 아래, 별이 있는 상층과 별이나 벽(Wall)이
//   있는 하층은 캐릭터 위다. 위에 그릴 타일은 따로 레이어(lower_over, upper_over)로 옮긴다. 씬의 바닥 레이어 수는 2 다.
// 통행 (EasyRPG Player 의 Game_Map::IsPassableTile): 방향마다 상층 타일이 막으면 막히고, 상층에 별이 없으면 지나가고, 있으면 하층이
//   정한다. 벽이 선 D 타일의 윗면 모양은 지나간다. 엔진의 통행은 0 과 1 뿐이라, 네 방향 모두 막힌 칸만 1 이다.

import { dLocal, eLocal, fLocal, animLocal, waterLocal, D_SAMPLE } from "./atlas";
import { D_KINDS, E_TILES, F_TILES, type WaterKind } from "./chipset";
import { PASS, PASS_DIRECTIONS, type LcfChipset, type LcfMap } from "./lcf";

export const BLOCK_C = 3000;
export const BLOCK_D = 4000;
export const BLOCK_E = 5000;
export const BLOCK_F = 10000;

/** 하층 타일 번호의 아틀라스 번호. 쓰지 않는 번호면 null */
export function lowerLocal(id: number): number | null {
  if (id < 0) return null;
  if (id < BLOCK_C) {
    const kind = Math.floor(id / 1000) as WaterKind;
    const b = Math.floor((id % 1000) / 50);
    const a = id % 50;
    if (b >= 16 || a >= 47) return null;
    return waterLocal(kind, a, b);
  }
  if (id < BLOCK_D) {
    const n = Math.floor((id - BLOCK_C) / 50);
    return n < 3 && (id - BLOCK_C) % 50 === 0 ? animLocal(n) : null;
  }
  if (id < BLOCK_E) {
    const n = Math.floor((id - BLOCK_D) / 50);
    const v = (id - BLOCK_D) % 50;
    if (n >= D_KINDS) return null;
    return dLocal(n, v < 47 ? v : v === 49 ? D_SAMPLE : 0);
  }
  if (id < BLOCK_E + E_TILES) return eLocal(id - BLOCK_E);
  return null;
}

/** 상층 타일 번호의 아틀라스 번호. 빈 타일(F0)은 0 이 아니라 null 이다. 쓰지 않는 번호면 undefined */
export function upperLocal(id: number): number | null | undefined {
  if (id === BLOCK_F) return null;
  if (id > BLOCK_F && id < BLOCK_F + F_TILES) return fLocal(id - BLOCK_F);
  return undefined;
}

/** 하층 타일의 통행 칸 (하층 162칸 안의 번호) */
export function lowerPassageIndex(id: number): number {
  if (id >= BLOCK_E) return id - BLOCK_E + 18;
  if (id >= BLOCK_D) return Math.floor((id - BLOCK_D) / 50) + 6;
  if (id >= BLOCK_C) return Math.floor((id - BLOCK_C) / 50) + 3;
  return Math.floor(id / 1000);
}

/** 벽이 선 D 타일에서 지나가는 모양 (윗면) */
const WALL_TOP = new Set([20, 21, 22, 23, 33, 34, 35, 36, 37, 42, 43, 45, 46]);

function lowerPasses(chipset: LcfChipset, id: number, bit: number): boolean {
  const flags = chipset.lower[lowerPassageIndex(id)] ?? 0;
  if (id >= BLOCK_D && id < BLOCK_E && flags & PASS.wall && WALL_TOP.has((id - BLOCK_D) % 50)) return true;
  return (flags & bit) !== 0;
}

/** 한 방향의 통행 (EasyRPG Player 의 IsPassableTile, 이벤트와 탈것은 보지 않는다) */
export function passes(chipset: LcfChipset, lower: number, upper: number, bit: number): boolean {
  const up = chipset.upper[upper >= BLOCK_F && upper < BLOCK_F + F_TILES ? upper - BLOCK_F : 0] ?? 0;
  if ((up & bit) === 0) return false;
  if ((up & PASS.above) === 0) return true;
  return lowerPasses(chipset, lower, bit);
}

export interface ConvertedLayers {
  /** lower, upper 와 위에 그릴 타일이 있으면 lower_over, upper_over */
  layers: Array<{ name: string; data: number[] }>;
  collision: number[];
  stats: {
    /** 알 수 없는 타일 번호라 비운 칸 */
    unknownTiles: number;
    /** 한두 방향만 막힌 칸 (지나갈 수 있는 칸으로 옮겼다) */
    partialPassage: number;
    /** 캐릭터 위에 그리는 칸 */
    overTiles: number;
  };
}

const ABOVE_LOWER = PASS.above | PASS.wall;

/** 맵의 레이어와 통행. 칸의 gid 는 firstGid + 아틀라스 번호다 */
export function convertLayers(map: LcfMap, chipset: LcfChipset, firstGid = 1): ConvertedLayers {
  const cells = map.width * map.height;
  const lower = new Array<number>(cells).fill(0);
  const upper = new Array<number>(cells).fill(0);
  const lowerOver = new Array<number>(cells).fill(0);
  const upperOver = new Array<number>(cells).fill(0);
  const collision = new Array<number>(cells).fill(0);
  let unknownTiles = 0;
  let partialPassage = 0;
  let overLower = 0;
  let overUpper = 0;
  for (let i = 0; i < cells; i++) {
    const lo = map.lower[i];
    const up = map.upper[i];
    const l = lowerLocal(lo);
    if (l === null) unknownTiles++;
    else if (chipset.lower[lowerPassageIndex(lo)] & ABOVE_LOWER) {
      lowerOver[i] = firstGid + l;
      overLower++;
    } else lower[i] = firstGid + l;
    const u = upperLocal(up);
    if (u === undefined) unknownTiles++;
    else if (u !== null) {
      if (chipset.upper[up - BLOCK_F] & PASS.above) {
        upperOver[i] = firstGid + u;
        overUpper++;
      } else upper[i] = firstGid + u;
    }
    let open = 0;
    for (const bit of [PASS.down, PASS.left, PASS.right, PASS.up]) if (passes(chipset, lo, up, bit)) open |= bit;
    if (open === 0) collision[i] = 1;
    else if (open !== PASS_DIRECTIONS) partialPassage++;
  }
  const layers = [
    { name: "lower", data: lower },
    { name: "upper", data: upper },
  ];
  if (overLower > 0) layers.push({ name: "lower_over", data: lowerOver });
  if (overUpper > 0) layers.push({ name: "upper_over", data: upperOver });
  return { layers, collision, stats: { unknownTiles, partialPassage, overTiles: overLower + overUpper } };
}
