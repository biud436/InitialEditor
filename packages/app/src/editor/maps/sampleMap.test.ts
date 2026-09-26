import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseMap, serializeMap, tileSource } from "@initial-editor/ext-tilemap/model";
import { encodePng, meadowMapJson, meadowTilesetPng, MEADOW_HEIGHT, MEADOW_WIDTH } from "./sampleMap";

function readChunks(png: Uint8Array): Array<{ type: string; data: Uint8Array }> {
  const out: Array<{ type: string; data: Uint8Array }> = [];
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let pos = 8;
  while (pos < png.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(...png.subarray(pos + 4, pos + 8));
    out.push({ type, data: png.subarray(pos + 8, pos + 8 + len) });
    pos += 12 + len;
  }
  return out;
}

describe("샘플 초원 맵", () => {
  it("맵 파일은 고정 형식 그대로다 (읽고 다시 쓰면 같은 글)", () => {
    const text = meadowMapJson();
    const map = parseMap(text);
    expect(map.width).toBe(MEADOW_WIDTH);
    expect(map.height).toBe(MEADOW_HEIGHT);
    expect(serializeMap(map)).toBe(text);
    expect(map.objects.map((o) => o.id)).toEqual(["start", "slime_1", "bat_1", "sign_1"]);
    // 모든 gid가 타일셋(8열 4행) 안이다
    for (const layer of map.layers) for (const gid of layer.data) if (gid > 0) expect(tileSource(map.tilesets, gid, 16, 16)!.local).toBeLessThan(32);
  });

  it("타일셋 PNG는 128x64 RGBA이고 zlib으로 풀린다", () => {
    const png = meadowTilesetPng();
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunks = readChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    const ihdr = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset);
    expect([ihdr.getUint32(0), ihdr.getUint32(4), chunks[0].data[8], chunks[0].data[9]]).toEqual([128, 64, 8, 6]);
    const raw = inflateSync(chunks[1].data);
    expect(raw.length).toBe(64 * (1 + 128 * 4));
    // 첫 타일(풀)은 불투명하다
    expect(raw[1 + 3]).toBe(255);
  });

  it("큰 이미지는 저장 블록을 여럿 쓴다", () => {
    const w = 200;
    const h = 100;
    const rgba = new Uint8Array(w * h * 4).map((_, i) => i % 251);
    const raw = inflateSync(readChunks(encodePng(w, h, rgba))[1].data);
    expect(raw.length).toBe(h * (1 + w * 4));
    expect(raw[1 + 5]).toBe(rgba[5]);
    expect(raw[(h - 1) * (1 + w * 4) + 1 + 7]).toBe(rgba[(h - 1) * w * 4 + 7]);
  });
});
