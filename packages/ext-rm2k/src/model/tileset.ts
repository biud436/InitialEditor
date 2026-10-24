// 맵 파일의 타일셋 항목. 엔진은 image, firstGid, columns, animations 만 읽고, 에디터는 rm2k 키로 이 타일셋이 ChipSet 을
// 구운 것임을 안다 (원본 ChipSet 경로, 아틀라스 판, 물의 애니메이션). 예:
//
//   { "image": "resources/tiles/Exterior.rm2k.png", "firstGid": 1, "columns": 48,
//     "animations": [ ... ],
//     "rm2k": { "version": 1, "chipset": "resources/ChipSet/Exterior.png", "water": "pingpong", "waterSpeed": "normal" } }

import { decodePng, encodePng, type ProjectBackend } from "@initial-editor/core";
import type { Tileset } from "@initial-editor/ext-tilemap/model";
import { ATLAS_COLUMNS, ATLAS_VERSION, atlasAnimations, DEFAULT_WATER_ANIMATION, type WaterAnimation } from "./atlas";
import { bakeAtlas, chipsetPixels } from "./bake";

export const RM2K_KEY = "rm2k";

export interface Rm2kInfo {
  version: number;
  /** 원본 ChipSet 그림 (프로젝트 경로) */
  chipset: string;
  water: WaterAnimation;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 타일셋의 rm2k 키. 이 확장이 구운 타일셋이 아니거나 판이 다르면 null */
export function rm2kInfo(tileset: Pick<Tileset, "columns" | "extra">): Rm2kInfo | null {
  const v = tileset.extra[RM2K_KEY];
  if (!isRecord(v) || v.version !== ATLAS_VERSION || typeof v.chipset !== "string" || tileset.columns !== ATLAS_COLUMNS) return null;
  return {
    version: ATLAS_VERSION,
    chipset: v.chipset,
    water: {
      pattern: v.water === "loop" ? "loop" : DEFAULT_WATER_ANIMATION.pattern,
      speed: v.waterSpeed === "fast" ? "fast" : DEFAULT_WATER_ANIMATION.speed,
    },
  };
}

/** ChipSet 경로로 아틀라스 경로: resources/tiles/<이름>.rm2k.png */
export function atlasPathFor(chipset: string): string {
  const base = chipset.slice(chipset.lastIndexOf("/") + 1).replace(/\.[^.]*$/, "");
  return `resources/tiles/${base}.rm2k.png`;
}

/** 새 맵의 타일셋 항목 (firstGid 는 맵이 정한다) */
export function rm2kTileset(chipset: string, image: string, water: WaterAnimation = DEFAULT_WATER_ANIMATION): Omit<Tileset, "firstGid"> {
  return {
    image,
    columns: ATLAS_COLUMNS,
    extra: {
      animations: atlasAnimations(water),
      [RM2K_KEY]: { version: ATLAS_VERSION, chipset, water: water.pattern, waterSpeed: water.speed },
    },
  };
}

/** ChipSet 파일을 읽어 구운 아틀라스를 image 에 쓴다. 그림이 ChipSet 이 아니면 ChipsetError */
export async function bakeChipsetFile(backend: Pick<ProjectBackend, "readBinary" | "writeBinary">, chipset: string, image: string): Promise<void> {
  const png = await decodePng(await backend.readBinary(chipset));
  const atlas = bakeAtlas(chipsetPixels(png));
  await backend.writeBinary(image, await encodePng(atlas));
}
