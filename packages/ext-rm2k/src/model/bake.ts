// ChipSet 굽기: ChipSet 그림(480x256)을 아틀라스(atlas.ts 의 배치)로. 전부 순수 함수다 (그림은 RGBA 바이트).
//
// 투명색: RPG Maker 2000 은 팔레트 그림의 0번 색을 투명으로 본다 (tRNS 가 없어도). 팔레트 그림이 아니면 그림의 알파를 쓰고,
// 알파가 전혀 없는 그림은 KEY_PIXEL(F0 의 왼쪽 위)의 색을 투명으로 본다.

import type { DecodedPng, RgbaImage } from "@initial-editor/core";
import { animOrigin, bodyOrigin, CHIPSET_HEIGHT, CHIPSET_WIDTH, D_KINDS, dOrigin, E_TILES, eOrigin, F_TILES, fOrigin, HALF, KEY_PIXEL, shoreX, TILE, WATER_FRAMES, WATER_KINDS, ANIM_FRAMES, ANIM_TILES, type PixelPoint, type WaterKind } from "./chipset";
import { animLocal, ATLAS_COLUMNS, ATLAS_HEIGHT, ATLAS_WIDTH, D_SAMPLE, dLocal, eLocal, fLocal, waterLocalByTuple } from "./atlas";
import { D_SAMPLE_SOURCES, D_SOURCE, D_VARIANT_SOURCES, QUARTERS, VARIANTS, WATER_TUPLES } from "./shapes";

export class ChipsetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChipsetError";
  }
}

/** 읽은 PNG 를 ChipSet 픽셀로 (크기 검사와 투명색). 크기가 다르면 ChipsetError */
export function chipsetPixels(png: DecodedPng): RgbaImage {
  if (png.width !== CHIPSET_WIDTH || png.height !== CHIPSET_HEIGHT) {
    throw new ChipsetError(`ChipSet 은 ${CHIPSET_WIDTH}x${CHIPSET_HEIGHT} 픽셀이어야 합니다 (이 이미지: ${png.width}x${png.height})`);
  }
  const data = png.data.slice();
  if (png.indices) {
    for (let i = 0; i < png.indices.length; i++) if (png.indices[i] === 0) data[i * 4 + 3] = 0;
    return { width: png.width, height: png.height, data };
  }
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      hasAlpha = true;
      break;
    }
  }
  if (!hasAlpha) {
    const k = (KEY_PIXEL.y * png.width + KEY_PIXEL.x) * 4;
    const [r, g, b] = [data[k], data[k + 1], data[k + 2]];
    for (let i = 0; i < data.length; i += 4) if (data[i] === r && data[i + 1] === g && data[i + 2] === b) data[i + 3] = 0;
  }
  return { width: png.width, height: png.height, data };
}

function copyRect(src: RgbaImage, sx: number, sy: number, dst: RgbaImage, dx: number, dy: number, size: number): void {
  for (let y = 0; y < size; y++) {
    const from = ((sy + y) * src.width + sx) * 4;
    dst.data.set(src.data.subarray(from, from + size * 4), ((dy + y) * dst.width + dx) * 4);
  }
}

function tileOrigin(local: number): PixelPoint {
  return { x: (local % ATLAS_COLUMNS) * TILE, y: Math.floor(local / ATLAS_COLUMNS) * TILE };
}

/** 원본 타일 넷(조각마다 하나)의 같은 자리 조각을 모아 아틀라스 칸 하나를 그린다 */
function composeTile(src: RgbaImage, dst: RgbaImage, local: number, sources: readonly PixelPoint[]): void {
  const at = tileOrigin(local);
  QUARTERS.forEach(({ qx, qy }, q) => copyRect(src, sources[q].x + qx * HALF, sources[q].y + qy * HALF, dst, at.x + qx * HALF, at.y + qy * HALF, HALF));
}

function dSources(n: number, symbols: string): PixelPoint[] {
  const o = dOrigin(n);
  return [...symbols].map((s) => ({ x: o.x + D_SOURCE[s].tx * TILE, y: o.y + D_SOURCE[s].ty * TILE }));
}

function waterSources(kind: WaterKind, key: string, frame: number): PixelPoint[] {
  const shallow = kind !== 2;
  return [...key].map((ch) => {
    if (ch === "b" || ch === "B") return bodyOrigin(shallow ? (ch === "B" ? 1 : 0) : ch === "B" ? 2 : 3, frame);
    return { x: shoreX(kind, frame), y: Number(ch) * TILE };
  });
}

/** ChipSet 픽셀(chipsetPixels)을 아틀라스로 굽는다 */
export function bakeAtlas(chipset: RgbaImage): RgbaImage {
  if (chipset.width !== CHIPSET_WIDTH || chipset.height !== CHIPSET_HEIGHT) throw new ChipsetError(`ChipSet 크기가 ${CHIPSET_WIDTH}x${CHIPSET_HEIGHT} 가 아닙니다`);
  const atlas: RgbaImage = { width: ATLAS_WIDTH, height: ATLAS_HEIGHT, data: new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT * 4) };
  const whole = (local: number, from: PixelPoint) => {
    const at = tileOrigin(local);
    copyRect(chipset, from.x, from.y, atlas, at.x, at.y, TILE);
  };
  for (let id = 0; id < E_TILES; id++) whole(eLocal(id), eOrigin(id));
  for (let id = 0; id < F_TILES; id++) whole(fLocal(id), fOrigin(id));
  for (let n = 0; n < D_KINDS; n++) {
    for (let v = 0; v < VARIANTS; v++) composeTile(chipset, atlas, dLocal(n, v), dSources(n, D_VARIANT_SOURCES[v]));
    composeTile(chipset, atlas, dLocal(n, D_SAMPLE), dSources(n, D_SAMPLE_SOURCES));
  }
  for (let f = 0; f < ANIM_FRAMES; f++) {
    for (let n = 0; n < ANIM_TILES; n++) whole(animLocal(n, f), animOrigin(n, f));
  }
  for (let f = 0; f < WATER_FRAMES; f++) {
    for (let k = 0; k < WATER_KINDS; k++) {
      WATER_TUPLES.keys.forEach((key, t) => composeTile(chipset, atlas, waterLocalByTuple(k as WaterKind, t, f), waterSources(k as WaterKind, key, f)));
    }
  }
  return atlas;
}
