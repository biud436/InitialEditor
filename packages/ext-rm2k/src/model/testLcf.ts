// 검사용 LCF 쓰기 (lcf.ts 의 반대). 단위 검사와 엔진 교차 검사가 RPG Maker 2000 게임 폴더를 만들 때 쓴다.
// 기본값과 같은 덩어리는 RPG Maker 2000 처럼 빼고 쓸 수 있다 (omitDefaults).

import { inflateZlib } from "@initial-editor/core";

export function ber(value: number): number[] {
  let v = value < 0 ? value + 0x100000000 : value;
  const out = [v & 0x7f];
  v = Math.floor(v / 128);
  while (v > 0) {
    out.unshift((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  return out;
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
export const header = (name: string) => [...ber(name.length), ...ascii(name)];

/** 덩어리 하나: 번호, 크기, 바이트 */
export function chunk(id: number, bytes: ArrayLike<number>): number[] {
  return [...ber(id), ...ber(bytes.length), ...Array.from(bytes)];
}

export const intChunk = (id: number, value: number) => chunk(id, ber(value));

function int16(values: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) out.push(values[i] & 0xff, (values[i] >> 8) & 0xff);
  return out;
}

export interface TestMap {
  chipsetId?: number;
  width?: number;
  height?: number;
  lower: ArrayLike<number>;
  upper?: ArrayLike<number>;
  events?: number;
  parallax?: boolean;
}

export function writeMapUnit(map: TestMap): Uint8Array {
  const out = header("LcfMapUnit");
  if (map.chipsetId !== undefined && map.chipsetId !== 1) out.push(...intChunk(0x01, map.chipsetId));
  if (map.width !== undefined && map.width !== 20) out.push(...intChunk(0x02, map.width));
  if (map.height !== undefined && map.height !== 15) out.push(...intChunk(0x03, map.height));
  out.push(...intChunk(0x0b, 0));
  if (map.parallax) out.push(...intChunk(0x1f, 1));
  out.push(...chunk(0x47, int16(map.lower)));
  if (map.upper) out.push(...chunk(0x48, int16(map.upper)));
  // 이벤트: 개수와 빈 이벤트 (id, 끝 표시)
  const events = map.events ?? 0;
  const body = ber(events);
  for (let i = 1; i <= events; i++) body.push(...ber(i), 0);
  out.push(...chunk(0x51, body), ...intChunk(0x5b, 1), 0);
  return new Uint8Array(out);
}

export interface TestMapInfo {
  id: number;
  name: number[];
  parent?: number;
  type?: number;
}

export function writeMapTree(maps: readonly TestMapInfo[]): Uint8Array {
  const out = header("LcfMapTree");
  out.push(...ber(maps.length));
  for (const m of maps) {
    out.push(...ber(m.id), ...chunk(0x01, m.name), ...intChunk(0x02, m.parent ?? 0), ...intChunk(0x04, m.type ?? 1), 0);
  }
  // 트리 순서, 활성 노드, 시작 위치
  out.push(...ber(maps.length), ...maps.flatMap((m) => ber(m.id)), ...ber(1), 0);
  return new Uint8Array(out);
}

export interface TestChipset {
  id: number;
  name: number[];
  file: number[];
  lower?: ArrayLike<number>;
  upper?: ArrayLike<number>;
  animationType?: number;
  animationSpeed?: number;
}

export function writeDatabase(chipsets: readonly TestChipset[]): Uint8Array {
  const out = header("LcfDataBase");
  // 앞의 덩어리(배우)는 읽는 쪽이 건너뛰는지 보려고 넣는다
  out.push(...chunk(0x0b, [...ber(1), ...ber(1), ...chunk(0x01, ascii("Alex")), 0]));
  const body = ber(chipsets.length);
  for (const c of chipsets) {
    body.push(...ber(c.id), ...chunk(0x01, c.name), ...chunk(0x02, c.file));
    if (c.lower) body.push(...chunk(0x04, Array.from(c.lower)));
    if (c.upper) body.push(...chunk(0x05, Array.from(c.upper)));
    if (c.animationType) body.push(...intChunk(0x0b, c.animationType));
    if (c.animationSpeed) body.push(...intChunk(0x0c, c.animationSpeed));
    body.push(0);
  }
  out.push(...chunk(0x14, body), ...chunk(0x15, [0]), 0);
  return new Uint8Array(out);
}

/** XYZ 그림 (팔레트 RGB 256색과 칸마다의 번호). deflate 는 zlib 형식 압축을 주는 함수 */
export async function writeXyz(width: number, height: number, palette: Uint8Array, indices: Uint8Array, deflate: (b: Uint8Array) => Promise<Uint8Array>): Promise<Uint8Array> {
  const body = new Uint8Array(768 + indices.length);
  body.set(palette.subarray(0, 768));
  body.set(indices, 768);
  const packed = await deflate(body);
  // 쓴 것을 다시 풀 수 있는지 (검사용 압축 함수가 zlib 형식인지)
  await inflateZlib(packed);
  return new Uint8Array([...ascii("XYZ1"), width & 0xff, width >> 8, height & 0xff, height >> 8, ...packed]);
}
