// 씬 뷰가 쓰는 색. 토큰(tokens.css)을 getComputedStyle 로 읽어 PIXI 가 받는 숫자로 바꾼다 (02-scope-and-screens.md 6절).
// 색 리터럴은 여기 없다. 토큰이 비어 있으면(테스트 환경 등) 검정이나 흰색으로 떨어진다: 0 과 0xffffff 는 색이 아니라 없음의 표시다.

import { toHex } from "../scripting/themeColors";

export const SCENE_COLOR_TOKENS = ["scene-bg", "scene-grid", "scene-grid-major", "scene-selection", "scene-camera", "accent", "fg", "fg-muted", "danger", "border"] as const;
export type SceneColorToken = (typeof SCENE_COLOR_TOKENS)[number];

export type SceneColors = Record<SceneColorToken, number>;

export const FONT_TOKENS = ["font-ui", "font-mono"] as const;
export type SceneFonts = Record<(typeof FONT_TOKENS)[number], string>;

/** CSS 색 문자열(hex 나 rgb 함수 꼴)을 PIXI 의 0xrrggbb 숫자로. 못 읽으면 fallback */
export function cssColorToNumber(css: string, fallback: number): number {
  const hex = toHex(css);
  if (!hex) return fallback;
  return parseInt(hex.slice(1, 7), 16);
}

export interface StyleReader {
  getPropertyValue(name: string): string;
}

/** 지금 적용된 테마의 씬 색 한 벌 */
export function readSceneColors(style: StyleReader): SceneColors {
  const out = {} as SceneColors;
  for (const name of SCENE_COLOR_TOKENS) {
    // 바탕은 없으면 검정, 선은 없으면 흰색: 토큰이 빠져도 뭔가는 보이게
    const fallback = name === "scene-bg" ? 0x000000 : 0xffffff;
    out[name] = cssColorToNumber(style.getPropertyValue(`--${name}`), fallback);
  }
  return out;
}

export function readSceneFonts(style: StyleReader): SceneFonts {
  const ui = style.getPropertyValue("--font-ui").trim();
  const mono = style.getPropertyValue("--font-mono").trim();
  return { "font-ui": ui || "sans-serif", "font-mono": mono || "monospace" };
}

export function readSceneTheme(root: Element = document.documentElement): { colors: SceneColors; fonts: SceneFonts } {
  const style = getComputedStyle(root);
  return { colors: readSceneColors(style), fonts: readSceneFonts(style) };
}
