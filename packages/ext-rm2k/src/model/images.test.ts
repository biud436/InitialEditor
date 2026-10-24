// RPG Maker 2000 의 그림 형식: XYZ 와 BMP (팔레트 번호까지), 파일 머리로 가려 읽기.
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodePng } from "@initial-editor/core";
import { decodeBmp, decodeRm2kImage, decodeXyz, ImageFormatError } from "./images";
import { writeXyz } from "./testLcf";

const deflate = async (b: Uint8Array) => new Uint8Array(deflateSync(b));

function palette(): Uint8Array {
  const p = new Uint8Array(768);
  for (let i = 0; i < 256; i++) p.set([i, 255 - i, (i * 7) & 0xff], i * 3);
  return p;
}

/** BMP 한 장 (BITMAPINFOHEADER). bits 8 이면 팔레트 256색, 24 면 BGR */
function bmp(width: number, height: number, bits: 4 | 8 | 24, pixel: (x: number, y: number) => number, topDown = false): Uint8Array {
  const colors = bits === 24 ? 0 : 1 << bits;
  const rowBytes = Math.ceil((width * bits) / 32) * 4;
  const offset = 14 + 40 + colors * 4;
  const out = new Uint8Array(offset + rowBytes * height);
  const dv = new DataView(out.buffer);
  out.set([0x42, 0x4d]);
  dv.setUint32(2, out.length, true);
  dv.setUint32(10, offset, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, width, true);
  dv.setInt32(22, topDown ? -height : height, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, bits, true);
  for (let i = 0; i < colors; i++) out.set([(i * 7) & 0xff, 255 - i, i, 0], 54 + i * 4); // B, G, R
  for (let y = 0; y < height; y++) {
    const row = offset + (topDown ? y : height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x++) {
      const v = pixel(x, y);
      if (bits === 24) out.set([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff], row + x * 3);
      else if (bits === 8) out[row + x] = v;
      else out[row + (x >> 1)] |= x & 1 ? v : v << 4;
    }
  }
  return out;
}

const rgbaAt = (img: { width: number; data: Uint8Array }, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

describe("RPG Maker 2000 의 그림", () => {
  it("XYZ: 팔레트와 번호를 풀고 번호도 돌려준다", async () => {
    const indices = new Uint8Array(6 * 4).map((_, i) => i * 10);
    const img = await decodeXyz(await writeXyz(6, 4, palette(), indices, deflate));
    expect([img.width, img.height]).toEqual([6, 4]);
    expect([...img.indices!]).toEqual([...indices]);
    expect(rgbaAt(img, 2, 1)).toEqual([80, 175, (80 * 7) & 0xff, 255]);
    await expect(decodeXyz(new Uint8Array([0x58, 0x59, 0x5a, 0x31, 6, 0, 4, 0, 1, 2, 3]))).rejects.toThrow(ImageFormatError);
  });

  it("BMP 8비트: 아래에서 위로와 위에서 아래로가 같은 그림이다. 팔레트는 BGR 이다", () => {
    const pixel = (x: number, y: number) => (y * 5 + x) % 256;
    for (const topDown of [false, true]) {
      const img = decodeBmp(bmp(5, 3, 8, pixel, topDown));
      expect([...img.indices!]).toEqual(Array.from({ length: 15 }, (_, i) => i));
      expect(rgbaAt(img, 3, 2)).toEqual([13, 242, (13 * 7) & 0xff, 255]);
    }
  });

  it("BMP 4비트와 24비트", () => {
    const four = decodeBmp(bmp(3, 2, 4, (x, y) => x + y * 3));
    expect([...four.indices!]).toEqual([0, 1, 2, 3, 4, 5]);
    // 픽셀 값은 바이트 순서 그대로 B, G, R
    const full = decodeBmp(bmp(2, 2, 24, (x, y) => (x * 100) | ((y * 50) << 8) | (0x30 << 16)));
    expect(full.indices).toBeNull();
    expect(rgbaAt(full, 1, 1)).toEqual([0x30, 50, 100, 255]);
  });

  it("압축한 BMP 와 모르는 형식은 이유를 알린다", async () => {
    const rle = bmp(2, 2, 8, () => 1);
    rle[30] = 1;
    expect(() => decodeBmp(rle)).toThrow(/압축한 BMP/);
    await expect(decodeRm2kImage(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).rejects.toThrow(/PNG, BMP, XYZ 가 아닙니다/);
  });

  it("파일 머리로 PNG, BMP, XYZ 를 가린다", async () => {
    const png = await encodePng({ width: 1, height: 1, data: new Uint8Array([9, 8, 7, 255]) });
    expect(rgbaAt(await decodeRm2kImage(png), 0, 0)).toEqual([9, 8, 7, 255]);
    expect((await decodeRm2kImage(bmp(1, 1, 8, () => 3))).indices).toEqual(new Uint8Array([3]));
    expect((await decodeRm2kImage(await writeXyz(1, 1, palette(), new Uint8Array([4]), deflate))).indices).toEqual(new Uint8Array([4]));
  });
});
