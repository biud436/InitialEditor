// 타일 애니메이션: 엔진(src/Tilemap.cpp 의 animatedGid)과 같은 gid 를 고르고, 엔진이 맵을 읽지 못하는 항목은 오류로 남긴다.
import { describe, expect, it } from "vitest";
import type { Tileset } from "./format";
import { animatedGid, animationOf, tileAnimations } from "./tileAnimation";

const tileset = (firstGid: number, animations?: unknown): Tileset => ({
  image: `t${firstGid}.png`,
  firstGid,
  columns: 8,
  extra: animations === undefined ? {} : { animations },
});

describe("타일 애니메이션", () => {
  it("범위의 i 번째 타일은 프레임의 첫 타일 + i 를 그린다", () => {
    const table = tileAnimations([tileset(1, [{ tile: 4, count: 3, frames: [4, 10, 20], duration: 100 }])]);
    expect(table.errors).toEqual([]);
    expect(table.ranges).toEqual([{ gid: 5, count: 3, frames: [5, 11, 21], durationMs: 100 }]);
    expect([0, 99, 100, 250, 300].map((t) => animatedGid(table, 6, t))).toEqual([6, 6, 12, 22, 6]);
    // 범위 밖과 빈 타일은 그대로
    expect(animatedGid(table, 4, 150)).toBe(4);
    expect(animatedGid(table, 8, 150)).toBe(8);
    expect(animatedGid(table, 0, 150)).toBe(0);
  });

  it("count 가 없으면 1, tile 이 없으면 0 이다", () => {
    const table = tileAnimations([tileset(1, [{ frames: [0, 1], duration: 50 }])]);
    expect(table.ranges).toEqual([{ gid: 1, count: 1, frames: [1, 2], durationMs: 50 }]);
    expect(animatedGid(table, 1, 60)).toBe(2);
    expect(animatedGid(table, 2, 60)).toBe(2);
  });

  it("타일셋마다 firstGid 로 옮기고 범위를 찾는다", () => {
    const table = tileAnimations([tileset(1, [{ tile: 0, frames: [0, 1], duration: 10 }]), tileset(101, [{ tile: 2, count: 2, frames: [2, 6], duration: 10 }])]);
    expect(table.ranges.map((r) => r.gid)).toEqual([1, 103]);
    expect(animationOf(table, 104)?.gid).toBe(103);
    expect(animatedGid(table, 104, 15)).toBe(108);
  });

  it("다음 타일셋이 가리는 gid 는 그 타일셋의 것이다", () => {
    const table = tileAnimations([tileset(1, [{ tile: 8, count: 10, frames: [8, 40], duration: 10 }]), tileset(13)]);
    expect(table.ranges).toEqual([{ gid: 9, count: 4, frames: [9, 41], durationMs: 10 }]);
    expect(animatedGid(table, 13, 15)).toBe(13);
  });

  it("엔진이 읽지 못하는 항목은 오류로 남기고 쓰지 않는다", () => {
    const table = tileAnimations([
      tileset(1, [
        { tile: 0, frames: [], duration: 100 },
        { tile: 1, frames: [1], duration: 0 },
        { tile: 2, count: 0, frames: [2], duration: 100 },
        { tile: 3, frames: [1.5], duration: 100 },
        { tile: 4, count: 3, frames: [4], duration: 100 },
        { tile: 5, frames: [5], duration: 100 },
      ]),
      tileset(201, { tile: 0 }),
    ]);
    expect(table.ranges.map((r) => r.gid)).toEqual([5]);
    expect(table.errors).toEqual([
      "tilesets[0].animations[0]: 잘못된 항목입니다",
      "tilesets[0].animations[1]: 잘못된 항목입니다",
      "tilesets[0].animations[2]: 잘못된 항목입니다",
      "tilesets[0].animations[3]: 잘못된 항목입니다",
      "tilesets[0].animations[5]: 다른 항목과 범위가 겹칩니다",
      "tilesets[1].animations: 배열이 아닙니다",
    ]);
  });
});
