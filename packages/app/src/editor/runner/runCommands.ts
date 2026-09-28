// 실행 커맨드 (docs/plans/02-scope-and-screens.md 5절의 표, 실행 갈래). 메뉴(appMenus.ts)와 툴바는 이 id 만 가리킨다.
// 비활성 이유는 setHint 로 툴팁에 간다: 엔진 없음(찾아본 곳), mruby 없음. 실행이 켜져 있으면 에디터 안 실행인지를 적는다.
// run.fromScene (Ctrl+F5) 은 활성 탭이 씬 문서일 때 그 씬 이름을 INITIAL2D_SCENE 으로 넘겨 띄운다 (E2).
// 씬 로더(scripts/*/scene_loader)가 그 변수를 game.json 의 startScene 보다 먼저 본다.
// 활성 탭이 맵 문서면 Ctrl+F5는 맵의 여기서 실행(map.playHere, maps/objectTools/commands.ts)으로 넘어가고,
// 켜짐과 안내와 툴팁도 그 커맨드의 것을 따른다.
// 실행, 현재 씬부터 실행, 다시 시작은 저장 안 된 문서가 있으면 먼저 묻는다 (게임은 디스크의 파일을 읽는다).

import { SceneDocument, sceneNameFromPath } from "@initial-editor/core";
import { MAP_KIND } from "@initial-editor/ext-tilemap/model";
import { saveBeforeDiskAction, type DirtyAsk } from "../dirtyChoice";
import type { Editor } from "../Editor";
import type { RunnerStore } from "./RunnerStore";

const NEED_SCENE_TAB = "활성 씬 탭 없음";
const MAP_PLAY_HERE = "map.playHere";
export const RUN_DIRTY_TITLE = "저장 안 된 문서";
export const RUN_DIRTY_SAVE = "모두 저장하고 실행";
export const RUN_DIRTY_KEEP = "저장하지 않고 실행";

/** 저장 안 된 문서의 이름을 셋까지 적는다 */
export function runDirtyMessage(titles: readonly string[]): string {
  const shown = titles.slice(0, 3).join(", ") + (titles.length > 3 ? ` 외 ${titles.length - 3}개` : "");
  return `저장 안 된 문서 ${titles.length}개 (${shown}). 게임은 디스크의 파일을 읽으므로 저장하지 않은 변경은 실행에 반영되지 않음`;
}

export function runDirtyAsk(titles: readonly string[]): DirtyAsk {
  return { title: RUN_DIRTY_TITLE, message: runDirtyMessage(titles), keepLabel: RUN_DIRTY_KEEP, saveLabel: RUN_DIRTY_SAVE, testId: "run-dirty", focus: "save" };
}

export function registerRunCommands(editor: Editor, runner: RunnerStore): void {
  const c = editor.commands;
  const saved = () => saveBeforeDiskAction(editor, runDirtyAsk);
  c.register({
    id: "run.start",
    label: "실행",
    category: "run",
    shortcut: "F5",
    icon: "play",
    enabled: () => runner.canRun,
    run: async () => {
      if (await saved()) await runner.start();
    },
  });
  editor.setHint("run.start", () => runner.startHint ?? runner.modeHint);

  c.register({ id: "run.stop", label: "정지", category: "run", shortcut: "Shift+F5", icon: "stop", enabled: () => runner.isRunning, run: () => runner.stop() });
  editor.setHint("run.stop", () => (runner.isRunning ? undefined : "실행 중인 게임 없음"));

  c.register({
    id: "run.restart",
    label: "다시 시작",
    category: "run",
    enabled: () => runner.isRunning && runner.canRun,
    run: async () => {
      if (await saved()) await runner.restart();
    },
  });
  editor.setHint("run.restart", () => (runner.isRunning ? runner.startHint : "실행 중인 게임 없음"));

  c.register({ id: "run.reload", label: "리로드", category: "run", shortcut: "Ctrl+Shift+R", icon: "reload", enabled: () => runner.canReload, run: () => void runner.reload() });
  editor.setHint("run.reload", () => runner.reloadHint);

  /** 활성 탭이 씬 문서면 그 씬 이름 */
  const activeSceneName = (): string | null => {
    const doc = editor.documents.active;
    return doc instanceof SceneDocument && doc.path ? sceneNameFromPath(doc.path) : null;
  };
  const mapActive = () => editor.documents.active?.kind === MAP_KIND && !!c.get(MAP_PLAY_HERE);
  c.register({
    id: "run.fromScene",
    label: "현재 씬부터 실행",
    category: "run",
    shortcut: "Ctrl+F5",
    enabled: () => (mapActive() ? c.isEnabled(MAP_PLAY_HERE) : activeSceneName() !== null && runner.canRun),
    run: async () => {
      if (mapActive()) {
        await c.execute(MAP_PLAY_HERE);
        return;
      }
      const scene = activeSceneName();
      if (scene && (await saved())) await runner.start({ scene });
    },
  });
  editor.setHint("run.fromScene", () => (mapActive() ? editor.commandHint(MAP_PLAY_HERE) : activeSceneName() === null ? NEED_SCENE_TAB : runner.startHint));
  editor.setNote("run.fromScene", () => (mapActive() ? editor.commandNote(MAP_PLAY_HERE) : undefined));
  editor.setLabelProvider("run.fromScene", () => (mapActive() ? "이 맵에서 실행" : "현재 씬부터 실행"));
}
