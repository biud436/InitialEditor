// 계층 패널 (docs/plans/e2-scene.md 마일스톤 2). 활성 씬의 오브젝트를 그리기 순서(파일 순서, 위가 먼저 그려진다)로
// 보인다. 선택은 문서(SceneDocument.selection)와 양방향이라 씬 뷰와 같은 선택을 본다.
//   클릭 선택, Shift 범위, Ctrl/Cmd 토글, 위아래 화살표, F2 나 더블클릭으로 이름 바꾸기, 눈 아이콘으로 표시 여부,
//   끌어서 순서 바꾸기, 오른쪽 클릭 메뉴 (이름 바꾸기, 복제, 삭제, 맨 앞으로, 맨 뒤로, 스크립트 열기).
// 모든 변경은 editor.sceneTools 를 거쳐 명령으로 문서에 들어간다.

import type { SceneObject } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useEditor } from "../../editor/EditorContext";
import { TypeIcon } from "../../editor/scene/typeIcons";
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from "../ContextMenu";
import "./HierarchyPanel.css";

export const HIERARCHY_EMPTY = "활성 씬 탭 없음";

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
      {open ? <circle cx="8" cy="8" r="2" /> : <path d="M3 13L13 3" />}
    </svg>
  );
}

interface DragState {
  from: number;
  over: number;
  after: boolean;
}

