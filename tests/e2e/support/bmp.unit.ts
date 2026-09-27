import { describe, expect, it } from "vitest";
import { BLANK_LIMITS, frameDifference, frameStats, isBlankFrame, readBmp, type Rgba } from "./bmp";

type PixelFn = (x: number, y: number) => Rgba;

interface Layout {
  bpp: 24 | 32;
  /** v4: SDL_SaveBMP와 같은 108바이트 머리와 BI_BITFIELDS, info-bitfields: 40바이트 머리 뒤에 마스크 셋, info-rgb: 압축 없음 */
  header: "v4" | "info-bitfields" | "info-rgb";
  topDown?: boolean;
  masks?: { r: number; g: number; b: number; a: number };
}

/** 테스트용 BMP 한 장 */
function makeBmp(width: number, height: number, px: PixelFn, layout: Layout): Buffer {
  const masks = layout.masks ?? { r: 0x00ff0000, g: 0x0000ff00, b: 0x000000ff, a: 0xff000000 };
  const dib = layout.header === "v4" ? 108 : 40;
  const extra = layout.header === "info-bitfields" ? 12 : 0;
  const offset = 14 + dib + extra;
  const stride = Math.floor((width * layout.bpp + 31) / 32) * 4;
  const buf = Buffer.alloc(offset + stride * height);
  buf.write("BM", 0, "latin1");
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(offset, 10);
  buf.writeUInt32LE(dib, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(layout.topDown ? -height : height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(layout.bpp, 28);
  buf.writeUInt32LE(layout.header === "info-rgb" ? 0 : 3, 30);
  buf.writeUInt32LE(stride * height, 34);
  if (layout.header !== "info-rgb") {
    buf.writeUInt32LE(masks.r, 54);
    buf.writeUInt32LE(masks.g, 58);
    buf.writeUInt32LE(masks.b, 62);
    if (layout.header === "v4") buf.writeUInt32LE(masks.a, 66);
  }
  const put = (v: number, mask: number) => {
    if (mask === 0) return 0;
    let shift = 0;
    while (((mask >>> shift) & 1) === 0) shift++;
    return (v << shift) >>> 0;
  };
  for (let y = 0; y < height; y++) {
    const row = layout.topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const p = px(x, y);
      const o = offset + row * stride + x * (layout.bpp / 8);
      if (layout.bpp === 24) {
        buf[o] = p.b;
        buf[o + 1] = p.g;
        buf[o + 2] = p.r;
      } else if (layout.header === "info-rgb") {
        buf.writeUInt32LE(((p.r << 16) | (p.g << 8) | p.b) >>> 0, o);
      } else {
        buf.writeUInt32LE((put(p.r, masks.r) | put(p.g, masks.g) | put(p.b, masks.b) | put(p.a, masks.a)) >>> 0, o);
      }
    }
  }
  return buf;
}

const gradient: PixelFn = (x, y) => ({ r: (x * 37) & 255, g: (y * 53) & 255, b: (x * y * 11) & 255, a: 255 });
const at = (x: number, y: number) => gradient(x, y);

describe("readBmp", () => {
  it("SDL_SaveBMP 꼴(32비트, V4 머리, BI_BITFIELDS, 아래에서 위)을 읽는다", () => {
    const img = readBmp(makeBmp(5, 4, gradient, { bpp: 32, header: "v4" }));
    expect([img.width, img.height, img.bitsPerPixel, img.topDown]).toEqual([5, 4, 32, false]);
    expect(img.pixel(0, 0)).toEqual(at(0, 0));
    expect(img.pixel(4, 0)).toEqual(at(4, 0));
    expect(img.pixel(3, 3)).toEqual(at(3, 3));
  });

  it("높이가 음수면 위에서 아래로 읽는다", () => {
    const img = readBmp(makeBmp(3, 3, gradient, { bpp: 32, header: "v4", topDown: true }));
    expect(img.topDown).toBe(true);
    expect(img.pixel(2, 0)).toEqual(at(2, 0));
    expect(img.pixel(1, 2)).toEqual(at(1, 2));
  });

  it("마스크대로 채널을 가른다 (RGBA 바이트 순서, 알파 포함)", () => {
    const masks = { r: 0x000000ff, g: 0x0000ff00, b: 0x00ff0000, a: 0xff000000 };
    const px: PixelFn = (x) => ({ r: 10 + x, g: 20, b: 30, a: 128 });
    const img = readBmp(makeBmp(2, 1, px, { bpp: 32, header: "v4", masks }));
    expect(img.pixel(1, 0)).toEqual({ r: 11, g: 20, b: 30, a: 128 });
  });

  it("40바이트 머리의 BI_BITFIELDS는 머리 뒤의 마스크를 쓰고 알파는 255다", () => {
    const img = readBmp(makeBmp(2, 2, gradient, { bpp: 32, header: "info-bitfields" }));
    expect(img.pixel(1, 1)).toEqual(at(1, 1));
  });

  it("24비트와 32비트 BI_RGB (줄 끝 4바이트 맞춤)", () => {
    const img24 = readBmp(makeBmp(3, 2, gradient, { bpp: 24, header: "info-rgb" }));
    expect(img24.bitsPerPixel).toBe(24);
    expect(img24.pixel(2, 1)).toEqual(at(2, 1));
    expect(img24.pixel(0, 0)).toEqual(at(0, 0));
    const img32 = readBmp(makeBmp(3, 2, gradient, { bpp: 32, header: "info-rgb" }));
    expect(img32.pixel(2, 1)).toEqual(at(2, 1));
  });

  it("BMP가 아니거나, 잘렸거나, 읽지 않는 형식이면 예외", () => {
    expect(() => readBmp(Buffer.from("PNG and more bytes than fifty four ........................"))).toThrow(/BMP가 아니다/);
    const ok = makeBmp(4, 4, gradient, { bpp: 32, header: "v4" });
    expect(() => readBmp(ok.subarray(0, ok.length - 1))).toThrow(/잘렸다/);
    const eight = makeBmp(4, 4, gradient, { bpp: 32, header: "v4" });
    eight.writeUInt16LE(8, 28);
    expect(() => readBmp(eight)).toThrow(/8비트/);
    const rle = makeBmp(4, 4, gradient, { bpp: 24, header: "info-rgb" });
    rle.writeUInt32LE(1, 30);
    expect(() => readBmp(rle)).toThrow(/압축 형식 1은/);
    const img = readBmp(ok);
    expect(() => img.pixel(4, 0)).toThrow(/밖이다/);
  });
});

describe("frameStats와 isBlankFrame", () => {
  it("한 색 화면은 빈 화면이다", () => {
    const img = readBmp(makeBmp(64, 32, () => ({ r: 0, g: 0, b: 0, a: 255 }), { bpp: 32, header: "v4" }));
    const s = frameStats(img);
    expect(s).toEqual({ rows: 16, pixels: 64 * 16, distinct: 1, topShare: 1 });
    expect(isBlankFrame(s)).toBe(true);
  });

  it("색이 많고 한 색이 덮지 않으면 빈 화면이 아니다", () => {
    const s = frameStats(readBmp(makeBmp(64, 32, gradient, { bpp: 32, header: "v4" })));
    expect(s.distinct).toBeGreaterThanOrEqual(BLANK_LIMITS.minDistinct);
    expect(isBlankFrame(s)).toBe(false);
  });

  it("한 색이 한계보다 많이 덮으면 색이 많아도 빈 화면이다", () => {
    // 64칸 중 오른쪽 4칸만 여러 색 (덮는 비율 60/64 > 0.9)
    const mostlyBlack: PixelFn = (x, y) => (x < 60 ? { r: 0, g: 0, b: 0, a: 255 } : { r: x * 4, g: y * 8, b: 7, a: 255 });
    const s = frameStats(readBmp(makeBmp(64, 32, mostlyBlack, { bpp: 32, header: "v4" })));
    expect(s.distinct).toBeGreaterThanOrEqual(BLANK_LIMITS.minDistinct);
    expect(s.topShare).toBeGreaterThan(BLANK_LIMITS.maxTopShare);
    expect(isBlankFrame(s)).toBe(true);
  });

  it("줄 수는 높이를 넘지 않는다", () => {
    const s = frameStats(readBmp(makeBmp(8, 3, gradient, { bpp: 24, header: "info-rgb" })), 16);
    expect(s.rows).toBe(3);
    expect(s.pixels).toBe(24);
  });
});

describe("frameDifference", () => {
  const img = (px: PixelFn, w = 64, h = 32, bpp: 24 | 32 = 32) => readBmp(makeBmp(w, h, px, bpp === 32 ? { bpp, header: "v4" } : { bpp, header: "info-rgb" }));

  it("같은 화면은 0, 모두 다르면 1", () => {
    expect(frameDifference(img(gradient), img(gradient))).toBe(0);
    const inverted: PixelFn = (x, y) => {
      const p = gradient(x, y);
      return { r: 255 - p.r, g: 255 - p.g, b: 255 - p.b, a: 255 };
    };
    expect(frameDifference(img(gradient), img(inverted))).toBe(1);
  });

  it("다른 픽셀의 비율을 뽑은 줄에서 센다 (알파와 저장 형식은 보지 않는다)", () => {
    // 왼쪽 16칸만 다르다: 64칸 중 16칸
    const leftChanged: PixelFn = (x, y) => (x < 16 ? { r: 1, g: 2, b: 3, a: 255 } : gradient(x, y));
    const same: PixelFn = (x, y) => (x < 16 ? { r: 1, g: 2, b: 3, a: 255 } : gradient(x, y));
    const base: PixelFn = (x, y) => (x < 16 ? { r: 9, g: 9, b: 9, a: 255 } : gradient(x, y));
    expect(frameDifference(img(base), img(leftChanged))).toBe(0.25);
    expect(frameDifference(img(same, 64, 32, 24), img(leftChanged))).toBe(0);
    const halfAlpha: PixelFn = (x, y) => ({ ...gradient(x, y), a: 128 });
    expect(frameDifference(img(gradient), img(halfAlpha))).toBe(0);
  });

  it("뽑은 줄 밖의 차이는 세지 않는다 (frameStats와 같은 줄)", () => {
    // 높이 32, 16줄이면 뽑는 줄은 1, 3, 5, ... 짝수 줄만 바꾸면 차이가 없다
    const evenRows: PixelFn = (x, y) => (y % 2 === 0 ? { r: 0, g: 0, b: 0, a: 255 } : gradient(x, y));
    expect(frameDifference(img(gradient), img(evenRows))).toBe(0);
    expect(frameDifference(img(gradient), img(evenRows), 32)).toBeCloseTo(0.5, 1);
  });

  it("크기가 다르면 예외", () => {
    expect(() => frameDifference(img(gradient, 64, 32), img(gradient, 32, 32))).toThrow(/크기가 다르다/);
  });
});
