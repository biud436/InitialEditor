// 새 프로젝트 (데스크톱 앱과 웹판). 폴더를 고르고, 템플릿과 언어(Lua, Ruby)를 물은 뒤 엔진에서 복사한 템플릿
// (packages/app/templates, scene/projectTemplates.ts)으로 game.json, 진입점, 씬 로더, 씬, 자산을 만든다.
// 웹판(브라우저 폴더 모드)은 폴더를 클릭 안에서 먼저 고르고, 대화상자에서 만들기를 누른 뒤에 브라우저가 그 폴더를 기억하고
// (최근 폴더) 브라우저 폴더 백엔드로 바꿔 쓴다 (샘플을 열어 둔 메모리 백엔드에서도). 메모리와 브리지 모드는 폴더를 고를 수 없어
// 꺼 두고 툴팁에 이유를 적는다.

import type { ProjectBackend } from "@initial-editor/core";
import { rubyNoteFor } from "./about";
import { browserFolders } from "./browserFolders";
import type { Editor } from "./Editor";
import { openNewProjectDialog } from "./scene/NewProjectDialog";
import { writeProjectTemplate, type ProjectTemplateOptions } from "./scene/projectTemplates";
import { TEMPLATE_LABELS } from "./scene/templateManifest";

export const NEW_PROJECT_NO_PICKER = "이 브라우저는 폴더 열기를 지원하지 않아 새 프로젝트를 만들 수 없습니다 (크롬과 엣지에서 지원합니다)";
export const NEW_PROJECT_BRIDGE = "브리지 모드에서는 새 프로젝트를 만들 수 없습니다. 데스크톱 앱이나 브라우저 폴더 모드에서 폴더를 선택하세요.";
export const NEW_PROJECT_MEMORY = "메모리 모드에서는 새 프로젝트를 만들 수 없습니다. 데스크톱 앱이나 폴더 열기를 지원하는 브라우저에서 만들 수 있습니다.";

/** 새 프로젝트를 못 만드는 이유. 만들 수 있으면 null */
export function newProjectBlocker(editor: Editor): string | null {
  if (editor.mode === "browser") return browserFolders(editor).supported ? null : NEW_PROJECT_NO_PICKER;
  if (editor.backend.capabilities.pickFolder) return null;
  return editor.mode === "bridge" ? NEW_PROJECT_BRIDGE : NEW_PROJECT_MEMORY;
}

export interface NewProjectDialogDefaults {
  name: string;
  folder: string;
  /** 언어에서 Ruby 를 고르면 보일 안내 (웹판에서 웹 엔진에 mruby 가 없을 때) */
  rubyNote?: string | null;
}

export interface NewProjectDeps {
  dialog?: (editor: Editor, defaults: NewProjectDialogDefaults) => Promise<ProjectTemplateOptions | null>;
  /** 웹 엔진의 기능 (MANIFEST). 모르면 null */
  webFeatures?: () => Promise<string[] | null>;
  /** 템플릿 쓰기 (기본 번들의 템플릿. 테스트는 저장소의 templates/ 를 읽는 소스를 넘긴다) */
  write?: (backend: ProjectBackend, options: ProjectTemplateOptions) => Promise<string[]>;
}

async function defaultWebFeatures(editor: Editor): Promise<string[] | null> {
  if (editor.mode === "tauri" || !editor.gameView) return null;
  return editor.gameView.loadFeatures().catch(() => null);
}

function failed(editor: Editor, e: unknown): false {
  const message = `새 프로젝트 생성 실패: ${e instanceof Error ? e.message : String(e)}`;
  editor.log.error("editor", message);
  editor.toasts.error(message);
  return false;
}

/** 비어 있지 않은 폴더면 한 번 묻는다. 만들면 true */
async function confirmFolder(editor: Editor, count: number): Promise<boolean> {
  if (count === 0) return true;
  return editor.modals.confirm({
    title: "새 프로젝트",
    message: `폴더가 비어 있지 않습니다 (항목 ${count}개). 기존 파일은 그대로 두고 없는 파일만 만듭니다. 이 폴더에 프로젝트를 만들까요?`,
    okLabel: "만들기",
  });
}

