// 씬 문서 뷰 (E2). 위에 상태 띠(씬 이름, 오브젝트와 선택 수, 줌, 격자와 스냅, 카메라로), 아래에 PIXI 캔버스.
// 렌더러(SceneRenderer)는 탭마다 하나이고 내릴 때 버린다. 테마가 바뀌면 토큰을 다시 읽어 렌더러에 준다.
// data-zoom, data-pan-x, data-pan-y 는 월드 → 화면 변환(screen = world * zoom + pan)이며 e2e 가 오브젝트 좌표를
// 캔버스 픽셀로 옮길 때 쓴다. data-grid 와 data-snap 은 보기 설정이다.

import type { SceneDocument } from "@initial-editor/core";
import { reaction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useEditor } from "../../editor/EditorContext";
import { GRID_SIZES, readSceneTheme, SceneRenderer } from "../../editor/sceneView";
import "./SceneView.css";

const APPROX_NOTE =
  "씬 뷰는 근사 표시. 텍스트는 시스템 폰트로 렌더링(게임은 BMFont), 스프라이트는 시작 프레임만 표시, 회전과 배율 기준점은 엔진과 같은 왼쪽 위. 정확한 결과는 게임 탭에서 확인";

export const SceneView = observer(function SceneView({ document: doc }: { document: SceneDocument }) {
  const editor = useEditor();
  const support = editor.sceneSupport;
  const hostRef = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<SceneRenderer | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const r = new SceneRenderer({
      document: doc,
      view: support.view,
      textures: support.textures,
      objectTypes: editor.registries.objectTypes,
      gameSize: () => support.gameSize(),
      theme: () => readSceneTheme(),
    });
    setRenderer(r);
    support.attachRenderer(doc, r);
    void r.init(host);
    // apply() 가 data-theme 를 같은 액션에서 바꾸므로 여기서 getComputedStyle 은 이미 새 토큰이다 (scripting/themes.ts 와 같은 이유)
    const stopTheme = reaction(
      () => editor.theme.applied,
      () => r.setTheme(readSceneTheme()),
    );
    return () => {
      stopTheme();
      support.detachRenderer(doc, r);
      r.dispose();
      setRenderer(null);
    };
  }, [doc, editor, support]);

  const view = support.view;
  const t = renderer?.transform;
  const zoom = t?.zoom ?? view.zoom;
  const game = support.gameSize();
  const selected = doc.selectedIds.length;
  const status = renderer?.status;
  const run = (id: string) => () => {
    void editor.commands.execute(id);
  };

  return (
    <div
      className="scene-view"
      data-testid="scene-view"
      data-zoom={zoom}
      data-pan-x={t?.panX ?? 0}
      data-pan-y={t?.panY ?? 0}
      data-grid={view.grid ? "on" : "off"}
      data-snap={view.snap ? "on" : "off"}
      data-ready={status?.ready ? "true" : "false"}
    >
      <div className="doc-header scene-view-header">
        <span className="doc-header-path" title={doc.path ?? undefined}>
          {doc.scene.name || doc.title}
        </span>
        <span title="카메라 (game.json 의 논리 해상도)">
          {game.width} x {game.height}
        </span>
        <span>오브젝트 {doc.scene.objects.length}</span>
        <span>
          선택 <span data-testid="scene-selection-count">{selected}</span>
        </span>
        <span className="doc-header-spacer" />
        <button type="button" className={"btn" + (view.grid ? " is-on" : "")} aria-pressed={view.grid} onClick={run("scene.toggleGrid")} title="격자 표시">
          격자
        </button>
        <select className="select scene-view-gridsize" aria-label="격자 크기" value={view.gridSize} onChange={(e) => view.setGridSize(Number(e.target.value))} title="격자 크기 (픽셀)">
          {(GRID_SIZES as readonly number[]).includes(view.gridSize) ? null : <option value={view.gridSize}>{view.gridSize}</option>}
          {GRID_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="button" className={"btn" + (view.snap ? " is-on" : "")} aria-pressed={view.snap} onClick={run("scene.toggleSnap")} title="격자에 스냅">
          스냅
        </button>
        <button type="button" className="btn" onClick={() => view.zoomOut()} aria-label="줌 축소">
          -
        </button>
        <span className="scene-view-zoom" data-testid="scene-zoom" title="줌 (휠로 커서 기준 확대, Shift+휠로 이동)">
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" className="btn" onClick={() => view.zoomIn()} aria-label="줌 확대">
          +
        </button>
        <button type="button" className="btn" onClick={() => renderer?.fitCamera()} disabled={!status?.ready} title="카메라 영역 전체가 보이도록 줌과 팬 조정">
          카메라에 맞추기
        </button>
        <span className="scene-view-note" title={APPROX_NOTE}>
          근사
        </span>
        <span className="doc-header-save-state">{doc.dirty ? "저장 안 됨" : "저장됨"}</span>
      </div>
      {status?.error ? (
        <div className="panel-hint scene-view-error" data-testid="scene-view-error">
          씬 뷰 렌더링 실패: {status.error}
        </div>
      ) : null}
      <div className="scene-view-host" ref={hostRef} tabIndex={0} role="application" aria-label={`씬 뷰: ${doc.scene.name || doc.title}`} />
    </div>
  );
});
