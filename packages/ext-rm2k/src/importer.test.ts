// RPG Maker 2000 게임 가져오기 (importer.ts). 검사용 LCF(testLcf.ts)로 만든 게임 폴더를 메모리 백엔드의 프로젝트로 가져온다:
// 게임 파일 찾기, 항목(이름, 크기, ChipSet, 이미 있는 파일, 가져올 수 없는 이유, 알림), 인코딩, ChipSet 그림 옮기기(XYZ → PNG),
// 아틀라스, 맵 파일(레이어, 통행, 물결 설정), RTP 를 쓰는 게임(프로젝트의 ChipSet).
import { deflateSync } from "node:zlib";
import { decodePng, encodePng, MemoryBackend } from "@initial-editor/core";
import type { ImportSource } from "@initial-editor/ext-tilemap";
import { parseMap } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import { chipsetWater, findGameFiles, planImport, rm2kImporter } from "./importer";
import { ATLAS_HEIGHT, ATLAS_WIDTH, CHIPSET_HEIGHT, CHIPSET_WIDTH, dLocal, eLocal, fLocal, PASS, waterLocal } from "./model";
import { writeDatabase, writeMapTree, writeMapUnit, writeXyz } from "./model/testLcf";

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
// 시작의 마을, 주인공의 집 (CP949)
const VILLAGE = [189, 195, 192, 219, 192, 199, 32, 184, 182, 192, 187];
const HOUSE = [193, 214, 192, 206, 176, 248, 192, 199, 32, 193, 253];

/** 팔레트 ChipSet: 번호는 16x16 타일마다 1..255, (0, 0) 타일만 0 번(투명) */
async function xyzChipset(): Promise<Uint8Array> {
  const palette = new Uint8Array(768);
  for (let i = 0; i < 256; i++) palette.set([i, 100, 255 - i], i * 3);
  const indices = new Uint8Array(CHIPSET_WIDTH * CHIPSET_HEIGHT);
  for (let y = 0; y < CHIPSET_HEIGHT; y++) for (let x = 0; x < CHIPSET_WIDTH; x++) indices[y * CHIPSET_WIDTH + x] = x < 16 && y < 16 ? 0 : 1 + ((Math.floor(x / 16) + Math.floor(y / 16) * 30) % 255);
  return writeXyz(CHIPSET_WIDTH, CHIPSET_HEIGHT, palette, indices, async (b) => new Uint8Array(deflateSync(b)));
}

async function game(extra: Record<string, Uint8Array> = {}): Promise<ImportSource> {
  const lower = new Uint8Array(162).fill(15);
  lower[0] = 0; // 물 A1 은 막힘
  const files: Record<string, Uint8Array> = {
    "MyGame/RPG_RT.ldb": writeDatabase([
      { id: 1, name: ascii("Field"), file: ascii("Coded"), lower, animationType: 1, animationSpeed: 1 },
      { id: 2, name: ascii("Town"), file: ascii("World") },
    ]),
    "MyGame/RPG_RT.lmt": writeMapTree([
      { id: 0, name: ascii("My Game"), type: 0 },
      { id: 1, name: VILLAGE },
      { id: 2, name: HOUSE, parent: 1 },
    ]),
    "MyGame/RPG_RT.ini": new Uint8Array(ascii("[RPG_RT]\r\nGameTitle=My Game\r\n")),
    // 2x2: 물 | 땅 / 하층 타일 E3 | 물, 상층 F5 한 칸
    "MyGame/Map0001.lmu": writeMapUnit({ width: 2, height: 2, lower: [0, 4000, 5003, 0], upper: [10000, 10005, 10000, 10000], events: 3 }),
    "MyGame/Map0002.lmu": writeMapUnit({ chipsetId: 2, width: 3, height: 1, lower: [5000, 5000, 5000], parallax: true }),
    "MyGame/Map0003.lmu": writeMapUnit({ chipsetId: 9, lower: new Array(300).fill(5000) }),
    "MyGame/ChipSet/Coded.xyz": await xyzChipset(),
    "MyGame/Music/Theme.mid": new Uint8Array([1]),
    ...extra,
  };
  return { name: "MyGame", paths: Object.keys(files), read: async (p) => files[p] };
}

async function project(files: Record<string, string | Uint8Array> = {}) {
  const backend = new MemoryBackend({ "game.json": "{}", ...files });
  await backend.open("/p");
  return backend;
}

