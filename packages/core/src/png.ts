// PNG 읽기와 쓰기 (의존성 없음). 압축은 플랫폼의 CompressionStream 과 DecompressionStream("deflate", zlib 형식)이 한다.
// 에디터(웹뷰와 브라우저)와 테스트(Node)가 같은 코드를 쓴다. 굽기처럼 그림을 만드는 확장이 쓴다 (ext-rm2k 의 ChipSet 굽기).
//
// 읽기: 색 형식 0(회색), 2(RGB), 3(팔레트, tRNS), 4(회색과 알파), 6(RGBA), 비트 깊이 1, 2, 4, 8 (회색과 팔레트) 또는 8,
// 필터 0 에서 4, 인터레이스 없음과 Adam7. 16비트는 읽지 않는다 (오류). 청크의 CRC 가 틀리거나 IDAT 이 모자라면 오류다.
// 팔레트 그림은 칸마다의 팔레트 번호(indices)도 돌려준다 (RPG Maker 2000 은 0번 색을 투명으로 본다).
// 쓰기: 8비트 RGBA, 줄마다 필터 다섯 가운데 바이트 합이 가장 작은 것을 고른다.

export interface RgbaImage {
  width: number;
  height: number;
  /** 한 픽셀 4바이트 (R, G, B, A), 알파는 곧은 값 */
  data: Uint8Array;
}

export interface DecodedPng extends RgbaImage {
  /** 팔레트 그림(색 형식 3)이면 칸마다의 팔레트 번호, 아니면 null */
  indices: Uint8Array | null;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8], 2: [8], 3: [1, 2, 4, 8], 4: [8], 6: [8] };
/** Adam7 의 일곱 단계: 시작 x, 시작 y, x 간격, y 간격 */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 압축 스트림 (CompressionStream, DecompressionStream). 환경마다 타입 선언이 달라 쓰는 두 끝만 적는다 */
interface ByteTransform {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

async function transform(bytes: Uint8Array, stream: ByteTransform): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes).catch(() => {});
  void writer.close().catch(() => {});
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return transform(bytes, new DecompressionStream("deflate") as unknown as ByteTransform).catch((e: Error) => {
    throw new Error(`PNG: 압축을 풀 수 없습니다 (${e.message})`);
  });
}

function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return transform(bytes, new CompressionStream("deflate") as unknown as ByteTransform);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** 필터를 푼 줄들. raw 의 offset 부터 height 줄을 읽고 다음 offset 을 돌려준다 */
function unfilter(raw: Uint8Array, start: number, stride: number, height: number, bpp: number): { rows: Uint8Array; offset: number } {
  const out = new Uint8Array(stride * height);
  let offset = start;
  for (let y = 0; y < height; y++) {
    if (offset + 1 + stride > raw.length) throw new Error("PNG: 이미지 데이터가 모자랍니다");
    const filter = raw[offset++];
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[offset + x];
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = y > 0 && x >= bpp ? out[prev + x - bpp] : 0;
      let r: number;
      switch (filter) {
        case 0:
          r = v;
          break;
        case 1:
          r = v + a;
          break;
        case 2:
          r = v + b;
          break;
        case 3:
          r = v + ((a + b) >> 1);
          break;
        case 4:
          r = v + paeth(a, b, c);
          break;
        default:
          throw new Error(`PNG: 알 수 없는 필터 ${filter} (줄 ${y})`);
      }
      out[row + x] = r & 255;
    }
    offset += stride;
  }
  return { rows: out, offset };
}

/** 한 줄 안 x 번째 표본 (비트 깊이 1, 2, 4, 8) */
function sample(rows: Uint8Array, rowStart: number, x: number, depth: number): number {
  if (depth === 8) return rows[rowStart + x];
  const perByte = 8 / depth;
  const byte = rows[rowStart + Math.floor(x / perByte)];
  const shift = 8 - depth * ((x % perByte) + 1);
  return (byte >> shift) & ((1 << depth) - 1);
}

function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function u16(bytes: Uint8Array, at: number): number {
  return (bytes[at] << 8) | bytes[at + 1];
}

