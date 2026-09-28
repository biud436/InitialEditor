// 맵 오브젝트 패널. 활성 맵의 오브젝트를 스키마 타입별로 묶어 보인다 (스키마에 없는 타입은 맨 뒤 한 묶음).
//   묶음 제목 줄: 타입 이름, 수, 추가 버튼 (맵 뷰의 화면 가운데에 defaultProps로, unique 타입은 둘째를 거부)
//   줄: id와 요약. 클릭 선택, Shift 더하기, Ctrl/Cmd 토글, 더블클릭은 맵 뷰에서 보이기,
//       오른쪽 클릭 메뉴(이름 바꾸기, 복제, 삭제), F2 이름 바꾸기, Delete 삭제, 위아래 화살표
//       이름 칸: Enter는 확정(거부되면 칸에 남는다), Escape는 취소, 초점을 잃으면 확정하고 거부되면 원래 id로 닫는다
//   맨 아래: 검사 결과. 누르면 그 오브젝트를 고른다
// 선택은 문서(MapDocument.selection)에 있어 맵 뷰와 인스펙터가 같은 것을 본다.

import { typeOf, type MapDocument, type MapObject } from "@initial-editor/ext-tilemap/model";
import { observer } from "mobx-react-lite";
import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useEditor } from "../../editor/EditorContext";
import { isEditableTarget } from "../../editor/shortcuts";
import { addMapObject, deleteMapObjects, duplicateMapObjects, focusObjectInView, renameMapObject, selectProblem } from "../../editor/maps/objectTools/actions";
import { groupObjects, summarizeObject } from "../../editor/maps/objectTools/rules";
import { asMapDocument } from "../../editor/maps/schemaStore";
import { ContextMenu, type ContextMenuState } from "../ContextMenu";
import "./MapObjectInspector.css";
import "./ObjectsPanel.css";

export const OBJECTS_EMPTY = "활성 맵 탭 없음";

/** 초점이 옮겨 간 곳이 입력 칸이나 누를 수 있는 것이면 true (그때는 초점을 되돌리지 않는다) */
function focusLanded(next: EventTarget | null): boolean {
  return next instanceof HTMLElement && (next.tabIndex >= 0 || isEditableTarget(next));
}

export const ObjectsPanel = observer(function ObjectsPanel() {
  const editor = useEditor();
  const doc = asMapDocument(editor.documents.active);
  if (!doc) {
    return (
      <div className="panel-body" data-testid="map-objects">
        <div className="panel-hint">{OBJECTS_EMPTY}</div>
      </div>
    );
  }
  return <ObjectsList doc={doc} />;
});

