// PNG 읽기와 쓰기 (의존성 없음, node:zlib). 픽셀을 견주는 곳이 쓴다:
//   packages/app/src/editor/scene/templates.test.ts  템플릿 묶음의 생성물(플래피 그림)을 바이트가 아니라 픽셀로 견준다
//   scripts/selftest-check.mjs                       숲의 기준 화면을 저장한 맵과 타일셋 그림으로 그린다
//
// 읽기: 색 형식 0(회색), 2(RGB), 3(팔레트, tRNS), 4(회색과 알파), 6(RGBA), 비트 깊이 1, 2, 4, 8 (회색과 팔레트) 또는 8,
// 필터 0 에서 4, 인터레이스 없음과 Adam7. 16비트는 8비트로 줄이면 차이를 가릴 수 있어 읽지 않는다 (오류).
// 청크의 CRC 가 틀리거나 IDAT 이 모자라면 오류다. 결과는 { width, height, rgba }(한 픽셀 4바이트, 알파는 곧은 값).

import zlib from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** 색 형식별 채널 수 */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** 색 형식별로 받는 비트 깊이 */
const DEPTHS = { 0: [1, 2, 4, 8], 2: [8], 3: [1, 2, 4, 8], 4: [8], 6: [8] };
/** Adam7 의 일곱 단계: 시작 x, 시작 y, x 간격, y 간격 */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** 필터를 푼 줄들. raw 의 offset 부터 height 줄을 읽고 다음 offset 을 돌려준다 */
function unfilter(raw, offset, stride, height, bpp) {
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    if (offset >= raw.length) throw new Error("PNG: 그림 데이터가 모자란다");
    const filter = raw[offset++];
    if (offset + stride > raw.length) throw new Error("PNG: 그림 데이터가 모자란다");
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[offset + x];
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = y > 0 && x >= bpp ? out[prev + x - bpp] : 0;
      let r;
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
          throw new Error(`PNG: 모르는 필터 ${filter} (줄 ${y})`);
      }
      out[row + x] = r & 255;
    }
    offset += stride;
  }
  return { rows: out, offset };
}

/** 한 줄 안 x 번째 표본 (비트 깊이 1, 2, 4, 8) */
function sample(rows, rowStart, x, depth) {
  if (depth === 8) return rows[rowStart + x];
  const perByte = 8 / depth;
  const byte = rows[rowStart + Math.floor(x / perByte)];
  const shift = 8 - depth * ((x % perByte) + 1);
  return (byte >> shift) & ((1 << depth) - 1);
}

/** @returns {{ width: number, height: number, rgba: Uint8Array }} */
export function decodePng(bytes) {
  const buf = Buffer.from(bytes.buffer ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("PNG 가 아니다 (서명)");
  let offset = 8;
  let header = null;
  let palette = null;
  let trns = null;
  const idat = [];
  let ended = false;
  while (offset + 12 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    if (offset + 12 + len > buf.length) throw new Error(`PNG: ${type} 청크가 잘렸다`);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    const crc = buf.readUInt32BE(offset + 8 + len);
    if ((zlib.crc32(buf.subarray(offset + 4, offset + 8 + len)) >>> 0) !== crc) throw new Error(`PNG: ${type} 청크의 CRC 가 틀렸다`);
    offset += 12 + len;
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        color: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!header) throw new Error("PNG: IHDR 가 없다");
  if (!ended) throw new Error("PNG: IEND 가 없다");
  const { width, height, depth, color, compression, filter, interlace } = header;
  if (!(color in CHANNELS)) throw new Error(`PNG: 모르는 색 형식 ${color}`);
  if (depth === 16) throw new Error("PNG: 16비트는 읽지 않는다 (8비트로 줄이면 차이를 가린다)");
  if (!DEPTHS[color].includes(depth)) throw new Error(`PNG: 색 형식 ${color} 에 맞지 않는 비트 깊이 ${depth}`);
  if (compression !== 0 || filter !== 0) throw new Error("PNG: 모르는 압축이나 필터 방식");
  if (interlace !== 0 && interlace !== 1) throw new Error(`PNG: 모르는 인터레이스 ${interlace}`);
  if (color === 3 && !palette) throw new Error("PNG: 팔레트 그림에 PLTE 가 없다");
  if (width === 0 || height === 0) throw new Error("PNG: 크기가 0 이다");

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = CHANNELS[color];
  const bpp = Math.max(1, (channels * depth) >> 3);
  const rgba = new Uint8Array(width * height * 4);
  const scale = depth === 8 ? 1 : 255 / ((1 << depth) - 1);
  const trnsGray = color === 0 && trns && trns.length >= 2 ? trns.readUInt16BE(0) : null;
  const trnsRgb = color === 2 && trns && trns.length >= 6 ? [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)] : null;

  const put = (rows, rowStart, sx, dx, dy) => {
    const o = (dy * width + dx) * 4;
    if (color === 3) {
      const i = sample(rows, rowStart, sx, depth);
      if (i * 3 + 2 >= palette.length) throw new Error(`PNG: 팔레트 밖 번호 ${i}`);
      rgba[o] = palette[i * 3];
      rgba[o + 1] = palette[i * 3 + 1];
      rgba[o + 2] = palette[i * 3 + 2];
      rgba[o + 3] = trns && i < trns.length ? trns[i] : 255;
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
  const passes = interlace === 1 ? ADAM7 : [[0, 0, 1, 1]];
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
  return { width, height, rgba };
}

/** 8비트 RGBA PNG (필터 0). 테스트와 도구용 */
export function encodePng(width, height, rgba, { filter = 0 } = {}) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const line = Buffer.from(rgba.buffer ? new Uint8Array(rgba.buffer, rgba.byteOffset + y * stride, stride) : rgba.slice(y * stride, (y + 1) * stride));
    const o = y * (stride + 1);
    raw[o] = filter;
    for (let x = 0; x < stride; x++) {
      const v = line[x];
      const a = x >= 4 ? line[x - 4] : 0;
      const up = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      raw[o + 1 + x] = filter === 1 ? (v - a) & 255 : filter === 2 ? (v - up) & 255 : v;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * 두 PNG 의 픽셀이 같은가 (너비, 높이, RGBA 전부). 압축과 필터와 색 형식이 달라도 풀어 낸 픽셀이 같으면 같다.
 * @returns {{ same: boolean, detail: string }}
 */
export function samePngPixels(a, b) {
  const pa = decodePng(a);
  const pb = decodePng(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return { same: false, detail: `크기 ${pa.width}x${pa.height} 와 ${pb.width}x${pb.height}` };
  let differ = 0;
  let first = -1;
  for (let i = 0; i < pa.rgba.length; i += 4) {
    if (pa.rgba[i] !== pb.rgba[i] || pa.rgba[i + 1] !== pb.rgba[i + 1] || pa.rgba[i + 2] !== pb.rgba[i + 2] || pa.rgba[i + 3] !== pb.rgba[i + 3]) {
      if (first < 0) first = i / 4;
      differ++;
    }
  }
  if (!differ) return { same: true, detail: `${pa.width}x${pa.height} 픽셀이 같다` };
  const x = first % pa.width;
  const y = Math.floor(first / pa.width);
  const at = (p) => Array.from(p.rgba.subarray(first * 4, first * 4 + 4)).join(",");
  return { same: false, detail: `${differ}개 픽셀이 다르다 (처음 (${x}, ${y}): ${at(pa)} 와 ${at(pb)})` };
}
