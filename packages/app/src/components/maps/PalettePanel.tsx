// 타일 팔레트 패널. 활성 맵의 타일셋을 탭으로 고르고, 정수 배율(1x, 2x, 3x)로 캔버스에 그린다.
// 클릭은 한 칸, 끌기는 사각형 붓을 고른다 (doc.setBrush). 지금 붓은 --accent 테두리로 보인다.
// 대상이 타일 레이어가 아니었으면 붓을 고를 때 마지막 타일 레이어로 돌아간다.
// 타일셋 종류(ext-tilemap 의 TilesetKindSpec)가 팔레트 쪽을 주면 그림 대신 쪽을 탭으로 보이고, 칸마다 그 칸의 그림을 그린다
// (RPG Maker 2000 ChipSet 의 하층과 상층). 붓은 칸의 값이고, 모양을 맞춘 오토타일 칸을 뜬 붓도 그 지형의 칸에 테두리가 보인다.

import type { PalettePage } from "@initial-editor/ext-tilemap";
import { paletteBrush, type Brush, type MapDocument, type Tileset } from "@initial-editor/ext-tilemap/model";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { guidePage } from "../../editor/about";
import { useEditor } from "../../editor/EditorContext";
import { ExternalLink } from "../ExternalLink";
import { cssToken, PALETTE_ZOOMS } from "../../editor/maps";
import { brushInPage, brushInTileset, pageBrush } from "../../editor/maps/mapGeometry";
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

/** 쪽 팔레트의 붓 표시: 한 칸이면 그 칸의 이름 (보이는 쪽에 없으면 다른 쪽에서 찾는다) */
function pageBrushLabel(brush: Brush, page: PalettePage, pages: readonly PalettePage[]): string {
  if (brush.width === 1 && brush.height === 1) {
    for (const p of [page, ...pages.filter((q) => q !== page)]) {
      const i = p.cellOf(brush.gids[0][0]);
      if (i >= 0) return `브러시: ${p.cells[i].label}`;
    }
  }
  return `브러시 ${brush.width}x${brush.height}`;
}

interface GridProps {
  doc: MapDocument;
  tileset: Tileset;
  image: LoadedImage | null;
  zoom: number;
  theme: string;
  onBrush(brush: Brush): void;
}

/** 칸 격자 캔버스의 끌기 (칸 좌표). 놓을 때 onRelease */
function useGridDrag(cols: number, rows: number, cw: number, ch: number, onRelease: (d: DragRect) => void) {
  const [drag, setDrag] = useState<DragRect | null>(null);
  const dragRef = useRef<DragRect | null>(null);
  const cellFrom = (e: PointerEvent<HTMLCanvasElement>): { c: number; r: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left) / cw);
    const r = Math.floor((e.clientY - rect.top) / ch);
    return { c: Math.max(0, Math.min(cols - 1, c)), r: Math.max(0, Math.min(rows - 1, r)) };
  };
  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || rows === 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { c, r } = cellFrom(e);
    dragRef.current = { c0: c, r0: r, c1: c, r1: r };
    setDrag(dragRef.current);
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const { c, r } = cellFrom(e);
    if (c === d.c1 && r === d.r1) return;
    dragRef.current = { ...d, c1: c, r1: r };
    setDrag(dragRef.current);
  };
  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d) onRelease(d);
  };
  return { drag, cellFrom, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}

/** 캔버스 크기를 맞추고 2D 문맥을 준다 (화면 배율 반영) */
function prepareCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cssW, cssH);
  return ctx;
}

/** 격자 선, 붓 테두리, 끌기 사각형 */
function drawOverlay(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  cw: number,
  ch: number,
  where: { rect: { col: number; row: number; width: number; height: number } | null; cells: Array<{ col: number; row: number }> },
  drag: DragRect | null,
): void {
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
}

/** 타일셋 그림을 그대로 보이는 팔레트 */
function ImageGrid({ doc, tileset, image, zoom, theme, onBrush }: GridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tw = doc.model.tileWidth;
  const th = doc.model.tileHeight;
  const brush = doc.brush;
  const cols = tileset.columns;
  const rows = image ? Math.floor(image.height / th) : 0;
  const { drag, handlers } = useGridDrag(cols, rows, tw * zoom, th * zoom, (d) => onBrush(paletteBrush(tileset, d.c0, d.r0, d.c1, d.r1)));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const cssW = image.width * zoom;
    const cssH = image.height * zoom;
    const ctx = prepareCanvas(canvas, cssW, cssH);
    if (!ctx) return;
    ctx.drawImage(image.image, 0, 0, cssW, cssH);
    drawOverlay(ctx, cols, rows, tw * zoom, th * zoom, brushInTileset(brush, tileset, rows), drag);
  }, [image, zoom, brush, drag, theme, cols, rows, tileset, tw, th]);

  return (
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
      {...handlers}
    />
  );
}

