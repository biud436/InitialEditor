// 맵 편집 (E3). 맵 문서 열기(openPath 감싸기), PIXI 8 맵 뷰(MapRenderer), 도구, 팔레트와 레이어 패널의 상태, 맵 커맨드.
import type { Editor } from "../Editor";
import { MapSupport } from "./MapSupport";

export { MapSupport, type WorldPoint } from "./MapSupport";
export { MapRenderer, type MapRendererDeps } from "./MapRenderer";
export { MapViewState, PALETTE_ZOOMS } from "./mapViewState";
export { readMapTheme, cssToken, type MapTheme } from "./mapColors";

export function installMapSupport(editor: Editor): MapSupport {
  const support = new MapSupport(editor);
  editor.mapSupport = support;
  support.install();
  return support;
}