describe("게임 파일 찾기", () => {
  it("RPG_RT.ldb 가 가장 얕은 폴더가 게임 폴더다. 대소문자를 가리지 않고 ChipSet 은 PNG, BMP, XYZ 순서다", () => {
    const files = findGameFiles({
      paths: ["Games/MyGame/rpg_rt.LDB", "Games/MyGame/Old/RPG_RT.ldb", "Games/MyGame/MAP0001.LMU", "Games/MyGame/Old/Map0002.lmu", "Games/MyGame/chipset/World.XYZ", "Games/MyGame/chipset/World.png", "Games/MyGame/ChipSet/Town.bmp", "Games/MyGame/ChipSet/readme.txt"],
    });
    expect(files).toMatchObject({ root: "Games/MyGame", ldb: "Games/MyGame/rpg_rt.LDB", lmt: null, ini: null });
    expect([...files!.maps]).toEqual([[1, "Games/MyGame/MAP0001.LMU"]]);
    expect([...files!.chipsets].sort()).toEqual([
      ["town", "Games/MyGame/ChipSet/Town.bmp"],
      ["world", "Games/MyGame/chipset/World.png"],
    ]);
    expect(findGameFiles({ paths: ["a/Map0001.lmu"] })).toBeNull();
    expect(rm2kImporter().accepts({ name: "x", paths: ["RPG_RT.ldb"], read: async () => new Uint8Array() })).toBe(true);
  });
});

describe("가져오기 계획", () => {
  it("맵마다 이름, 크기, ChipSet, 가져올 수 없는 이유, 알림. 이름의 인코딩은 짐작한다", async () => {
    const backend = await project({ "resources/maps/map0002.json": "{}" });
    const plan = await planImport(await game(), { encoding: "auto" }, backend);
    expect(plan.title).toBe("My Game");
    expect(plan.notes).toEqual(["자동으로 선택한 텍스트 인코딩: 한국어 (CP949)"]);
    expect(plan.items.map((i) => [i.label, i.detail, i.target, i.exists])).toEqual([
      ["MAP0001 시작의 마을", "2x2, ChipSet Coded", "resources/maps/map0001.json", false],
      ["MAP0002 주인공의 집", "3x1, ChipSet World", "resources/maps/map0002.json", true],
      ["MAP0003", "20x15, ChipSet 9번 (데이터베이스에 없음)", "resources/maps/map0003.json", false],
    ]);
    expect(plan.items[0].problems).toEqual([]);
    expect(plan.items[0].notes).toEqual(["이벤트 3개는 가져오지 않습니다"]);
    expect(plan.items[1].problems[0]).toMatch(/^ChipSet 이미지가 없습니다: World\. .*resources\/ChipSet\/World\.png/);
    expect(plan.items[1].notes).toEqual(["원경 이미지는 가져오지 않습니다"]);
    expect(plan.items[2].problems).toEqual(["데이터베이스에 9번 ChipSet 이 없습니다"]);
  });

  it("인코딩을 고르면 그대로 읽는다", async () => {
    const plan = await planImport(await game(), { encoding: "shift_jis" }, await project());
    expect(plan.notes).toEqual([]);
    expect(plan.items[0].label).not.toContain("시작의 마을");
  });

  it("게임 폴더가 아니면 이유를 던진다", async () => {
    await expect(planImport({ name: "x", paths: ["a.txt"], read: async () => new Uint8Array() }, {}, await project())).rejects.toThrow(/RPG_RT\.ldb 가 없습니다/);
  });
});

