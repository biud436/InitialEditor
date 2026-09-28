// 새 프로젝트 대화상자 (파일 > 새 프로젝트). 템플릿(빈 프로젝트, 플래피버드, 타일맵, RPG 데모), 언어(Lua, Ruby), 이름을
// 받는다. 폴더는 그 전에 OS 대화상자로 골랐다 (newProject.ts). 파일 쓰기는 projectTemplates.ts 가 한다.

import type { ScriptBackend } from "@initial-editor/core";
import { useState, type FormEvent } from "react";
import type { Editor } from "../Editor";
import type { ProjectTemplateOptions } from "./projectTemplates";
import { TEMPLATE_LABELS, TEMPLATE_LANGUAGE, type ProjectTemplateId } from "./templateManifest";

const LANGUAGE_LABELS: Record<ScriptBackend, string> = { lua: "Lua", mruby: "Ruby (mruby)" };

/** 템플릿 목록 아래의 설명 */
export const TEMPLATE_HELP: Record<ProjectTemplateId, string> = {
  empty: "씬 파일 1개(resources/scenes/main.json)와 씬 로더를 만듭니다. 진입점 스크립트에서 game.json의 startScene에 지정된 씬을 불러옵니다.",
  flappy: "엔진 저장소의 플래피버드를 씬(resources/scenes/flappy.json)과 컴포넌트 5개로 구성한 템플릿입니다",
  tilemap: "타일셋과 맵 1개(resources/maps/start.json), 맵을 여는 씬, 맵 오브젝트 스키마를 만듭니다. 맵을 칠한 뒤 F5를 눌러 실행할 수 있습니다.",
  rpg: "엔진의 RPG 데모 「떠나기 전에」입니다. 타이틀 화면, 항구 마을과 여관 맵, 이벤트와 대화, 아이템이 들어 있습니다. 맵 탭에서 이벤트를 편집하고 F5를 눌러 실행할 수 있습니다.",
};

export function NewProjectForm({
  initialName,
  folder,
  rubyNote,
  onSubmit,
  onCancel,
}: {
  initialName: string;
  folder: string;
  /** Ruby 를 고르면 보일 안내 (웹판에서 웹 엔진에 mruby 가 없을 때, newProject.ts) */
  rubyNote?: string | null;
  onSubmit: (o: ProjectTemplateOptions) => void;
  onCancel: () => void;
}) {
  const [template, setTemplate] = useState<ProjectTemplateId>("empty");
  const [chosenLanguage, setLanguage] = useState<ScriptBackend>("lua");
  // RPG 데모처럼 한 언어로만 만드는 템플릿이면 그 언어로 고정한다
  const fixedLanguage = TEMPLATE_LANGUAGE[template];
  const language: ScriptBackend = fixedLanguage === "lua" ? "lua" : fixedLanguage === "ruby" ? "mruby" : chosenLanguage;
  const [name, setName] = useState(initialName);
  const error = name.trim() === "" ? "이름 비어 있음" : null;
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
          <div className="form-help" data-testid="new-project-template-help">
            {TEMPLATE_HELP[template]}
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="new-project-language">언어</label>
          <select id="new-project-language" className="select" value={language} onChange={(e) => setLanguage(e.target.value as ScriptBackend)} disabled={fixedLanguage !== undefined} data-testid="new-project-language">
            {(Object.keys(LANGUAGE_LABELS) as ScriptBackend[]).map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABELS[l]}
              </option>
            ))}
          </select>
          <div className="form-help" data-testid="new-project-language-help">{fixedLanguage ? "이 템플릿은 Lua로만 만듭니다 (RPG 이벤트 실행기가 Lua에만 있습니다)" : language === "lua" ? "scripts/lua/에 main.lua와 씬 로더를 만듭니다" : "scripts/ruby/에 main.rb와 씬 로더를 만듭니다. mruby가 포함된 엔진 빌드가 필요합니다."}</div>
          {language === "mruby" && rubyNote && (
            <div className="form-help new-project-note" data-testid="new-project-ruby-note">
              {rubyNote}
            </div>
          )}
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
export function openNewProjectDialog(editor: Editor, defaults: { name: string; folder: string; rubyNote?: string | null }): Promise<ProjectTemplateOptions | null> {
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
            rubyNote={defaults.rubyNote}
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
