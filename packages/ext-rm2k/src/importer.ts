// RPG Maker 2000 게임 가져오기 (맵 > 맵 가져오기). 게임 폴더의 RPG_RT.ldb(ChipSet 과 통행), RPG_RT.lmt(맵 이름),
// MapXXXX.lmu(맵)와 ChipSet 폴더의 그림을 읽어, 맵마다 resources/maps/mapXXXX.json 을 쓴다.
//   - ChipSet 그림은 resources/ChipSet/<이름>.png 로 옮기고(BMP 와 XYZ 는 PNG 로 바꾼다) 아틀라스를 굽는다. 게임 폴더에 그림이
//     없으면(RTP 를 쓰는 게임) 프로젝트의 resources/ChipSet/<이름>.png 를 쓴다
//   - 물결은 ChipSet 의 설정(왕복이나 한 방향, 보통이나 빠르게)을 따른다
//   - 레이어와 통행은 model/convert.ts. 이벤트와 원경 그림은 가져오지 않고 항목의 알림에 적는다
//   - 글(맵 이름, ChipSet 이름)의 인코딩은 선택지로 고르고, 자동이면 model/lcfText.ts 가 짐작한다

import { decodePng, encodePng, type DecodedPng, type ProjectBackend } from "@initial-editor/core";
import type { ImportSource, MapImporterSpec, MapImportItem, MapImportPlan, MapImportRun } from "@initial-editor/ext-tilemap";
import { serializeMap, type MapData } from "@initial-editor/ext-tilemap/model";
import {
  atlasPathFor,
  bakeAtlas,
  chipsetPixels,
  convertLayers,
  decodeLcfText,
  decodeRm2kImage,
  guessEncoding,
  imageExtension,
  LCF_ENCODINGS,
  MAP_INFO_MAP,
  parseDatabaseChipsets,
  parseMapTree,
  parseMapUnit,
  rm2kTileset,
  RM2K_IMAGE_EXTENSIONS,
  TILE,
  type LcfChipset,
  type LcfMap,
  type LcfMapInfo,
  type WaterAnimation,
} from "./model";

export const RM2K_IMPORTER_ID = "rm2k-game";
export const AUTO_ENCODING = "auto";
const CHIPSET_DIR = "resources/ChipSet";
const MAPS_DIR = "resources/maps";

const lower = (s: string) => s.toLowerCase();
const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const dirName = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

interface GameFiles {
  /** RPG_RT.ldb 가 든 폴더 (고른 폴더 기준, 고른 폴더 자체면 "") */
  root: string;
  ldb: string;
  lmt: string | null;
  ini: string | null;
  /** 맵 번호 → 파일 */
  maps: Map<number, string>;
  /** ChipSet 이름(소문자, 확장자 없이) → 파일 */
  chipsets: Map<string, string>;
}