async function askOptions(editor: Editor, deps: NewProjectDeps, name: string, folder: string): Promise<ProjectTemplateOptions | null> {
  const features = await (deps.webFeatures ?? (() => defaultWebFeatures(editor)))();
  return (deps.dialog ?? openNewProjectDialog)(editor, { name, folder, rubyNote: rubyNoteFor(editor.mode, features) });
}

/** 열린 백엔드에 템플릿을 쓰고 닫은 뒤 에디터로 연다 */
async function writeAndOpen(editor: Editor, deps: NewProjectDeps, backend: ProjectBackend, root: string, folder: { shown: string; name: string }, options: ProjectTemplateOptions): Promise<boolean> {
  try {
    const written = await (deps.write ?? writeProjectTemplate)(backend, options);
    editor.log.info("editor", `새 프로젝트 생성됨: ${folder.shown} (${TEMPLATE_LABELS[options.template]}, ${options.language}, 파일 ${written.length}개)`);
    for (const p of written) editor.log.append("debug", "editor", `  만듦: ${p}`);
  } catch (e) {
    return failed(editor, e);
  } finally {
    await backend.close().catch(() => {});
  }
  const opened = await editor.openProject(root);
  if (opened) editor.toasts.success(`새 프로젝트: ${folder.name}`);
  return opened;
}

/** 데스크톱: 열린 프로젝트를 닫고, OS 대화상자로 고르고, 백엔드로 연 폴더를 세고 묻는다 */
async function createDesktopProject(editor: Editor, deps: NewProjectDeps): Promise<boolean> {
  const { backend } = editor;
  if (!(await editor.closeProject())) return false;
  const folder = await backend.pickFolder();
  if (!folder) return false;
  let options: ProjectTemplateOptions | null;
  const shown = { shown: folder, name: folder };
  try {
    const info = await backend.open(folder);
    shown.shown = info.root;
    shown.name = info.name;
    if (!(await confirmFolder(editor, (await backend.list("")).length))) options = null;
    else options = await askOptions(editor, deps, info.name, info.root);
  } catch (e) {
    await backend.close().catch(() => {});
    return failed(editor, e);
  }
  if (!options) {
    await backend.close().catch(() => {});
    return false;
  }
  return writeAndOpen(editor, deps, backend, folder, shown, options);
}

/**
 * 웹판: 클릭 안에서 폴더를 고르고, 열린 프로젝트를 닫고, 고른 폴더를 세고 묻는다. 대화상자에서 만들기를 누른 뒤에야
 * 폴더를 기억하고(최근 폴더) 브라우저 폴더 백엔드로 바꿔 쓴다. 그 전에 취소하면 기억한 기록과 백엔드가 그대로다
 */
async function createBrowserProject(editor: Editor, deps: NewProjectDeps): Promise<boolean> {
  const folders = browserFolders(editor);
  const handle = await folders.pickNewProjectFolder();
  if (!handle) return false;
  let options: ProjectTemplateOptions | null;
  try {
    let count = 0;
    for await (const _entry of handle.entries()) count++;
    options = (await confirmFolder(editor, count)) ? await askOptions(editor, deps, handle.name, handle.name) : null;
  } catch (e) {
    return failed(editor, e);
  }
  if (!options) return false;
  const key = await folders.adopt(handle);
  if (!key) return false;
  const backend = editor.backend;
  try {
    await backend.open(key);
  } catch (e) {
    await backend.close().catch(() => {});
    return failed(editor, e);
  }
  return writeAndOpen(editor, deps, backend, key, { shown: handle.name, name: handle.name }, options);
}

export async function createNewProject(editor: Editor, deps: NewProjectDeps = {}): Promise<boolean> {
  const blocker = newProjectBlocker(editor);
  if (blocker) {
    editor.toasts.warn(blocker);
    return false;
  }
  return editor.mode === "browser" ? createBrowserProject(editor, deps) : createDesktopProject(editor, deps);
}
