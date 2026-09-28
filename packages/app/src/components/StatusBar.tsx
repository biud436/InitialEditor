// 상태 바: 프로젝트 루트, 백엔드 모드, 스크립트 언어, 저장 안 된 문서 수, 감시 상태, 엔진 상태(E1 실행기), 테마.

import { observer } from "mobx-react-lite";
import { MODE_LABELS } from "../editor/backends";
import { useEditor } from "../editor/EditorContext";
import "./StatusBar.css";

const THEME_LABEL = { dark: "다크", light: "라이트" } as const;

/** 엔진: 없음 / 대기 / 실행 중 PID 1234 00:42 / 종료 코드 1 (문구는 RunnerStore.statusText) */
const EngineStatus = observer(function EngineStatus() {
  const runner = useEditor().runner;
  const crashed = runner.state === "idle" && runner.exitCode !== null && runner.exitCode !== 0;
  const className = ["statusbar-item", "statusbar-engine", runner.isRunning ? "running" : "", crashed ? "failed" : ""].filter(Boolean).join(" ");
  return (
    <span className={className} data-testid="status-engine" title={runner.statusTitle}>
      {runner.statusText}
    </span>
  );
});

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
        {project.isOpen ? project.root : "열린 프로젝트 없음"}
      </span>
      <span className="statusbar-item">{MODE_LABELS[editor.mode]}{editor.bridgeUrl ? ` ${editor.bridgeUrl}` : ""}</span>
      <span className="statusbar-item">{project.isOpen ? (project.gameJson.script === "lua" ? "Lua" : "Ruby") : "-"}</span>
      <span className="statusbar-item">{dirty > 0 ? `저장 안 된 문서 ${dirty}개` : "저장됨"}</span>
      <span className="statusbar-item">{watching ? "파일 감시 중" : "파일 감시 안 함"}</span>
      <EngineStatus />
      <span className="statusbar-spacer" />
      <span className="statusbar-item" data-testid="status-theme">
        {theme}
      </span>
    </div>
  );
});
