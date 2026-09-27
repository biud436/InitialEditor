// 파일 > 최근 프로젝트 하위 메뉴. 목록이 바뀔 때마다 항목을 다시 등록한다.
// Tauri, 브리지는 settings.recentProjects, 브라우저 폴더 모드는 IndexedDB 의 기억한 폴더(browserFolders.ts)다.
// 메뉴 경로의 마지막 조각은 번호다 (경로의 "/" 가 하위 메뉴가 되지 않게). 보이는 이름은 커맨드 라벨이다.

import { Disposables } from "@initial-editor/core";
import { reaction } from "mobx";
import { browserFolders } from "./browserFolders";
import type { Editor } from "./Editor";

export const RECENT_MENU_PATH = "파일/최근 프로젝트";
const MAX_LABEL = 60;

export function shortenRoot(root: string): string {
  if (root.length <= MAX_LABEL) return root;
  return "…" + root.slice(root.length - MAX_LABEL + 1);
}

interface RecentItem {
  label: string;
  open: () => void;
}

function menuBuilder(editor: Editor, clear: () => void): { rebuild(items: RecentItem[]): void; dispose(): void } {
  let current = new Disposables();
  return {
    rebuild(items) {
      current.dispose();
      current = new Disposables();
      if (items.length === 0) {
        current.add(editor.commands.register({ id: "file.openRecent.none", label: "(없음)", category: "file", enabled: () => false, run: () => {} }));
        current.add(editor.menus.register({ path: `${RECENT_MENU_PATH}/(없음)`, commandId: "file.openRecent.none", order: 10 }));
        return;
      }
      items.forEach((item, i) => {
        const id = `file.openRecent.${i}`;
        current.add(editor.commands.register({ id, label: shortenRoot(item.label), category: "file", run: item.open }));
        current.add(editor.menus.register({ path: `${RECENT_MENU_PATH}/recent-${i}`, commandId: id, order: 10 + i }));
      });
      current.add(editor.commands.register({ id: "file.openRecent.clear", label: "목록 비우기", category: "file", run: clear }));
      current.add(editor.menus.register({ path: `${RECENT_MENU_PATH}/목록 비우기`, commandId: "file.openRecent.clear", order: 900, separatorBefore: true }));
    },
    dispose() {
      current.dispose();
    },
  };
}

export function installRecentProjectsMenu(editor: Editor): () => void {
  if (editor.mode === "browser") return installBrowserRecentMenu(editor);
  const menu = menuBuilder(editor, () => editor.settings.update({ recentProjects: [] }));
  const dispose = reaction(
    () => editor.settings.settings.recentProjects.slice(),
    (roots) => menu.rebuild(roots.map((root) => ({ label: root, open: () => void editor.openProject(root) }))),
    { fireImmediately: true },
  );
  return () => {
    dispose();
    menu.dispose();
  };
}

function installBrowserRecentMenu(editor: Editor): () => void {
  const folders = browserFolders(editor);
  const menu = menuBuilder(editor, () => void folders.forgetAll());
  const dispose = reaction(
    () => folders.records,
    (records) => menu.rebuild(records.map((record) => ({ label: record.name, open: () => void folders.reopen(record) }))),
    { fireImmediately: true },
  );
  void folders.refresh();
  return () => {
    dispose();
    menu.dispose();
  };
}
