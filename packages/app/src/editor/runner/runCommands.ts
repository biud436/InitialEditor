// 실행 커맨드 (docs/plans/02-scope-and-screens.md 5절의 표, 실행 갈래). 메뉴(appMenus.ts)와 툴바는 이 id 만 가리킨다.
// 비활성 이유는 setHint 로 툴팁에 간다: 브라우저 모드, 엔진 없음(찾아본 곳), mruby 없음.
// run.fromScene 은 씬 문서(E2)가 생기면 붙는다. 지금은 자리만 있고 비활성이다.

import { SCENE_LATER } from "../appCommands";
import type { Editor } from "../Editor";
import type { RunnerStore } from "./RunnerStore";

export function registerRunCommands(editor: Editor, runner: RunnerStore): void {
  const c = editor.commands;
  c.register({ id: "run.start", label: "실행", category: "run", shortcut: "F5", icon: "play", enabled: () => runner.canRun, run: () => runner.start() });
  editor.setHint("run.start", () => runner.startHint);

  c.register({ id: "run.stop", label: "정지", category: "run", shortcut: "Shift+F5", icon: "stop", enabled: () => runner.isRunning, run: () => runner.stop() });
  editor.setHint("run.stop", () => (runner.isRunning ? undefined : "실행 중이 아니다"));

  c.register({ id: "run.restart", label: "다시 시작", category: "run", enabled: () => runner.isRunning && runner.canRun, run: () => runner.restart() });
  editor.setHint("run.restart", () => (runner.isRunning ? runner.startHint : "실행 중이 아니다"));

  c.register({ id: "run.reload", label: "리로드", category: "run", shortcut: "Ctrl+Shift+R", icon: "reload", enabled: () => runner.canReload, run: () => void runner.reload() });
  editor.setHint("run.reload", () => runner.reloadHint);

  c.register({ id: "run.fromScene", label: "현재 씬부터 실행", category: "run", shortcut: "Ctrl+F5", enabled: () => false, run: () => {} });
  editor.setHint("run.fromScene", () => SCENE_LATER);
}
