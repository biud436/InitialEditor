// 새 스크립트 대화상자 (파일 > 새 스크립트, Ctrl+Alt+N). 언어와 종류와 이름을 받아 templates.ts 의 템플릿으로
// scripts/lua/ 나 scripts/ruby/ 아래에 파일을 만들고 연다. 기본 언어는 game.json 의 script.

import { dirname } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useState, type FormEvent } from "react";
import type { Editor } from "../Editor";
import { useEditor } from "../EditorContext";
import { LANGUAGE_LABELS, scriptPathFor, scriptTemplate, TEMPLATE_LABELS, validateScriptName, type TemplateKind, type TemplateLanguage } from "./templates";

export interface NewScriptOptions {
  language: TemplateLanguage;
  kind: TemplateKind;
  name: string;
}

/** 파일을 만들고 트리에 드러내고 연다. 이미 있으면 경고만 하고 false */
export async function createScript(editor: Editor, options: NewScriptOptions): Promise<boolean> {
  const path = scriptPathFor(options.language, options.name);
  try {
    if (await editor.backend.exists(path)) {
      editor.toasts.warn(`이미 있다: ${path}`);
      return false;
    }
    const text = scriptTemplate({ ...options, hooks: editor.scripting.spec.sceneContract });
    await editor.backend.writeText(path, text);
    await editor.project.refresh(dirname(path)).catch(() => {});
    await editor.tree.reveal(path);
    editor.log.info("editor", `스크립트를 만들었다: ${path}`);
    await editor.scripting.openScript(path);
    return true;
  } catch (e) {
    const message = `스크립트를 만들지 못했다: ${(e as Error).message}`;
    editor.log.error("editor", message);
    editor.toasts.error(message);
    return false;
  }
}

const NewScriptForm = observer(function NewScriptForm({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const [language, setLanguage] = useState<TemplateLanguage>(editor.project.gameJson.script === "mruby" ? "ruby" : "lua");
  const [kind, setKind] = useState<TemplateKind>("scene");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const error = validateScriptName(name);
  const path = error ? "" : scriptPathFor(language, name);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (error || busy) return;
    setBusy(true);
    try {
      if (await createScript(editor, { language, kind, name: name.trim() })) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} data-testid="new-script-dialog">
      <div className="modal-body">
        <div className="form-row">
          <label htmlFor="new-script-language">언어</label>
          <select id="new-script-language" className="select" value={language} onChange={(e) => setLanguage(e.target.value as TemplateLanguage)} data-testid="new-script-language">
            {(Object.keys(LANGUAGE_LABELS) as TemplateLanguage[]).map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="new-script-kind">종류</label>
          <select id="new-script-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as TemplateKind)} data-testid="new-script-kind">
            {(Object.keys(TEMPLATE_LABELS) as TemplateKind[]).map((k) => (
              <option key={k} value={k}>
                {TEMPLATE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="new-script-name">이름</label>
          <input
            id="new-script-name"
            className="input"
            value={name}
            placeholder="main 또는 games/flappy (확장자 없이)"
            onChange={(e) => setName(e.target.value)}
            data-autofocus
            autoFocus
            data-testid="new-script-name"
          />
          <div className="form-help">{path ? `만들 파일: ${path}` : name ? error : `scripts/${language === "lua" ? "lua" : "ruby"}/ 아래에 만든다`}</div>
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button type="submit" className="btn btn-primary" disabled={!!error || busy}>
          만들기
        </button>
      </div>
    </form>
  );
});

export function openNewScriptDialog(editor: Editor): Promise<void> {
  return editor.modals.custom({ title: "새 스크립트", width: 460, render: (close) => <NewScriptForm onClose={close} /> });
}