/** PNG 파일 바이트를 RGBA 로 */
export async function decodePng(bytes: Uint8Array): Promise<DecodedPng> {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error("PNG 파일이 아닙니다");
  let offset = 8;
  let header: { width: number; height: number; depth: number; color: number; compression: number; filter: number; interlace: number } | null = null;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const len = u32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (offset + 12 + len > bytes.length) throw new Error(`PNG: ${type} 청크가 잘렸습니다`);
    const data = bytes.subarray(offset + 8, offset + 8 + len);
    if (crc32(bytes, offset + 4, offset + 8 + len) !== u32(bytes, offset + 8 + len)) throw new Error(`PNG: ${type} 청크의 CRC 가 틀립니다`);
    offset += 12 + len;
    if (type === "IHDR") {
      header = { width: u32(data, 0), height: u32(data, 4), depth: data[8], color: data[9], compression: data[10], filter: data[11], interlace: data[12] };
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!header) throw new Error("PNG: IHDR 청크가 없습니다");
  if (!ended) throw new Error("PNG: IEND 청크가 없습니다");
  const { width, height, depth, color, compression, filter, interlace } = header;
  if (!(color in CHANNELS)) throw new Error(`PNG: 알 수 없는 색 형식 ${color}`);
  if (depth === 16) throw new Error("PNG: 16비트 이미지는 읽지 않습니다");
  if (!DEPTHS[color].includes(depth)) throw new Error(`PNG: 색 형식 ${color}에 맞지 않는 비트 깊이 ${depth}`);
  if (compression !== 0 || filter !== 0) throw new Error("PNG: 알 수 없는 압축이나 필터 방식");
  if (interlace !== 0 && interlace !== 1) throw new Error(`PNG: 알 수 없는 인터레이스 ${interlace}`);
  if (color === 3 && !palette) throw new Error("PNG: 팔레트 이미지에 PLTE 청크가 없습니다");
  if (width === 0 || height === 0) throw new Error("PNG: 크기가 0 입니다");

  let total = 0;
  for (const d of idat) total += d.length;
  const joined = new Uint8Array(total);
  let at = 0;
  for (const d of idat) {
    joined.set(d, at);
    at += d.length;
  }
  const raw = await inflate(joined);
  const channels = CHANNELS[color];
  const bpp = Math.max(1, (channels * depth) >> 3);
  const rgba = new Uint8Array(width * height * 4);
  const indices = color === 3 ? new Uint8Array(width * height) : null;
  const scale = depth === 8 ? 1 : 255 / ((1 << depth) - 1);
  const trnsGray = color === 0 && trns && trns.length >= 2 ? u16(trns, 0) : null;
  const trnsRgb = color === 2 && trns && trns.length >= 6 ? [u16(trns, 0), u16(trns, 2), u16(trns, 4)] : null;

  const put = (rows: Uint8Array, rowStart: number, sx: number, dx: number, dy: number) => {
    const o = (dy * width + dx) * 4;
    if (color === 3) {
      const i = sample(rows, rowStart, sx, depth);
      if (!palette || i * 3 + 2 >= palette.length) throw new Error(`PNG: 팔레트 밖의 번호 ${i}`);
      rgba[o] = palette[i * 3];
      rgba[o + 1] = palette[i * 3 + 1];
      rgba[o + 2] = palette[i * 3 + 2];
      rgba[o + 3] = trns && i < trns.length ? trns[i] : 255;
      indices![dy * width + dx] = i;
    } else if (color === 0) {
      const s = sample(rows, rowStart, sx, depth);
      const v = Math.round(s * scale);
      rgba[o] = rgba[o + 1] = rgba[o + 2] = v;
      rgba[o + 3] = trnsGray !== null && s === trnsGray ? 0 : 255;
    } else {
      const p = rowStart + sx * channels;
      if (color === 2) {
        rgba[o] = rows[p];
        rgba[o + 1] = rows[p + 1];
        rgba[o + 2] = rows[p + 2];
        rgba[o + 3] = trnsRgb && rows[p] === trnsRgb[0] && rows[p + 1] === trnsRgb[1] && rows[p + 2] === trnsRgb[2] ? 0 : 255;
      } else if (color === 4) {
        rgba[o] = rgba[o + 1] = rgba[o + 2] = rows[p];
        rgba[o + 3] = rows[p + 1];
      } else {
        rgba[o] = rows[p];
        rgba[o + 1] = rows[p + 1];
        rgba[o + 2] = rows[p + 2];
        rgba[o + 3] = rows[p + 3];
      }
    }
  };

  let pos = 0;
  const passes = interlace === 1 ? ADAM7 : ([[0, 0, 1, 1]] as const);
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((width - x0) / dx);
    const ph = Math.ceil((height - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil((pw * channels * depth) / 8);
    const { rows, offset: next } = unfilter(raw, pos, stride, ph, bpp);
    pos = next;
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) put(rows, y * stride, x, x0 + x * dx, y0 + y * dy);
    }
  }
  return { width, height, data: rgba, indices };
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/** 줄 하나를 필터 f 로 (filtered 의 자리에 쓴다) */
function filterRow(f: number, line: Uint8Array, prev: Uint8Array | null, out: Uint8Array, at: number): void {
  out[at] = f;
  for (let x = 0; x < line.length; x++) {
    const v = line[x];
    const a = x >= 4 ? line[x - 4] : 0;
    const b = prev ? prev[x] : 0;
    const c = prev && x >= 4 ? prev[x - 4] : 0;
    let r: number;
    switch (f) {
      case 1:
        r = v - a;
        break;
      case 2:
        r = v - b;
        break;
      case 3:
        r = v - ((a + b) >> 1);
        break;
      case 4:
        r = v - paeth(a, b, c);
        break;
      default:
        r = v;
    }
    out[at + 1 + x] = r & 255;
  }
}

/** RGBA 를 PNG 파일 바이트로 (8비트 RGBA) */
export async function encodePng(image: RgbaImage): Promise<Uint8Array> {
  const { width, height, data } = image;
  if (width < 1 || height < 1 || data.length !== width * height * 4) throw new Error(`PNG: 크기(${width}x${height})와 픽셀 수가 맞지 않습니다`);
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  const trial = new Uint8Array(stride + 1);
  for (let y = 0; y < height; y++) {
    const line = data.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? data.subarray((y - 1) * stride, y * stride) : null;
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      filterRow(f, line, prev, trial, 0);
      let score = 0;
      for (let x = 1; x < trial.length; x++) score += trial[x] < 128 ? trial[x] : 256 - trial[x];
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    filterRow(best, line, prev, raw, y * (stride + 1));
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [Uint8Array.from(SIGNATURE), chunk("IHDR", ihdr), chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
