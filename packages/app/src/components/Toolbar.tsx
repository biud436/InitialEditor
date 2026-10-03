// 메뉴 바 아래 툴바. 실행과 정지와 리로드는 runner/runCommands.ts 의 커맨드에 묶이고, 비활성 이유는 툴팁에 있다
// (켜져 있어도 설명이 있으면 붙는다: 에디터 안 실행). 실행 중이면 초록 점과 PID(에디터 안이면 그 표시)와 경과 시간이
// 붙는다 (editor.runner). 언어 선택은 game.json 의 script, 씬 선택은 startScene 이고 바꾸면 바로 저장한다.
// 씬 목록은 resources/scenes 의 *.json 이다 (프로젝트의 폴더 캐시라 파일이 생기고 지워지면 따라간다).

import { dirname, SCENES_DIR, type ScriptBackend } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useEditor } from "../editor/EditorContext";
import { PlayIcon, ReloadIcon, StopIcon } from "./icons";
import "./Toolbar.css";

const CommandButton = observer(function CommandButton({ id, children }: { id: string; children: React.ReactNode }) {
  const editor = useEditor();
  const enabled = editor.commands.isEnabled(id);
  const label = editor.commandLabel(id);
  const shortcut = editor.commands.formatShortcut(id);
  // 켜진 단추는 메모(여기서 실행이 거절될 이유 등)가 있으면 그것, 없으면 설명을 보인다. 꺼진 단추는 꺼진 이유
  const hint = enabled ? (editor.commandNote(id) ?? editor.commandHint(id)) : editor.commandHint(id);
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
  return (
    <span className={`toolbar-running${starting ? " starting" : ""}`} data-testid="toolbar-running" title={runner.indicatorTitle}>
      <span className="toolbar-dot" aria-hidden="true" />
      {runner.indicatorText}
    </span>
  );
});

/** resources/scenes 아래 씬 파일의 이름 (확장자 없이) */
function useSceneNames(): string[] {
  const project = useEditor().project;
  const root = project.isOpen ? project.root : null;
  useEffect(() => {
    if (!root) return;
    void project.entries(SCENES_DIR).catch(() => {});
    // 폴더를 아직 못 읽었으면(없던 폴더) 그 안에 파일이 생길 때 다시 읽는다. 읽은 폴더는 프로젝트가 스스로 갱신한다
    return project.events.on("change", (e) => {
      if (dirname(e.path) === SCENES_DIR && !project.folders.has(SCENES_DIR)) void project.refresh(SCENES_DIR).catch(() => {});
    });
  }, [project, root]);
  if (!root) return [];
  const entries = project.folders.get(SCENES_DIR) ?? [];
  return entries.filter((e) => e.kind === "file" && e.name.endsWith(".json")).map((e) => e.name.slice(0, -".json".length));
}

const NO_START_SCENE = "(시작 씬 없음)";

const SceneSelect = observer(function SceneSelect() {
  const editor = useEditor();
  const project = editor.project;
  const names = useSceneNames();
  const start = project.gameJson.startScene;
  // game.json 이 가리키는 씬 파일이 없어도 목록에 남겨 지금 값을 보인다
  const options = start && !names.includes(start) ? [start, ...names] : names;
  const title = !project.isOpen ? "열린 프로젝트 없음" : options.length === 0 ? `${SCENES_DIR} 에 씬 없음` : "게임을 시작할 때 여는 씬 (game.json 의 startScene)";
  return (
    <label className="toolbar-field" title={title}>
      씬
      <select
        className="select"
        value={start ?? ""}
        disabled={!project.isOpen || options.length === 0}
        onChange={(e) => void editor.sceneTools.setStartScene(e.target.value)}
        data-testid="scene-select"
      >
        {!start && (
          <option value="" disabled>
            {NO_START_SCENE}
          </option>
        )}
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
            {names.includes(name) ? "" : " (파일 없음)"}
          </option>
        ))}
      </select>
    </label>
  );
});

export const Toolbar = observer(function Toolbar() {
  const editor = useEditor();
  const project = editor.project;

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
      <div className="toolbar-spacer" />
      <label className="toolbar-field">
        언어
        <select className="select" value={project.gameJson.script} disabled={!project.isOpen} onChange={(e) => onLanguage(e.target.value as ScriptBackend)} data-testid="language-select">
          <option value="lua">Lua</option>
          <option value="mruby">Ruby</option>
        </select>
      </label>
      <SceneSelect />
    </div>
  );
});
