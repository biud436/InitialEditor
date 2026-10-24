// LCF 읽기: BER 수, 덩어리, 기본값을 뺀 맵, 맵 트리, 데이터베이스의 ChipSet.
// 맨 앞의 검사는 RPG Maker 2000 이 쓴 맵의 첫 바이트(EasyRPG TestGame 의 Map0001.lmu)를 그대로 옮긴 것이다.
import { describe, expect, it } from "vitest";
import { LcfError, LcfReader, parseDatabaseChipsets, parseMapTree, parseMapUnit } from "./lcf";
import { ber, chunk, header, intChunk, writeDatabase, writeMapTree, writeMapUnit } from "./testLcf";

describe("LCF 읽기", () => {
  it("RPG Maker 2000 이 쓴 맵: 크기와 ChipSet 덩어리가 없으면 20x15 와 1번이다", () => {
    // 0a "LcfMapUnit", 0b 01 00 (스크롤 없음), 47 84 58 (하층 600바이트) a0 0f ... (4000 = D1)
    const head = [0x0a, ...[..."LcfMapUnit"].map((c) => c.charCodeAt(0)), 0x0b, 0x01, 0x00, 0x47, 0x84, 0x58];
    const lower = new Array(300).fill([0xa0, 0x0f]).flat();
    const map = parseMapUnit(new Uint8Array([...head, ...lower, 0x00]));
    expect(map).toMatchObject({ chipsetId: 1, width: 20, height: 15, events: 0, parallax: false });
    expect(map.lower.length).toBe(300);
    expect(map.lower.every((v) => v === 4000)).toBe(true);
    // 상층이 없으면 빈 타일(10000)
    expect(map.upper.every((v) => v === 10000)).toBe(true);
  });

  it("BER 수: 7비트씩 큰 쪽부터, 32비트를 넘는 1은 -1 이다", () => {
    for (const v of [0, 1, 127, 128, 300, 16383, 16384, 0x7fffffff, -1]) expect(new LcfReader(new Uint8Array(ber(v))).ber()).toBe(v);
    expect(ber(300)).toEqual([0x82, 0x2c]);
    expect(new LcfReader(new Uint8Array([0x8f, 0xff, 0xff, 0xff, 0x7f])).ber()).toBe(-1);
    expect(() => new LcfReader(new Uint8Array([0x81])).ber()).toThrow(LcfError);
  });

  it("맵: 크기, ChipSet, 두 레이어, 이벤트 수, 원경", () => {
    const lower = Array.from({ length: 12 }, (_, i) => 5000 + i);
    const upper = Array.from({ length: 12 }, (_, i) => (i % 2 ? 10000 : 10001 + i));
    const map = parseMapUnit(writeMapUnit({ chipsetId: 3, width: 4, height: 3, lower, upper, events: 2, parallax: true }));
    expect(map).toMatchObject({ chipsetId: 3, width: 4, height: 3, events: 2, parallax: true });
    expect([...map.lower]).toEqual(lower);
    expect([...map.upper]).toEqual(upper);
  });

  it("레이어 길이가 맵 크기와 다르거나 머리가 다르면 오류다", () => {
    expect(() => parseMapUnit(writeMapUnit({ width: 4, height: 3, lower: [1, 2, 3] }))).toThrow(/타일 수가 맵 크기와 다릅니다/);
    expect(() => parseMapUnit(new Uint8Array([...header("LcfMapTree"), 0]))).toThrow(/LcfMapUnit 파일이 아닙니다/);
    expect(() => parseMapUnit(new Uint8Array([...header("LcfMapUnit"), ...chunk(0x47, [1, 2, 3, 4])]).slice(0, -2))).toThrow(LcfError);
    expect(() => parseMapUnit(new Uint8Array([...header("LcfMapUnit"), ...intChunk(0x02, 501), 0]))).toThrow(/맵 크기/);
  });

  it("맵 트리: id, 이름 바이트, 부모, 종류", () => {
    const tree = parseMapTree(
      writeMapTree([
        { id: 0, name: [0x47, 0x61, 0x6d, 0x65], type: 0 },
        { id: 1, name: [0x82, 0xcd], parent: 0 },
        { id: 2, name: [], parent: 1, type: 2 },
      ]),
    );
    expect(tree.map((m) => [m.id, [...m.name], m.parent, m.type])).toEqual([
      [0, [0x47, 0x61, 0x6d, 0x65], 0, 0],
      [1, [0x82, 0xcd], 0, 1],
      [2, [], 1, 2],
    ]);
  });

  it("데이터베이스: 앞의 덩어리를 건너뛰고 ChipSet 을 읽는다. 없는 통행은 기본값(하층 15, 상층 0번 31 나머지 15)이다", () => {
    const lower = new Uint8Array(162).fill(15);
    lower[0] = 0;
    lower[6] = 0x30;
    const db = parseDatabaseChipsets(
      writeDatabase([
        { id: 1, name: [0x57], file: [0x57, 0x6f, 0x72, 0x6c, 0x64], lower, upper: new Uint8Array(144).fill(0x1f), animationType: 1, animationSpeed: 1 },
        { id: 4, name: [], file: [] },
      ]),
    );
    expect(db.map((c) => [c.id, [...c.file], c.animationType, c.animationSpeed])).toEqual([
      [1, [0x57, 0x6f, 0x72, 0x6c, 0x64], 1, 1],
      [4, [], 0, 0],
    ]);
    expect([db[0].lower[0], db[0].lower[6], db[0].lower[7], db[0].upper[3]]).toEqual([0, 0x30, 15, 0x1f]);
    expect([db[1].lower[0], db[1].upper[0], db[1].upper[1]]).toEqual([15, 31, 15]);
    expect(db[1].lower.length).toBe(162);
    expect(db[1].upper.length).toBe(144);
  });
});
