// 메뉴 바 아래 툴바. 실행과 정지와 리로드는 runner/runCommands.ts 의 커맨드에 묶이고, 비활성 이유는 툴팁에 있다.
// 실행 중이면 초록 점과 PID 와 경과 시간이 붙는다 (editor.runner). 언어 선택은 game.json 의 script 이고 바꾸면
// 바로 저장한다. 씬 선택은 E2 의 자리다.

import type { ScriptBackend } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useEditor } from "../editor/EditorContext";
import { PlayIcon, ReloadIcon, StopIcon } from "./icons";
import "./Toolbar.css";

const CommandButton = observer(function CommandButton({ id, children }: { id: string; children: React.ReactNode }) {
  const editor = useEditor();
  const enabled = editor.commands.isEnabled(id);
  const label = editor.commandLabel(id);
  const shortcut = editor.commands.formatShortcut(id);
  const hint = enabled ? editor.commandNote(id) : editor.commandHint(id);
  const title = [label, shortcut ? `(${shortcut})` : "", hint ? `: ${hint}` : ""].filter(Boolean).join(" ");
  return (
    <span className="toolbar-tip" title={title}>
      <button type="button" className="toolbar-button" disabled={!enabled} aria-label={label} onClick={() => void editor.commands.execute(id)} data-command={id}>
        {children}
        <span>{label}</span>
      </button>
    </span>
  );
});

const RunningIndicator = observer(function RunningIndicator() {
  const runner = useEditor().runner;
  if (!runner.isRunning) return null;
  const starting = runner.state === "starting";
  const title = starting ? "엔진을 띄우는 중" : `${runner.enginePath ?? "엔진"} 실행 중 (PID ${runner.pid ?? "?"})`;
  return (
    <span className={`toolbar-running${starting ? " starting" : ""}`} data-testid="toolbar-running" title={title}>
      <span className="toolbar-dot" aria-hidden="true" />
      {starting ? "시작 중" : `PID ${runner.pid ?? "?"} ${runner.elapsedText}`}
    </span>
  );
});

export const Toolbar = observer(function Toolbar() {
  const editor = useEditor();
  const project = editor.project;
  const tools = [...editor.registries.tools.values()];

  const onLanguage = (script: ScriptBackend) => {
    void editor.commands.execute(script === "lua" ? "run.language.lua" : "run.language.mruby");
  };

  return (
    <div className="toolbar" data-testid="toolbar">
      <div className="toolbar-group">
        <CommandButton id="run.start">
          <PlayIcon />
        </CommandButton>
        <CommandButton id="run.stop">
          <StopIcon />
        </CommandButton>
        <CommandButton id="run.reload">
          <ReloadIcon />
        </CommandButton>
        <RunningIndicator />
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group" aria-label="도구">
        <span className="toolbar-caption">도구</span>
        <button type="button" className="toolbar-button" disabled title="선택: E2 에서 붙는다">
          선택
        </button>
        <button type="button" className="toolbar-button" disabled title="이동: E2 에서 붙는다">
          이동
        </button>
        {tools.map((t) => (
          <button key={t.id} type="button" className="toolbar-button" disabled title={`${t.label}: 확장 도구는 E2 씬 뷰에서 붙는다`}>
            {t.label}
          </button>
        ))}
        {tools.length === 0 && <span className="toolbar-caption muted">확장 도구 자리</span>}
      </div>
      <div className="toolbar-spacer" />
      <label className="toolbar-field">
        언어
        <select className="select" value={project.gameJson.script} disabled={!project.isOpen} onChange={(e) => onLanguage(e.target.value as ScriptBackend)} data-testid="language-select">
          <option value="lua">Lua</option>
          <option value="mruby">Ruby</option>
        </select>
      </label>
      <label className="toolbar-field">
        씬
        <select className="select" disabled title="씬 선택은 E2 에서 붙는다">
          <option>{project.gameJson.startScene ?? "(E2)"}</option>
        </select>
      </label>
    </div>
  );
});
