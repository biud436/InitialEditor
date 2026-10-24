// RPG Maker 2000 타일맵 확장 (extension.ts). 앱처럼 확장 호스트에 타일맵 확장과 함께 켜고, 메모리 백엔드에서 본다:
// 타일셋 종류 등록, 새 맵의 굽기, 맵을 열 때 아틀라스가 없으면 굽기, 원본 ChipSet 이 바뀌면 다시 굽기, 팔레트 쪽의 gid.
import { CommandRegistry, decodePng, DocumentRegistry, encodePng, ExtensionHost, ExtensionRegistries, LogStore, MemoryBackend, MenuRegistry, type Workspace } from "@initial-editor/core";
import { tilemapExtension, type TilemapApi } from "@initial-editor/ext-tilemap";
import { MapDocument } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it, vi } from "vitest";
import { rm2kExtension, rm2kPalettePages } from "./extension";
import { ATLAS_HEIGHT, ATLAS_WIDTH, D_SAMPLE, dLocal, rm2kTileset, waterLocal } from "./model";
import { codedChipset } from "./model/testChipset";

const CHIPSET = "resources/ChipSet/Coded.png";
const ATLAS = "resources/tiles/Coded.rm2k.png";
const MAP = "resources/maps/field.json";

function mapText(): string {
  const tileset = { ...rm2kTileset(CHIPSET, ATLAS), firstGid: 1 };
  return JSON.stringify({
    version: 2,
    name: "field",
    width: 2,
    height: 2,
    tileWidth: 16,
    tileHeight: 16,
    layers: [{ name: "lower", data: [0, 0, 0, 0] }],
    tilesets: [{ image: tileset.image, firstGid: 1, columns: tileset.columns, ...tileset.extra }],
  });
}

async function setup(files: Record<string, string | Uint8Array> = {}) {
  const backend = new MemoryBackend(files);
  await backend.open("/p");
  const documents = new DocumentRegistry();
  const log = new LogStore();
  const errors: string[] = [];
  const workspace: Workspace = {
    backend: () => backend,
    project: { isOpen: true, root: "/p", onOpened: () => () => {}, onClosed: () => () => {}, onFileChange: (l) => backend.watch(l) },
    documents,
    log,
    toasts: { info: () => {}, success: () => {}, warn: () => {}, error: (t) => errors.push(t) },
    openPath: async () => {},
  };
  const host = new ExtensionHost({ commands: new CommandRegistry({ platform: "mac" }), menus: new MenuRegistry(), registries: new ExtensionRegistries(), workspace });
  await host.activateAll([tilemapExtension, rm2kExtension]);
  return { backend, documents, log, errors, host, tilemap: host.exportsOf<TilemapApi>("tilemap")! };
}