/** 타일셋 종류가 준 쪽 하나의 팔레트 */
function PageGrid({ doc, tileset, image, zoom, theme, onBrush, page, onHover }: GridProps & { page: PalettePage; onHover(label: string | null): void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tw = doc.model.tileWidth;
  const th = doc.model.tileHeight;
  const brush = doc.brush;
  const cols = page.columns;
  const rows = Math.ceil(page.cells.length / cols);
  const cw = tw * zoom;
  const ch = th * zoom;
  const { drag, cellFrom, handlers } = useGridDrag(cols, rows, cw, ch, (d) => onBrush(pageBrush(page, d.c0, d.r0, d.c1, d.r1)));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = prepareCanvas(canvas, cols * cw, rows * ch);
    if (!ctx) return;
    page.cells.forEach((cell, i) => {
      const local = cell.icon - tileset.firstGid;
      const sx = (local % tileset.columns) * tw;
      const sy = Math.floor(local / tileset.columns) * th;
      ctx.drawImage(image.image, sx, sy, tw, th, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
    });
    drawOverlay(ctx, cols, rows, cw, ch, brushInPage(brush, page), drag);
  }, [image, page, brush, drag, theme, cols, rows, cw, ch, tileset, tw, th]);

  const hover = (e: PointerEvent<HTMLCanvasElement>) => {
    handlers.onPointerMove(e);
    const { c, r } = cellFrom(e);
    onHover(page.cells[r * cols + c]?.label ?? null);
  };

  return (
    <canvas
      ref={canvasRef}
      className="palette-canvas"
      data-testid="palette-canvas"
      data-page={page.id}
      data-zoom={zoom}
      data-tile-width={tw}
      data-tile-height={th}
      data-columns={cols}
      data-rows={rows}
      data-ready={image ? "true" : "false"}
      {...handlers}
      onPointerMove={hover}
      onPointerLeave={() => onHover(null)}
    />
  );
}

const PaletteBody = observer(function PaletteBody({ doc }: { doc: MapDocument }) {
  const editor = useEditor();
  const support = editor.mapSupport;
  useMapStructure(doc);
  const tilesets = doc.model.tilesets;
  const index = Math.min(Math.max(0, doc.paletteTileset), Math.max(0, tilesets.length - 1));
  const tileset: Tileset | undefined = tilesets[index];
  const th = doc.model.tileHeight;
  const zoom = support.view.paletteZoom;
  const theme = editor.theme.applied;
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const imagePath = tileset?.image ?? null;
  const kind = tileset ? (editor.tilemap?.tilesetKind(tileset) ?? null) : null;
  const pages = tileset ? (kind?.palette?.(tileset) ?? null) : null;
  const page = pages && pages.length > 0 ? pages[Math.min(pageIndex, pages.length - 1)] : null;

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

  const onBrush = (brush: Brush) => {
    const last = support.lastLayer(doc);
    const wasLayer = doc.target.kind === "layer";
    doc.setBrush(brush);
    if (!wasLayer) doc.setTarget({ kind: "layer", index: last });
  };

  const rows = image ? Math.floor(image.height / th) : 0;
  const cols = tileset?.columns ?? 1;
  const gridProps = tileset ? { doc, tileset, image, zoom, theme, onBrush } : null;

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
      {pages && page ? (
        <div className="palette-header palette-pages">
          <span className="palette-tabs" role="tablist" aria-label="팔레트 쪽">
            {pages.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p === page}
                className={"palette-tab" + (p === page ? " is-active" : "")}
                data-testid="palette-page-tab"
                data-page={p.id}
                onClick={() => setPageIndex(i)}
              >
                {p.label}
              </button>
            ))}
          </span>
          <span className="palette-spacer" />
          {(kind?.guides ?? []).map((g) => (
            <ExternalLink key={g.page} host={editor} href={guidePage(g.page)} className="palette-guide" testId="palette-guide">
              {g.label}
            </ExternalLink>
          ))}
        </div>
      ) : null}
      <div className="palette-info">
        <span data-testid="palette-brush">{pages && page ? pageBrushLabel(doc.brush, page, pages) : brushLabel(doc)}</span>
        {page ? (
          <span className="muted" data-testid="palette-hover">
            {hovered ?? `${page.label} 타일 ${page.cells.length}개`}
          </span>
        ) : tileset && image ? (
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
        {gridProps && !error ? page ? <PageGrid key={`${index}:${page.id}`} {...gridProps} page={page} onHover={setHovered} /> : <ImageGrid key={index} {...gridProps} /> : null}
      </div>
    </div>
  );
});
