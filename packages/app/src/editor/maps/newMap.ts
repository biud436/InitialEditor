// 새 맵 (맵/새 맵, Ctrl+Alt+M). 이름, 칸 수, 타일 크기, 타일셋 그림, 레이어 이름, 통행 여부를 받아
// resources/maps/<이름>.json을 고정 형식 v2(serializeMap)로 쓰고 연다. 이미 있는 이름은 거부한다.
// 타일셋은 꼭 하나 있어야 한다 (엔진은 tilesets가 빈 맵을 읽지 않는다). 열 수는 PNG 머리(IHDR)의 폭을 타일 크기로 나눈 값이다.
// 대화상자는 components/maps/NewMapDialog.tsx.

import type { LogStore, ProjectBackend } from "@initial-editor/core";
import { extname } from "@initial-editor/core";
import { isMapPath, MAPS_DIR, MAX_MAP_TILES, serializeMap, type MapData } from "@initial-editor/ext-tilemap/model";
import { RESOURCES_DIR, walkFiles } from "../scene/projectAssets";

export const DEFAULT_TILE_SIZE = 16;
export const MAX_TILE_SIZE = 256;
export const DEFAULT_LAYER_NAMES = ["ground", "deco"] as const;
export const DEFAULT_MAP_WIDTH = 20;
export const DEFAULT_MAP_HEIGHT = 15;
const LOG = "maps";

export interface ImageSize {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** PNG 머리의 폭과 높이. PNG가 아니거나 IHDR가 없으면 null */
export function pngSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  // 첫 청크: 길이(4) 이름(4) 폭(4) 높이(4), 큰 쪽이 앞
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

export function mapPathFor(name: string): string {
  return `${MAPS_DIR}/${name}.json`;
}

/** 맵 이름 검사: 파일 이름이 되는 글자만, 이미 있는 맵은 거부 (대소문자를 가리지 않는 파일 시스템을 생각해 소문자로 견준다) */
export function validateMapName(value: string, existing: readonly string[]): string | null {
  const v = value.trim();
  if (!v) return "이름 비어 있음";
  if (/\.json$/i.test(v)) return "확장자 불필요 (.json 자동 추가)";
  if (!/^[\p{L}\p{N}_-]+$/u.test(v)) return "문자, 숫자, _, - 만 허용 (폴더 경로 불가)";
  const path = mapPathFor(v);
  if (existing.some((p) => p.toLowerCase() === path.toLowerCase())) return `이미 있는 맵: ${path}`;
  return null;
}

/** 정수 입력 검사. subject 는 대상 이름 (너비, 높이). 쓸 수 없으면 이유 */
export function validateInt(value: string, subject: string, min: number, max: number): string | null {
  const t = value.trim();
  if (!/^\d+$/.test(t)) return `${subject}: 정수여야 합니다`;
  const n = Number(t);
  if (n < min || n > max) return `${subject}: ${min} 이상 ${max} 이하여야 합니다`;
  return null;
}

export const validateMapTiles = (value: string, subject: string) => validateInt(value, subject, 1, MAX_MAP_TILES);
export const validateTileSize = (value: string) => validateInt(value, "타일 크기", 1, MAX_TILE_SIZE);

/** 쉼표로 가른 레이어 이름. 하나 이상이고 겹치지 않아야 한다 */
export function parseLayerNames(text: string): { names: string[]; error: string | null } {
  const names = text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  if (names.length === 0) return { names, error: "레이어 이름이 1개 이상 필요합니다" };
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) return { names, error: `레이어 이름 중복: ${n}` };
    seen.add(n);
  }
  return { names, error: null };
}

/** 그림 폭을 타일 크기로 나눈 열 수. 그림이 타일보다 좁으면 0 */
export function tilesetColumns(imageWidth: number, tileSize: number): number {
  return tileSize > 0 ? Math.floor(imageWidth / tileSize) : 0;
}

export interface NewMapTileset {
  image: string;
  columns: number;
}

export interface NewMapSpec {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  tileset: NewMapTileset;
  layers: string[];
  collision: boolean;
}

