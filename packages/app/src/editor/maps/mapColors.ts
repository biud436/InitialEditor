// 맵 뷰와 팔레트가 쓰는 색. 테마 토큰을 읽어 PIXI의 숫자(0xrrggbb)와 캔버스의 CSS 문자열로 준다.
// 오브젝트 표식의 색은 스키마의 color 이름(accent, danger, warning, success, muted)을 토큰으로 옮긴다.

import type { ShapeColor } from "@initial-editor/ext-tilemap/model";
import { cssColorToNumber, readSceneFonts, type SceneFonts, type StyleReader } from "../sceneView/colors";

export const MAP_COLOR_TOKENS = [
  "scene-bg",
  "scene-grid",
  "scene-grid-major",
  "scene-selection",
  "accent",
  "danger",
  "warning",
  "success",
  "fg",
  "fg-muted",
  "border",
  "bg-panel",
] as const;
export type MapColorToken = (typeof MAP_COLOR_TOKENS)[number];
export type MapColors = Record<MapColorToken, number>;

export interface MapTheme {
  colors: MapColors;
  fonts: SceneFonts;
}

export function readMapColors(style: StyleReader): MapColors {
  const out = {} as MapColors;
  for (const name of MAP_COLOR_TOKENS) out[name] = cssColorToNumber(style.getPropertyValue(`--${name}`), name === "scene-bg" ? 0x000000 : 0xffffff);
  return out;
}

export function readMapTheme(root: Element = document.documentElement): MapTheme {
  const style = getComputedStyle(root);
  return { colors: readMapColors(style), fonts: readSceneFonts(style) };
}

/** 스키마 색 이름에 맞는 토큰. 모르는 이름과 스키마가 없는 타입은 fg-muted */
export function shapeColorToken(color: ShapeColor | undefined): MapColorToken {
  switch (color) {
    case "accent":
    case "danger":
    case "warning":
    case "success":
      return color;
    default:
      return "fg-muted";
  }
}

/** 캔버스 2D 용 CSS 색 문자열 (토큰 값을 그대로) */
export function cssToken(name: string, root: Element = document.documentElement): string {
  return getComputedStyle(root).getPropertyValue(`--${name}`).trim();
}
