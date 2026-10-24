// 새 게임 (데스크톱 앱과 웹판, docs/plans/quality.md Q1). 대화상자(components/launcher/NewGameDialog)에서 템플릿, 이름,
// 폴더, 화면 크기, 언어를 정하고, 만들기를 누른 뒤에야 열린 게임을 닫고 템플릿(packages/app/templates, scene/projectTemplates.ts)을
// 쓴 다음 연다. 폴더는 대화상자 안의 단추로 고른다: 데스크톱은 OS 대화상자, 웹판은 브라우저의 폴더 고르기(클릭 안에서만 뜬다).
// 웹판은 만들기 뒤에 그 폴더를 기억하고(최근 폴더) 브라우저 폴더 백엔드로 바꿔 쓴다 (샘플을 열어 둔 메모리 백엔드에서도).
// 메모리와 브리지 모드는 폴더를 고를 수 없어 꺼 두고 툴팁에 이유를 적는다.

import type { FsDirHandle } from "@initial-editor/backend-fsaccess";
import type { ProjectBackend } from "@initial-editor/core";
import { openNewGameDialog } from "../components/launcher/NewGameDialog";
import { rubyNoteFor } from "./about";
import { browserFolders } from "./browserFolders";
import type { Editor } from "./Editor";
import { writeProjectTemplate, type ProjectTemplateOptions } from "./scene/projectTemplates";
import { TEMPLATE_LABELS, type ProjectTemplateId } from "./scene/templateManifest";

export const NEW_PROJECT_NO_PICKER = "이 브라우저는 폴더를 열 수 없어 새 게임을 만들 수 없습니다. 크롬이나 엣지에서 만듭니다.";
export const NEW_PROJECT_BRIDGE = "브리지 모드에서는 새 게임을 만들 수 없습니다. 데스크톱 앱이나 크롬, 엣지에서 만듭니다.";
export const NEW_PROJECT_MEMORY = "샘플을 둘러보는 중에는 새 게임을 만들 수 없습니다. 데스크톱 앱이나 크롬, 엣지에서 만듭니다.";

/** 새 게임을 못 만드는 이유. 만들 수 있으면 null */
export function newProjectBlocker(editor: Editor): string | null {
  if (editor.mode === "browser") return browserFolders(editor).supported ? null : NEW_PROJECT_NO_PICKER;
  if (editor.backend.capabilities.pickFolder) return null;
  return editor.mode === "bridge" ? NEW_PROJECT_BRIDGE : NEW_PROJECT_MEMORY;
}

/** 대화상자에서 고른 폴더. value 는 데스크톱이면 경로, 웹판이면 폴더 핸들이다 */
export interface NewGameFolder {
  /** 폴더 이름 */
  label: string;
  /** 전체 경로 (데스크톱) */
  detail?: string;
  value: string | FsDirHandle;
}

export interface NewProjectDialogDefaults {
  name: string;
  /** 언어에서 Ruby 를 고르면 보일 안내 (웹판에서 웹 엔진에 mruby 가 없을 때) */
  rubyNote?: string | null;
  /** 폴더 고르기 단추 (대화상자 안의 클릭에서 부른다). 취소면 null */
  pickFolder: () => Promise<NewGameFolder | null>;
}

export interface NewGameChoice {
  options: ProjectTemplateOptions;
  folder: NewGameFolder;
}

/** 만든 뒤 열어 둘 문서 (템플릿마다 손댈 곳) */
export const TEMPLATE_FIRST_DOCUMENT: Record<ProjectTemplateId, string> = {
  empty: "resources/scenes/main.json",
  flappy: "resources/scenes/flappy.json",
  tilemap: "resources/maps/start.json",
  rpg: "resources/maps/port_town.json",
};

export interface NewProjectDeps {
  dialog?: (editor: Editor, defaults: NewProjectDialogDefaults) => Promise<NewGameChoice | null>;
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
  const message = `새 게임을 만들지 못했습니다: ${e instanceof Error ? e.message : String(e)}`;
  editor.log.error("editor", message);
  editor.toasts.error(message);
  return false;
}

/** 비어 있지 않은 폴더면 한 번 묻는다. 만들면 true */
async function confirmFolder(editor: Editor, count: number): Promise<boolean> {
  if (count === 0) return true;
  return editor.modals.confirm({
    title: "새 게임",
    message: `폴더가 비어 있지 않습니다 (항목 ${count}개). 기존 파일은 그대로 두고 없는 파일만 만듭니다. 이 폴더에 게임을 만들까요?`,
    okLabel: "만들기",
  });
}