describe("가져오기", () => {
  it("ChipSet 그림을 PNG 로 옮기고 아틀라스를 굽고, 고른 맵을 쓴다", async () => {
    const backend = await project();
    const plan = await planImport(await game(), {}, backend);
    const steps: number[] = [];
    const result = await plan.run(["1", "3"], { backend, firstMapId: 7, progress: (done) => steps.push(done) });
    // 3 은 가져올 수 없는 항목이라 건너뛴다
    expect(result.maps).toEqual(["resources/maps/map0001.json"]);
    expect(result.files).toEqual(["resources/ChipSet/Coded.png", "resources/tiles/Coded.rm2k.png"]);
    expect(steps).toEqual([1]);
    expect(result.notes).toEqual(["MAP0001 시작의 마을 → resources/maps/map0001.json, 레이어 lower, upper, 통행 불가 타일 2개. 이벤트 3개는 가져오지 않습니다"]);

    // XYZ 의 0번 색은 투명이다
    const chip = await decodePng(await backend.readBinary("resources/ChipSet/Coded.png"));
    expect([chip.width, chip.height, chip.data[3], chip.data[16 * 4 + 3]]).toEqual([CHIPSET_WIDTH, CHIPSET_HEIGHT, 0, 255]);
    const atlas = await decodePng(await backend.readBinary("resources/tiles/Coded.rm2k.png"));
    expect([atlas.width, atlas.height]).toEqual([ATLAS_WIDTH, ATLAS_HEIGHT]);

    const map = parseMap(await backend.readText("resources/maps/map0001.json"));
    expect(map).toMatchObject({ name: "시작의 마을", id: 7, width: 2, height: 2, tileWidth: 16, tileHeight: 16 });
    expect(map.layers.map((l) => [l.name, l.data])).toEqual([
      ["lower", [1 + waterLocal(0, 0, 0), 1 + dLocal(0, 0), 1 + eLocal(3), 1 + waterLocal(0, 0, 0)]],
      ["upper", [0, 1 + fLocal(5), 0, 0]],
    ]);
    expect(map.collision).toEqual([1, 0, 0, 1]);
    expect(map.tilesets[0]).toMatchObject({ image: "resources/tiles/Coded.rm2k.png", firstGid: 1, columns: 48 });
    expect(map.tilesets[0].extra.rm2k).toEqual({ version: 1, chipset: "resources/ChipSet/Coded.png", water: "loop", waterSpeed: "fast" });
    expect(map.tilesets[0].extra.animations).toEqual(expect.arrayContaining([expect.objectContaining({ duration: 200, frames: expect.any(Array) })]));
  });

  it("RTP 를 쓰는 게임: 게임 폴더에 없는 ChipSet 은 프로젝트의 resources/ChipSet 에서 찾고 그 그림은 다시 쓰지 않는다", async () => {
    const world = await encodePng({ width: CHIPSET_WIDTH, height: CHIPSET_HEIGHT, data: new Uint8Array(CHIPSET_WIDTH * CHIPSET_HEIGHT * 4).fill(255) });
    const backend = await project({ "resources/ChipSet/World.png": world });
    const plan = await planImport(await game(), {}, backend);
    expect(plan.items[1].problems).toEqual([]);
    const result = await plan.run(["2"], { backend, firstMapId: 1 });
    expect(result.files).toEqual(["resources/tiles/World.rm2k.png"]);
    expect(await backend.readBinary("resources/ChipSet/World.png")).toEqual(world);
    expect(parseMap(await backend.readText("resources/maps/map0002.json")).tilesets[0].extra.rm2k).toMatchObject({ water: "pingpong", waterSpeed: "normal" });
  });

  it("같은 ChipSet 그림이 이미 있으면 다시 쓰지 않고, 다르면 게임의 것으로 바꾸고 알린다", async () => {
    const backend = await project();
    const plan = await planImport(await game(), {}, backend);
    await plan.run(["1"], { backend, firstMapId: 1 });
    const again = await plan.run(["1"], { backend, firstMapId: 2 });
    expect(again.files).toEqual(["resources/tiles/Coded.rm2k.png"]);
    await backend.writeBinary("resources/ChipSet/Coded.png", new Uint8Array([1, 2, 3]));
    const replaced = await (await planImport(await game(), {}, backend)).run(["1"], { backend, firstMapId: 3 });
    expect(replaced.files).toContain("resources/ChipSet/Coded.png");
    expect(replaced.notes[0]).toBe("ChipSet 이미지를 게임 폴더의 이미지로 교체: resources/ChipSet/Coded.png");
  });

  it("ChipSet 의 물결 설정: 0 은 왕복과 보통, 1 은 한 방향과 빠르게", () => {
    const chip = (animationType: number, animationSpeed: number) => ({ id: 1, name: new Uint8Array(), file: new Uint8Array(), lower: new Uint8Array(), upper: new Uint8Array(), animationType, animationSpeed });
    expect(chipsetWater(chip(0, 0))).toEqual({ pattern: "pingpong", speed: "normal" });
    expect(chipsetWater(chip(1, 1))).toEqual({ pattern: "loop", speed: "fast" });
    expect(PASS.above).toBe(16);
  });
});
