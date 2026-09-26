// E2 씬 도구의 진입점. Editor.start() 가 installSceneTools 를 부른다 (씬 뷰 installSceneSupport 뒤).
//   - 코어 오브젝트 타입 셋(node, sprite, text)을 레지스트리에 넣는다 (coreTypes.tsx)
//   - SceneTools 저장소 (활성 씬, 클립보드, 프로젝트 자산 목록, 오브젝트 조작)
//   - 씬 커맨드와 메뉴 (sceneCommands.ts). 계층과 인스펙터 패널은 components/panels/ 에서 editor.sceneTools 를 본다
//   - 새 프로젝트 템플릿 (projectTemplates.ts, newProject.ts 가 쓴다)

import type { Editor } from "../Editor";
import { registerCoreObjectTypes } from "./coreTypes";
import { registerSceneCommands } from "./sceneCommands";
import { SceneTools } from "./SceneTools";

export type { SceneTools } from "./SceneTools";
export { writeProjectTemplate } from "./projectTemplates";
export type { ProjectTemplateOptions } from "./projectTemplates";
export { TEMPLATE_LABELS, type ProjectTemplateId } from "./templateManifest";

export function installSceneTools(editor: Editor): void {
  registerCoreObjectTypes(editor.registries);
  const tools = new SceneTools(editor);
  editor.sceneTools = tools;
  tools.install();
  registerSceneCommands(editor, tools);
}
