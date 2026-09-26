// 씬 뷰의 좌표 계산 (순수 함수, DOM 도 PIXI 도 모른다. geometry.test.ts 가 검사한다).
//   - 화면(캔버스 CSS 픽셀) 과 월드(게임 논리 픽셀, 원점 왼쪽 위) 사이의 변환: world = (screen - pan) / zoom
//   - 줌 단계와 커서 기준 줌 (커서 아래의 월드 점이 그 자리에 머문다)
//   - 격자 스냅, 사각형 교차, 맞히기 (그리기 순서의 마지막이 위)
//   - 상자 선택, 끌기 이동 (스냅은 기준 오브젝트의 위치에 걸고 나머지는 같은 변위를 따른다)

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 월드 → 화면: screen = world * zoom + pan */
export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8] as const;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** 지금 줌보다 큰 첫 단계. 이미 최대면 최대 */
export function nextZoomStep(zoom: number): number {
  return ZOOM_STEPS.find((z) => z > zoom + 1e-9) ?? ZOOM_MAX;
}

/** 지금 줌보다 작은 마지막 단계. 이미 최소면 최소 */
export function prevZoomStep(zoom: number): number {
  const below = ZOOM_STEPS.filter((z) => z < zoom - 1e-9);
  return below.length ? below[below.length - 1] : ZOOM_MIN;
}

export function screenToWorld(t: ViewTransform, p: Point): Point {
  return { x: (p.x - t.panX) / t.zoom, y: (p.y - t.panY) / t.zoom };
}

export function worldToScreen(t: ViewTransform, p: Point): Point {
  return { x: p.x * t.zoom + t.panX, y: p.y * t.zoom + t.panY };
}

/** 화면의 anchor 점 아래에 있던 월드 점이 새 줌에서도 같은 자리에 있도록 pan 을 고친다 */
export function zoomAround(t: ViewTransform, newZoom: number, anchor: Point): ViewTransform {
  const zoom = clampZoom(newZoom);
  const world = screenToWorld(t, anchor);
  return { zoom, panX: anchor.x - world.x * zoom, panY: anchor.y - world.y * zoom };
}

/** 월드 사각형이 뷰포트에 여백을 두고 들어가는 변환 (가운데 정렬). 줌은 단계에 맞추지 않고 그대로 */
export function fitRect(viewport: { width: number; height: number }, rect: Rect, margin = 24): ViewTransform {
  const availW = Math.max(1, viewport.width - margin * 2);
  const availH = Math.max(1, viewport.height - margin * 2);
  const zoom = clampZoom(Math.min(availW / Math.max(1, rect.w), availH / Math.max(1, rect.h)));
  const panX = (viewport.width - rect.w * zoom) / 2 - rect.x * zoom;
  const panY = (viewport.height - rect.h * zoom) / 2 - rect.y * zoom;
  return { zoom, panX, panY };
}

export function snapValue(v: number, gridSize: number): number {
  if (gridSize <= 0) return v;
  return Math.round(v / gridSize) * gridSize;
}

export function snapPoint(p: Point, gridSize: number): Point {
  return { x: snapValue(p.x, gridSize), y: snapValue(p.y, gridSize) };
}

/** 두 점을 잇는 정규화된 사각형 (w, h 는 0 이상) */
export function rectFromPoints(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function rectContains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

/** 겹치는 넓이가 있는가 (모서리만 닿는 것은 아니다). 0 크기 사각형은 점처럼 안에 있어야 한다 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  if (a.w === 0 || a.h === 0 || b.w === 0 || b.h === 0) {
    return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
  }
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export interface HitTarget {
  id: string;
  /** 월드 좌표의 경계 상자 */
  bounds: Rect;
}

/** 점을 품는 것 중 그리기 순서의 마지막(가장 위). 없으면 null */
export function hitTest(targets: readonly HitTarget[], p: Point): string | null {
  for (let i = targets.length - 1; i >= 0; i--) {
    if (rectContains(targets[i].bounds, p)) return targets[i].id;
  }
  return null;
}

/** 상자와 겹치는 것 전부 (그리기 순서대로) */
export function rubberBandSelect(targets: readonly HitTarget[], band: Rect): string[] {
  return targets.filter((t) => rectsIntersect(t.bounds, band)).map((t) => t.id);
}

/** 상자 선택의 결과를 지금 선택에 합친다. additive 면 기존에 더하고, 아니면 바꾼다 */
export function mergeSelection(current: Iterable<string>, hits: string[], additive: boolean): string[] {
  if (!additive) return hits;
  const out = new Set(current);
  for (const id of hits) out.add(id);
  return [...out];
}

