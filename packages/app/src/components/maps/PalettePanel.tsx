// 타일 팔레트 패널. 활성 맵의 타일셋을 탭으로 고르고, 이미지를 정수 배율(1x, 2x, 3x)로 캔버스에 그린다.
// 클릭은 한 칸, 끌기는 사각형 붓을 고른다 (doc.setBrush). 지금 붓은 --accent 테두리로 보인다.
// 대상이 타일 레이어가 아니었으면 붓을 고를 때 마지막 타일 레이어로 돌아간다.

import { paletteBrush, type MapDocument, type Tileset } from "@initial-editor/ext-tilemap/model";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useEditor } from "../../editor/EditorContext";
import { cssToken, PALETTE_ZOOMS } from "../../editor/maps";
import { brushInTileset } from "../../editor/maps/mapGeometry";
import { useMapStructure } from "./useMapModel";
import "./PalettePanel.css";

export const PALETTE_EMPTY = "활성 맵 탭 없음";

interface LoadedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
}

interface DragRect {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export const PalettePanel = observer(function PalettePanel() {
  const editor = useEditor();
  const doc = editor.mapSupport.activeMap;
  if (!doc) {
    return (
      <div className="panel-body" data-testid="palette">
        <div className="panel-hint">{PALETTE_EMPTY}</div>
      </div>
    );
  }
  return <PaletteBody doc={doc} />;
});

function brushLabel(doc: MapDocument): string {
  const b = doc.brush;
  const gids = b.gids.flat();
  const nonZero = gids.filter((g) => g > 0);
  if (nonZero.length === 0) return `브러시 ${b.width}x${b.height} (빈 타일)`;
  if (gids.length === 1) return `브러시 gid ${gids[0]}`;
  return `브러시 ${b.width}x${b.height} (gid ${Math.min(...nonZero)}..${Math.max(...nonZero)})`;
}

const PaletteBody = observer(function PaletteBody({ doc }: { doc: MapDocument }) {
  const editor = useEditor();
  const support = editor.mapSupport;
  useMapStructure(doc);
  const tilesets = doc.model.tilesets;
  const index = Math.min(Math.max(0, doc.paletteTileset), Math.max(0, tilesets.length - 1));
  const tileset: Tileset | undefined = tilesets[index];
  const tw = doc.model.tileWidth;
  const th = doc.model.tileHeight;
  const zoom = support.view.paletteZoom;
  const theme = editor.theme.applied;
  const brush = doc.brush;
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [drag, setDrag] = useState<DragRect | null>(null);
  const dragRef = useRef<DragRect | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagePath = tileset?.image ?? null;

  useEffect(() => {
    if (!imagePath) return;
    let alive = true;
    setImage(null);
    setError(null);
    support.textures.load(imagePath).then(
      (l) => {
        if (alive) setImage({ image: l.texture.source.resource as CanvasImageSource, width: l.width, height: l.height });
      },
      (e: Error) => {
        if (alive) setError(e.message);
      },
    );
    const off = support.textures.events.on("invalidated", (p) => {
      if (p === imagePath) setReload((n) => n + 1);
    });
    return () => {
      alive = false;
      off();
    };
  }, [imagePath, reload, support]);

  const cols = tileset?.columns ?? 1;
  const rows = image ? Math.floor(image.height / th) : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !tileset) return;
    const cssW = image.width * zoom;
    const cssH = image.height * zoom;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.drawImage(image.image, 0, 0, cssW, cssH);
    const cw = tw * zoom;
    const ch = th * zoom;
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = cssToken("border");
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < cols; c++) {
      ctx.moveTo(c * cw + 0.5, 0);
      ctx.lineTo(c * cw + 0.5, rows * ch);
    }
    for (let r = 1; r < rows; r++) {
      ctx.moveTo(0, r * ch + 0.5);
      ctx.lineTo(cols * cw, r * ch + 0.5);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    const accent = cssToken("accent");
    const where = brushInTileset(brush, tileset, rows);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    if (where.rect) {
      ctx.strokeRect(where.rect.col * cw + 1, where.rect.row * ch + 1, where.rect.width * cw - 2, where.rect.height * ch - 2);
    } else {
      for (const c of where.cells) ctx.strokeRect(c.col * cw + 1, c.row * ch + 1, cw - 2, ch - 2);
    }
    if (drag) {
      const x0 = Math.min(drag.c0, drag.c1);
      const y0 = Math.min(drag.r0, drag.r1);
      const w = Math.abs(drag.c1 - drag.c0) + 1;
      const h = Math.abs(drag.r1 - drag.r0) + 1;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = accent;
      ctx.fillRect(x0 * cw, y0 * ch, w * cw, h * ch);
      ctx.globalAlpha = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x0 * cw + 1, y0 * ch + 1, w * cw - 2, h * ch - 2);
      ctx.setLineDash([]);
    }
  }, [image, zoom, brush, drag, theme, cols, rows, tileset, tw, th]);

  const cellFrom = (e: PointerEvent<HTMLCanvasElement>): { c: number; r: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left) / (tw * zoom));
    const r = Math.floor((e.clientY - rect.top) / (th * zoom));
    return { c: Math.max(0, Math.min(cols - 1, c)), r: Math.max(0, Math.min(rows - 1, r)) };
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || rows === 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { c, r } = cellFrom(e);
    dragRef.current = { c0: c, r0: r, c1: c, r1: r };
    setDrag(dragRef.current);
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const { c, r } = cellFrom(e);
    if (c === d.c1 && r === d.r1) return;
    dragRef.current = { ...d, c1: c, r1: r };
    setDrag(dragRef.current);
  };
  const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d || !tileset) return;
    const last = support.lastLayer(doc);
    const wasLayer = doc.target.kind === "layer";
    doc.setBrush(paletteBrush(tileset, d.c0, d.r0, d.c1, d.r1));
    if (!wasLayer) doc.setTarget({ kind: "layer", index: last });
  };

  return (
    <div className="palette" data-testid="palette" data-tileset={index}>
      <div className="palette-header">
        <span className="palette-tabs" role="tablist" aria-label="타일셋">
          {tilesets.map((t, i) => (
            <button
              key={`${i}:${t.image}`}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={"palette-tab" + (i === index ? " is-active" : "")}
              data-testid="palette-tab"
              title={`${t.image} (firstGid ${t.firstGid}, ${t.columns}열)`}
              onClick={() => runInAction(() => (doc.paletteTileset = i))}
            >
              {basename(t.image)}
            </button>
          ))}
        </span>
        <span className="palette-spacer" />
        <span className="palette-zooms" role="group" aria-label="팔레트 배율">
          {PALETTE_ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              className={"palette-zoom" + (z === zoom ? " is-active" : "")}
              aria-pressed={z === zoom}
              data-testid={`palette-zoom-${z}`}
              onClick={() => support.view.setPaletteZoom(z)}
            >
              {z}x
            </button>
          ))}
        </span>
      </div>
      <div className="palette-info">
        <span data-testid="palette-brush">{brushLabel(doc)}</span>
        {tileset && image ? (
          <span className="muted">
            {cols}열 {rows}행, gid {tileset.firstGid}..{tileset.firstGid + cols * rows - 1}
          </span>
        ) : null}
      </div>
      <div className="palette-scroll">
        {!tileset ? <div className="panel-hint">타일셋 없음</div> : null}
        {error ? (
          <div className="panel-hint palette-error">
            {tileset?.image} 읽기 실패: {error}
          </div>
        ) : null}
        {tileset && !error ? (
          <canvas
            ref={canvasRef}
            className="palette-canvas"
            data-testid="palette-canvas"
            data-zoom={zoom}
            data-tile-width={tw}
            data-tile-height={th}
            data-columns={cols}
            data-rows={rows}
            data-ready={image ? "true" : "false"}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        ) : null}
      </div>
    </div>
  );
});
