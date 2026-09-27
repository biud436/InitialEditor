// scripts/lib/png.mjs: 픽셀로 견주는 PNG 읽기. 템플릿 묶음의 생성물 대조(templates.test.ts)와 숲의 기준 화면(selftest-check.mjs)이 쓴다.
// 여러 색 형식, 비트 깊이, 필터, Adam7 을 이 파일의 작은 인코더로 만들어 읽고, 틀린 파일은 오류로 끝나는지 본다.

import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
interface Decoded {
  width: number;
  height: number;
  rgba: Uint8Array;
}
const png = (await import(pathToFileURL(path.join(REPO, "scripts", "lib", "png.mjs")).href)) as {
  decodePng(bytes: Uint8Array): Decoded;
  encodePng(width: number, height: number, rgba: Uint8Array, opts?: { filter?: number }): Buffer;
  samePngPixels(a: Uint8Array, b: Uint8Array): { same: boolean; detail: string };
};

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** 줄들에 필터를 건다 (줄마다 filters[y % n]) */
function filterRows(rows: Buffer[], bpp: number, filters: number[]): Buffer {
  const out: Buffer[] = [];
  rows.forEach((row, y) => {
    const f = filters[y % filters.length];
    const prev = y > 0 ? rows[y - 1] : Buffer.alloc(row.length);
    const line = Buffer.alloc(row.length + 1);
    line[0] = f;
    for (let x = 0; x < row.length; x++) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
      line[x + 1] = (row[x] - pred) & 255;
    }
    out.push(line);
  });
  return Buffer.concat(out);
}

/** 표본(채널 값 배열)으로 줄 하나를 비트 깊이대로 싼다 */
function packRow(samples: number[][], depth: number, channels: number): Buffer {
  const bits = samples.length * channels * depth;
  const row = Buffer.alloc(Math.ceil(bits / 8));
  let bit = 0;
  for (const px of samples) {
    for (const v of px) {
      if (depth === 8) row[bit >> 3] = v;
      else row[bit >> 3] |= v << (8 - depth - (bit % 8));
      bit += depth;
    }
  }
  return row;
}

interface Spec {
  width: number;
  height: number;
  color: number;
  depth: number;
  at: (x: number, y: number) => number[];
  plte?: Buffer;
  trns?: Buffer;
  interlace?: boolean;
  filters?: number[];
}

