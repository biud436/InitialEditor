// 칠한 뒤의 모양 맞추기 규칙 (ext-tilemap 의 AutotileRule). 지형은 타일셋마다 따로다 (firstGid 로 가른다).
//
//   땅 D1..D12   같은 D 종류만 같은 지형이다. 맵 밖은 같은 지형으로 본다 (가장자리에 테두리가 생기지 않는다)
//   물          물가 모양(a)은 물 A1, A2, 깊은 물, 애니메이션 타일을 모두 물로 보고, 맵 밖도 물로 본다.
//               깊은 물과 얕은 물이 만나는 모서리(b)는 EasyRPG Editor 의 규칙이다:
//                 얕은 물  동서남북 둘이 깊은 물이고 그 사이의 대각선이 물이면 그 모서리
//                 깊은 물  동서남북 둘과 그 사이의 대각선이 모두 얕은 물이면 그 모서리
//   애니메이션 타일   모양이 없다. 물이 이웃으로 볼 수 있게 지형만 있고, 칠하면 첫 프레임으로 맞춘다
//   E, F        오토타일이 아니다 (지형 없음)

import { OUTSIDE, type AutotileRule, type Terrain } from "@initial-editor/ext-tilemap/model";
import { animLocal, chipAt, D_SAMPLE, dLocal, waterLocal } from "./atlas";
import type { WaterKind } from "./chipset";
import { blobVariant, CORNER_BITS } from "./shapes";

/** 이 타일셋의 지형 이름 앞머리 */
export function terrainPrefix(firstGid: number): string {
  return `rm2k:${firstGid}:`;
}

/** 모서리 비트의 조각마다 (동서남북 둘, 대각선) */
const CORNERS: ReadonlyArray<{ bit: number; a: [number, number]; b: [number, number]; diag: [number, number] }> = [
  { bit: CORNER_BITS[0], a: [0, -1], b: [-1, 0], diag: [-1, -1] },
  { bit: CORNER_BITS[1], a: [0, -1], b: [1, 0], diag: [1, -1] },
  { bit: CORNER_BITS[2], a: [0, 1], b: [-1, 0], diag: [-1, 1] },
  { bit: CORNER_BITS[3], a: [0, 1], b: [1, 0], diag: [1, 1] },
];

export function rm2kAutotileRule(firstGid: number): AutotileRule {
  const prefix = terrainPrefix(firstGid);
  const water = (k: WaterKind) => `${prefix}w${k}`;
  const isWaterLike = (t: Terrain) => t === OUTSIDE || (t !== null && t.startsWith(prefix) && (t[prefix.length] === "w" || t[prefix.length] === "c"));
  const isDeep = (t: Terrain) => t === water(2);
  const isShallow = (t: Terrain) => t === water(0) || t === water(1);
  return {
    terrainOf(gid) {
      const chip = chipAt(gid - firstGid);
      if (!chip) return null;
      if (chip.kind === "water") return water(chip.water);
      if (chip.kind === "anim") return `${prefix}c${chip.n}`;
      if (chip.kind === "d") return `${prefix}d${chip.n}`;
      return null;
    },
    resolve(terrain, neighbor, current) {
      if (!terrain.startsWith(prefix)) return current;
      const kind = terrain[prefix.length];
      const n = Number(terrain.slice(prefix.length + 1));
      if (kind === "d") {
        const variant = blobVariant((dx, dy) => {
          const t = neighbor(dx, dy);
          return t === terrain || t === OUTSIDE;
        });
        return firstGid + dLocal(n, variant);
      }
      if (kind === "c") return firstGid + animLocal(n);
      if (kind !== "w") return current;
      const a = blobVariant((dx, dy) => isWaterLike(neighbor(dx, dy)));
      let b = 0;
      for (const c of CORNERS) {
        const na = neighbor(...c.a);
        const nb = neighbor(...c.b);
        const nd = neighbor(...c.diag);
        if (n === 2 ? isShallow(na) && isShallow(nb) && isShallow(nd) : isDeep(na) && isDeep(nb) && isWaterLike(nd)) b |= c.bit;
      }
      return firstGid + waterLocal(n as WaterKind, a, b);
    },
  };
}

/** 팔레트 그림과 붓에 쓰는 대표 칸 (칠하면 모양을 맞춘다) */
export const SAMPLE_LOCALS = {
  water: (k: WaterKind) => (k === 2 ? waterLocal(2, 0, 15) : waterLocal(k, 46, 0)),
  d: (n: number) => dLocal(n, D_SAMPLE),
  anim: (n: number) => animLocal(n),
};
