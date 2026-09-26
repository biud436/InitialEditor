// 파일 > 최근 프로젝트 하위 메뉴. settings.recentProjects 가 바뀔 때마다 항목을 다시 등록한다.

import { Disposables } from "@initial-editor/core";
import { reaction } from "mobx";
import type { Editor } from "./Editor";

export const RECENT_MENU_PATH = "파일/최근 프로젝트";
const MAX_LABEL = 60;

export function shortenRoot(root: string): string {
  if (root.length <= MAX_LABEL) return root;
  return "…" + root.slice(root.length - MAX_LABEL + 1);
}

export function installRecentProjectsMenu(editor: Editor): () => void {
  let current = new Disposables();
  const rebuild = (roots: string[]) => {
    current.dispose();
    current = new Disposables();
    if (roots.length === 0) {
      current.add(editor.commands.register({ id: "file.openRecent.none", label: "(없음)", category: "file", enabled: () => false, run: () => {} }));
      current.add(editor.menus.register({ path: `${RECENT_MENU_PATH}/(없음)`, commandId: "file.openRecent.none", order: 10 }));
      return;
    }
    roots.forEach((root, i) => {
      const id = `file.openRecent.${i}`;
      current.add(editor.commands.register({ id, label: shortenRoot(root), category: "file", run: () => void editor.openProject(root) }));
      current.add(editor.menus.register({ path: `${RECENT_MENU_PATH}/${root}`, commandId: id, order: 10 + i }));
    });
    current.add(editor.commands.register({ id: "file.openRecent.clear", label: "목록 비우기", category: "file", run: () => editor.settings.update({ recentProjects: [] }) }));
    current.add(editor.menus.register({ path: `${RECENT_MENU_PATH}/목록 비우기`, commandId: "file.openRecent.clear", order: 900, separatorBefore: true }));
  };
  const dispose = reaction(
    () => editor.settings.settings.recentProjects.slice(),
    (roots) => rebuild(roots),
    { fireImmediately: true },
  );
  return () => {
    dispose();
    current.dispose();
  };
}
