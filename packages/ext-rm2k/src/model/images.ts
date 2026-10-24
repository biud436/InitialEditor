// RPG Maker 2000 이 읽는 그림 형식: PNG, BMP, XYZ. 팔레트 그림이면 칸마다의 팔레트 번호(indices)도 돌려준다 (0번 색이 투명).
//
// XYZ: "XYZ1", 폭과 높이(16비트, 작은 쪽 먼저), 그 뒤 zlib 압축 안에 팔레트 256색(RGB 768바이트)과 칸마다 1바이트 번호.
// BMP: BITMAPINFOHEADER 이상, 압축 없음(BI_RGB)의 1, 4, 8비트(팔레트)와 24, 32비트, 아래에서 위로나 위에서 아래로.

import { decodePng, inflateZlib, type DecodedPng } from "@initial-editor/core";

export class ImageFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageFormatError";
  }
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const i32 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);

function indexed(width: number, height: number, palette: Uint8Array, stride: 3 | 4, indices: Uint8Array): DecodedPng {
  const data = new Uint8Array(width * height * 4);
  const colors = Math.floor(palette.length / stride);
  for (let i = 0; i < indices.length; i++) {
    const c = indices[i];
    if (c >= colors) throw new ImageFormatError(`팔레트 밖의 색 번호 ${c}`);
    // BMP 팔레트는 BGR 순서다 (stride 4)
    data[i * 4] = stride === 4 ? palette[c * 4 + 2] : palette[c * 3];
    data[i * 4 + 1] = palette[c * stride + 1];
    data[i * 4 + 2] = stride === 4 ? palette[c * 4] : palette[c * 3 + 2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data, indices };
}

export async function decodeXyz(bytes: Uint8Array): Promise<DecodedPng> {
  if (bytes.length < 8 || String.fromCharCode(...bytes.subarray(0, 4)) !== "XYZ1") throw new ImageFormatError("XYZ 파일이 아닙니다");
  const width = u16(bytes, 4);
  const height = u16(bytes, 6);
  let body: Uint8Array;
  try {
    body = await inflateZlib(bytes.subarray(8));
  } catch (e) {
    throw new ImageFormatError(`XYZ 압축을 풀 수 없습니다 (${(e as Error).message})`);
  }
  if (body.length < 768 + width * height) throw new ImageFormatError("XYZ 파일의 이미지 데이터가 모자랍니다");
  return indexed(width, height, body.subarray(0, 768), 3, body.slice(768, 768 + width * height));
}

export function decodeBmp(bytes: Uint8Array): DecodedPng {
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) throw new ImageFormatError("BMP 파일이 아닙니다");
  const offset = u32(bytes, 10);
  const header = u32(bytes, 14);
  if (header < 40) throw new ImageFormatError("오래된 BMP 머리(OS/2)는 읽지 않습니다");
  const width = i32(bytes, 18);
  const rawHeight = i32(bytes, 22);
  const bits = u16(bytes, 28);
  const compression = u32(bytes, 30);
  if (compression !== 0) throw new ImageFormatError("압축한 BMP 는 읽지 않습니다. 압축 없이 저장한 BMP 나 PNG 를 씁니다");
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  if (width < 1 || height < 1) throw new ImageFormatError("BMP 크기가 맞지 않습니다");
  const rowBytes = Math.ceil((width * bits) / 32) * 4;
  if (offset + rowBytes * height > bytes.length) throw new ImageFormatError("BMP 파일의 이미지 데이터가 모자랍니다");
  const row = (y: number) => offset + (topDown ? y : height - 1 - y) * rowBytes;
  if (bits === 1 || bits === 4 || bits === 8) {
    const used = u32(bytes, 46) || 1 << bits;
    const palette = bytes.subarray(14 + header, 14 + header + used * 4);
    const indices = new Uint8Array(width * height);
    const mask = (1 << bits) - 1;
    for (let y = 0; y < height; y++) {
      const r = row(y);
      for (let x = 0; x < width; x++) {
        const bit = x * bits;
        indices[y * width + x] = (bytes[r + (bit >> 3)] >> (8 - bits - (bit & 7))) & mask;
      }
    }
    return indexed(width, height, palette, 4, indices);
  }
  if (bits === 24 || bits === 32) {
    const step = bits / 8;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      const r = row(y);
      for (let x = 0; x < width; x++) {
        const s = r + x * step;
        const o = (y * width + x) * 4;
        data[o] = bytes[s + 2];
        data[o + 1] = bytes[s + 1];
        data[o + 2] = bytes[s];
        data[o + 3] = 255;
      }
    }
    return { width, height, data, indices: null };
  }
  throw new ImageFormatError(`${bits}비트 BMP 는 읽지 않습니다`);
}

/** 파일 이름의 확장자 (소문자, 점 없이) */
export function imageExtension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export const RM2K_IMAGE_EXTENSIONS = ["png", "bmp", "xyz"] as const;

/** PNG, BMP, XYZ 를 파일 머리로 가려 읽는다 */
export async function decodeRm2kImage(bytes: Uint8Array): Promise<DecodedPng> {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return decodePng(bytes);
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return decodeBmp(bytes);
  if (bytes[0] === 0x58 && bytes[1] === 0x59 && bytes[2] === 0x5a) return decodeXyz(bytes);
  throw new ImageFormatError("PNG, BMP, XYZ 가 아닙니다");
}