/** 새 맵의 데이터. 칸은 전부 0(빈 칸)이고 통행을 켜면 전부 지나감이다 */
export function buildNewMap(spec: NewMapSpec, id = 0): MapData {
  const cells = spec.width * spec.height;
  return {
    version: 2,
    name: spec.name,
    id,
    width: spec.width,
    height: spec.height,
    tileWidth: spec.tileSize,
    tileHeight: spec.tileSize,
    layers: spec.layers.map((name) => ({ name, data: new Array<number>(cells).fill(0), extra: {} })),
    collision: spec.collision ? new Array<number>(cells).fill(0) : null,
    tilesets: [{ image: spec.tileset.image, firstGid: 1, columns: spec.tileset.columns, extra: {} }],
    events: null,
    objects: [],
    extra: {},
  };
}

/** resources 아래의 PNG (타일셋 후보) */
export async function listTilesetImages(backend: ProjectBackend): Promise<string[]> {
  return (await walkFiles(backend, RESOURCES_DIR)).filter((p) => extname(p) === "png");
}

/** resources/maps의 맵 파일 */
export async function listMapPaths(backend: ProjectBackend): Promise<string[]> {
  try {
    const entries = await backend.list(MAPS_DIR);
    return entries.filter((e) => e.kind === "file" && isMapPath(e.path)).map((e) => e.path);
  } catch {
    return [];
  }
}

export async function readImageSize(backend: ProjectBackend, path: string): Promise<ImageSize> {
  const size = pngSize(await backend.readBinary(path));
  if (!size) throw new Error(`PNG 파일이 아님: ${path}`);
  return size;
}

/** 파일 머리의 "id" 숫자 (앞쪽 몇 줄만 본다). 없으면 null */
export function mapIdOf(text: string): number | null {
  const m = /"id"\s*:\s*(-?\d+)/.exec(text.slice(0, 512));
  return m ? Number(m[1]) : null;
}

/** 이미 있는 맵들의 id 중 가장 큰 것 + 1 (없으면 1) */
export async function nextMapId(backend: ProjectBackend, paths: readonly string[]): Promise<number> {
  let max = 0;
  for (const p of paths) {
    try {
      const id = mapIdOf(await backend.readText(p));
      if (id !== null && id > max) max = id;
    } catch {
      // 읽지 못한 맵은 건너뛴다
    }
  }
  return max + 1;
}

export interface NewMapHost {
  readonly backend: ProjectBackend;
  readonly project: { refresh(rel: string): Promise<unknown> };
  readonly tree: { reveal(path: string): Promise<void> };
  readonly log: LogStore;
  readonly toasts: { warn(text: string): unknown; error(text: string): unknown };
}

/** 맵 파일을 쓴다. 이미 있거나 쓰지 못하면 알리고 null */
export async function createMapFile(host: NewMapHost, spec: NewMapSpec): Promise<string | null> {
  const path = mapPathFor(spec.name);
  try {
    if (await host.backend.exists(path)) {
      host.toasts.warn(`이미 있는 맵: ${path}`);
      return null;
    }
    const id = await nextMapId(host.backend, await listMapPaths(host.backend));
    await host.backend.writeText(path, serializeMap(buildNewMap(spec, id)));
    for (const dir of ["", RESOURCES_DIR, MAPS_DIR]) await host.project.refresh(dir).catch(() => {});
    await host.tree.reveal(path).catch(() => {});
  } catch (e) {
    const message = `맵 생성 실패: ${(e as Error).message}`;
    host.log.error(LOG, message);
    host.toasts.error(message);
    return null;
  }
  const tileset = `${spec.tileset.image} (${spec.tileset.columns}열)`;
  host.log.info(LOG, `새 맵 생성됨: ${path} (${spec.width}x${spec.height} 타일, 타일 크기 ${spec.tileSize}px, 타일셋 ${tileset}, 레이어 ${spec.layers.join(", ")}, 통행 ${spec.collision ? "있음" : "없음"})`);
  return path;
}
