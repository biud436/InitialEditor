// E1 스크립트 편집 지원의 진입점. Editor.start() 가 installScriptSupport 를 부른다.
// Monaco 문서(documents/ScriptDocument.ts), 자동완성(completion.ts), 찾기(find.ts), 새 스크립트(templates.ts)가 여기 붙는다.

import type { Editor } from "../Editor";
import { ScriptSupport } from "./ScriptSupport";

export type { ScriptSupport } from "./ScriptSupport";

export function installScriptSupport(editor: Editor): void {
  const support = new ScriptSupport(editor);
  editor.scripting = support;
  support.install();
}
