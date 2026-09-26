// 레이어 패널. 위에서부터 오브젝트, 통행, 타일 레이어(목록 위가 나중에 그려진다) 줄이다.
// 줄 클릭은 편집 대상(doc.setTarget), 눈은 보이기, 타일 레이어 이름은 더블클릭으로 바꾼다.
// 아래 단추: 추가(대상 위에), 삭제, 위로, 아래로. 전부 모델의 레이어 명령이라 되돌릴 수 있다.

import type { MapDocument } from "@initial-editor/ext-tilemap/model";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useEditor } from "../../editor/EditorContext";
import { addLayer, moveLayer, removeLayer, renameLayer } from "../../editor/maps/layerOps";
import { targetKey } from "./MapView";
import { useMapStructure } from "./useMapModel";
import "./LayersPanel.css";

export const LAYERS_EMPTY = "맵 탭을 열면 레이어가 보인다";

export const LayersPanel = observer(function LayersPanel() {
  const editor = useEditor();
  const doc = editor.mapSupport.activeMap;
  if (!doc) {
    return (
      <div className="panel-body" data-testid="layers">
        <div className="panel-hint">{LAYERS_EMPTY}</div>
      </div>
    );
  }
  return <LayersBody doc={doc} />;
});

function Eye({ visible, label, onToggle }: { visible: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={"layers-eye" + (visible ? "" : " is-off")}
      aria-pressed={visible}
      aria-label={`${label} ${visible ? "숨기기" : "보이기"}`}
      title={visible ? "숨기기" : "보이기"}
      data-testid="layer-eye"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {visible ? "보임" : "숨김"}
    </button>
  );
}

function Row({ keyName, active, children, onSelect, onDoubleClick }: { keyName: string; active: boolean; children: ReactNode; onSelect: () => void; onDoubleClick?: () => void }) {
  return (
    <div
      className={"layers-row" + (active ? " is-active" : "")}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      data-testid="layer-row"
      data-target={keyName}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
    >
      {children}
    </div>
  );
}

const LayersBody = observer(function LayersBody({ doc }: { doc: MapDocument }) {
  useMapStructure(doc);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [text, setText] = useState("");
  const m = doc.model;
  const current = targetKey(doc.target);
  const activeIndex = doc.target.kind === "layer" ? doc.target.index : null;
  const count = m.layers.length;

  const commitRename = () => {
    if (renaming !== null) renameLayer(doc, renaming, text);
    setRenaming(null);
  };
  const onRenameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setRenaming(null);
    }
  };

  const collisionCells = m.collision ? m.collision.reduce((n, v) => (v !== 0 ? n + 1 : n), 0) : 0;
  void m.revision;

  return (
    <div className="layers" data-testid="layers">
      <div className="layers-list" role="listbox" aria-label="레이어">
        <Row keyName="objects" active={current === "objects"} onSelect={() => doc.setTarget({ kind: "objects" })}>
          <Eye visible={doc.showObjects} label="오브젝트" onToggle={() => runInAction(() => (doc.showObjects = !doc.showObjects))} />
          <span className="layers-name">오브젝트</span>
          <span className="layers-meta">{m.objects.length}개</span>
        </Row>
        <Row keyName="collision" active={current === "collision"} onSelect={() => doc.setTarget({ kind: "collision" })}>
          <Eye visible={doc.showCollision} label="통행" onToggle={() => runInAction(() => (doc.showCollision = !doc.showCollision))} />
          <span className="layers-name">통행</span>
          <span className="layers-meta">{m.collision ? `막힘 ${collisionCells}칸` : "없음"}</span>
        </Row>
        <div className="layers-sep" />
        {m.layers
          .map((layer, i) => ({ layer, i }))
          .reverse()
          .map(({ layer, i }) => (
            <Row
              key={i}
              keyName={`layer:${i}`}
              active={current === `layer:${i}`}
              onSelect={() => doc.setTarget({ kind: "layer", index: i })}
              onDoubleClick={() => {
                setRenaming(i);
                setText(layer.name);
              }}
            >
              <Eye visible={!doc.hiddenLayers.has(i)} label={layer.name} onToggle={() => doc.toggleLayer(i)} />
              {renaming === i ? (
                <input
                  className="input layers-rename"
                  value={text}
                  autoFocus
                  aria-label="레이어 이름"
                  data-testid="layer-rename"
                  onChange={(e) => setText(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={onRenameKey}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="layers-name" title="더블클릭으로 이름 바꾸기">
                  {layer.name}
                </span>
              )}
              <span className="layers-meta">{i}</span>
            </Row>
          ))}
      </div>
      <div className="layers-actions">
        <button type="button" className="btn" data-testid="layer-add" onClick={() => addLayer(doc)} title="대상 레이어 위에 새 레이어">
          추가
        </button>
        <button type="button" className="btn" data-testid="layer-remove" disabled={activeIndex === null || count <= 1} onClick={() => removeLayer(doc)} title="대상 레이어 지우기 (되돌릴 수 있다)">
          삭제
        </button>
        <button type="button" className="btn" data-testid="layer-up" disabled={activeIndex === null || activeIndex >= count - 1} onClick={() => moveLayer(doc, 1)} title="위로 (나중에 그린다)">
          위로
        </button>
        <button type="button" className="btn" data-testid="layer-down" disabled={activeIndex === null || activeIndex <= 0} onClick={() => moveLayer(doc, -1)} title="아래로 (먼저 그린다)">
          아래로
        </button>
      </div>
    </div>
  );
});
