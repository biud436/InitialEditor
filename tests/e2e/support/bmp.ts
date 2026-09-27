// BMP 읽기 (의존성 없음). 엔진의 INITIAL2D_SCREENSHOT은 SDL_SaveBMP로 32비트 BI_BITFIELDS(V4 머리)를 쓴다.
// 24비트와 32비트, 아래에서 위(높이 양수)와 위에서 아래(높이 음수)를 읽는다. 팔레트와 압축 형식은 받지 않는다.
// frameStats는 고르게 뽑은 줄의 픽셀로 색 수와 가장 흔한 색의 비율을 센다. 빈 화면(한 색)을 가려낸다.
// frameDifference는 같은 줄들에서 두 화면의 RGB가 다른 픽셀의 비율이다. 카메라가 다른 자리를 비추는지 본다.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface BmpImage {
  width: number;
  height: number;
  bitsPerPixel: 24 | 32;
  topDown: boolean;
  pixel(x: number, y: number): Rgba;
}

const BI_RGB = 0;
const BI_BITFIELDS = 3;
const BI_ALPHABITFIELDS = 6;

interface Channel {
  mask: number;
  shift: number;
  max: number;
}

function channel(mask: number): Channel | null {
  if (mask === 0) return null;
  let shift = 0;
  while (((mask >>> shift) & 1) === 0) shift++;
  return { mask, shift, max: mask >>> shift };
}

function readChannel(v: number, c: Channel | null, fallback: number): number {
  if (!c) return fallback;
  const raw = (v & c.mask) >>> c.shift;
  return c.max === 255 ? raw : Math.round((raw * 255) / c.max);
}

export function readBmp(data: Buffer | Uint8Array): BmpImage {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (buf.length < 54 || buf.toString("latin1", 0, 2) !== "BM") throw new Error("BMP가 아니다 (BM 서명이 없다)");
  const dataOffset = buf.readUInt32LE(10);
  const dibSize = buf.readUInt32LE(14);
  if (dibSize < 40) throw new Error(`모르는 BMP 머리 크기다: ${dibSize}`);
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  if (width <= 0 || rawHeight === 0) throw new Error(`크기가 잘못됐다: ${width}x${rawHeight}`);
  if (bpp !== 24 && bpp !== 32) throw new Error(`${bpp}비트 BMP는 읽지 않는다 (24와 32만)`);
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  const stride = Math.floor((width * bpp + 31) / 32) * 4;
  if (buf.length < dataOffset + stride * height) throw new Error(`BMP가 잘렸다: ${buf.length} 바이트 (필요 ${dataOffset + stride * height})`);

  let red = channel(0x00ff0000);
  let green = channel(0x0000ff00);
  let blue = channel(0x000000ff);
  let alpha: Channel | null = null;
  if (bpp === 32 && (compression === BI_BITFIELDS || compression === BI_ALPHABITFIELDS)) {
    // 마스크는 V2 머리 이상이면 머리 안(54), 40바이트 머리면 머리 바로 뒤(54)에 있다
    red = channel(buf.readUInt32LE(54));
    green = channel(buf.readUInt32LE(58));
    blue = channel(buf.readUInt32LE(62));
    if (dibSize >= 56 || compression === BI_ALPHABITFIELDS) alpha = channel(buf.readUInt32LE(66));
  } else if (compression !== BI_RGB) {
    throw new Error(`압축 형식 ${compression}은(는) 읽지 않는다`);
  }

  return {
    width,
    height,
    bitsPerPixel: bpp,
    topDown,
    pixel(x: number, y: number): Rgba {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) throw new Error(`픽셀 자리가 밖이다: ${x}, ${y}`);
      const row = topDown ? y : height - 1 - y;
      const o = dataOffset + row * stride + x * (bpp / 8);
      if (bpp === 24) return { r: buf[o + 2], g: buf[o + 1], b: buf[o], a: 255 };
      const v = buf.readUInt32LE(o);
      return { r: readChannel(v, red, 0), g: readChannel(v, green, 0), b: readChannel(v, blue, 0), a: readChannel(v, alpha, 255) };
    },
  };
}

export interface FrameStats {
  /** 뽑은 줄 수 */
  rows: number;
  /** 뽑은 픽셀 수 */
  pixels: number;
  /** 서로 다른 RGB 수 */
  distinct: number;
  /** 가장 흔한 색의 비율 (0..1) */
  topShare: number;
}

/** 높이를 고르게 나눈 줄 rows개의 모든 픽셀로 센다 */
export function frameStats(img: BmpImage, rows = 16): FrameStats {
  const counts = new Map<number, number>();
  const n = Math.max(1, Math.min(rows, img.height));
  let pixels = 0;
  for (let k = 0; k < n; k++) {
    const y = Math.floor(((k + 0.5) * img.height) / n);
    for (let x = 0; x < img.width; x++) {
      const p = img.pixel(x, y);
      const key = (p.r << 16) | (p.g << 8) | p.b;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      pixels++;
    }
  }
  let top = 0;
  for (const c of counts.values()) top = Math.max(top, c);
  return { rows: n, pixels, distinct: counts.size, topShare: pixels ? top / pixels : 1 };
}

/** 빈 화면으로 보는 한계: 색이 이보다 적거나 한 색이 이보다 많이 덮으면 빈 화면 */
export const BLANK_LIMITS = { minDistinct: 16, maxTopShare: 0.9 } as const;

export function isBlankFrame(stats: FrameStats, limits: { minDistinct: number; maxTopShare: number } = BLANK_LIMITS): boolean {
  return stats.distinct < limits.minDistinct || stats.topShare > limits.maxTopShare;
}

/** 두 화면에서 같은 자리의 RGB가 다른 픽셀의 비율 (0..1). frameStats와 같은 줄들을 본다. 크기가 다르면 예외 */
export function frameDifference(a: BmpImage, b: BmpImage, rows = 16): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`크기가 다르다: ${a.width}x${a.height}, ${b.width}x${b.height}`);
  const n = Math.max(1, Math.min(rows, a.height));
  let pixels = 0;
  let differ = 0;
  for (let k = 0; k < n; k++) {
    const y = Math.floor(((k + 0.5) * a.height) / n);
    for (let x = 0; x < a.width; x++) {
      const p = a.pixel(x, y);
      const q = b.pixel(x, y);
      if (p.r !== q.r || p.g !== q.g || p.b !== q.b) differ++;
      pixels++;
    }
  }
  return pixels ? differ / pixels : 0;
}
