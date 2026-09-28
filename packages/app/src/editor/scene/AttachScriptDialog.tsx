// 스크립트 붙이기 대화상자 (인스펙터의 "스크립트 붙이기"). 논리 이름(components/bird)을 받고, 프로젝트에 있는
// 컴포넌트 파일을 제안한다 (매개변수 선언이 있는 것 먼저, 이미 붙은 것은 빼고). 파일이 없으면 컴포넌트 템플릿(scripting/templates.ts)으로 만들고 트리에 드러낸 뒤 붙인다.
// 언어는 game.json 의 script 다 (Lua 면 scripts/lua/<이름>.lua, Ruby 면 scripts/ruby/<이름>.rb).

import { dirname } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useState, type FormEvent } from "react";
import type { Editor } from "../Editor";
import { useEditor } from "../EditorContext";
import { scriptTemplate } from "../scripting/templates";
import { validateLogicalScriptName } from "./SceneTools";

export interface AttachScriptOptions {
  objectId: string;
  logicalName: string;
  /** 파일이 없으면 컴포넌트 템플릿으로 만든다 */
  createIfMissing: boolean;
}

/** 붙인다 (필요하면 파일을 먼저 만든다). 성공하면 true */
export async function attachScript(editor: Editor, options: AttachScriptOptions): Promise<boolean> {
  const tools = editor.sceneTools;
  const name = options.logicalName.trim().replace(/^\/+|\/+$/g, "");
  const path = tools.scriptPath(name);
  const language = editor.project.gameJson.script === "mruby" ? "ruby" : "lua";
  try {
    const exists = await editor.backend.exists(path);
    if (!exists) {
      if (!options.createIfMissing) {
        editor.toasts.warn(`파일 없음: ${path}`);
        return false;
      }
      const text = scriptTemplate({ language, kind: "component", name, hooks: editor.scripting.spec.sceneContract });
      await editor.backend.writeText(path, text);
      await editor.project.refresh(dirname(path)).catch(() => {});
      await editor.tree.reveal(path);
      editor.log.info("editor", `컴포넌트 생성됨: ${path}`);
      tools.assets.schedule();
    }
  } catch (e) {
    const message = `스크립트 생성 실패: ${(e as Error).message}`;
    editor.log.error("editor", message);
    editor.toasts.error(message);
    return false;
  }
  return tools.attachScript(options.objectId, name);
}

const AttachScriptForm = observer(function AttachScriptForm({ objectId, onClose }: { objectId: string; onClose: () => void }) {
  const editor = useEditor();
  const tools = editor.sceneTools;
  const language = editor.project.gameJson.script;
  const [name, setName] = useState("");
  const [create, setCreate] = useState(true);
  const [busy, setBusy] = useState(false);
  const declared = new Set(tools.assets.declaredComponents);
  const attached = new Set(tools.activeScene?.scene.find(objectId)?.scripts ?? []);
  const files = tools.assets.components(language).filter((s) => !attached.has(s));
  const suggestions = [...files.filter((s) => declared.has(s)), ...files.filter((s) => !declared.has(s))];
  const declaredCount = suggestions.filter((s) => declared.has(s)).length;
  const error = validateLogicalScriptName(name);
  const path = error ? "" : tools.scriptPath(name.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (error || busy) return;
    setBusy(true);
    try {
      if (await attachScript(editor, { objectId, logicalName: name, createIfMissing: create })) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} data-testid="attach-script-dialog">
      <div className="modal-body">
        <div className="form-row">
          <label htmlFor="attach-script-name">논리 이름</label>
          <input id="attach-script-name" className="input" list="attach-script-suggestions" value={name} placeholder="components/player" onChange={(e) => setName(e.target.value)} data-autofocus autoFocus data-testid="attach-script-name" />
          <datalist id="attach-script-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <div className="form-help">{path ? `파일: ${path}` : name ? error : `기존 컴포넌트 ${suggestions.length}개 (매개변수 선언 ${declaredCount}개). scripts/${language === "mruby" ? "ruby" : "lua"}/ 기준 상대 경로, 확장자 제외`}</div>
        </div>
        <div className="form-row">
          <label htmlFor="attach-script-create">파일이 없으면 생성</label>
          <label className="attach-script-check">
            <input id="attach-script-create" type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} data-testid="attach-script-create" /> 파일이 없으면 컴포넌트 템플릿으로 생성
          </label>
        </div>
        {suggestions.length > 0 && (
          <div className="attach-script-suggestions" data-testid="attach-script-suggestions">
            {suggestions.map((s) => (
              <button key={s} type="button" className="btn btn-ghost attach-script-suggestion" onClick={() => setName(s)} data-declared={declared.has(s) || undefined} title={declared.has(s) ? `매개변수 선언: scripts/${s}.json` : undefined}>
                {s}
                {declared.has(s) && <span className="attach-script-tag">매개변수</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button type="submit" className="btn btn-primary" disabled={!!error || busy} data-testid="attach-script-ok">
          추가
        </button>
      </div>
    </form>
  );
});

export function openAttachScriptDialog(editor: Editor, objectId: string): Promise<void> {
  return editor.modals.custom({ title: `스크립트 추가: ${objectId}`, width: 480, render: (close) => <AttachScriptForm objectId={objectId} onClose={close} /> });
}