export const HierarchyPanel = observer(function HierarchyPanel() {
  const editor = useEditor();
  const tools = editor.sceneTools;
  const doc = tools.activeScene;
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);
  const anchor = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 한 번의 이름 바꾸기가 Enter 와 뒤따르는 blur 로 두 번 확정되지 않게 한다
  const renameClosed = useRef(false);

  if (!doc) {
    return (
      <div className="panel-body" data-testid="hierarchy">
        <div className="panel-hint">{HIERARCHY_EMPTY}</div>
      </div>
    );
  }

  const objects = doc.scene.objects;
  const ids = objects.map((o) => o.id);
  const selectedIds = doc.selectedIds;

  const focusRow = (id: string) => {
    listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
  };

  const selectRow = (e: MouseEvent | KeyboardEvent, id: string) => {
    if (e.shiftKey && anchor.current && ids.includes(anchor.current)) {
      const a = ids.indexOf(anchor.current);
      const b = ids.indexOf(id);
      const [from, to] = a < b ? [a, b] : [b, a];
      doc.select(ids.slice(from, to + 1));
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      if (doc.selection.has(id)) doc.select(selectedIds.filter((s) => s !== id));
      else doc.select([id], true);
      anchor.current = id;
      return;
    }
    doc.select([id]);
    anchor.current = id;
  };

  const beginRename = (id: string) => {
    renameClosed.current = false;
    setRenaming(id);
    setRenameText(id);
  };

  const commitRename = () => {
    if (renaming === null || renameClosed.current) return;
    renameClosed.current = true;
    const id = renaming;
    const next = renameText.trim();
    const ok = next === id || tools.rename(id, next);
    // 거부된 이름(비었거나 겹침)은 토스트로 알렸다. 입력을 닫고 원래 id 줄로 초점을 돌린다
    setRenaming(null);
    requestAnimationFrame(() => focusRow(ok ? next : id));
  };

  const onListKey = (e: KeyboardEvent) => {
    if (renaming !== null) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (ids.length === 0) return;
      e.preventDefault();
      const current = anchor.current && ids.includes(anchor.current) ? ids.indexOf(anchor.current) : selectedIds.length ? ids.indexOf(selectedIds[selectedIds.length - 1]) : -1;
      const next = e.key === "ArrowDown" ? Math.min(ids.length - 1, current + 1) : Math.max(0, current - 1);
      const id = ids[next];
      if (e.shiftKey && anchor.current) doc.select([...selectedIds, id]);
      else {
        doc.select([id]);
        anchor.current = id;
      }
      focusRow(id);
    } else if ((e.key === "F2" || e.key === "Enter") && selectedIds.length === 1) {
      e.preventDefault();
      beginRename(selectedIds[0]);
    }
  };

  const openContext = (e: MouseEvent, o: SceneObject) => {
    e.preventDefault();
    e.stopPropagation();
    if (!doc.selection.has(o.id)) {
      doc.select([o.id]);
      anchor.current = o.id;
    }
    const count = doc.selectedIds.length;
    const many = count > 1;
    const items: ContextMenuItem[] = [
      { label: "이름 바꾸기", disabled: many, onClick: () => beginRename(o.id) },
      { label: many ? `복제 (${count}개)` : "복제", onClick: () => tools.duplicateSelected() },
      { label: many ? `삭제 (${count}개)` : "삭제", danger: true, onClick: () => tools.deleteSelected() },
      { label: "맨 앞으로 (가장 나중에 그림)", separatorBefore: true, disabled: doc.scene.indexOf(o.id) === objects.length - 1, onClick: () => tools.bringToFront(o.id) },
      { label: "맨 뒤로 (가장 먼저 그림)", disabled: doc.scene.indexOf(o.id) === 0, onClick: () => tools.sendToBack(o.id) },
    ];
    if (o.scripts.length === 0) items.push({ label: "스크립트 열기: (추가된 스크립트 없음)", separatorBefore: true, disabled: true });
    o.scripts.forEach((name, i) => items.push({ label: `스크립트 열기: ${name}`, separatorBefore: i === 0, onClick: () => void editor.openPath(tools.scriptPath(name)) }));
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  // ---- 끌어서 순서 바꾸기 ----
  const onDragStart = (e: DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", ids[index]);
    setDrag({ from: index, over: index, after: false });
  };
  const onDragOver = (e: DragEvent, index: number) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    if (drag.over !== index || drag.after !== after) setDrag({ ...drag, over: index, after });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (!drag) return;
    let to = drag.after ? drag.over + 1 : drag.over;
    if (drag.from < to) to -= 1;
    tools.reorder(drag.from, to);
    setDrag(null);
  };

  return (
    <div className="hierarchy" data-testid="hierarchy" data-scene={doc.title}>
      <div className="hierarchy-header">
        <span className="hierarchy-title" title={doc.path ?? undefined}>
          {doc.title}
        </span>
        <span className="muted hierarchy-order">그리기 순서 (위 항목부터)</span>
        <span className="muted hierarchy-count" data-testid="hierarchy-count">
          {objects.length}개
        </span>
      </div>
      <div className="hierarchy-list" role="listbox" aria-multiselectable="true" aria-label="오브젝트" ref={listRef} onKeyDown={onListKey} onDragEnd={() => setDrag(null)} onContextMenu={(e) => e.preventDefault()}>
        {objects.map((o, index) => {
          const selected = doc.selection.has(o.id);
          const spec = tools.typeSpec(o.type);
          const dropClass = drag && drag.over === index && drag.from !== index ? (drag.after ? " drop-after" : " drop-before") : "";
          return (
            <div
              key={o.id}
              role="option"
              tabIndex={0}
              aria-selected={selected}
              className={"hier-row" + (selected ? " is-selected" : "") + (o.visible ? "" : " is-hidden") + (drag?.from === index ? " is-dragging" : "") + dropClass}
              data-testid="hierarchy-row"
              data-id={o.id}
              data-type={o.type}
              draggable={renaming === null}
              onClick={(e) => selectRow(e, o.id)}
              onDoubleClick={() => beginRename(o.id)}
              onContextMenu={(e) => openContext(e, o)}
              onDragStart={(e) => onDragStart(e, index)}
              onDragOver={(e) => onDragOver(e, index)}
              onDrop={onDrop}
            >
              <button
                type="button"
                className={"btn btn-ghost hier-eye" + (o.visible ? "" : " is-off")}
                aria-label={o.visible ? `${o.id} 숨기기` : `${o.id} 보이기`}
                aria-pressed={o.visible}
                title={o.visible ? "보임 (클릭하면 숨김)" : "숨김 (클릭하면 보임)"}
                data-testid="hierarchy-eye"
                onClick={(e) => {
                  e.stopPropagation();
                  tools.setVisible(o.id, !o.visible);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <EyeIcon open={o.visible} />
              </button>
              <span className="hier-icon" title={spec?.label ?? o.type}>
                <TypeIcon icon={spec?.icon ?? o.type} />
              </span>
              {renaming === o.id ? (
                <input
                  className="input hier-rename"
                  value={renameText}
                  autoFocus
                  aria-label="새 id"
                  data-testid="hierarchy-rename"
                  onChange={(e) => setRenameText(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onBlur={commitRename}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitRename();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setRenaming(null);
                      requestAnimationFrame(() => focusRow(o.id));
                    }
                    e.stopPropagation();
                  }}
                />
              ) : (
                <span className="hier-name">{o.id}</span>
              )}
              <span className="muted hier-type">{spec?.label ?? o.type}</span>
              {o.scripts.length > 0 && (
                <span className="hier-scripts" title={o.scripts.join("\n")}>
                  {o.scripts.length}
                </span>
              )}
            </div>
          );
        })}
        {objects.length === 0 && <div className="panel-hint">오브젝트 없음. 씬 메뉴의 오브젝트 추가(Ctrl+Shift+A)로 추가할 수 있습니다.</div>}
      </div>
      {menu && <ContextMenu state={menu} onClose={() => setMenu(null)} />}
    </div>
  );
});
