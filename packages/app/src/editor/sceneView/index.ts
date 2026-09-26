// E2 씬 뷰의 진입점. 씬 문서 열기(openPath 감싸기), PIXI 8 씬 뷰(SceneRenderer), 격자와 스냅과 줌 커맨드가 여기 붙는다.
import type { Editor } from "../Editor";
import { SceneSupport } from "./SceneSupport";

export { SceneSupport, isScenePath } from "./SceneSupport";
export { SceneRenderer, type SceneNodeContext } from "./SceneRenderer";
export { SceneViewState, GRID_SIZES } from "./viewState";
export { readSceneTheme } from "./colors";

export function installSceneSupport(editor: Editor): SceneSupport {
  const support = new SceneSupport(editor);
  editor.sceneSupport = support;
  support.install();
  return support;
}