describe("RPG Maker 2000 타일맵 확장", () => {
  it("타일셋 종류 rm2k 를 등록한다: ChipSet 크기와 타일 16 만 받는다", async () => {
    const { tilemap, host } = await setup();
    expect(tilemap.tilesetKinds.map((k) => k.id)).toEqual(["rm2k"]);
    const kind = tilemap.tilesetKinds[0];
    expect(kind.accepts?.({ width: 480, height: 256 }, 16, 16)).toBe(true);
    expect(kind.accepts?.({ width: 480, height: 256 }, 32, 32)).toBe(false);
    expect(kind.accepts?.({ width: 256, height: 256 }, 16, 16)).toBe(false);
    expect(tilemap.tilesetKind({ ...rm2kTileset(CHIPSET, ATLAS), firstGid: 1 })?.id).toBe("rm2k");
    expect(tilemap.tilesetKind({ image: "a.png", firstGid: 1, columns: 48, extra: {} })).toBeNull();
    await host.deactivate("rm2k");
    expect(tilemap.tilesetKinds).toEqual([]);
  });

  it("새 맵: 고른 ChipSet 을 resources/tiles 에 굽고 선택지를 타일셋 항목에 적는다", async () => {
    const { tilemap, backend } = await setup({ [CHIPSET]: await encodePng(codedChipset()) });
    const tileset = await tilemap.tilesetKinds[0].createTileset!({ source: CHIPSET, options: { water: "loop", waterSpeed: "fast" }, backend });
    expect(tileset.image).toBe(ATLAS);
    expect(tileset.columns).toBe(48);
    expect(tileset.extra.rm2k).toEqual({ version: 1, chipset: CHIPSET, water: "loop", waterSpeed: "fast" });
    expect((tileset.extra.animations as Array<{ duration: number; frames: number[] }>)[1]).toMatchObject({ duration: 200, frames: [912, 1872, 2832] });
    const atlas = await decodePng(await backend.readBinary(ATLAS));
    expect([atlas.width, atlas.height]).toEqual([ATLAS_WIDTH, ATLAS_HEIGHT]);
  });

  it("새 맵: ChipSet 이 아닌 그림은 이유와 함께 거부한다", async () => {
    const { tilemap, backend } = await setup({ [CHIPSET]: await encodePng({ width: 16, height: 16, data: new Uint8Array(16 * 16 * 4) }) });
    await expect(tilemap.tilesetKinds[0].createTileset!({ source: CHIPSET, options: {}, backend })).rejects.toThrow("ChipSet 은 480x256 픽셀이어야 합니다 (이 이미지: 16x16)");
  });

  it("맵을 열 때 아틀라스가 없으면 원본 ChipSet 으로 굽는다", async () => {
    const { backend, documents } = await setup({ [CHIPSET]: await encodePng(codedChipset()), [MAP]: mapText() });
    expect(await backend.exists(ATLAS)).toBe(false);
    documents.open(await MapDocument.open(backend, MAP));
    await vi.waitFor(async () => expect(await backend.exists(ATLAS)).toBe(true));
  });

  it("열린 맵의 원본 ChipSet 이 바뀌면 아틀라스를 다시 굽는다", async () => {
    const { backend, documents, log } = await setup({ [CHIPSET]: await encodePng(codedChipset()), [MAP]: mapText() });
    documents.open(await MapDocument.open(backend, MAP));
    await vi.waitFor(async () => expect(await backend.exists(ATLAS)).toBe(true));
    const before = await backend.readBinary(ATLAS);
    const changed = codedChipset();
    changed.data.fill(90);
    await backend.writeBinary(CHIPSET, await encodePng(changed));
    await vi.waitFor(async () => expect(Buffer.from(await backend.readBinary(ATLAS)).equals(Buffer.from(before))).toBe(false));
    expect(log.entries.some((e) => e.text.includes("ChipSet 이 바뀌어 아틀라스를 다시 구움"))).toBe(true);
  });

  it("팔레트 쪽의 칸은 firstGid 를 더한 gid 이고, 모양을 맞춘 칸도 그 지형의 칸으로 찾는다", () => {
    const [lower, upper] = rm2kPalettePages({ ...rm2kTileset(CHIPSET, ATLAS), firstGid: 101 });
    expect([lower.label, lower.columns, lower.cells.length]).toEqual(["하층", 6, 162]);
    expect([upper.label, upper.cells.length]).toEqual(["상층", 144]);
    expect(lower.cells[0]).toEqual({ value: 101 + waterLocal(0, 46, 0), icon: 101 + waterLocal(0, 46, 0), label: "물 A1" });
    expect(lower.cells[8]).toMatchObject({ value: 101 + dLocal(2, D_SAMPLE), label: "오토타일 D3" });
    expect(upper.cells[0]).toMatchObject({ value: 0, label: "빈 타일" });
    expect(lower.cellOf(101 + dLocal(2, 17))).toBe(8);
    expect(lower.cellOf(101 + waterLocal(2, 5, 3, 2))).toBe(2);
    expect(upper.cellOf(101 + dLocal(2, 17))).toBe(-1);
    expect(upper.cellOf(0)).toBe(0);
  });
});
