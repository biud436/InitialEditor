// 타일셋의 animations (엔진 docs/plans/02-tilemap.md 의 타일 애니메이션). 항목은 {tile, count?, frames, duration} 이고
// 범위 tile..tile+count-1 의 i 번째 타일은 시계 t 에서 frames[floor(t / duration) % frames.length] + i 를 그린다.
// 엔진이 맵을 읽지 못하는 항목(정수가 아닌 값, 1 보다 작은 duration 과 count, 빈 frames, 겹치는 범위)은 errors 에 적고 쓰지 않는다.

import type { Tileset } from "./format";
import { tileSource } from "./tiles";

export interface TileAnimation {
  /** 범위의 첫 gid */
  gid: number;
  count: number;
  /** 프레임마다 범위 첫 타일의 gid */
  frames: number[];
  durationMs: number;
}

export interface TileAnimationTable {
  /** gid 오름차순, 겹치지 않는다 */
  ranges: TileAnimation[];
  errors: string[];
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;
const isIndex = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** 맵의 타일셋에서 애니메이션 범위를 모은다 */
export function tileAnimations(tilesets: readonly Tileset[]): TileAnimationTable {
  const ranges: TileAnimation[] = [];
  const errors: string[] = [];
  tilesets.forEach((tileset, ti) => {
    const raw = tileset.extra.animations;
    if (raw === undefined || raw === null) return;
    const where = `tilesets[${ti}].animations`;
    if (!Array.isArray(raw)) {
      errors.push(`${where}: 배열이 아닙니다`);
      return;
    }
    const own: TileAnimation[] = [];
    raw.forEach((entry: unknown, ai) => {
      const e = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
      const tile = e.tile ?? 0;
      const count = e.count ?? 1;
      const frames = e.frames;
      if (!isIndex(tile) || !isCount(e.duration) || !isCount(count) || !Array.isArray(frames) || frames.length === 0 || !frames.every(isIndex)) {
        errors.push(`${where}[${ai}]: 잘못된 항목입니다`);
        return;
      }
      if (own.some((r) => r.gid < tileset.firstGid + tile + count && tileset.firstGid + tile < r.gid + r.count)) {
        errors.push(`${where}[${ai}]: 다른 항목과 범위가 겹칩니다`);
        return;
      }
      own.push({ gid: tileset.firstGid + tile, count, frames: frames.map((f: number) => tileset.firstGid + f), durationMs: e.duration });
    });
    // firstGid 가 더 큰 타일셋이 가리는 gid 는 엔진도 그 타일셋에서 찾으므로 범위를 그 앞에서 자른다
    if (tileSource(tilesets, tileset.firstGid, 1, 1)?.tilesetIndex !== ti) return;
    const limit = Math.min(...tilesets.map((t) => (t.firstGid > tileset.firstGid ? t.firstGid : Infinity)));
    for (const r of own) if (r.gid < limit) ranges.push({ ...r, count: Math.min(r.count, limit - r.gid) });
  });
  ranges.sort((a, b) => a.gid - b.gid);
  return { ranges, errors };
}

/** gid 가 든 범위. 없으면 null */
export function animationOf(table: TileAnimationTable, gid: number): TileAnimation | null {
  const { ranges } = table;
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid];
    if (gid < r.gid) hi = mid - 1;
    else if (gid >= r.gid + r.count) lo = mid + 1;
    else return r;
  }
  return null;
}

/** 시계(밀리초)에서의 프레임 번호 */
export function animationStep(animation: TileAnimation, clockMs: number): number {
  return Math.floor(Math.max(0, clockMs) / animation.durationMs) % animation.frames.length;
}

/** 시계에서 gid 자리에 그릴 gid */
export function animatedGid(table: TileAnimationTable, gid: number, clockMs: number): number {
  const r = gid > 0 ? animationOf(table, gid) : null;
  if (!r) return gid;
  return r.frames[animationStep(r, clockMs)] + (gid - r.gid);
}