const ObjectsList = observer(function ObjectsList({ doc }: { doc: MapDocument }) {
  const editor = useEditor();
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const anchor = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const schema = doc.schema;
  const groups = groupObjects(doc.model.objects, schema);
  const flat = groups.flatMap((g) => g.objects.map((o) => o.id));
  const selectedIds = doc.selectedIds;
  // 확장 레이어의 문제는 그 레이어가 보인다 (레이어 패널의 오류 수, 레이어의 패널과 인스펙터)
  const problems = doc.objectProblems;
  const schemaError = editor.mapSchema?.error ?? null;

  const focusRow = (id: string) => {
    listRef.current?.querySelector<HTMLElement>(`[data-testid="map-objects-row"][data-id="${CSS.escape(id)}"]`)?.focus();
  };

  const selectRow = (e: MouseEvent | KeyboardEvent, id: string) => {
    if (e.metaKey || e.ctrlKey) {
      if (doc.selection.has(id)) doc.select(selectedIds.filter((s) => s !== id));
      else doc.select([id], true);
    } else if (e.shiftKey) {
      doc.select([id], true);
    } else {
      doc.select([id]);
    }
    anchor.current = id;
  };

  const beginRename = (id: string) => {
    setRenaming(id);
    setRenameText(id);
  };

  /** 이름 바꾸기를 확정한다. 거부되면 false (이유는 renameMapObject가 토스트로 알린다) */
  const commitRename = (): boolean => {
    if (renaming === null) return true;
    const id = renaming;
    const next = renameText.trim();
    if (!renameMapObject(editor, doc, id, next)) return false;
    setRenaming(null);
    requestAnimationFrame(() => focusRow(next || id));
    return true;
  };

  const add = (type: string) => {
    const created = addMapObject(editor, doc, type);
    if (created) {
      anchor.current = created.id;
      requestAnimationFrame(() => focusRow(created.id));
    }
  };

  const onListKey = (e: KeyboardEvent) => {
    if (renaming !== null) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (flat.length === 0) return;
      e.preventDefault();
      const current = anchor.current && flat.includes(anchor.current) ? flat.indexOf(anchor.current) : -1;
      const next = e.key === "ArrowDown" ? Math.min(flat.length - 1, current + 1) : Math.max(0, current - 1);
      const id = flat[next];
      if (e.shiftKey) doc.select([id], true);
      else doc.select([id]);
      anchor.current = id;
      focusRow(id);
    } else if (e.key === "F2" && selectedIds.length === 1) {
      e.preventDefault();
      beginRename(selectedIds[0]);
    } else if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
      e.preventDefault();
      deleteMapObjects(doc, selectedIds);
    }
  };

  const openContext = (e: MouseEvent, o: MapObject) => {
    e.preventDefault();
    e.stopPropagation();
    if (!doc.selection.has(o.id)) {
      doc.select([o.id]);
      anchor.current = o.id;
    }
    const ids = doc.selectedIds;
    const many = ids.length > 1;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "이름 바꾸기", disabled: many, onClick: () => beginRename(o.id) },
        { label: many ? `복제 (${ids.length}개)` : "복제", onClick: () => duplicateMapObjects(editor, doc, ids) },
        { label: many ? `삭제 (${ids.length}개)` : "삭제", danger: true, onClick: () => deleteMapObjects(doc, ids) },
      ],
    });
  };

  return (
    <div className="map-objects" data-testid="map-objects" data-map={doc.title}>
      <div className="map-objects-header">
        <span className="map-objects-title" title={doc.path ?? undefined}>
          {doc.title}
        </span>
        <span className="muted map-objects-count" data-testid="map-objects-count">
          {doc.model.objects.length}개
        </span>
      </div>
      {schemaError && (
        <div className="map-objects-banner" data-testid="map-objects-schema-error" title={schemaError}>
          {schemaError}
        </div>
      )}
      {!schema && !schemaError && <div className="panel-hint map-objects-noschema">스키마 없음. 타입별 추가 버튼을 표시하려면 resources/schema/map-objects.json이 필요합니다.</div>}
      <div className="map-objects-list" role="listbox" aria-multiselectable="true" aria-label="맵 오브젝트" ref={listRef} onKeyDown={onListKey} onContextMenu={(e) => e.preventDefault()}>
        {groups.map((g) => (
          <div key={g.type || "(unknown)"} className="map-objects-group" data-testid="map-objects-group" data-type={g.type} data-count={g.objects.length}>
            <div className="map-objects-group-head">
              <span className={"map-swatch is-" + (g.spec?.color ?? "muted")} aria-hidden="true" />
              <span className="map-objects-group-label">{g.label}</span>
              <span className="map-objects-badge" data-testid="map-objects-group-count">
                {g.objects.length}
              </span>
              {g.spec?.unique && <span className="muted map-objects-unique">맵당 1개</span>}
              {g.spec && (
                <button type="button" className="btn btn-ghost map-objects-add" onClick={() => add(g.type)} aria-label={`${g.label} 추가`} title={`${g.label} 추가 (맵 뷰의 화면 가운데)`} data-testid="map-objects-add" data-type={g.type}>
                  추가
                </button>
              )}
            </div>
            {g.objects.map((o) => {
              const selected = doc.selection.has(o.id);
              const spec = typeOf(schema, o.type);
              return (
                <div
                  key={o.id}
                  role="option"
                  tabIndex={0}
                  aria-selected={selected}
                  className={"map-objects-row" + (selected ? " is-selected" : "")}
                  data-testid="map-objects-row"
                  data-id={o.id}
                  data-type={o.type}
                  onClick={(e) => selectRow(e, o.id)}
                  onDoubleClick={() => focusObjectInView(editor, o.id)}
                  onContextMenu={(e) => openContext(e, o)}
                >
                  {renaming === o.id ? (
                    <input
                      className="input map-objects-rename"
                      value={renameText}
                      autoFocus
                      aria-label="새 id"
                      data-testid="map-objects-rename"
                      onChange={(e) => setRenameText(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => {
                        if (renameText.trim() === o.id) setRenaming(null);
                        else if (!commitRename()) {
                          // 거부된 이름은 버리고 원래 id로 닫는다. 초점이 갈 곳이 없으면 그 줄로 돌린다
                          setRenaming(null);
                          if (!focusLanded(e.relatedTarget)) requestAnimationFrame(() => focusRow(o.id));
                        }
                      }}
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
                    <span className="map-objects-id">{o.id}</span>
                  )}
                  <span className="muted map-objects-summary" data-testid="map-objects-summary">
                    {summarizeObject(o, spec)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        {doc.model.objects.length === 0 && schema && <div className="panel-hint">오브젝트 없음. 타입별 추가 버튼으로 추가할 수 있습니다.</div>}
      </div>
      <div className="map-objects-problems" data-testid="map-objects-problems" data-count={problems.length}>
        <div className="map-objects-problems-head">
          검사 {problems.length === 0 ? <span className="muted">(문제 없음)</span> : <span className="map-objects-badge">{problems.length}</span>}
        </div>
        <div className="map-objects-problems-list">
          {problems.map((p, i) => (
            <div
              key={i}
              className={"map-objects-problem is-" + p.severity + (p.objectId ? " is-link" : "")}
              data-testid="map-objects-problem"
              data-object-id={p.objectId}
              data-severity={p.severity}
              title={p.objectId ? "클릭하면 해당 오브젝트 선택" : undefined}
              onClick={() => selectProblem(editor, doc, p)}
            >
              <span className="map-objects-problem-where">{p.location}</span>
              <span>{p.message}</span>
            </div>
          ))}
        </div>
      </div>
      {menu && <ContextMenu state={menu} onClose={() => setMenu(null)} />}
    </div>
  );
});
