// 팔레트 쪽 둘. RPG Maker 2000 의 팔레트와 같은 순서와 6열이다 (EasyRPG Editor 의 palette_scene.cpp).
//
//   하층 162칸: 물 A1, 물 A2, 깊은 물, 애니메이션 타일 C1..C3, 땅 오토타일 D1..D12, 하층 타일 E0..E143
//   상층 144칸: 상층 타일 F0..F143. F0 은 빈 타일이라 칠하면 타일을 비운다 (값 0)
//
// 오토타일 칸의 값은 대표 칸(rules.ts 의 SAMPLE_LOCALS)이고 칠하면 이웃을 보고 모양을 맞춘다. cellOf 는 맵에서 뜬 gid
// (모양이 맞춰진 칸, 물의 다른 프레임)도 그 지형의 칸으로 찾는다.

import { chipAt, eLocal, fLocal } from "./atlas";
import { ANIM_TILES, D_KINDS, E_TILES, F_TILES, type WaterKind } from "./chipset";
import { SAMPLE_LOCALS } from "./rules";

export const PALETTE_COLUMNS = 6;

export interface Rm2kPaletteCell {
  /** 칠할 값의 타일셋 안 번호. null 이면 빈 칸(값 0) */
  local: number | null;
  /** 칸에 그릴 그림의 타일셋 안 번호 */
  icon: number;
  label: string;
}

export interface Rm2kPalettePage {
  id: "lower" | "upper";
  label: string;
  cells: readonly Rm2kPaletteCell[];
}

const WATER_LABELS: Readonly<Record<WaterKind, string>> = { 0: "물 A1", 1: "물 A2", 2: "깊은 물" };

export const LOWER_PAGE: Rm2kPalettePage = {
  id: "lower",
  label: "하층",
  cells: [
    ...([0, 1, 2] as const).map((k) => ({ local: SAMPLE_LOCALS.water(k), icon: SAMPLE_LOCALS.water(k), label: WATER_LABELS[k] })),
    ...Array.from({ length: ANIM_TILES }, (_, n) => ({ local: SAMPLE_LOCALS.anim(n), icon: SAMPLE_LOCALS.anim(n), label: `애니메이션 타일 C${n + 1}` })),
    ...Array.from({ length: D_KINDS }, (_, n) => ({ local: SAMPLE_LOCALS.d(n), icon: SAMPLE_LOCALS.d(n), label: `오토타일 D${n + 1}` })),
    ...Array.from({ length: E_TILES }, (_, id) => ({ local: eLocal(id), icon: eLocal(id), label: `하층 타일 E${id}` })),
  ],
};

export const UPPER_PAGE: Rm2kPalettePage = {
  id: "upper",
  label: "상층",
  cells: Array.from({ length: F_TILES }, (_, id) => ({ local: id === 0 ? null : fLocal(id), icon: fLocal(id), label: id === 0 ? "빈 타일" : `상층 타일 F${id}` })),
};

export const PALETTE_PAGES: readonly Rm2kPalettePage[] = [LOWER_PAGE, UPPER_PAGE];

/** 타일셋 안 번호가 이 쪽의 몇 번째 칸인가. 없으면 -1 (null 은 빈 칸) */
export function paletteCellOf(page: Rm2kPalettePage, local: number | null): number {
  if (local === null) return page.cells.findIndex((c) => c.local === null);
  const chip = chipAt(local);
  if (!chip) return -1;
  if (page.id === "upper") return chip.kind === "f" ? chip.id : -1;
  switch (chip.kind) {
    case "water":
      return chip.water;
    case "anim":
      return 3 + chip.n;
    case "d":
      return 6 + chip.n;
    case "e":
      return 18 + chip.id;
    default:
      return -1;
  }
}