async function askChoice(editor: Editor, deps: NewProjectDeps, pickFolder: NewProjectDialogDefaults["pickFolder"]): Promise<NewGameChoice | null> {
  const features = await (deps.webFeatures ?? (() => defaultWebFeatures(editor)))();
  return (deps.dialog ?? openNewGameDialog)(editor, { name: "", rubyNote: rubyNoteFor(editor.mode, features), pickFolder });
}

/** 경로의 마지막 이름 */
function lastName(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** 열린 백엔드에 템플릿을 쓰고 닫은 뒤 에디터로 열고, 템플릿의 첫 문서를 연다 */
async function writeAndOpen(editor: Editor, deps: NewProjectDeps, backend: ProjectBackend, root: string, folder: { shown: string; name: string }, options: ProjectTemplateOptions): Promise<boolean> {
  try {
    const written = await (deps.write ?? writeProjectTemplate)(backend, options);
    editor.log.info("editor", `새 게임: ${folder.shown} (${TEMPLATE_LABELS[options.template]}, ${options.language}, 파일 ${written.length}개)`);
    for (const p of written) editor.log.append("debug", "editor", `  만듦: ${p}`);
  } catch (e) {
    return failed(editor, e);
  } finally {
    await backend.close().catch(() => {});
  }
  const opened = await editor.openProject(root);
  if (!opened) return false;
  await editor.openPath(TEMPLATE_FIRST_DOCUMENT[options.template]).catch(() => {});
  editor.toasts.success(`새 게임을 만들었습니다: ${options.name}`);
  return true;
}

/** 데스크톱: 대화상자에서 OS 대화상자로 폴더를 고르고, 만들기 뒤에 열린 게임을 닫고 그 폴더를 세어 묻는다 */
async function createDesktopProject(editor: Editor, deps: NewProjectDeps): Promise<boolean> {
  const { backend } = editor;
  const choice = await askChoice(editor, deps, async () => {
    const path = await backend.pickFolder();
    return path ? { label: lastName(path), detail: path, value: path } : null;
  });
  if (!choice) return false;
  const folder = choice.folder.value as string;
  if (!(await editor.closeProject())) return false;
  const shown = { shown: folder, name: lastName(folder) };
  try {
    const info = await backend.open(folder);
    shown.shown = info.root;
    shown.name = info.name;
    if (!(await confirmFolder(editor, (await backend.list("")).length))) {
      await backend.close().catch(() => {});
      return false;
    }
  } catch (e) {
    await backend.close().catch(() => {});
    return failed(editor, e);
  }
  return writeAndOpen(editor, deps, backend, folder, shown, choice.options);
}

/**
 * 웹판: 대화상자 안의 클릭으로 폴더를 고르고, 만들기 뒤에 그 폴더를 세어 묻고, 열린 게임을 닫는다. 그다음에야 폴더를
 * 기억하고(최근 폴더) 브라우저 폴더 백엔드로 바꿔 쓴다. 그 전에 취소하면 기억한 기록과 백엔드와 열린 게임이 그대로다
 */
async function createBrowserProject(editor: Editor, deps: NewProjectDeps): Promise<boolean> {
  const folders = browserFolders(editor);
  const choice = await askChoice(editor, deps, async () => {
    const handle = await folders.pickFolderHandle();
    return handle ? { label: handle.name, value: handle } : null;
  });
  if (!choice) return false;
  const handle = choice.folder.value as FsDirHandle;
  try {
    let count = 0;
    for await (const _entry of handle.entries()) count++;
    if (!(await confirmFolder(editor, count))) return false;
  } catch (e) {
    return failed(editor, e);
  }
  if (!(await editor.closeProject())) return false;
  const key = await folders.adopt(handle);
  if (!key) return false;
  const backend = editor.backend;
  try {
    await backend.open(key);
  } catch (e) {
    await backend.close().catch(() => {});
    return failed(editor, e);
  }
  return writeAndOpen(editor, deps, backend, key, { shown: handle.name, name: handle.name }, choice.options);
}

export async function createNewProject(editor: Editor, deps: NewProjectDeps = {}): Promise<boolean> {
  const blocker = newProjectBlocker(editor);
  if (blocker) {
    editor.toasts.warn(blocker);
    return false;
  }
  return editor.mode === "browser" ? createBrowserProject(editor, deps) : createDesktopProject(editor, deps);
}