/** 클릭 선택: Shift 는 토글, 아니면 그것만 (이미 선택된 것을 그냥 클릭하면 선택을 그대로 둔다: 여럿을 끌 수 있게) */
export function clickSelection(current: Iterable<string>, hit: string | null, shift: boolean): string[] {
  const cur = new Set(current);
  if (hit === null) return shift ? [...cur] : [];
  if (shift) {
    if (cur.has(hit)) cur.delete(hit);
    else cur.add(hit);
    return [...cur];
  }
  return cur.has(hit) ? [...cur] : [hit];
}

export interface DragStart {
  id: string;
  x: number;
  y: number;
}

/**
 * 끌기 중의 새 위치. delta 는 월드 변위. 스냅이 켜져 있으면 기준(primary) 오브젝트의 목표 위치를 격자에 맞추고
 * 나머지는 같은 변위를 따른다 (변위 자체를 스냅하면 오브젝트가 격자 사이에 걸린다).
 */
export function dragPositions(starts: readonly DragStart[], delta: Point, primaryId: string | null, snap: boolean, gridSize: number): Array<{ id: string; x: number; y: number }> {
  let dx = delta.x;
  let dy = delta.y;
  if (snap) {
    const primary = starts.find((s) => s.id === primaryId) ?? starts[0];
    if (primary) {
      const target = snapPoint({ x: primary.x + delta.x, y: primary.y + delta.y }, gridSize);
      dx = target.x - primary.x;
      dy = target.y - primary.y;
    }
  }
  return starts.map((s) => ({ id: s.id, x: Math.round((s.x + dx) * 1000) / 1000, y: Math.round((s.y + dy) * 1000) / 1000 }));
}

/** 화면에서 이만큼은 움직여야 끌기다 (클릭과 구분) */
export const DRAG_THRESHOLD_PX = 3;

export function movedEnough(a: Point, b: Point, threshold = DRAG_THRESHOLD_PX): boolean {
  return Math.abs(a.x - b.x) >= threshold || Math.abs(a.y - b.y) >= threshold;
}

/** 방향키 이동: 1px, Shift 로 10px */
export function nudgeDelta(key: string, shift: boolean): Point | null {
  const step = shift ? 10 : 1;
  switch (key) {
    case "ArrowLeft":
      return { x: -step, y: 0 };
    case "ArrowRight":
      return { x: step, y: 0 };
    case "ArrowUp":
      return { x: 0, y: -step };
    case "ArrowDown":
      return { x: 0, y: step };
    default:
      return null;
  }
}

/**
 * 격자 선을 그을 월드 좌표 목록. 뷰포트가 보는 월드 영역만 긋고, 화면에서 minSpacingPx 보다 촘촘해지면 굵은 선(major)만 남긴다.
 * major 는 gridSize * majorEvery 마다.
 */
export function gridLines(
  t: ViewTransform,
  viewport: { width: number; height: number },
  gridSize: number,
  majorEvery = 10,
  minSpacingPx = 6,
): { minor: { xs: number[]; ys: number[] }; major: { xs: number[]; ys: number[] } } {
  const minor = { xs: [] as number[], ys: [] as number[] };
  const major = { xs: [] as number[], ys: [] as number[] };
  if (gridSize <= 0 || viewport.width <= 0 || viewport.height <= 0) return { minor, major };
  const topLeft = screenToWorld(t, { x: 0, y: 0 });
  const bottomRight = screenToWorld(t, { x: viewport.width, y: viewport.height });
  const majorSize = gridSize * majorEvery;
  const drawMinor = gridSize * t.zoom >= minSpacingPx;
  const drawMajor = majorSize * t.zoom >= minSpacingPx;
  if (!drawMajor) return { minor, major };
  const step = drawMinor ? gridSize : majorSize;
  const startX = Math.floor(topLeft.x / step) * step;
  const startY = Math.floor(topLeft.y / step) * step;
  const isMajor = (v: number) => Math.abs(v / majorSize - Math.round(v / majorSize)) < 1e-6;
  for (let x = startX; x <= bottomRight.x; x += step) (isMajor(x) ? major.xs : minor.xs).push(x);
  for (let y = startY; y <= bottomRight.y; y += step) (isMajor(y) ? major.ys : minor.ys).push(y);
  return { minor, major };
}
