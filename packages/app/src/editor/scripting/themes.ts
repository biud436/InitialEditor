// Monaco 테마를 토큰에서 정의하고 테마가 바뀔 때 다시 적용한다 (02-scope-and-screens.md 6절).
// ThemeController.applied 를 mobx reaction 으로 듣는다: apply() 가 data-theme 를 같은 액션에서 바꾸므로
// reaction 이 돌 때 getComputedStyle 은 이미 새 토큰을 돌려준다.

import { reaction } from "mobx";
import type { ThemeController } from "../../theme/ThemeController";
import { monaco } from "./monaco";
import { buildMonacoTheme, readThemeTokens } from "./themeColors";

export const MONACO_THEME_NAMES = { dark: "initial-dark", light: "initial-light" } as const;

/** 지금 적용된 테마의 토큰으로 Monaco 테마 하나를 (다시) 정의하고 켠다 */
export function applyMonacoTheme(applied: "dark" | "light", root: Element = document.documentElement): string {
  const name = MONACO_THEME_NAMES[applied];
  const tokens = readThemeTokens(getComputedStyle(root));
  monaco.editor.defineTheme(name, buildMonacoTheme(applied === "dark" ? "vs-dark" : "vs", tokens));
  monaco.editor.setTheme(name);
  return name;
}

/** 테마 컨트롤러를 따라간다. 돌려주는 함수로 뗀다 */
export function installMonacoTheme(theme: ThemeController): () => void {
  return reaction(
    () => theme.applied,
    (applied) => applyMonacoTheme(applied),
    { fireImmediately: true },
  );
}
