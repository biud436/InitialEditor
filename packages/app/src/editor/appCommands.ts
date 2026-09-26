// 셸이 등록하는 커맨드 (docs/plans/02-scope-and-screens.md 5절의 표). 메뉴와 툴바와 단축키는 전부 이것을 본다.
// 아직 없는 기능(E1 실행기, E2 씬)은 자리만 잡고 이유를 툴팁이나 토스트로 알린다.

import { BridgeBackend } from "@initial-editor/backend-bridge";
import type { EditorCommand, ScriptBackend } from "@initial-editor/core";
import { openAboutDialog } from "../components/AboutDialog";
import { openSettingsDialog } from "../components/SettingsDialog";
import type { Editor } from "./Editor";
import { WELCOME_KIND } from "./documents/WelcomeDocument";
import { PANEL_IDS, PANEL_TITLES, PRESET_LABELS, type PresetName } from "./layoutPresets";
import { createNewProject } from "./newProject";

export const ENGINE_README_API = "https://github.com/biud436/Initial2D#lua-대응표";
export const PLANS_INDEX = "https://github.com/biud436/InitialEditor/blob/master/docs/plans/index.md";

export const BROWSER_NO_RUN = "브라우저 모드에서는 엔진을 띄울 수 없다";
export const RUN_LATER = "E1 에서 붙는다";
export const SCENE_LATER = "E2 에서 붙는다";

function isHttpUrl(value: string): string | null {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? null : "http 나 https 주소여야 한다";
  } catch {
    return "주소 모양이 아니다 (예: http://127.0.0.1:5960)";
  }
}

async function openProjectCommand(editor: Editor): Promise<void> {
  if (editor.backend.capabilities.pickFolder) {
    const folder = await editor.backend.pickFolder();
    if (folder) await editor.openProject(folder);
    return;
  }
  const url = await editor.modals.prompt({
    title: "프로젝트 열기 (브리지)",
    label: "엔진 저장소의 브리지 서버 주소 (node tools/bridge/server.js --project <폴더>)",
    initial: editor.bridgeUrl ?? editor.settings.settings.bridgeUrl,
    placeholder: "http://127.0.0.1:5960",
    okLabel: "연결",
    validate: isHttpUrl,
  });
  if (!url) return;
  const clean = url.trim().replace(/\/+$/, "");
  editor.settings.update({ bridgeUrl: clean });
  if (!(await editor.replaceBackend(new BridgeBackend(clean), clean))) return;
  await editor.openProject(clean);
}

