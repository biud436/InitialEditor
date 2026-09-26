// 상태 바: 프로젝트 루트, 백엔드 모드, 스크립트 언어, 저장 안 된 문서 수, 감시 상태, 테마.

import { observer } from "mobx-react-lite";
import { MODE_LABELS } from "../editor/backends";
import { useEditor } from "../editor/EditorContext";
import "./StatusBar.css";

const THEME_LABEL = { dark: "다크", light: "라이트" } as const;

export const StatusBar = observer(function StatusBar() {
  const editor = useEditor();
  const project = editor.project;
  const dirty = editor.documents.dirtyDocuments.length;
  const watching = project.isOpen && editor.backend.capabilities.watch;
  const themePref = editor.settings.settings.theme;
  const theme = THEME_LABEL[editor.theme.applied] + (themePref === "system" ? " (시스템)" : "");
  return (
    <div className="statusbar" data-testid="statusbar">
      <span className="statusbar-item statusbar-root" title={project.root || undefined}>
        {project.isOpen ? project.root : "프로젝트 없음"}
      </span>
      <span className="statusbar-item">{MODE_LABELS[editor.mode]}{editor.bridgeUrl ? ` ${editor.bridgeUrl}` : ""}</span>
      <span className="statusbar-item">{project.isOpen ? (project.gameJson.script === "lua" ? "Lua" : "Ruby") : "-"}</span>
      <span className="statusbar-item">{dirty > 0 ? `저장 안 됨 ${dirty}` : "저장됨"}</span>
      <span className="statusbar-item">{watching ? "감시 중" : "감시 없음"}</span>
      <span className="statusbar-spacer" />
      <span className="statusbar-item" data-testid="status-theme">
        {theme}
      </span>
    </div>
  );
});
