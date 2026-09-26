// 맵 뷰의 좌표 계산 (DOM 없음). 맵 뷰는 data-zoom, data-pan-x, data-pan-y로 월드에서 캔버스로 가는 변환을 내보낸다
// (screen = world * zoom + pan). 여기서는 그 변환과 캔버스 상자로 페이지 좌표를 구하고, 보이는 칸 중에서 붓질할 칸을 고른다.

export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Cell {
  x: number;
  y: number;
}

/** 월드 사각형 (x0, y0 포함, x1, y1 미포함) */
export interface WorldRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GridSize {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
}

/** 월드 좌표를 페이지 좌표로 */
export function worldToPage(box: Box, t: ViewTransform, world: Point): Point {
  return { x: box.x + world.x * t.zoom + t.panX, y: box.y + world.y * t.zoom + t.panY };
}

/** 페이지 좌표를 월드 좌표로 */
export function pageToWorld(box: Box, t: ViewTransform, p: Point): Point {
  return { x: (p.x - box.x - t.panX) / t.zoom, y: (p.y - box.y - t.panY) / t.zoom };
}

/** 캔버스에 보이는 월드 영역 */
export function visibleWorldRect(box: Box, t: ViewTransform): WorldRect {
  const a = pageToWorld(box, t, { x: box.x, y: box.y });
  const b = pageToWorld(box, t, { x: box.x + box.width, y: box.y + box.height });
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
}

/** 페이지 점이 상자 안에 있다 (가장자리에서 inset 안쪽) */
export function insideBox(box: Box, p: Point, inset = 0): boolean {
  return p.x >= box.x + inset && p.x <= box.x + box.width - inset && p.y >= box.y + inset && p.y <= box.y + box.height - inset;
}

/** 칸의 가운데 (월드 픽셀) */
export function cellCenter(grid: Pick<GridSize, "tileWidth" | "tileHeight">, cell: Cell): Point {
  return { x: cell.x * grid.tileWidth + grid.tileWidth / 2, y: cell.y * grid.tileHeight + grid.tileHeight / 2 };
}

/**
 * 한 줄로 이어진 칸 length개. 칸 전체가 보이고 맵 안인 것만 고른다.
 * 줄은 preferredRow와 보이는 마지막 줄 중 위쪽, 칸은 보이는 범위의 가운데. 고를 수 없으면 예외.
 */
export function pickStrokeCells(visible: WorldRect, grid: GridSize, opts: { preferredRow: number; length: number; margin?: number }): Cell[] {
  const m = opts.margin ?? 2;
  const c0 = Math.max(0, Math.ceil((visible.x0 + m) / grid.tileWidth));
  const c1 = Math.min(grid.width - 1, Math.floor((visible.x1 - m) / grid.tileWidth) - 1);
  const r0 = Math.max(0, Math.ceil((visible.y0 + m) / grid.tileHeight));
  const r1 = Math.min(grid.height - 1, Math.floor((visible.y1 - m) / grid.tileHeight) - 1);
  const row = Math.min(opts.preferredRow, r1);
  if (row < r0 || c1 - c0 + 1 < opts.length) {
    throw new Error(`보이는 칸이 모자란다: 열 ${c0}..${c1}, 줄 ${r0}..${r1}, 필요한 칸 ${opts.length}`);
  }
  const mid = Math.floor((c0 + c1) / 2);
  const start = Math.min(Math.max(mid - Math.floor(opts.length / 2), c0), c1 - opts.length + 1);
  return Array.from({ length: opts.length }, (_, i) => ({ x: start + i, y: row }));
}
