// 프로젝트 패널의 파일 조작: 새 파일, 새 폴더, 이름 바꾸기, 삭제, 새로 고침. 위험한 것은 모달로 묻는다.

import { basename, dirname, joinRel, type Entry } from "@initial-editor/core";
import type { Editor } from "./Editor";

const NAME_ERROR = "이름에는 / 와 \\ 를 쓸 수 없다";

function validateName(value: string): string | null {
  const v = value.trim();
  if (!v) return "이름을 적는다";
  if (v === "." || v === "..") return "그 이름은 쓸 수 없다";
  if (/[\\/]/.test(v)) return NAME_ERROR;
  return null;
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
      editor.toasts.warn(`이미 있다: ${path}`);
      return;
    }
    await editor.backend.writeText(path, "");
    await editor.project.refresh(dir);
    await editor.tree.reveal(path);
    editor.log.info("editor", `파일을 만들었다: ${path}`);
  } catch (e) {
    fail(editor, "파일을 만들지 못했다", e);
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
    editor.log.info("editor", `폴더를 만들었다: ${path}`);
  } catch (e) {
    fail(editor, "폴더를 만들지 못했다", e);
  }
}

export async function renameEntry(editor: Editor, entry: Entry): Promise<void> {
  const name = await editor.modals.prompt({ title: "이름 바꾸기", label: entry.path, initial: entry.name, validate: validateName });
  if (!name || name.trim() === entry.name) return;
  const parent = dirname(entry.path);
  const to = joinRel(parent, name.trim());
  try {
    if (await editor.backend.exists(to)) {
      editor.toasts.warn(`이미 있다: ${to}`);
      return;
    }
    await editor.backend.rename(entry.path, to);
    closeDocumentsUnder(editor, entry.path);
    await editor.project.refresh(parent);
    editor.tree.select(to);
    editor.log.info("editor", `이름을 바꿨다: ${entry.path} → ${to}`);
  } catch (e) {
    fail(editor, "이름을 바꾸지 못했다", e);
  }
}

export async function removeEntry(editor: Editor, entry: Entry): Promise<void> {
  let message = `${entry.path} 을(를) 지울까? 되돌릴 수 없다.`;
  if (entry.kind === "dir") {
    try {
      const inside = await editor.backend.list(entry.path);
      if (inside.length > 0) message = `${entry.path} 폴더가 비어 있지 않다. 안의 항목 ${inside.length}개도 함께 지운다. 되돌릴 수 없다.`;
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
    editor.log.info("editor", `지웠다: ${entry.path}`);
  } catch (e) {
    fail(editor, "지우지 못했다", e);
  }
}

export async function refreshDir(editor: Editor, dir: string): Promise<void> {
  try {
    await editor.project.refresh(dir);
  } catch (e) {
    fail(editor, "새로 고치지 못했다", e);
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