function buildPng(s: Spec): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s.width, 0);
  ihdr.writeUInt32BE(s.height, 4);
  ihdr[8] = s.depth;
  ihdr[9] = s.color;
  ihdr[12] = s.interlace ? 1 : 0;
  const channels = CHANNELS[s.color];
  const bpp = Math.max(1, (channels * s.depth) >> 3);
  const passes = s.interlace ? ADAM7 : [[0, 0, 1, 1]];
  const parts: Buffer[] = [];
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((s.width - x0) / dx);
    const ph = Math.ceil((s.height - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const rows: Buffer[] = [];
    for (let y = 0; y < ph; y++) {
      const samples: number[][] = [];
      for (let x = 0; x < pw; x++) samples.push(s.at(x0 + x * dx, y0 + y * dy));
      rows.push(packRow(samples, s.depth, channels));
    }
    parts.push(filterRows(rows, bpp, s.filters ?? [0, 1, 2, 3, 4]));
  }
  const chunks = [chunk("IHDR", ihdr)];
  if (s.plte) chunks.push(chunk("PLTE", s.plte));
  if (s.trns) chunks.push(chunk("tRNS", s.trns));
  const z = zlib.deflateSync(Buffer.concat(parts));
  // IDAT 을 둘로 나눠 이어 붙이기도 본다
  chunks.push(chunk("IDAT", z.subarray(0, z.length >> 1)), chunk("IDAT", z.subarray(z.length >> 1)), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat([SIGNATURE, ...chunks]);
}

function rgbaOf(d: Decoded, x: number, y: number): number[] {
  const i = (y * d.width + x) * 4;
  return Array.from(d.rgba.subarray(i, i + 4));
}

/** 13x11 처럼 8 의 배수가 아닌 크기로 Adam7 의 빈 단계와 자투리를 본다 */
const W = 13;
const H = 11;
const pattern = (x: number, y: number) => [(x * 19 + y * 7) & 255, (x * 3 + y * 31) & 255, (x * y * 5) & 255, (x + y) % 3 === 0 ? 0 : 255 - x * 4];

describe("PNG 읽기 (scripts/lib/png.mjs)", () => {
  it("RGBA 8비트: 다섯 필터와 Adam7, 나눈 IDAT", () => {
    for (const interlace of [false, true]) {
      const d = png.decodePng(buildPng({ width: W, height: H, color: 6, depth: 8, at: pattern, interlace }));
      expect([d.width, d.height]).toEqual([W, H]);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) expect(rgbaOf(d, x, y), `${interlace} ${x},${y}`).toEqual(pattern(x, y));
    }
  });

  it("RGB 와 tRNS 한 색, 회색과 알파", () => {
    const rgb = png.decodePng(buildPng({ width: W, height: H, color: 2, depth: 8, at: (x, y) => pattern(x, y).slice(0, 3), trns: Buffer.from([0, 0, 0, 0, 0, 0]) }));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const [r, g, b] = pattern(x, y);
        expect(rgbaOf(rgb, x, y)).toEqual([r, g, b, r === 0 && g === 0 && b === 0 ? 0 : 255]);
      }
    }
    expect(rgbaOf(rgb, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(rgbaOf(rgb, 1, 0)).toEqual([19, 3, 0, 255]);
    const ga = png.decodePng(buildPng({ width: W, height: H, color: 4, depth: 8, at: (x, y) => [x * 10, y * 20], interlace: true }));
    expect(rgbaOf(ga, 12, 10)).toEqual([120, 120, 120, 200]);
  });

  it("회색 1비트와 4비트는 0..255 로 늘리고, 8비트 회색의 tRNS 는 그 값만 투명하다", () => {
    const one = png.decodePng(buildPng({ width: W, height: H, color: 0, depth: 1, at: (x, y) => [(x + y) & 1] }));
    expect(rgbaOf(one, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(rgbaOf(one, 1, 0)).toEqual([255, 255, 255, 255]);
    expect(rgbaOf(one, 12, 10)).toEqual([0, 0, 0, 255]);
    const four = png.decodePng(buildPng({ width: W, height: H, color: 0, depth: 4, at: (x) => [x % 16], interlace: true }));
    expect(rgbaOf(four, 5, 3)).toEqual([85, 85, 85, 255]);
    const gray = png.decodePng(buildPng({ width: W, height: H, color: 0, depth: 8, at: (x) => [x * 20], trns: Buffer.from([0, 40]) }));
    expect(rgbaOf(gray, 2, 0)).toEqual([40, 40, 40, 0]);
    expect(rgbaOf(gray, 3, 0)).toEqual([60, 60, 60, 255]);
  });

  it("팔레트 2비트와 tRNS (tRNS 가 짧으면 나머지는 불투명)", () => {
    const plte = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80, 90, 200, 210, 220]);
    const d = png.decodePng(buildPng({ width: W, height: H, color: 3, depth: 2, at: (x, y) => [(x + y) % 4], plte, trns: Buffer.from([0, 128]), interlace: true }));
    expect(rgbaOf(d, 0, 0)).toEqual([10, 20, 30, 0]);
    expect(rgbaOf(d, 1, 0)).toEqual([40, 50, 60, 128]);
    expect(rgbaOf(d, 2, 0)).toEqual([70, 80, 90, 255]);
    expect(rgbaOf(d, 12, 10)).toEqual([70, 80, 90, 255]);
  });

  it("encodePng 는 decodePng 가 그대로 읽는다 (필터 0, 1, 2)", () => {
    const rgba = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgba.set(pattern(x, y), (y * W + x) * 4);
    for (const filter of [0, 1, 2]) expect(png.decodePng(png.encodePng(W, H, rgba, { filter })).rgba).toEqual(rgba);
  });

  it("틀린 파일은 오류다: 서명, CRC, 16비트, 모자란 데이터, 모르는 필터, 팔레트 밖", () => {
    const good = buildPng({ width: W, height: H, color: 6, depth: 8, at: pattern });
    expect(() => png.decodePng(Buffer.from("not a png at all"))).toThrow(/서명/);
    const crc = Buffer.from(good);
    crc[20] ^= 1;
    expect(() => png.decodePng(crc)).toThrow(/CRC/);
    expect(() => png.decodePng(buildPng({ width: 2, height: 2, color: 6, depth: 16, at: () => [0, 0, 0, 0, 0, 0, 0, 0] }))).toThrow(/16비트/);
    const short = buildPng({ width: W, height: H, color: 6, depth: 8, at: pattern });
    const ihdr = chunk("IHDR", Buffer.from([0, 0, 0, W, 0, 0, 0, H + 5, 8, 6, 0, 0, 0]));
    expect(() => png.decodePng(Buffer.concat([SIGNATURE, ihdr, short.subarray(8 + 25)]))).toThrow(/모자란다/);
    expect(() => png.decodePng(buildPng({ width: 2, height: 2, color: 6, depth: 8, at: () => [1, 2, 3, 4], filters: [7] }))).toThrow(/모르는 필터 7/);
    expect(() => png.decodePng(buildPng({ width: 2, height: 1, color: 3, depth: 8, at: () => [5], plte: Buffer.from([1, 2, 3]) }))).toThrow(/팔레트 밖/);
    expect(() => png.decodePng(good.subarray(0, good.length - 12))).toThrow(/IEND/);
  });
});

describe("픽셀로 견주기 (samePngPixels)", () => {
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgba.set(pattern(x, y), (y * W + x) * 4);

  it("압축과 필터와 IDAT 나눔이 달라 바이트가 달라도 픽셀이 같으면 같다", () => {
    const a = png.encodePng(W, H, rgba, { filter: 0 });
    const b = buildPng({ width: W, height: H, color: 6, depth: 8, at: pattern, interlace: true, filters: [4, 3] });
    expect(Buffer.compare(a, b)).not.toBe(0);
    expect(png.samePngPixels(a, b)).toEqual({ same: true, detail: `${W}x${H} 픽셀이 같다` });
  });

  it("한 픽셀이나 알파 하나라도 다르면, 또는 크기가 다르면 다르다", () => {
    const changed = Uint8Array.from(rgba);
    changed[(3 * W + 5) * 4 + 3] ^= 1;
    const r = png.samePngPixels(png.encodePng(W, H, rgba), png.encodePng(W, H, changed));
    expect(r.same).toBe(false);
    expect(r.detail).toContain("1개 픽셀이 다르다 (처음 (5, 3)");
    const smaller = png.samePngPixels(png.encodePng(W, H, rgba), png.encodePng(W, H - 1, rgba.subarray(0, W * (H - 1) * 4)));
    expect(smaller).toEqual({ same: false, detail: `크기 ${W}x${H} 와 ${W}x${H - 1}` });
  });
});