function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function registerAppCommands(editor: Editor): void {
  const c = editor.commands;
  const browser = editor.isBrowser;
  const active = () => editor.documents.active;
  const reg = (cmd: EditorCommand) => c.register(cmd);
  const later = (label: string, id: string, reason: string, shortcut?: string, category = "scene") =>
    reg({
      id,
      label,
      category,
      shortcut,
      run: () => {
        editor.toasts.info(`${label}: ${reason}`);
      },
    });

  // 파일
  reg({ id: "file.newProject", label: "새 프로젝트", category: "file", shortcut: "Ctrl+N", enabled: () => !browser, run: () => void createNewProject(editor) });
  editor.setHint("file.newProject", () => (browser ? "브라우저 모드에서는 새 프로젝트를 만들 수 없다 (Tauri 앱에서 폴더를 고른다)" : undefined));
  reg({ id: "file.openProject", label: "프로젝트 열기", category: "file", shortcut: "Ctrl+O", run: () => openProjectCommand(editor) });
  reg({
    id: "file.save",
    label: "저장",
    category: "file",
    shortcut: "Ctrl+S",
    enabled: () => {
      const doc = active();
      return !!doc && doc.kind !== WELCOME_KIND && doc.dirty;
    },
    run: async () => {
      const doc = active();
      if (!doc) return;
      await doc.save();
      editor.toasts.success(`저장했다: ${doc.title}`);
    },
  });
  reg({
    id: "file.saveAll",
    label: "모두 저장",
    category: "file",
    shortcut: "Ctrl+Shift+S",
    enabled: () => editor.documents.dirtyDocuments.length > 0,
    run: async () => {
      const docs = editor.documents.dirtyDocuments;
      for (const doc of docs) await doc.save();
      editor.toasts.success(`${docs.length}개 문서를 저장했다`);
    },
  });
  reg({ id: "file.closeProject", label: "프로젝트 닫기", category: "file", enabled: () => editor.project.isOpen, run: () => void editor.closeProject() });

  // 편집
  reg({ id: "edit.undo", label: "되돌리기", category: "edit", shortcut: "Ctrl+Z", enabled: () => !!active()?.undo.canUndo, run: () => void active()?.undo.undo() });
  reg({ id: "edit.redo", label: "다시 실행", category: "edit", shortcut: "Ctrl+Shift+Z", enabled: () => !!active()?.undo.canRedo, run: () => void active()?.undo.redo() });
  editor.setLabelProvider("edit.undo", () => {
    const label = active()?.undo.undoLabel;
    return label ? `되돌리기: ${label}` : "되돌리기";
  });
  editor.setLabelProvider("edit.redo", () => {
    const label = active()?.undo.redoLabel;
    return label ? `다시 실행: ${label}` : "다시 실행";
  });
  for (const [id, label, shortcut] of [
    ["edit.cut", "잘라내기", "Ctrl+X"],
    ["edit.copy", "복사", "Ctrl+C"],
    ["edit.paste", "붙여넣기", "Ctrl+V"],
    ["edit.duplicate", "복제", "Ctrl+D"],
    ["edit.delete", "삭제", "Delete"],
  ] as const) {
    reg({ id, label, category: "edit", shortcut, enabled: () => false, run: () => {} });
    editor.setHint(id, () => SCENE_LATER);
  }
  reg({
    id: "edit.find",
    label: "찾기",
    category: "edit",
    shortcut: "Ctrl+F",
    run: () => {
      editor.toasts.info(`찾기: ${RUN_LATER}`);
    },
  });

  // 씬 (E2)
  later("새 씬", "scene.new", SCENE_LATER, "Ctrl+Shift+N");
  later("오브젝트 추가", "scene.addObject", SCENE_LATER, "Ctrl+Shift+A");
  later("시작 씬으로 지정", "scene.setStart", SCENE_LATER);
  later("격자 표시", "scene.toggleGrid", SCENE_LATER);
  later("스냅", "scene.toggleSnap", SCENE_LATER);

  // 실행 (E1). 등록은 하되 비활성이고 이유는 툴팁에
  const runHint = () => (browser ? BROWSER_NO_RUN : RUN_LATER);
  for (const [id, label, shortcut] of [
    ["run.start", "실행", "F5"],
    ["run.stop", "정지", "Shift+F5"],
    ["run.fromScene", "현재 씬부터 실행", "Ctrl+F5"],
    ["run.reload", "리로드", "Ctrl+Shift+R"],
  ] as const) {
    reg({ id, label, category: "run", shortcut, enabled: () => false, run: () => {} });
    editor.setHint(id, runHint);
  }
  const setLanguage = async (script: ScriptBackend) => {
    const project = editor.project;
    if (!project.isOpen || project.gameJson.script === script) return;
    try {
      await project.saveGameJson({ ...project.gameJson, script });
      editor.log.info("editor", `스크립트 언어: ${script}`);
    } catch (e) {
      editor.toasts.error(`game.json 을 저장하지 못했다: ${(e as Error).message}`);
    }
  };
  reg({ id: "run.language.lua", label: "Lua", category: "run", enabled: () => editor.project.isOpen, run: () => setLanguage("lua") });
  reg({ id: "run.language.mruby", label: "Ruby (mruby)", category: "run", enabled: () => editor.project.isOpen, run: () => setLanguage("mruby") });
  editor.setChecked("run.language.lua", () => editor.project.isOpen && editor.project.gameJson.script === "lua");
  editor.setChecked("run.language.mruby", () => editor.project.isOpen && editor.project.gameJson.script === "mruby");
  reg({ id: "run.enginePath", label: "엔진 경로", category: "run", run: () => openSettingsDialog(editor) });

  // 도구
  reg({ id: "tools.settings", label: "설정", category: "tools", shortcut: "Ctrl+,", run: () => openSettingsDialog(editor) });

  // 창
  for (const id of PANEL_IDS) {
    reg({ id: `window.panel.${id}`, label: PANEL_TITLES[id], category: "window", run: () => editor.layout.togglePanel(id) });
    editor.setChecked(`window.panel.${id}`, () => editor.layout.isPanelOpen(id));
  }
  for (const preset of Object.keys(PRESET_LABELS) as PresetName[]) {
    reg({ id: `window.layout.${preset}`, label: `레이아웃: ${PRESET_LABELS[preset]}`, category: "window", run: () => editor.layout.applyPreset(preset) });
  }
  reg({ id: "window.layout.reset", label: "레이아웃 초기화", category: "window", run: () => editor.layout.reset() });

  // 도움말
  reg({ id: "help.api", label: "엔진 API 대응표", category: "help", run: () => openExternal(ENGINE_README_API) });
  reg({ id: "help.plans", label: "계획 문서", category: "help", run: () => openExternal(PLANS_INDEX) });
  reg({ id: "help.about", label: "InitialEditor 정보", category: "help", run: () => openAboutDialog(editor) });
}
