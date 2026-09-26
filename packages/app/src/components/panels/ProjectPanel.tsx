// 프로젝트 패널: 파일 트리. 폴더는 펼칠 때 읽고(뷰 모델 ProjectTreeModel), 더블클릭으로 문서를 연다.
// 오른쪽 클릭 메뉴로 새 파일, 새 폴더, 이름 바꾸기, 삭제, 새로 고침.

import { dirname, extname, type Entry } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { useEditor } from "../../editor/EditorContext";
import { entryDir, newFile, newFolder, refreshDir, removeEntry, renameEntry } from "../../editor/projectActions";
import type { TreeRow } from "../../editor/projectTree";
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from "../ContextMenu";
import { ChevronIcon, EntryIcon, RefreshIcon } from "../icons";
import "./ProjectPanel.css";

const TreeRowView = observer(function TreeRowView({ row, onContextMenu }: { row: TreeRow; onContextMenu: (e: MouseEvent, entry: Entry) => void }) {
  const editor = useEditor();
  const { entry, depth, expanded, loading } = row;
  const isDir = entry.kind === "dir";
  const selected = editor.tree.selected === entry.path;
  const activate = () => {
    editor.tree.select(entry.path);
    if (isDir) void editor.tree.toggle(entry.path);
    else void editor.openPath(entry.path);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      activate();
    } else if (e.key === "ArrowRight" && isDir && !expanded) void editor.tree.expand(entry.path);
    else if (e.key === "ArrowLeft" && isDir && expanded) editor.tree.collapse(entry.path);
  };
  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-expanded={isDir ? expanded : undefined}
      aria-selected={selected}
      aria-level={depth + 1}
      className={"tree-row" + (selected ? " is-selected" : "")}
      style={{ paddingLeft: 6 + depth * 14 }}
      data-path={entry.path}
      data-kind={entry.kind}
      data-testid="tree-row"
      onClick={() => {
        editor.tree.select(entry.path);
        if (isDir) void editor.tree.toggle(entry.path);
      }}
      onDoubleClick={() => {
        if (!isDir) void editor.openPath(entry.path);
      }}
      onKeyDown={onKey}
      onContextMenu={(e) => onContextMenu(e, entry)}
    >
      <span className="tree-chevron">{isDir ? <ChevronIcon size={12} open={expanded} /> : null}</span>
      <span className="tree-icon">
        <EntryIcon kind={entry.kind} ext={extname(entry.path)} open={expanded} />
      </span>
      <span className="tree-name">{entry.name}</span>
      {loading && <span className="tree-loading muted">…</span>}
    </div>
  );
});

export const ProjectPanel = observer(function ProjectPanel() {
  const editor = useEditor();
  const { project, tree } = editor;
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  if (!project.isOpen) {
    return (
      <div className="panel-body">
        <div className="panel-hint">프로젝트를 열면 파일이 보인다</div>
      </div>
    );
  }

  const openContext = (e: MouseEvent, entry: Entry | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (entry) tree.select(entry.path);
    const dir = entryDir(entry);
    const items: ContextMenuItem[] = [
      { label: "새 파일", onClick: () => void newFile(editor, dir) },
      { label: "새 폴더", onClick: () => void newFolder(editor, dir) },
    ];
    if (entry) {
      items.push({ label: "이름 바꾸기", separatorBefore: true, onClick: () => void renameEntry(editor, entry) });
      items.push({ label: "삭제", danger: true, onClick: () => void removeEntry(editor, entry) });
    }
    items.push({ label: "새로 고침", separatorBefore: true, onClick: () => void refreshDir(editor, entry ? (entry.kind === "dir" ? entry.path : dirname(entry.path)) : "") });
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  return (
    <div className="project-panel" onContextMenu={(e) => openContext(e, null)} data-testid="project-panel">
      <div className="project-header">
        <span className="project-name" title={project.root}>
          {project.info?.name}
        </span>
        <button type="button" className="btn btn-ghost project-refresh" aria-label="새로 고침" title="새로 고침" onClick={() => void refreshDir(editor, "")}>
          <RefreshIcon />
        </button>
      </div>
      <div className="project-tree" role="tree" data-testid="project-tree">
        {tree.rows.map((row) => (
          <TreeRowView key={row.entry.path} row={row} onContextMenu={openContext} />
        ))}
        {tree.rows.length === 0 && <div className="panel-hint">빈 프로젝트다. 오른쪽 클릭으로 파일을 만든다</div>}
      </div>
      {menu && <ContextMenu state={menu} onClose={() => setMenu(null)} />}
    </div>
  );
});
