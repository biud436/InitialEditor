// PNG 읽기와 쓰기 (png.ts). 쓴 것을 다시 읽어 픽셀이 같은지, 팔레트 그림의 번호와 tRNS, 깨진 파일의 오류를 본다.
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePng, encodePng } from "./png";

function crc(bytes: Buffer): number {
  return zlib.crc32(bytes) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}

/** 2x2 팔레트 그림 (4비트, 번호 0..3, 0번은 tRNS 로 투명) */
function palettePng(): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 4;
  ihdr[9] = 3;
  const plte = Buffer.from([225, 0, 126, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  const trns = Buffer.from([0]);
  // 줄마다 필터 바이트 하나 + 4비트 둘 (번호 0,1 과 2,3)
  const raw = Buffer.from([0, 0x01, 1, 0x23]);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array(Buffer.concat([sig, chunk("IHDR", ihdr), chunk("PLTE", plte), chunk("tRNS", trns), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

describe("png", () => {
  it("쓴 RGBA 를 다시 읽으면 픽셀이 같다", async () => {
    const width = 37;
    const height = 19;
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 31 + (i >> 7)) & 255;
    const bytes = await encodePng({ width, height, data });
    const back = await decodePng(bytes);
    expect(back.width).toBe(width);
    expect(back.height).toBe(height);
    expect(back.indices).toBeNull();
    expect(Buffer.from(back.data).equals(Buffer.from(data))).toBe(true);
    // 압축은 zlib 형식이다: node:zlib 가 IDAT 을 풀면 줄마다 필터 바이트 하나 + 픽셀이다
    const buf = Buffer.from(bytes);
    const idatAt = buf.indexOf("IDAT", 0, "latin1");
    const idat = buf.subarray(idatAt + 4, idatAt + 4 + buf.readUInt32BE(idatAt - 4));
    expect(zlib.inflateSync(idat).length).toBe((width * 4 + 1) * height);
  });

  it("같은 색이 이어진 그림은 작게 줄어든다", async () => {
    const width = 256;
    const height = 256;
    const data = new Uint8Array(width * height * 4).fill(200);
    const bytes = await encodePng({ width, height, data });
    expect(bytes.length).toBeLessThan(4096);
  });

  it("팔레트 그림은 번호와 tRNS 의 알파를 돌려준다", async () => {
    const png = await decodePng(palettePng());
    expect([...png.indices!]).toEqual([0, 1, 2, 3]);
    expect([...png.data.subarray(0, 8)]).toEqual([225, 0, 126, 0, 10, 20, 30, 255]);
  });

  it("CRC 가 틀리면 오류다", async () => {
    const bytes = palettePng();
    bytes[20] ^= 0xff;
    await expect(decodePng(bytes)).rejects.toThrow(/CRC/);
  });

  it("PNG 가 아니면 오류다", async () => {
    await expect(decodePng(new Uint8Array([1, 2, 3]))).rejects.toThrow(/PNG 파일이 아닙니다/);
  });
});
