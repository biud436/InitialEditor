// 새 프로젝트 대화상자 (파일 > 새 프로젝트, Tauri 모드). 템플릿(빈 프로젝트, 플래피버드), 언어(Lua, Ruby), 이름을
// 받는다. 폴더는 그 전에 OS 대화상자로 골랐다 (newProject.ts). 파일 쓰기는 projectTemplates.ts 가 한다.

import type { ScriptBackend } from "@initial-editor/core";
import { useState, type FormEvent } from "react";
import type { Editor } from "../Editor";
import type { ProjectTemplateOptions } from "./projectTemplates";
import { TEMPLATE_LABELS, type ProjectTemplateId } from "./templateManifest";

const LANGUAGE_LABELS: Record<ScriptBackend, string> = { lua: "Lua", mruby: "Ruby (mruby)" };

function NewProjectForm({ initialName, folder, onSubmit, onCancel }: { initialName: string; folder: string; onSubmit: (o: ProjectTemplateOptions) => void; onCancel: () => void }) {
  const [template, setTemplate] = useState<ProjectTemplateId>("empty");
  const [language, setLanguage] = useState<ScriptBackend>("lua");
  const [name, setName] = useState(initialName);
  const error = name.trim() === "" ? "이름을 적는다" : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (error) return;
    onSubmit({ template, language, name: name.trim() });
  };
  return (
    <form onSubmit={submit} data-testid="new-project-dialog">
      <div className="modal-body">
        <div className="form-row">
          <label htmlFor="new-project-folder">폴더</label>
          <div id="new-project-folder" className="muted" title={folder}>
            {folder}
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="new-project-name">이름</label>
          <input id="new-project-name" className="input" value={name} onChange={(e) => setName(e.target.value)} data-autofocus autoFocus data-testid="new-project-name" />
          <div className="form-help">game.json 의 name</div>
        </div>
        <div className="form-row">
          <label htmlFor="new-project-template">템플릿</label>
          <select id="new-project-template" className="select" value={template} onChange={(e) => setTemplate(e.target.value as ProjectTemplateId)} data-testid="new-project-template">
            {(Object.keys(TEMPLATE_LABELS) as ProjectTemplateId[]).map((t) => (
              <option key={t} value={t}>
                {TEMPLATE_LABELS[t]}
              </option>
            ))}
          </select>
          <div className="form-help">{template === "empty" ? "씬 하나(resources/scenes/main.json)와 씬 로더. 진입점이 game.json 의 startScene 을 연다" : "엔진 저장소의 플래피버드를 씬(resources/scenes/flappy.json)과 컴포넌트 다섯으로 옮긴 것"}</div>
        </div>
        <div className="form-row">
          <label htmlFor="new-project-language">언어</label>
          <select id="new-project-language" className="select" value={language} onChange={(e) => setLanguage(e.target.value as ScriptBackend)} data-testid="new-project-language">
            {(Object.keys(LANGUAGE_LABELS) as ScriptBackend[]).map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABELS[l]}
              </option>
            ))}
          </select>
          <div className="form-help">{language === "lua" ? "scripts/lua/ 에 main.lua 와 씬 로더" : "scripts/ruby/ 에 main.rb 와 씬 로더. 엔진 빌드에 mruby 가 있어야 돈다"}</div>
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="btn btn-primary" disabled={!!error} data-testid="new-project-ok">
          만들기
        </button>
      </div>
    </form>
  );
}

/** 대화상자를 띄우고 고른 것을 돌려준다. 취소면 null */
export function openNewProjectDialog(editor: Editor, defaults: { name: string; folder: string }): Promise<ProjectTemplateOptions | null> {
  return new Promise((resolve) => {
    let result: ProjectTemplateOptions | null = null;
    void editor.modals
      .custom({
        title: "새 프로젝트",
        width: 500,
        render: (close) => (
          <NewProjectForm
            initialName={defaults.name}
            folder={defaults.folder}
            onSubmit={(o) => {
              result = o;
              close();
            }}
            onCancel={close}
          />
        ),
      })
      .then(() => resolve(result));
  });
}