/** 고른 폴더에서 게임 파일을 찾는다. RPG_RT.ldb 가 가장 얕은 곳이 게임 폴더다 */
export function findGameFiles(source: Pick<ImportSource, "paths">): GameFiles | null {
  const ldbs = source.paths.filter((p) => lower(baseName(p)) === "rpg_rt.ldb").sort((a, b) => a.split("/").length - b.split("/").length);
  if (ldbs.length === 0) return null;
  const root = dirName(ldbs[0]);
  const inRoot = (p: string) => dirName(p) === root;
  const find = (name: string) => source.paths.find((p) => inRoot(p) && lower(baseName(p)) === name) ?? null;
  const maps = new Map<number, string>();
  for (const p of source.paths) {
    const m = /^map(\d{4})\.lmu$/i.exec(baseName(p));
    if (m && inRoot(p)) maps.set(Number(m[1]), p);
  }
  const chipDir = lower(root ? `${root}/chipset` : "chipset");
  const chipsets = new Map<string, string>();
  for (const p of source.paths) {
    if (lower(dirName(p)) !== chipDir) continue;
    const ext = imageExtension(p);
    if (!(RM2K_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) continue;
    const key = lower(baseName(p).slice(0, -(ext.length + 1)));
    // 같은 이름이 여럿이면 PNG, BMP, XYZ 순서 (RPG Maker 2000 이 찾는 순서)
    const prev = chipsets.get(key);
    if (!prev || RM2K_IMAGE_EXTENSIONS.indexOf(ext as never) < RM2K_IMAGE_EXTENSIONS.indexOf(imageExtension(prev) as never)) chipsets.set(key, p);
  }
  return { root, ldb: ldbs[0], lmt: find("rpg_rt.lmt"), ini: find("rpg_rt.ini"), maps, chipsets };
}

/** 맵 파일 이름: Map0001.lmu → resources/maps/map0001.json */
export function importedMapPath(id: number): string {
  return `${MAPS_DIR}/map${String(id).padStart(4, "0")}.json`;
}

export function chipsetProjectPath(file: string): string {
  return `${CHIPSET_DIR}/${file}.png`;
}

/** ChipSet 의 물결 설정 */
export function chipsetWater(chipset: LcfChipset): WaterAnimation {
  return { pattern: chipset.animationType === 1 ? "loop" : "pingpong", speed: chipset.animationSpeed !== 0 ? "fast" : "normal" };
}

/** ini 의 GameTitle (바이트 그대로) */
function iniTitle(ini: Uint8Array | null): Uint8Array | null {
  if (!ini) return null;
  const nl = [0x0d, 0x0a];
  const key = [..."GameTitle="].map((c) => c.charCodeAt(0));
  for (let i = 0; i + key.length <= ini.length; i++) {
    if (i > 0 && !nl.includes(ini[i - 1])) continue;
    if (!key.every((k, j) => ini[i + j] === k)) continue;
    let end = i + key.length;
    while (end < ini.length && !nl.includes(ini[end])) end++;
    return ini.slice(i + key.length, end);
  }
  return null;
}

interface ChipsetImage {
  /** 프로젝트에 쓸 PNG 바이트 (이미 프로젝트에 있는 그림이면 null) */
  png: Uint8Array | null;
  decoded: DecodedPng;
}

interface PlannedMap {
  item: MapImportItem;
  map: LcfMap | null;
  chipset: LcfChipset | null;
  name: string;
}

export function rm2kImporter(): MapImporterSpec {
  return {
    id: RM2K_IMPORTER_ID,
    label: "RPG Maker 2000 게임",
    description: "RPG_RT.ldb 와 Map0001.lmu 같은 파일이 든 게임 폴더를 선택합니다. 맵마다 맵 파일을 만들고, ChipSet 이미지를 프로젝트에 복사합니다.",
    guides: [
      { label: "따라 하기", page: "rm2k-import.md" },
      { label: "설명서", page: "rm2k.md" },
    ],
    options: [
      {
        id: "encoding",
        label: "텍스트 인코딩",
        choices: [{ value: AUTO_ENCODING, label: "자동" }, ...LCF_ENCODINGS.map((e) => ({ value: e.id, label: e.label }))],
        default: AUTO_ENCODING,
      },
    ],
    accepts: (source) => findGameFiles(source) !== null,
    plan: (source, options, backend) => planImport(source, options, backend),
  };
}

export async function planImport(source: ImportSource, options: Readonly<Record<string, string>>, backend: ProjectBackend): Promise<MapImportPlan> {
  const files = findGameFiles(source);
  if (!files) throw new Error("RPG_RT.ldb 가 없습니다. RPG Maker 2000 게임 폴더를 선택합니다");
  const chipsets = parseDatabaseChipsets(await source.read(files.ldb));
  const tree: LcfMapInfo[] = files.lmt ? parseMapTree(await source.read(files.lmt)) : [];
  const ini = files.ini ? await source.read(files.ini) : null;
  const title = iniTitle(ini);

  const auto = !options.encoding || options.encoding === AUTO_ENCODING;
  const samples = [...tree.map((m) => m.name), ...chipsets.flatMap((c) => [c.name, c.file]), ...(title ? [title] : [])];
  const encoding = auto ? guessEncoding(samples, ini ?? undefined) : options.encoding;
  const text = (b: Uint8Array) => decodeLcfText(b, encoding).trim();
  const encodingLabel = LCF_ENCODINGS.find((e) => e.id === encoding)?.label ?? encoding;

  // ChipSet 그림: 게임 폴더, 없으면 프로젝트 (한 번만 읽는다)
  const images = new Map<string, Promise<ChipsetImage | string>>();
  const imageOf = (file: string): Promise<ChipsetImage | string> => {
    let job = images.get(lower(file));
    if (!job) {
      job = loadChipsetImage(source, files, backend, file);
      images.set(lower(file), job);
    }
    return job;
  };

  const names = new Map(tree.filter((m) => m.type === MAP_INFO_MAP).map((m) => [m.id, text(m.name)]));
  const planned: PlannedMap[] = [];
  for (const id of [...files.maps.keys()].sort((a, b) => a - b)) {
    const path = files.maps.get(id)!;
    const number = `MAP${String(id).padStart(4, "0")}`;
    const name = names.get(id) || number;
    const target = importedMapPath(id);
    const problems: string[] = [];
    const notes: string[] = [];
    let map: LcfMap | null = null;
    let chipset: LcfChipset | null = null;
    let detail = "";
    try {
      map = parseMapUnit(await source.read(path));
      chipset = chipsets.find((c) => c.id === map!.chipsetId) ?? null;
      const chipName = chipset ? text(chipset.file) : "";
      detail = `${map.width}x${map.height}, ChipSet ${chipset ? chipName || "(이름 없음)" : `${map.chipsetId}번 (데이터베이스에 없음)`}`;
      if (!chipset) problems.push(`데이터베이스에 ${map.chipsetId}번 ChipSet 이 없습니다`);
      else if (!chipName) problems.push("ChipSet 에 이미지가 지정되지 않았습니다");
      else {
        const image = await imageOf(chipName);
        if (typeof image === "string") problems.push(image);
      }
      if (map.events > 0) notes.push(`이벤트 ${map.events}개는 가져오지 않습니다`);
      if (map.parallax) notes.push("원경 이미지는 가져오지 않습니다");
      if (chipset) {
        const { stats } = convertLayers(map, chipset);
        if (stats.unknownTiles > 0) notes.push(`알 수 없는 타일 ${stats.unknownTiles}개는 비웁니다`);
        if (stats.partialPassage > 0) notes.push(`일부 방향만 통행 불가인 타일 ${stats.partialPassage}개는 통행 가능(0)으로 가져옵니다`);
      }
    } catch (e) {
      problems.push(`맵을 읽지 못했습니다: ${(e as Error).message}`);
    }
    let exists = false;
    try {
      exists = await backend.exists(target);
    } catch {
      exists = false;
    }
    planned.push({ item: { id: String(id), label: `${number} ${name === number ? "" : name}`.trim(), detail, target, exists, problems, notes }, map, chipset, name });
  }

  // 고른 인코딩은 선택지에 보이므로, 자동일 때만 고른 것을 알린다
  const planNotes = auto ? [`자동으로 선택한 텍스트 인코딩: ${encodingLabel}`] : [];
  if (files.maps.size === 0) planNotes.push("게임 폴더에 맵 파일(MapXXXX.lmu)이 없습니다");

  return {
    title: title ? text(title) || source.name : source.name,
    items: planned.map((p) => p.item),
    notes: planNotes,
    run: (ids, run) => runImport(planned, ids, run, imageOf, text),
  };
}

async function loadChipsetImage(source: ImportSource, files: GameFiles, backend: ProjectBackend, file: string): Promise<ChipsetImage | string> {
  const inGame = files.chipsets.get(lower(file));
  const projectPath = chipsetProjectPath(file);
  try {
    if (inGame) {
      const bytes = await source.read(inGame);
      const decoded = await decodeRm2kImage(bytes);
      chipsetPixels(decoded);
      return { png: imageExtension(inGame) === "png" ? bytes : await encodePng(chipsetPixels(decoded)), decoded };
    }
    if (await backend.exists(projectPath)) {
      const decoded = await decodePng(await backend.readBinary(projectPath));
      chipsetPixels(decoded);
      return { png: null, decoded };
    }
  } catch (e) {
    return `ChipSet 이미지를 읽지 못했습니다 (${file}): ${(e as Error).message}`;
  }
  return `ChipSet 이미지가 없습니다: ${file}. 게임 폴더의 ChipSet 에도, 프로젝트의 ${projectPath} 에도 없습니다 (RTP 를 쓰는 게임이면 RTP 의 이미지를 ${projectPath} 로 복사합니다)`;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function runImport(
  planned: readonly PlannedMap[],
  ids: readonly string[],
  { backend, firstMapId, progress }: MapImportRun,
  imageOf: (file: string) => Promise<ChipsetImage | string>,
  text: (b: Uint8Array) => string,
): Promise<{ maps: string[]; files: string[]; notes: string[] }> {
  const chosen = ids.map((id) => planned.find((p) => p.item.id === id)).filter((p): p is PlannedMap => !!p && p.item.problems.length === 0 && !!p.map && !!p.chipset);
  const maps: string[] = [];
  const written: string[] = [];
  const notes: string[] = [];
  // ChipSet 마다 그림과 아틀라스를 한 번씩
  const prepared = new Map<string, Promise<{ chipset: string; atlas: string }>>();
  const prepare = (file: string) => {
    let job = prepared.get(lower(file));
    if (!job) {
      job = (async () => {
        const image = await imageOf(file);
        if (typeof image === "string") throw new Error(image);
        const chipset = chipsetProjectPath(file);
        const atlas = atlasPathFor(chipset);
        if (image.png) {
          const old = (await backend.exists(chipset)) ? await backend.readBinary(chipset) : null;
          if (!old || !sameBytes(old, image.png)) {
            await backend.writeBinary(chipset, image.png);
            written.push(chipset);
            if (old) notes.push(`ChipSet 이미지를 게임 폴더의 이미지로 교체: ${chipset}`);
          }
        }
        await backend.writeBinary(atlas, await encodePng(bakeAtlas(chipsetPixels(image.decoded))));
        written.push(atlas);
        return { chipset, atlas };
      })();
      prepared.set(lower(file), job);
    }
    return job;
  };

  let done = 0;
  for (const p of chosen) {
    const map = p.map!;
    const chip = p.chipset!;
    const { chipset, atlas } = await prepare(text(chip.file));
    const converted = convertLayers(map, chip);
    const data: MapData = {
      version: 2,
      name: p.name,
      id: firstMapId + maps.length,
      width: map.width,
      height: map.height,
      tileWidth: TILE,
      tileHeight: TILE,
      layers: converted.layers.map((l) => ({ name: l.name, data: l.data, extra: {} })),
      collision: converted.collision,
      tilesets: [{ ...rm2kTileset(chipset, atlas, chipsetWater(chip)), firstGid: 1 }],
      events: null,
      objects: [],
      extra: {},
    };
    await backend.writeText(p.item.target, serializeMap(data));
    maps.push(p.item.target);
    const parts = [`${p.item.label} → ${p.item.target}`, `레이어 ${converted.layers.map((l) => l.name).join(", ")}`, `통행 불가 타일 ${converted.collision.filter((c) => c !== 0).length}개`];
    notes.push([parts.join(", "), ...p.item.notes].join(". "));
    progress?.(++done, chosen.length);
  }
  return { maps, files: written, notes };
}
