// Monaco 의 진입점. 전체(editor.main)가 아니라 쓰는 기능만 골라 담아 번들을 줄인다:
//   편집기 코어 + 찾기와 바꾸기, 자동완성(suggest), 시그니처 도움말, 호버, 스니펫, 접기, 주석 토글, 다중 커서,
//   괄호 짝, 들여쓰기, 줄 조작, 단어 강조, 오른쪽 클릭 메뉴, 클립보드.
//   언어는 Lua, Ruby, Markdown (basic-languages) 과 JSON (진단 워커 포함, 컴포넌트 매개변수 선언 파일의 스키마).
// 워커는 Vite 의 ?worker 로 (vite.config.ts 는 손대지 않아도 된다). 다른 모듈은 monaco 를 여기서만 가져온다.

import "monaco-editor/esm/vs/editor/browser/coreCommands.js";
import "monaco-editor/esm/vs/editor/browser/widget/codeEditor/codeEditorWidget.js";
import "monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js";
import "monaco-editor/esm/vs/editor/contrib/caretOperations/browser/caretOperations.js";
import "monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js";
import "monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu.js";
import "monaco-editor/esm/vs/editor/contrib/cursorUndo/browser/cursorUndo.js";
import "monaco-editor/esm/vs/editor/contrib/find/browser/findController.js";
import "monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js";
import "monaco-editor/esm/vs/editor/contrib/gotoError/browser/gotoError.js";
import "monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js";
import "monaco-editor/esm/vs/editor/contrib/indentation/browser/indentation.js";
import "monaco-editor/esm/vs/editor/contrib/lineSelection/browser/lineSelection.js";
import "monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js";
import "monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js";
import "monaco-editor/esm/vs/editor/contrib/parameterHints/browser/parameterHints.js";
import "monaco-editor/esm/vs/editor/contrib/smartSelect/browser/smartSelect.js";
import "monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js";
import "monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js";
import "monaco-editor/esm/vs/editor/contrib/tokenization/browser/tokenization.js";
import "monaco-editor/esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.js";
import "monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js";
import "monaco-editor/esm/vs/editor/contrib/wordPartOperations/browser/wordPartOperations.js";
import "monaco-editor/esm/vs/editor/common/standaloneStrings.js";
import "monaco-editor/esm/vs/base/browser/ui/codicons/codiconStyles.js";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/lua/lua.contribution";
import "monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution";
import "monaco-editor/esm/vs/language/json/monaco.contribution";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import { DECLARATION_FILE_MATCH, DECLARATION_SCHEMA, DECLARATION_SCHEMA_URI } from "./declarationSchema";

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

if (typeof window !== "undefined" && !window.MonacoEnvironment) {
  window.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      if (label === "json") return new jsonWorker();
      return new editorWorker();
    },
  };
}

// 컴포넌트 매개변수 선언 파일의 스키마 (진단과 자동 완성)
monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  enableSchemaRequest: false,
  // 선언이 틀리면 엔진이 씬을 불러오지 못하므로 스키마 위반도 오류로 표시한다
  schemaValidation: "error",
  schemas: [{ uri: DECLARATION_SCHEMA_URI, fileMatch: DECLARATION_FILE_MATCH, schema: DECLARATION_SCHEMA }],
});

/** 확장자로 Monaco 언어 id 를 고른다. 모르는 것은 plaintext */
export function languageForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case "lua":
      return "lua";
    case "rb":
      return "ruby";
    case "json":
      return "json";
    case "md":
      return "markdown";
    default:
      return "plaintext";
  }
}

/** 언어 id 의 표시 이름 (편집기 머리) */
export function languageLabel(language: string): string {
  switch (language) {
    case "lua":
      return "Lua";
    case "ruby":
      return "Ruby";
    case "json":
      return "JSON";
    case "markdown":
      return "Markdown";
    default:
      return "텍스트";
  }
}

export { monaco };
