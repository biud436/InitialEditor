// 엔진 검수 줄 도우미의 단위 테스트 (vitest). 줄의 모양은 엔진 game.lua와 game.rb의 format이 찍는 그대로다.
import { describe, expect, it } from "vitest";
import { CHECKSUM_MOD, expectedMonsters, isTraceLine, parseMapTrace, parseMonsterTraces, tileChecksum } from "./trace";

/** BigInt로 같은 식을 푼 기준값 */
function reference(layers: number[][]): number {
  let sum = 0n;
  for (const data of layers) for (const gid of data) sum = (sum * 31n + BigInt(gid)) % BigInt(CHECKSUM_MOD);
  return Number(sum);
}

const mapText = (layers: number[][], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 2, width: 2, height: 1, layers: layers.map((data, i) => ({ name: `l${i}`, data })), ...extra }, null, 2);

describe("타일 검사합", () => {
  it("레이어 순서와 칸 순서대로 (합 * 31 + gid) mod 1000000007", () => {
    // ((1 * 31 + 2) * 31 + 3) = 1026
    expect(tileChecksum(mapText([[1, 2], [3]]))).toBe(1026);
    // 순서가 바뀌면 다르다
    expect(tileChecksum(mapText([[3], [1, 2]]))).not.toBe(1026);
    expect(tileChecksum(mapText([]))).toBe(0);
    expect(tileChecksum("{}")).toBe(0);
  });

  it("큰 값에서도 BigInt 기준값과 같다", () => {
    const big = [Array.from({ length: 500 }, (_, i) => (i * 7919) % 4096), Array.from({ length: 300 }, () => CHECKSUM_MOD - 1), [2 ** 31 - 1, 0, 5]];
    expect(tileChecksum(mapText(big))).toBe(reference(big));
  });

  it("collision과 objects는 넣지 않고, 정수가 아닌 gid는 던진다", () => {
    const base = tileChecksum(mapText([[1, 2]]));
    expect(tileChecksum(mapText([[1, 2]], { collision: [1, 1], objects: [{ id: "a", type: "spawn", x: 1, y: 2 }] }))).toBe(base);
    expect(() => tileChecksum(mapText([[1.5, 2]]))).toThrow(/정수가 아니다/);
  });
});

describe("검수 줄", () => {
  const LOG = [
    "libpng warning: iCCP: known incorrect sRGB profile",
    "알데바란: 맵 ./resources/maps/aldebaran_forest.json 타일 221069392",
    "알데바란: 시작 x 1966 (y 304)",
    "알데바란: 몬스터 spider x 224 범위 180..280\r",
    "알데바란: 몬스터 wolf x 2054 범위 2014..2094",
    "알데바란: 몬스터 bat x -8.5 범위 -20..3.25",
    "알데바란: 맵 ./other.json 타일 1",
  ].join("\n");

  it("첫 맵 줄의 경로와 검사합", () => {
    expect(parseMapTrace(LOG)).toEqual({ line: "알데바란: 맵 ./resources/maps/aldebaran_forest.json 타일 221069392", path: "./resources/maps/aldebaran_forest.json", checksum: 221069392 });
    expect(parseMapTrace("알데바란: 맵 파일을 읽지 못했다: x")).toBeNull();
    // 공백이 든 절대 경로도 된다
    expect(parseMapTrace("알데바란: 맵 /tmp/a b/forest.json 타일 7")).toMatchObject({ path: "/tmp/a b/forest.json", checksum: 7 });
  });

  it("몬스터 줄을 찍힌 순서로", () => {
    expect(parseMonsterTraces(LOG)).toEqual([
      { species: "spider", x: 224, minX: 180, maxX: 280 },
      { species: "wolf", x: 2054, minX: 2014, maxX: 2094 },
      { species: "bat", x: -8.5, minX: -20, maxX: 3.25 },
    ]);
    expect(parseMonsterTraces("")).toEqual([]);
  });

  it("검수 줄은 맵 줄과 몬스터 줄뿐이다", () => {
    expect(isTraceLine("알데바란: 맵 ./a.json 타일 3")).toBe(true);
    expect(isTraceLine("알데바란: 몬스터 wolf x 1 범위 0..2")).toBe(true);
    expect(isTraceLine("알데바란: 시작 x 1966 (y 304)")).toBe(false);
    expect(isTraceLine("알데바란: 맵 파일을 읽지 못했다: a.json")).toBe(false);
  });

  it("맵 파일의 spawn에서 엔진이 찍을 몬스터 줄 (범위가 없으면 x)", () => {
    const text = JSON.stringify({
      objects: [
        { id: "start", type: "start", x: 56, y: 384 },
        { id: "s1", type: "spawn", x: 224, y: 384, props: { species: "spider", minX: 180, maxX: 280 } },
        { id: "boss", type: "spawn", x: 3860, y: 384, props: { species: "monkey", boss: true } },
      ],
    });
    expect(expectedMonsters(text)).toEqual([
      { species: "spider", x: 224, minX: 180, maxX: 280 },
      { species: "monkey", x: 3860, minX: 3860, maxX: 3860 },
    ]);
    expect(expectedMonsters("{}")).toEqual([]);
  });
});
