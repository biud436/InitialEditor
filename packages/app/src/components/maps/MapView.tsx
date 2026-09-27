// 맵 문서 뷰. 위에 머리 띠 두 줄(맵 이름과 크기와 줌, 도구와 보기 토글과 커서 좌표), 아래에 PIXI 캔버스.
// 렌더러(MapRenderer)는 뷰마다 하나이고 내릴 때 버린다. 테마가 바뀌면 토큰을 다시 읽어 렌더러에 준다.
// data-zoom, data-pan-x, data-pan-y는 월드 → 화면 변환(screen = world * zoom + pan)이다. e2e가 칸과 오브젝트를
// 캔버스 픽셀로 옮길 때 쓴다. data-tool, data-target은 문서의 편집 상태, data-ready는 타일셋까지 그린 뒤 true.
// 확장이 이 맵에서 타일을 고르는 동안(MapSupport.picker) 캔버스 위 가운데에 요청의 글과 취소 단추를 띄우고(캔버스가 밀리지
// 않게 겹쳐 그린다. 띠 위의 누름은 취소 단추 말고는 아래 타일로 간다), 캔버스 자리에 data-pick-surface를 달아 그 밖의 누름이
// 고르기를 취소하게 하고, 캔버스 자리에 초점을 준다.
// data-picking은 고르는 중이면 true.

import type { MapDocument, MapTarget } from "@initial-editor/ext-tilemap/model";
import { reaction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useEditor } from "../../editor/EditorContext";
import { MapRenderer, readMapTheme } from "../../editor/maps";
import { layerCommandId } from "../../editor/maps/extLayers";
import { MAP_TOOLS } from "../../editor/maps/mapCommands";
import { targetHidden } from "../../editor/maps/mapTools";
import { MapSizeButton } from "./MapSizeButton";
import "./MapView.css";

export function targetKey(target: MapTarget): string {
  if (target.kind === "layer") return `layer:${target.index}`;
  if (target.kind === "ext") return `ext:${target.id}`;
  return target.kind;
}

function targetLabel(doc: MapDocument, extLabel: (id: string) => string | undefined): string {
  const t = doc.target;
  if (t.kind === "collision") return "통행";
  if (t.kind === "objects") return "오브젝트";
  if (t.kind === "ext") return extLabel(t.id) ?? t.id;
  return doc.model.layers[t.index]?.name ?? `레이어 ${t.index}`;
}

const MapCursor = observer(function MapCursor({ renderer }: { renderer: MapRenderer | null }) {
  const hover = renderer?.hover.get() ?? null;
  return (
    <span className="map-view-cursor" data-testid="map-cursor" title="포인터 아래의 칸과 픽셀 좌표">
      {hover ? `칸 ${hover.cell.x}, ${hover.cell.y}  픽셀 ${hover.px.x}, ${hover.px.y}` : "칸 -"}
    </span>
  );
});

