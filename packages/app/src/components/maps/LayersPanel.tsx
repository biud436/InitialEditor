// 레이어 패널. 위에서부터 확장 레이어(order 큰 것이 위), 오브젝트, 통행, 타일 레이어(목록 위가 나중에 그려진다) 줄이다.
// 줄 클릭은 편집 대상(doc.setTarget), 눈은 보이기, 타일 레이어 이름은 더블클릭으로 바꾼다.
// 확장 레이어(docs/plans/e5-rpg.md 2.3)는 이 맵에 상태가 붙었을 때만 줄이 있고, 잠겨 있으면 자물쇠와 이유를 보인다.
// 상태가 없는 레이어는 줄 대신 그 레이어의 hint 한 줄을 목록 아래에 옅게 둔다 (hint 가 없으면 아무것도 없다).
// 아래 단추: 추가(대상 위에), 삭제, 위로, 아래로. 전부 모델의 레이어 명령이라 되돌릴 수 있다.

import type { MapLayerSpec } from "@initial-editor/ext-tilemap";
import type { MapDocument } from "@initial-editor/ext-tilemap/model";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useEditor } from "../../editor/EditorContext";
import { addLayer, moveLayer, removeLayer, renameLayer } from "../../editor/maps/layerOps";
import { targetKey } from "./MapView";
import { useMapStructure } from "./useMapModel";
import "./LayersPanel.css";

export const LAYERS_EMPTY = "활성 맵 탭 없음";

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

/** 확장 레이어의 줄. 잠겼으면 자물쇠와 이유가 이름 아래에 있다 */
const ExtLayerRow = observer(function ExtLayerRow({ doc, spec, active }: { doc: MapDocument; spec: MapLayerSpec; active: boolean }) {
  const state = doc.layerState(spec.id);
  if (!state) return null;
  const locked = state.locked;
  const errors = doc.layerProblems().filter((p) => p.layer === spec.id && p.severity === "error").length;
  return (
    <>
      <Row keyName={`ext:${spec.id}`} active={active} onSelect={() => doc.setTarget({ kind: "ext", id: spec.id })}>
        <Eye visible={!doc.hiddenExtLayers.has(spec.id)} label={spec.label} onToggle={() => doc.toggleExtLayer(spec.id)} />
        <span className="layers-name">{spec.label}</span>
        {locked !== null && (
          <span className="layers-lock" data-testid="layer-lock" title={locked}>
            잠김
          </span>
        )}
        {errors > 0 && (
          <span className="layers-errors" data-testid="layer-errors" title="이 레이어의 오류 수 (목록은 인스펙터에 표시)">
            오류 {errors}
          </span>
        )}
        {spec.toolKey ? <span className="layers-meta">{spec.toolKey}</span> : null}
      </Row>
      {locked !== null && (
        <div className="layers-lock-reason" data-testid="layer-lock-reason">
          {locked}
        </div>
      )}
    </>
  );
});

const LayersBody = observer(function LayersBody({ doc }: { doc: MapDocument }) {
  const editor = useEditor();
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
  const extLayers = editor.mapSupport.layers();
  const attached = extLayers.filter((spec) => doc.layerState(spec.id) !== null).reverse();
  const hints = extLayers.flatMap((spec) => {
    if (doc.layerState(spec.id) !== null) return [];
    const hint = spec.hint?.(doc);
    return hint ? [{ id: spec.id, hint }] : [];
  });

  return (
    <div className="layers" data-testid="layers">
      <div className="layers-list" role="listbox" aria-label="레이어">
        {attached.map((spec) => (
          <ExtLayerRow key={spec.id} doc={doc} spec={spec} active={current === `ext:${spec.id}`} />
        ))}
        <Row keyName="objects" active={current === "objects"} onSelect={() => doc.setTarget({ kind: "objects" })}>
          <Eye visible={doc.showObjects} label="오브젝트" onToggle={() => runInAction(() => (doc.showObjects = !doc.showObjects))} />
          <span className="layers-name">오브젝트</span>
          <span className="layers-meta">{m.objects.length}개</span>
        </Row>
        <Row keyName="collision" active={current === "collision"} onSelect={() => doc.setTarget({ kind: "collision" })}>
          <Eye visible={doc.showCollision} label="통행" onToggle={() => runInAction(() => (doc.showCollision = !doc.showCollision))} />
          <span className="layers-name">통행</span>
          <span className="layers-meta">{m.collision ? `통행 불가 타일 ${collisionCells}개` : "없음"}</span>
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
        {hints.map((h) => (
          <div key={h.id} className="layers-hint" data-testid="layer-hint" data-layer={h.id}>
            {h.hint}
          </div>
        ))}
      </div>
      <div className="layers-actions">
        <button type="button" className="btn" data-testid="layer-add" onClick={() => addLayer(doc)} title="대상 레이어 위에 새 레이어">
          추가
        </button>
        <button type="button" className="btn" data-testid="layer-remove" disabled={activeIndex === null || count <= 1} onClick={() => removeLayer(doc)} title="대상 레이어 삭제 (되돌리기 가능)">
          삭제
        </button>
        <button type="button" className="btn" data-testid="layer-up" disabled={activeIndex === null || activeIndex >= count - 1} onClick={() => moveLayer(doc, 1)} title="위로 (나중에 그림)">
          위로
        </button>
        <button type="button" className="btn" data-testid="layer-down" disabled={activeIndex === null || activeIndex <= 0} onClick={() => moveLayer(doc, -1)} title="아래로 (먼저 그림)">
          아래로
        </button>
      </div>
    </div>
  );
});
