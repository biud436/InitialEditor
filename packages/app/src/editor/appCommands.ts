// 셸이 등록하는 커맨드 (docs/plans/02-scope-and-screens.md 5절의 표). 메뉴와 툴바와 단축키는 전부 이것을 본다.
// 아직 없는 기능(E1 실행기, E2 씬)은 자리만 잡고 이유를 툴팁이나 토스트로 알린다.

import { BridgeBackend } from "@initial-editor/backend-bridge";
import type { EditorCommand, ScriptBackend } from "@initial-editor/core";
import { openAboutDialog } from "../components/AboutDialog";
import { ENGINE_README_API, PLANS_INDEX } from "./about";
import { openSettingsDialog } from "../components/SettingsDialog";
import { browserFolders } from "./browserFolders";
import type { Editor } from "./Editor";
import { WELCOME_KIND } from "./documents/WelcomeDocument";
import { PANEL_IDS, PANEL_TITLES, PRESET_LABELS, type PresetName } from "./layoutPresets";
import { createNewProject, newProjectBlocker } from "./newProject";
import { openLink } from "./openExternal";
import { saveActiveDocument, saveAllDocuments } from "./saveCommands";

// 바깥 링크 주소는 about.ts 에 있다 (정보 창과 시작 화면이 같이 쓴다)
export { ENGINE_README_API, PLANS_INDEX };

export const BROWSER_NO_RUN = "브라우저 모드에서는 엔진을 띄울 수 없다";
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
  // 웹판은 샘플(메모리 백엔드)로 바꾼 뒤에도 폴더 고르기로 연다
  if (editor.mode === "browser") {
    await browserFolders(editor).openNew();
    return;
  }
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

export function registerAppCommands(editor: Editor): void {
  const c = editor.commands;
  const active = () => editor.documents.active;
  const reg = (cmd: EditorCommand) => c.register(cmd);
  // 파일
  // 새 프로젝트는 폴더를 고를 수 있는 곳(데스크톱 앱, 폴더 열기가 있는 브라우저의 웹판)에서 된다
  reg({ id: "file.newProject", label: "새 프로젝트", category: "file", shortcut: "Ctrl+N", enabled: () => newProjectBlocker(editor) === null, run: () => void createNewProject(editor) });
  editor.setHint("file.newProject", () => newProjectBlocker(editor) ?? undefined);
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
      await saveActiveDocument(editor);
    },
  });
  reg({
    id: "file.saveAll",
    label: "모두 저장",
    category: "file",
    shortcut: "Ctrl+Shift+S",
    enabled: () => editor.documents.dirtyDocuments.length > 0,
    run: async () => {
      await saveAllDocuments(editor);
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
  // edit.cut, edit.copy, edit.paste, edit.duplicate, edit.delete (씬 오브젝트) 는 scene/sceneCommands.ts 가 등록한다 (E2)
  // edit.find (프로젝트 전체 찾기) 는 scripting/scriptCommands.ts 가 등록한다 (E1)

  // 씬 커맨드(scene.new, addObject, setStart)는 scene/sceneCommands.ts 가, 격자와 스냅과 줌은 sceneView/viewCommands.ts 가 등록한다 (E2)

  // 실행 커맨드(run.start, run.stop, run.fromScene, run.reload)는 runner/runCommands.ts 가 등록한다 (E1)
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
  reg({ id: "help.api", label: "엔진 API 대응표", category: "help", run: () => void openLink(editor, ENGINE_README_API) });
  reg({ id: "help.plans", label: "계획 문서", category: "help", run: () => void openLink(editor, PLANS_INDEX) });
  reg({ id: "help.about", label: "InitialEditor 정보", category: "help", run: () => openAboutDialog(editor) });
}
