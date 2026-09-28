// 프로젝트 패널의 파일 조작: 새 파일, 새 폴더, 이름 바꾸기, 삭제, 새로 고침. 위험한 것은 모달로 묻는다.

import { basename, dirname, joinRel, type Entry } from "@initial-editor/core";
import type { Editor } from "./Editor";

const NAME_ERROR = "이름에 / 와 \\ 사용 불가";

function validateName(value: string): string | null {
  const v = value.trim();
  if (!v) return "이름 비어 있음";
  if (v === "." || v === "..") return "사용할 수 없는 이름 (. 또는 ..)";
  if (/[\\/]/.test(v)) return NAME_ERROR;
  return null;
}

/** 필터가 켜진 프로젝트 뷰에서 만든 항목이 숨으면 알린다 */
function noteHidden(editor: Editor, path: string, kind: Entry["kind"]): void {
  if (editor.tree.isHidden(path, kind)) editor.toasts.info(`프로젝트 뷰 필터로 숨김: ${path}. 필터를 끄면 표시`);
}

function fail(editor: Editor, what: string, e: unknown): void {
  const message = `${what}: ${(e as Error).message}`;
  editor.log.error("editor", message);
  editor.toasts.error(message);
}

export async function newFile(editor: Editor, dir: string): Promise<void> {
  const name = await editor.modals.prompt({ title: "새 파일", label: `${dir || "/"} 안에 만들 파일 이름`, placeholder: "example.lua", validate: validateName });
  if (!name) return;
  const path = joinRel(dir, name.trim());
  try {
    if (await editor.backend.exists(path)) {
      editor.toasts.warn(`이미 있는 파일: ${path}`);
      return;
    }
    await editor.backend.writeText(path, "");
    await editor.project.refresh(dir);
    await editor.tree.reveal(path);
    editor.log.info("editor", `파일 생성됨: ${path}`);
    noteHidden(editor, path, "file");
  } catch (e) {
    fail(editor, "파일 생성 실패", e);
  }
}

export async function newFolder(editor: Editor, dir: string): Promise<void> {
  const name = await editor.modals.prompt({ title: "새 폴더", label: `${dir || "/"} 안에 만들 폴더 이름`, placeholder: "folder", validate: validateName });
  if (!name) return;
  const path = joinRel(dir, name.trim());
  try {
    await editor.backend.mkdir(path);
    await editor.project.refresh(dir);
    await editor.tree.reveal(path);
    editor.log.info("editor", `폴더 생성됨: ${path}`);
    noteHidden(editor, path, "dir");
  } catch (e) {
    fail(editor, "폴더 생성 실패", e);
  }
}

export async function renameEntry(editor: Editor, entry: Entry): Promise<void> {
  const name = await editor.modals.prompt({ title: "이름 바꾸기", label: entry.path, initial: entry.name, validate: validateName });
  if (!name || name.trim() === entry.name) return;
  const parent = dirname(entry.path);
  const to = joinRel(parent, name.trim());
  try {
    if (await editor.backend.exists(to)) {
      editor.toasts.warn(`이미 있는 경로: ${to}`);
      return;
    }
    await editor.backend.rename(entry.path, to);
    closeDocumentsUnder(editor, entry.path);
    await editor.project.refresh(parent);
    editor.tree.select(to);
    editor.log.info("editor", `이름 변경됨: ${entry.path} → ${to}`);
  } catch (e) {
    fail(editor, "이름 변경 실패", e);
  }
}

export async function removeEntry(editor: Editor, entry: Entry): Promise<void> {
  let message = `${entry.path} 삭제할까요? (되돌릴 수 없음)`;
  if (entry.kind === "dir") {
    try {
      const inside = await editor.backend.list(entry.path);
      if (inside.length > 0) message = `${entry.path} 폴더와 안의 항목 ${inside.length}개를 함께 삭제할까요? (되돌릴 수 없음)`;
    } catch {
      // 목록을 못 읽어도 삭제는 물어본다
    }
  }
  const ok = await editor.modals.confirm({ title: "삭제", message, okLabel: "삭제", danger: true });
  if (!ok) return;
  try {
    await editor.backend.remove(entry.path);
    closeDocumentsUnder(editor, entry.path);
    await editor.project.refresh(dirname(entry.path));
    editor.log.info("editor", `삭제됨: ${entry.path}`);
  } catch (e) {
    fail(editor, "삭제 실패", e);
  }
}

export async function refreshDir(editor: Editor, dir: string): Promise<void> {
  try {
    await editor.project.refresh(dir);
  } catch (e) {
    fail(editor, "새로 고침 실패", e);
  }
}

/** 지워지거나 이름이 바뀐 경로 아래의 열린 문서를 닫는다 (E0 문서는 읽기 전용이라 잃는 것이 없다) */
function closeDocumentsUnder(editor: Editor, path: string): void {
  for (const doc of [...editor.documents.documents]) {
    if (doc.path && (doc.path === path || doc.path.startsWith(path + "/"))) editor.documents.close(doc);
  }
}

export function entryDir(entry: Entry | null): string {
  if (!entry) return "";
  return entry.kind === "dir" ? entry.path : dirname(entry.path);
}

export function displayName(path: string): string {
  return path === "" ? "/" : basename(path);
}
