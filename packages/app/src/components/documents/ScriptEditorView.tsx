// 스크립트 문서 뷰 (E1). 문서의 Monaco 모델에 편집기를 붙인다. 옵션(글꼴 크기, 탭 크기, 자동 줄바꿈, 미니맵)은
// 설정에서 오고 바뀌면 바로 반영한다. 탭을 오갈 때 커서와 스크롤은 문서(viewState)에 남긴다. 테마는 전역
// (scripting/themes.ts) 이라 여기서는 고르지 않는다. Monaco 안에서 누르는 단축키는 Monaco 가 먼저 받으므로
// 저장과 프로젝트 찾기와 새 스크립트를 편집기 액션으로도 건다. 탭이 가려져 떨어진 편집기에 남은 초점 상태는
// 초점이 다른 곳으로 옮겨 갈 때 푼다 (scripting/editorFocus.ts).

import type { EditorSettings } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import type { ScriptDocument } from "../../editor/documents/ScriptDocument";
import { useEditor } from "../../editor/EditorContext";
import { releaseStaleFocus } from "../../editor/scripting/editorFocus";
import { languageLabel, monaco } from "../../editor/scripting/monaco";
import "./ScriptEditorView.css";

type EditorOptions = monaco.editor.IEditorOptions & monaco.editor.IGlobalEditorOptions;

export function editorOptionsFrom(s: Pick<EditorSettings, "editorFontSize" | "editorTabSize" | "editorWordWrap" | "editorMinimap">): EditorOptions {
  return {
    fontSize: s.editorFontSize,
    tabSize: s.editorTabSize,
    insertSpaces: true,
    wordWrap: s.editorWordWrap ? "on" : "off",
    minimap: { enabled: s.editorMinimap },
    lineNumbers: "on",
  };
}

function monoFont(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
  return value || "monospace";
}

export const ScriptEditorView = observer(function ScriptEditorView({ doc }: { doc: ScriptDocument }) {
  const editor = useEditor();
  const hostRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const model = doc.model;
  const { editorFontSize, editorTabSize, editorWordWrap, editorMinimap } = editor.settings.settings;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !model) return;
    const code = monaco.editor.create(host, {
      model,
      ...editorOptionsFrom(editor.settings.settings),
      automaticLayout: true,
      fontFamily: monoFont(),
      scrollBeyondLastLine: false,
      renderLineHighlight: "line",
      folding: true,
      suggest: { showWords: true, preview: false },
      quickSuggestions: { other: true, comments: false, strings: false },
      unicodeHighlight: { ambiguousCharacters: false, nonBasicASCII: false },
      fixedOverflowWidgets: true,
    });
    const position = code.getPosition();
    if (position) setCursor({ line: position.lineNumber, column: position.column });
    if (doc.viewState) code.restoreViewState(doc.viewState);
    doc.attachEditor(code);
    codeRef.current = code;
    const run = (id: string) => () => {
      void editor.commands.execute(id);
    };
    const subscriptions: monaco.IDisposable[] = [
      releaseStaleFocus(code),
      code.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, column: e.position.column })),
      code.addAction({ id: "initial.save", label: "저장", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], run: run("file.save") }),
      code.addAction({
        id: "initial.findInProject",
        label: "프로젝트에서 찾기",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
        contextMenuGroupId: "navigation",
        contextMenuOrder: 2,
        run: run("edit.findInProject"),
      }),
      code.addAction({ id: "initial.newScript", label: "새 스크립트", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyN], run: run("file.newScript") }),
    ];
    return () => {
      doc.viewState = code.saveViewState();
      for (const s of subscriptions) s.dispose();
      doc.detachEditor(code);
      codeRef.current = null;
      code.dispose();
    };
  }, [model, doc, editor]);

  useEffect(() => {
    codeRef.current?.updateOptions(editorOptionsFrom({ editorFontSize, editorTabSize, editorWordWrap, editorMinimap }));
  }, [editorFontSize, editorTabSize, editorWordWrap, editorMinimap]);

  // 그래프에서 만든 파일은 읽기 전용이다 (저장하면 그래프가 다시 쓴다)
  const graphSource = doc.graphSource;
  useEffect(() => {
    codeRef.current?.updateOptions({ readOnly: graphSource !== null });
  }, [graphSource, model]);

  return (
    <div className="script-editor" data-testid="script-editor" data-language={doc.language}>
      <div className="doc-header">
        <span className="doc-header-path">{doc.path}</span>
        <span className="doc-header-spacer" />
        {doc.loaded && !doc.error && (
          <span data-testid="script-cursor">
            줄 {cursor.line}, 열 {cursor.column}
          </span>
        )}
        <span>{languageLabel(doc.language)}</span>
        <span className="doc-header-save-state">{doc.dirty ? "저장 안 됨" : "저장됨"}</span>
      </div>
      {graphSource && (
        <div className="script-editor-generated" data-testid="script-generated">
          <span>그래프에서 만든 파일입니다. 이 파일이 아니라 그래프({graphSource})를 편집합니다.</span>
          <button className="btn" onClick={() => void editor.graphSupport.revealGenerated(doc.path ?? "", cursor.line)} data-testid="script-open-graph">
            그래프 열기
          </button>
        </div>
      )}
      {doc.error ? <div className="panel-hint">열기 실패: {doc.error}</div> : !doc.loaded ? <div className="panel-hint">불러오는 중</div> : null}
      <div className="script-editor-host" ref={hostRef} />
    </div>
  );
});