export const MapView = observer(function MapView({ document: doc }: { document: MapDocument }) {
  const editor = useEditor();
  const support = editor.mapSupport;
  const hostRef = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<MapRenderer | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const r: MapRenderer = new MapRenderer({
      document: doc,
      textures: support.textures,
      view: support.view,
      theme: () => readMapTheme(),
      onCursor: (p) => support.setCursor(p, r),
      // 같은 알림이 떠 있으면 다시 띄우지 않는다
      onNotice: (message) => {
        if (!editor.toasts.toasts.some((t) => t.text === message)) editor.toasts.warn(message);
      },
      layers: () => support.layers(),
      pick: { active: () => support.picker.isPicking(doc), choose: (cell) => support.picker.choose(doc, cell) },
    });
    setRenderer(r);
    support.attachRenderer(doc, r);
    void r.init(host);
    // apply()가 data-theme를 같은 액션에서 바꾸므로 여기서 읽는 토큰은 이미 새 값이다
    const stopTheme = reaction(
      () => editor.theme.applied,
      () => r.setTheme(readMapTheme()),
    );
    return () => {
      stopTheme();
      support.detachRenderer(doc, r);
      r.dispose();
      setRenderer(null);
    };
  }, [doc, editor, support]);

  const pick = support.picker.active?.doc === doc ? support.picker.active : null;
  const picking = pick !== null;
  useEffect(() => {
    if (picking) hostRef.current?.focus({ preventScroll: true });
  }, [picking]);

  const m = doc.model;
  void m.revision;
  const t = renderer?.transform;
  const zoom = t?.zoom ?? 1;
  const status = renderer?.status;
  const view = support.view;
  const run = (id: string) => () => {
    void editor.commands.execute(id);
  };
  const paintsHidden = doc.tool !== "object" && doc.tool !== "pick" && targetHidden(doc);
  const extTools = support.layers().filter((spec) => doc.layerState(spec.id) !== null);

  return (
    <div
      className="map-view"
      data-testid="map-view"
      data-zoom={zoom}
      data-pan-x={t?.panX ?? 0}
      data-pan-y={t?.panY ?? 0}
      data-tool={doc.tool}
      data-target={targetKey(doc.target)}
      data-ready={status?.ready ? "true" : "false"}
      data-picking={picking ? "true" : "false"}
      data-chunk-renders={renderer?.stats.chunkRenders ?? 0}
      data-chunk-textures={renderer?.stats.chunkTextures ?? 0}
    >
      <div className="doc-header map-view-header">
        <span className="doc-header-path" title={doc.path ?? undefined}>
          {m.name || doc.title}
        </span>
        <MapSizeButton document={doc} onResize={run("map.resize")} />
        <span>
          선택 <span data-testid="map-selection-count">{doc.selectedIds.length}</span>
        </span>
        <span className="doc-header-spacer" />
        <MapCursor renderer={renderer} />
        <span className="map-view-group">
          <button type="button" className="btn" onClick={run("map.zoomOut")} aria-label="줌 축소" title="줌 축소 (Ctrl+-)" disabled={!status?.ready}>
            -
          </button>
          <button
            type="button"
            className="btn map-view-zoom"
            data-testid="map-zoom"
            onClick={run("map.zoomReset")}
            disabled={!status?.ready}
            title="누르면 100% (Ctrl+0). 휠은 커서 기준 확대, Shift+휠과 가운데 버튼 끌기와 Space+끌기는 이동"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="btn" onClick={run("map.zoomIn")} aria-label="줌 확대" title="줌 확대 (Ctrl+=)" disabled={!status?.ready}>
            +
          </button>
        </span>
        <button type="button" className="btn" onClick={run("map.fit")} disabled={!status?.ready} data-testid="map-fit" title="맵 전체가 보이게 줌과 팬을 맞춘다">
          맵 전체 보기
        </button>
        <span>{doc.dirty ? "수정됨" : "저장됨"}</span>
      </div>
      <div className="doc-header map-view-tools" role="toolbar" aria-label="맵 도구">
        <span className="map-view-group">
          {MAP_TOOLS.map((spec) => {
            const on = doc.tool === spec.tool;
            return (
              <button
                key={spec.tool}
                type="button"
                className={"btn map-view-tool" + (on ? " is-on" : "")}
                aria-pressed={on}
                data-testid={`map-tool-${spec.tool}`}
                title={`${spec.label} (${spec.key}): ${spec.title}`}
                onClick={run(`map.tool.${spec.tool}`)}
              >
                {spec.label}
                <kbd className="map-view-key">{spec.key}</kbd>
              </button>
            );
          })}
          {extTools.map((spec) => {
            const on = doc.target.kind === "ext" && doc.target.id === spec.id;
            return (
              <button
                key={spec.id}
                type="button"
                className={"btn map-view-tool" + (on ? " is-on" : "")}
                aria-pressed={on}
                data-testid={`map-tool-ext-${spec.id}`}
                title={spec.toolKey ? `${spec.label} (${spec.toolKey})` : spec.label}
                onClick={run(layerCommandId(spec.id))}
              >
                {spec.label}
                {spec.toolKey ? <kbd className="map-view-key">{spec.toolKey}</kbd> : null}
              </button>
            );
          })}
        </span>
        <span className="map-view-target" title="칠하거나 고르는 대상 (레이어 패널에서 바꾼다)">
          대상 <b data-testid="map-target">{targetLabel(doc, (id) => support.layer(id)?.label)}</b>
        </span>
        {paintsHidden ? (
          <span className="map-view-hidden-hint" data-testid="map-target-hidden" title={doc.tool === "ext" ? "레이어 패널에서 눈을 켜면 고칠 수 있다" : "레이어 패널에서 눈을 켜면 칠할 수 있다"}>
            {doc.tool === "ext" ? "숨김, 고치지 않는다" : "숨김, 칠하지 않는다"}
          </span>
        ) : null}
        <span className="doc-header-spacer" />
        <span className="map-view-group">
          <button type="button" className={"btn" + (view.grid ? " is-on" : "")} aria-pressed={view.grid} onClick={run("map.toggleGrid")} data-testid="map-toggle-grid" title="타일 격자 (8칸마다 굵은 선)">
            격자
          </button>
          <button
            type="button"
            className={"btn" + (doc.showCollision ? " is-on" : "")}
            aria-pressed={doc.showCollision}
            onClick={run("map.toggleCollision")}
            data-testid="map-toggle-collision"
            title="통행 겹쳐 보기 (막힌 칸)"
          >
            통행
          </button>
          <button
            type="button"
            className={"btn" + (doc.showObjects ? " is-on" : "")}
            aria-pressed={doc.showObjects}
            onClick={run("map.toggleObjects")}
            data-testid="map-toggle-objects"
            title="오브젝트 표식 보기"
          >
            오브젝트
          </button>
        </span>
      </div>
      {status?.error ? (
        <div className="panel-hint map-view-error" data-testid="map-view-error">
          맵 뷰를 그릴 수 없다: {status.error}
        </div>
      ) : null}
      {status?.warning ? (
        <div className="map-view-warning" data-testid="map-view-warning">
          {status.warning}
        </div>
      ) : null}
      <div className="map-view-stage">
        <div
          className="map-view-host"
          ref={hostRef}
          tabIndex={0}
          role="application"
          aria-label={`맵 뷰: ${m.name || doc.title}`}
          data-pick-surface={picking ? "true" : undefined}
        />
        {pick ? (
          <div className="map-view-pick" role="status" data-testid="map-pick-banner">
            <span data-testid="map-pick-prompt">{pick.prompt}</span>
            <button type="button" className="btn" data-testid="map-pick-cancel" onClick={() => support.picker.cancel()}>
              취소
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
});
