// PIXI 8 맵 뷰 렌더러. 맵 문서 하나에 렌더러 하나, 뷰(탭)마다 따로 만든다.
//
//   world (팬과 줌) ─ backdrop ─ layerRoot (레이어마다 Container, 그 안에 덩어리 스프라이트) ─ collisionRoot
//                   ─ gridG ─ boundsG ─ objectsG ─ labelRoot ─ extRoot (확장 레이어마다 Container) ─ ghost (붓 미리보기) ─ previewG
//
// 타일: 레이어를 CHUNK_TILES 칸 정사각 덩어리로 나눈다. 덩어리마다 칸 스프라이트를 떼어 둔 Container에 두고
//   RenderTexture 한 장에 그리고, 화면에는 그 텍스처의 스프라이트 하나만 올린다. 모델의 "cells" 이벤트로 바뀐 칸의
//   스프라이트만 고치고, 그 칸이 든 덩어리만 다음 프레임에 다시 그린다. 빈 덩어리는 텍스처를 만들지 않는다.
// 타일 텍스처: 타일셋 이미지를 TextureCache로 한 번 읽고 gid마다 frame을 자른 Texture를 캐시한다 (nearest).
// 통행: 덩어리마다 Graphics 하나. 막힌 칸을 행 단위 구간으로 묶어 --danger로 옅게 칠한다.
// 오브젝트: Graphics 하나에 전부 다시 그린다 (수가 적다). 글자는 오브젝트마다 Text 하나이고 줌의 역수로 배율을 준다.
// 확장 레이어(docs/plans/e5-rpg.md 2.2): 상태가 붙은 레이어마다 Container 하나를 order 순으로 extRoot에 두고 createView를 부른다.
//   눈을 끄면 숨기고, 대상이 다른 레이어면 반투명이다. 줌이나 테마가 바뀌면 뷰의 redraw를 부른다. 도구(createTool)는
//   대상이 그 레이어가 될 때 만들고 MapToolController가 포인터와 키를 넘긴다.
// 입력: 팬과 줌은 여기서, 도구는 mapTools.ts의 MapToolController가 맡는다. Space는 창 전체에서 듣는다:
//   포인터가 캔버스 위에 있으면 초점이 팔레트나 도구 단추에 있어도 Space+끌기가 팬이다.
// 타일 고르기(deps.pick, cellPick.ts): 고르는 동안 왼쪽 누름은 도구 대신 고르기로 가고(맵 밖이면 취소), 오른쪽 버튼은 팬이다.
//   포인터 아래 타일에 테두리를 그리고, 도구는 포인터와 키와 두 번 누르기를 받지 않는다. 끝나면 도구가 그대로 이어진다.

import { Emitter } from "@initial-editor/core";
import type { MapLayerSpec, MapLayerTool, MapLayerToolContext, MapLayerView, MapLayerViewContext } from "@initial-editor/ext-tilemap";
import { isJsonText, tileSource, typeOf, type MapDocument, type MapObject, type ObjectTypeSchema } from "@initial-editor/ext-tilemap/model";
import { comparer, observable, reaction, runInAction } from "mobx";
import { Application, Container, Graphics, Rectangle, RenderTexture, Sprite, Text, Texture, UPDATE_PRIORITY } from "pixi.js";
import type { LoadedTexture, TextureCache } from "../sceneView/textures";
import { isEditableTarget } from "../shortcuts";
import { shapeColorToken, type MapTheme } from "./mapColors";
import {
  POINT_RADIUS_PX,
  RANGE_HANDLE_HALF_H_PX,
  RANGE_HANDLE_HALF_W_PX,
  cellAt,
  centerOn,
  chunkCells,
  chunkGrid,
  clampZoom,
  fitRect,
  groupByChunk,
  initialView,
  nextZoomStep,
  prevZoomStep,
  screenToWorld,
  shapeOf,
  tileGridLines,
  zoomAround,
  type Cell,
  type ChunkGrid,
  type Point,
  type ViewTransform,
} from "./mapGeometry";
import { MapToolController, type ToolPointer, type ToolPreview } from "./mapTools";
import type { MapViewState } from "./mapViewState";

export interface MapRendererDeps {
  document: MapDocument;
  textures: TextureCache;
  view: MapViewState;
  theme: () => MapTheme;
  /** 포인터 아래 월드 좌표 (정수 픽셀) */
  onCursor?: (p: Point) => void;
  /** 도구가 사용자에게 짧게 알린다 (숨긴 레이어에 칠하려 할 때) */
  onNotice?: (message: string) => void;
  /** 등록된 확장 레이어 (아래부터 그리는 순서). 관찰 가능하면 등록과 해제를 따라간다 */
  layers?: () => readonly MapLayerSpec[];
  /** 이 뷰의 타일 고르기. 없으면 고르지 않는다 */
  pick?: MapCellPick;
}

/** 렌더러가 보는 타일 고르기 (MapSupport.picker 를 이 문서로 좁힌 것) */
export interface MapCellPick {
  /** 이 뷰에서 고르는 중인가 (관찰 가능) */
  active(): boolean;
  /** 왼쪽 누름의 타일. 맵 밖이면 null (취소) */
  choose(cell: Cell | null): void;
}

export interface MapRendererEvents {
  /** 도구의 경고 (한도에 닿은 채우기). onNotice로도 알린다. MapSupport가 콘솔에 남긴다 */
  warn: string;
}

interface ChunkNode {
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** 화면에 올리지 않는 칸 스프라이트 묶음. rt에 그린다 */
  content: Container;
  sprites: Array<Sprite | null>;
  count: number;
  rt: RenderTexture | null;
  display: Sprite;
}

interface LayerNode {
  container: Container;
  chunks: Map<number, ChunkNode>;
}

interface ExtLayerNode {
  spec: MapLayerSpec;
  container: Container;
  view: MapLayerView | null;
}

interface TilesetSlot {
  image: string;
  loaded: LoadedTexture | null;
  error: string | null;
}

export interface MapRenderStats {
  /** 지금까지 rt를 다시 그린 덩어리 수 */
  chunkRenders: number;
  /** 텍스처가 있는 덩어리 수 */
  chunkTextures: number;
}

const MARGIN = 24;
const LABEL_FONT_SIZE = 11;
const DIM_ALPHA = 0.35;
const COLLISION_ALPHA = 0.4;
const GHOST_ALPHA = 0.6;
/** 대상이 아닌 확장 레이어의 투명도 */
export const EXT_DIM_ALPHA = 0.5;

export class MapRenderer {
  /** 화면 변환 (screen = world * zoom + pan). 뷰가 data-zoom, data-pan-x, data-pan-y로 내보낸다 */
  readonly transform = observable<ViewTransform>({ zoom: 1, panX: MARGIN, panY: MARGIN });
  readonly status = observable<{ ready: boolean; error: string | null; warning: string | null }>({ ready: false, error: null, warning: null });
  /** 포인터 아래의 칸과 픽셀 (헤더 표시용) */
  readonly hover = observable.box<{ cell: Cell; px: Point } | null>(null, { equals: comparer.structural });
  readonly stats = observable<MapRenderStats>({ chunkRenders: 0, chunkTextures: 0 });
  readonly tools: MapToolController;
  readonly events = new Emitter<MapRendererEvents>();

  private app: Application | null = null;
  private host: HTMLElement | null = null;
  private readonly world = new Container();
  private readonly backdrop = new Graphics();
  private readonly layerRoot = new Container();
  private readonly collisionRoot = new Container();
  private readonly gridG = new Graphics();
  private readonly boundsG = new Graphics();
  private readonly objectsG = new Graphics();
  private readonly labelRoot = new Container();
  private readonly extRoot = new Container();
  private readonly extNodes = new Map<string, ExtLayerNode>();
  private readonly extTools = new Map<string, { spec: MapLayerSpec; tool: MapLayerTool | null }>();
  private readonly ghost = new Container();
  private readonly previewG = new Graphics();
  private layers: LayerNode[] = [];
  private readonly collisionChunks = new Map<number, Graphics>();
  private grid: ChunkGrid;
  private tilesets: TilesetSlot[] = [];
  private tilesetRun = 0;
  private tilesetsSettled = false;
  private readonly tileTextures = new Map<number, Texture | null>();
  private readonly dirtyTiles = new Map<number, Map<number, Set<number> | "all">>();
  private dirtyCollision: Set<number> | "all" = "all";
  private needLayers = true;
  private needObjects = true;
  private needGrid = true;
  private needPreview = true;
  private ghostKey = "";
  private readonly labels = new Map<string, Text>();
  private theme: MapTheme;
  private pan: { last: Point; pointerId: number } | null = null;
  private toolPointer: number | null = null;
  private spaceHeld = false;
  /** 포인터가 캔버스 위에 있다 */
  private hovering = false;
  /** 타일셋 밖의 gid 경고를 다음 프레임에 다시 센다 */
  private needWarning = false;
  private initialViewDone = false;
  /** 첫 화면을 맞춘 뒤 가운데에 둘 월드 점 (reveal) */
  private pendingCenter: Point | null = null;
  /** 고르는 동안 포인터 아래 타일 (맵 안일 때만) */
  private pickHover: Cell | null = null;
  private scaleMode: "nearest" | "linear" = "nearest";
  private disposers: Array<() => void> = [];
  private disposed = false;

  constructor(private readonly deps: MapRendererDeps) {
    this.theme = deps.theme();
    this.grid = chunkGrid(deps.document.model);
    this.tools = new MapToolController({
      document: deps.document,
      zoom: () => this.transform.zoom,
      viewWidth: () => this.viewport().width,
      changed: () => {
        this.needPreview = true;
        this.updateCursor();
      },
      notice: (message) => this.deps.onNotice?.(message),
      warn: (message) => {
        this.deps.onNotice?.(message);
        this.events.emit("warn", message);
      },
      layerTool: (id) => this.layerTool(id),
    });
  }

  get document(): MapDocument {
    return this.deps.document;
  }

  private get model() {
    return this.deps.document.model;
  }

  /** PIXI를 띄우고 host에 캔버스를 붙인다. WebGL이 없으면 status.error에 이유를 적고 끝난다 */
  async init(host: HTMLElement): Promise<void> {
    this.host = host;
    const app = new Application();
    const base = {
      preference: "webgl" as const,
      background: this.theme.colors["scene-bg"],
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
    };
    try {
      try {
        await app.init(base);
      } catch (first) {
        try {
          await app.init({ ...base, powerPreference: "low-power" });
        } catch {
          throw first;
        }
      }
    } catch (e) {
      runInAction(() => {
        this.status.error = `WebGL 초기화 실패: ${(e as Error).message}`;
      });
      return;
    }
    if (this.disposed) {
      app.destroy({ removeView: true }, { children: true });
      return;
    }
    this.app = app;
    app.stage.eventMode = "none";
    this.ghost.alpha = GHOST_ALPHA;
    this.collisionRoot.visible = this.document.showCollision;
    this.stackWorld();
    app.stage.addChild(this.world);
    host.appendChild(app.canvas);
    app.canvas.style.display = "block";
    app.ticker.add(this.frame, this, UPDATE_PRIORITY.HIGH);
    this.disposers.push(() => app.ticker.remove(this.frame, this));
    this.installDom(host, app.canvas);
    this.installReactions();
    this.loadTilesets();
    this.drawStatic();
  }

  /** 월드의 겹 순서 (아래부터). 확장 레이어는 오브젝트 글자 위, 붓 미리보기 아래다 */
  private stackWorld(): void {
    this.world.addChild(this.backdrop, this.layerRoot, this.collisionRoot, this.gridG, this.boundsG, this.objectsG, this.labelRoot, this.extRoot, this.ghost, this.previewG);
  }

  dispose(): void {
    this.disposed = true;
    this.events.clear();
    for (const d of this.disposers.reverse()) d();
    this.disposers = [];
    for (const node of this.layers) this.destroyLayer(node);
    this.layers = [];
    for (const id of [...this.extNodes.keys()]) this.removeExtNode(id);
    for (const { tool } of this.extTools.values()) tool?.dispose?.();
    this.extTools.clear();
    for (const g of this.collisionChunks.values()) g.destroy();
    this.collisionChunks.clear();
    this.releaseTileTextures();
    if (this.app) {
      // 타일셋 원본은 캐시의 것이라 놓지 않는다
      this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
      this.app = null;
    }
    this.host = null;
  }

  // ---- 화면 변환 ----

  private viewport(): { width: number; height: number } {
    return { width: this.host?.clientWidth ?? 1, height: this.host?.clientHeight ?? 1 };
  }

  private setTransform(t: ViewTransform): void {
    const zoom = clampZoom(t.zoom);
    runInAction(() => {
      this.transform.zoom = zoom;
      this.transform.panX = Math.round(t.panX);
      this.transform.panY = Math.round(t.panY);
    });
    this.applyTransform();
  }

  private applyTransform(): void {
    const t = this.transform;
    this.world.scale.set(t.zoom);
    this.world.position.set(t.panX, t.panY);
    for (const label of this.labels.values()) label.scale.set(1 / t.zoom);
    this.redrawExtViews();
    this.applyScaleMode();
    this.needGrid = true;
    this.needObjects = true;
    this.needPreview = true;
  }

  /** 100% 이상은 픽셀 그대로(nearest), 축소하면 선형으로 거른다 (띄엄띄엄 건너뛴 픽셀이 반짝이지 않게) */
  private applyScaleMode(): void {
    const mode = this.transform.zoom < 1 ? "linear" : "nearest";
    if (mode === this.scaleMode) return;
    this.scaleMode = mode;
    for (const node of this.layers) {
      for (const ch of node.chunks.values()) {
        if (!ch.rt) continue;
        ch.rt.source.scaleMode = mode;
        // 이미 올라간 텍스처는 style이 바뀌었다고 알려야 거르기를 다시 건다
        ch.rt.source.style.update();
      }
    }
  }

  /** 뷰포트 가운데의 월드 좌표 */
  viewCenter(): Point {
    const vp = this.viewport();
    return screenToWorld(this.transform, { x: vp.width / 2, y: vp.height / 2 });
  }

  /** 줌을 바꾼다. anchor(화면 좌표) 아래의 월드 점이 제자리에 있다. 없으면 뷰 가운데 */
  setZoom(zoom: number, anchor?: Point): void {
    const vp = this.viewport();
    this.setTransform(zoomAround(this.transform, zoom, anchor ?? { x: vp.width / 2, y: vp.height / 2 }));
  }

  zoomIn(): void {
    this.setZoom(nextZoomStep(this.transform.zoom));
  }

  zoomOut(): void {
    this.setZoom(prevZoomStep(this.transform.zoom));
  }

  resetZoom(): void {
    this.setZoom(1);
  }

  /** 맵 전체가 여백을 두고 들어가게 */
  fit(): void {
    const m = this.model;
    this.setTransform(fitRect(this.viewport(), { x: 0, y: 0, w: m.pixelWidth, h: m.pixelHeight }, MARGIN));
  }

  /** 월드 점이 뷰 가운데 오게 (줌은 그대로) */
  centerOn(world: Point): void {
    this.setTransform(centerOn(this.transform, this.viewport(), world));
  }

  /** 월드 점이 뷰 가운데 오게 한다. 첫 화면을 아직 맞추지 않았거나 뷰가 보이지 않으면 보일 때 옮긴다 */
  reveal(world: Point): void {
    this.pendingCenter = { x: world.x, y: world.y };
    this.applyPendingCenter();
  }

  private applyPendingCenter(): void {
    const p = this.pendingCenter;
    if (!p || !this.initialViewDone || !this.host?.isConnected) return;
    const vp = this.viewport();
    if (vp.width <= 8 || vp.height <= 8) return;
    this.pendingCenter = null;
    this.centerOn(p);
  }

  /** 이 뷰에서 타일을 고르는 중인가 */
  private picking(): boolean {
    return this.deps.pick?.active() ?? false;
  }

  /** 월드 점의 타일. 맵 밖이면 null */
  private cellInMap(world: Point): Cell | null {
    const m = this.model;
    const c = cellAt(world, m.tileWidth, m.tileHeight);
    return c.x >= 0 && c.y >= 0 && c.x < m.width && c.y < m.height ? c : null;
  }

  /**
   * 타일 레이어만(격자, 통행, 오브젝트 표식 없이) 월드 좌표 rect 를 1배로 뽑는다. 줌과 팬과 상관없다.
   * 자가 검사가 게임 프레임과 견준다 (e6-packaging.md 5절). 타일셋을 다 읽기 전이면 null
   */
  captureTiles(rect: { x: number; y: number; width: number; height: number }): { width: number; height: number; pixels: Uint8ClampedArray } | null {
    const app = this.app;
    if (!app || !this.tilesetsSettled) return null;
    if (this.needLayers) this.rebuildLayers();
    this.flushTiles();
    const out = app.renderer.extract.pixels({ target: this.layerRoot, frame: new Rectangle(rect.x, rect.y, rect.width, rect.height), resolution: 1, antialias: false });
    return { width: out.width, height: out.height, pixels: out.pixels };
  }

  /** 테마가 바뀌었다: 색이 든 것을 전부 다시 그린다 */
  setTheme(theme: MapTheme): void {
    this.theme = theme;
    if (this.app) this.app.renderer.background.color = theme.colors["scene-bg"];
    for (const label of this.labels.values()) label.destroy();
    this.labels.clear();
    this.dirtyCollision = "all";
    this.drawStatic();
    this.redrawExtViews();
    this.needGrid = true;
    this.needObjects = true;
    this.needPreview = true;
  }

  private screenPoint(e: { clientX: number; clientY: number }): Point {
    const canvas = this.app?.canvas;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ---- DOM 이벤트 ----

  private installDom(host: HTMLElement, canvas: HTMLCanvasElement): void {
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (ev: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn, opts);
      this.disposers.push(() => el.removeEventListener(type, fn, opts));
    };
    const onWindow = <K extends keyof WindowEventMap>(type: K, fn: (ev: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn);
      this.disposers.push(() => window.removeEventListener(type, fn));
    };
    on(canvas, "pointerdown", (e) => this.onPointerDown(e));
    on(canvas, "pointermove", (e) => this.onPointerMove(e));
    on(canvas, "pointerup", (e) => this.onPointerUp(e));
    on(canvas, "pointercancel", (e) => this.onPointerUp(e));
    on(canvas, "pointerenter", () => {
      this.hovering = true;
    });
    on(canvas, "pointerleave", () => this.onPointerLeave());
    on(canvas, "wheel", (e) => this.onWheel(e), { passive: false });
    on(canvas, "dblclick", (e) => this.onDoubleClick(e));
    on(canvas, "contextmenu", (e) => e.preventDefault());
    on(host, "keydown", (e) => this.onKeyDown(e));
    onWindow("keydown", (e) => this.onSpaceDown(e));
    onWindow("keyup", (e) => this.onSpaceUp(e));
    onWindow("blur", () => this.releaseSpace());
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(host);
    this.disposers.push(() => observer.disconnect());
    this.resize();
  }

  private resize(): void {
    const app = this.app;
    const host = this.host;
    if (!app || !host) return;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    if (app.renderer.width !== w || app.renderer.height !== h) app.renderer.resize(w, h);
    if (!this.initialViewDone && w > 8 && h > 8) {
      this.initialViewDone = true;
      this.setTransform(initialView({ width: w, height: h }, this.model.pixelWidth, this.model.pixelHeight, MARGIN));
    }
    this.applyPendingCenter();
    this.needGrid = true;
  }

  private updateCursor(): void {
    const host = this.host;
    if (!host) return;
    host.style.cursor = this.pan ? "grabbing" : this.spaceHeld ? "grab" : this.picking() ? "crosshair" : this.tools.cursor;
  }

  private toToolPointer(e: PointerEvent | MouseEvent, screen: Point): ToolPointer {
    return { world: screenToWorld(this.transform, screen), button: e.button === 2 ? 2 : 0, shift: e.shiftKey, alt: e.altKey, mod: e.ctrlKey || e.metaKey };
  }

  private onDoubleClick(e: MouseEvent): void {
    if (e.button !== 0 || this.spaceHeld || this.picking()) return;
    this.tools.doubleClick(this.toToolPointer(e as PointerEvent, this.screenPoint(e)));
  }

  private onPointerDown(e: PointerEvent): void {
    const host = this.host;
    const app = this.app;
    if (!host || !app) return;
    host.focus({ preventScroll: true });
    const screen = this.screenPoint(e);
    const picking = this.picking();
    if (e.button === 1 || this.spaceHeld || (e.button === 2 && (picking || !this.tools.wantsRightButton()))) {
      app.canvas.setPointerCapture(e.pointerId);
      this.pan = { last: screen, pointerId: e.pointerId };
      this.updateCursor();
      e.preventDefault();
      return;
    }
    if (picking) {
      if (e.button === 0) {
        e.preventDefault();
        this.deps.pick?.choose(this.cellInMap(screenToWorld(this.transform, screen)));
      }
      return;
    }
    if ((e.button !== 0 && e.button !== 2) || this.toolPointer !== null) return;
    app.canvas.setPointerCapture(e.pointerId);
    this.toolPointer = e.pointerId;
    this.tools.pointerDown(this.toToolPointer(e, screen));
  }

  private onPointerMove(e: PointerEvent): void {
    this.hovering = true;
    const screen = this.screenPoint(e);
    const pan = this.pan;
    if (pan && pan.pointerId === e.pointerId) {
      const t = this.transform;
      this.setTransform({ zoom: t.zoom, panX: t.panX + screen.x - pan.last.x, panY: t.panY + screen.y - pan.last.y });
      pan.last = screen;
      return;
    }
    const world = screenToWorld(this.transform, screen);
    const px = { x: Math.floor(world.x), y: Math.floor(world.y) };
    runInAction(() => this.hover.set({ cell: cellAt(world, this.model.tileWidth, this.model.tileHeight), px }));
    this.deps.onCursor?.(px);
    if (this.picking()) {
      this.setPickHover(this.cellInMap(world));
      return;
    }
    this.tools.pointerMove(this.toToolPointer(e, screen));
  }

  private onPointerUp(e: PointerEvent): void {
    const canvas = this.app?.canvas;
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (this.pan && this.pan.pointerId === e.pointerId) {
      this.pan = null;
      this.updateCursor();
      return;
    }
    if (this.toolPointer !== e.pointerId) return;
    this.toolPointer = null;
    this.tools.pointerUp(this.toToolPointer(e, this.screenPoint(e)));
  }

  private onPointerLeave(): void {
    this.hovering = false;
    if (this.tools.busy || this.pan) return;
    runInAction(() => this.hover.set(null));
    this.setPickHover(null);
    this.tools.pointerLeave();
  }

  private setPickHover(cell: Cell | null): void {
    const prev = this.pickHover;
    if (prev === cell || (prev && cell && prev.x === cell.x && prev.y === cell.y)) return;
    this.pickHover = cell;
    this.needPreview = true;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const t = this.transform;
    // Shift, Alt, 가로가 긴 스크롤(트랙패드)은 팬
    if (e.shiftKey || e.altKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
      this.setTransform({ zoom: t.zoom, panX: t.panX - dx, panY: t.panY - dy });
      return;
    }
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002));
    const next = clampZoom(t.zoom * factor);
    if (next !== t.zoom) this.setZoom(next, this.screenPoint(e));
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Space는 창의 onSpaceDown이 받는다. 고르는 동안에는 도구가 키를 받지 않는다 (Esc는 고르기가 창에서 받는다)
    if (e.key === " " || this.picking()) return;
    if (this.tools.keyDown({ key: e.key, shift: e.shiftKey, alt: e.altKey, mod: e.ctrlKey || e.metaKey })) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /** Space: 포인터가 캔버스 위에 있거나 뷰에 초점이 있으면 팬 준비. 입력 칸에서는 받지 않는다 */
  private onSpaceDown(e: KeyboardEvent): void {
    if (e.key !== " " || e.ctrlKey || e.metaKey || e.altKey || !this.host?.isConnected) return;
    if (!this.hovering && document.activeElement !== this.host) return;
    if (isEditableTarget(e.target)) return;
    // 누르고 있는 동안 반복되는 keydown으로도 잡는다 (첫 keydown이 다른 곳에 갔을 수 있다)
    if (!this.spaceHeld) {
      this.spaceHeld = true;
      this.updateCursor();
    }
    // 초점이 간 단추가 눌리거나 화면이 스크롤되지 않게
    e.preventDefault();
  }

  private onSpaceUp(e: KeyboardEvent): void {
    if (e.key !== " " || !this.spaceHeld) return;
    e.preventDefault();
    this.releaseSpace();
  }

  private releaseSpace(): void {
    if (!this.spaceHeld) return;
    this.spaceHeld = false;
    this.updateCursor();
  }

  // ---- 문서 → 뷰 ----

  private installReactions(): void {
    const doc = this.document;
    const model = this.model;
    const view = this.deps.view;
    this.disposers.push(
      model.events.on("cells", (e) => {
        this.markCells(e.layer, e.indices);
        if (e.layer !== "collision") this.needWarning = true;
      }),
      model.events.on("layers", () => {
        this.needLayers = true;
        this.needWarning = true;
      }),
      model.events.on("reset", () => {
        // 다시 읽기와 크기 바꾸기: 덩어리 격자, 레이어, 통행, 오브젝트, 격자 선, 바탕을 새로 그린다
        this.grid = chunkGrid(model);
        this.needGrid = true;
        // 타일셋이 같으면 읽은 이미지는 그대로이고 칸만 바뀌었다
        if (!this.sameTilesets()) this.loadTilesets();
        else this.needWarning = true;
        this.needLayers = true;
        this.needObjects = true;
        this.drawStatic();
      }),
      this.deps.textures.events.on("invalidated", (path) => {
        if (this.tilesets.some((t) => t.image === path)) this.loadTilesets();
      }),
      reaction(
        () => [doc.model.objects.slice(), doc.schema, [...doc.selection], doc.showObjects],
        () => {
          this.needObjects = true;
        },
      ),
      reaction(
        () => [[...doc.hiddenLayers], doc.target, view.dimAbove],
        () => this.applyLayerVisibility(),
      ),
      reaction(
        () => doc.showCollision,
        (show) => {
          this.collisionRoot.visible = show;
        },
      ),
      reaction(
        () => view.grid,
        () => {
          this.needGrid = true;
        },
      ),
      reaction(
        () => [doc.tool, doc.target, doc.brush, [...doc.hiddenLayers], doc.showCollision],
        () => this.tools.refresh(),
      ),
      reaction(
        () => (this.deps.layers?.() ?? []).filter((spec) => doc.layerState(spec.id) !== null),
        (specs) => this.syncExtLayers(specs),
        { fireImmediately: true, equals: comparer.shallow },
      ),
      reaction(
        () => [[...doc.hiddenExtLayers], doc.target],
        () => this.applyExtVisibility(),
      ),
      reaction(
        () => this.picking(),
        () => {
          this.pickHover = null;
          this.needPreview = true;
          this.updateCursor();
        },
      ),
    );
  }

  // ---- 확장 레이어 ----

  /** 상태가 붙은 레이어 (아래부터)에 맞춰 Container와 뷰를 더하고 빼고 순서를 맞춘다. 거둔 레이어의 도구도 버린다 */
  private syncExtLayers(specs: readonly MapLayerSpec[]): void {
    const keep = new Set(specs.map((s) => s.id));
    for (const id of [...this.extNodes.keys()]) if (!keep.has(id) || this.extNodes.get(id)!.spec !== specs.find((s) => s.id === id)) this.removeExtNode(id);
    for (const [id, entry] of [...this.extTools]) {
      if (keep.has(id) && specs.find((s) => s.id === id) === entry.spec) continue;
      entry.tool?.dispose?.();
      this.extTools.delete(id);
    }
    specs.forEach((spec, i) => {
      let node = this.extNodes.get(spec.id);
      if (!node) {
        const container = new Container();
        container.label = `ext:${spec.id}`;
        node = { spec, container, view: null };
        this.extNodes.set(spec.id, node);
        node.view = spec.createView?.(this.viewContext(container)) ?? null;
      }
      this.extRoot.addChildAt(node.container, Math.min(i, this.extRoot.children.length));
    });
    this.applyExtVisibility();
    this.tools.refresh();
  }

  private removeExtNode(id: string): void {
    const node = this.extNodes.get(id);
    if (!node) return;
    this.extNodes.delete(id);
    node.view?.dispose();
    node.container.destroy({ children: true });
  }

  private viewContext(container: Container): MapLayerViewContext {
    return {
      document: this.document,
      container,
      zoom: () => this.transform.zoom,
      color: (token) => (this.theme.colors as Record<string, number>)[token] ?? this.theme.colors.fg,
      font: (token) => (this.theme.fonts as unknown as Record<string, string>)[token] ?? this.theme.fonts["font-ui"],
      loadTexture: (path) => this.deps.textures.load(path).then((t) => ({ texture: t.texture, width: t.width, height: t.height })),
    };
  }

  private toolContext(): MapLayerToolContext {
    return {
      document: this.document,
      zoom: () => this.transform.zoom,
      changed: () => {
        this.needPreview = true;
        this.updateCursor();
      },
      notice: (message) => this.deps.onNotice?.(message),
    };
  }

  /** 확장 레이어의 도구 (처음 부를 때 만든다). 등록되지 않았거나 도구가 없으면 null */
  layerTool(id: string): MapLayerTool | null {
    const spec = this.deps.layers?.().find((s) => s.id === id);
    if (!spec) return null;
    const cached = this.extTools.get(id);
    if (cached && cached.spec === spec) return cached.tool;
    cached?.tool?.dispose?.();
    const tool = spec.createTool?.(this.toolContext()) ?? null;
    this.extTools.set(id, { spec, tool });
    return tool;
  }

  /** 눈을 끈 레이어는 숨기고, 대상이 아닌 레이어는 반투명이다 */
  private applyExtVisibility(): void {
    const doc = this.document;
    for (const [id, node] of this.extNodes) {
      node.container.visible = !doc.hiddenExtLayers.has(id);
      node.container.alpha = doc.target.kind === "ext" && doc.target.id === id ? 1 : EXT_DIM_ALPHA;
    }
  }

  private redrawExtViews(): void {
    for (const node of this.extNodes.values()) node.view?.redraw?.();
  }

  private markCells(layer: number | "collision", indices: number[]): void {
    if (layer === "collision") {
      if (this.dirtyCollision === "all") return;
      if (indices.length === 0 || !this.model.collision) {
        this.dirtyCollision = "all";
        return;
      }
      for (const c of groupByChunk(indices, this.model.width, this.grid).keys()) this.dirtyCollision.add(c);
      return;
    }
    let chunks = this.dirtyTiles.get(layer);
    if (!chunks) this.dirtyTiles.set(layer, (chunks = new Map()));
    for (const [chunk, cells] of groupByChunk(indices, this.model.width, this.grid)) {
      const prev = chunks.get(chunk);
      if (prev === "all") continue;
      if (!prev) chunks.set(chunk, new Set(cells));
      else for (const c of cells) prev.add(c);
    }
  }

  private markAllTiles(): void {
    const total = this.grid.cols * this.grid.rows;
    this.model.layers.forEach((_, layer) => {
      const chunks = new Map<number, "all">();
      for (let c = 0; c < total; c++) chunks.set(c, "all");
      this.dirtyTiles.set(layer, chunks);
    });
  }

  private applyLayerVisibility(): void {
    const doc = this.document;
    const active = doc.target.kind === "layer" ? doc.target.index : -1;
    this.layers.forEach((node, i) => {
      node.container.visible = !doc.hiddenLayers.has(i);
      node.container.alpha = this.deps.view.dimAbove && active >= 0 && i > active ? DIM_ALPHA : 1;
    });
  }

  // ---- 타일셋 ----

  private sameTilesets(): boolean {
    const now = this.model.tilesets;
    return now.length === this.tilesets.length && now.every((t, i) => t.image === this.tilesets[i].image);
  }

  /** 타일셋을 (다시) 읽는다. 다 읽을 때까지 덩어리를 다시 그리지 않는다 (옛 텍스처가 이미 버려졌을 수 있다) */
  private loadTilesets(): void {
    const run = ++this.tilesetRun;
    this.tilesetsSettled = false;
    this.tilesets = this.model.tilesets.map((t) => ({ image: t.image, loaded: null, error: null }));
    const jobs = this.tilesets.map((slot) =>
      this.deps.textures.load(slot.image).then(
        (loaded) => {
          if (run === this.tilesetRun) slot.loaded = loaded;
        },
        (e: Error) => {
          if (run === this.tilesetRun) slot.error = e.message;
        },
      ),
    );
    void Promise.all(jobs).then(() => {
      if (run !== this.tilesetRun || this.disposed) return;
      this.tilesetsSettled = true;
      this.releaseTileTextures();
      this.markAllTiles();
      this.ghostKey = "";
      this.needPreview = true;
      this.needWarning = false;
      this.updateWarning();
    });
  }

  private releaseTileTextures(): void {
    for (const tex of this.tileTextures.values()) tex?.destroy(false);
    this.tileTextures.clear();
  }

  /** gid의 잘린 텍스처. 타일셋이 아직 없거나 이미지 밖이면 null */
  private tileTexture(gid: number): Texture | null {
    const cached = this.tileTextures.get(gid);
    if (cached !== undefined) return cached;
    const m = this.model;
    const src = tileSource(m.tilesets, gid, m.tileWidth, m.tileHeight);
    if (!src) {
      this.tileTextures.set(gid, null);
      return null;
    }
    const slot = this.tilesets[src.tilesetIndex];
    if (!slot?.loaded) return null;
    const { loaded } = slot;
    if (src.sx + m.tileWidth > loaded.width || src.sy + m.tileHeight > loaded.height) {
      this.tileTextures.set(gid, null);
      return null;
    }
    const tex = new Texture({ source: loaded.texture.source, frame: new Rectangle(src.sx, src.sy, m.tileWidth, m.tileHeight) });
    this.tileTextures.set(gid, tex);
    return tex;
  }

  /** 읽지 못한 타일셋과 타일셋 밖의 gid를 헤더에 알린다 */
  private updateWarning(): void {
    const parts: string[] = [];
    for (const slot of this.tilesets) if (slot.error) parts.push(`타일셋 읽기 실패: ${slot.image} (${slot.error})`);
    let missing = 0;
    const seen = new Map<number, boolean>();
    for (const layer of this.model.layers) {
      for (const gid of layer.data) {
        if (gid <= 0) continue;
        let ok = seen.get(gid);
        if (ok === undefined) {
          const src = tileSource(this.model.tilesets, gid, this.model.tileWidth, this.model.tileHeight);
          const slot = src ? this.tilesets[src.tilesetIndex] : undefined;
          ok = !!src && !!slot && (!slot.loaded || (src.sx + this.model.tileWidth <= slot.loaded.width && src.sy + this.model.tileHeight <= slot.loaded.height));
          seen.set(gid, ok);
        }
        if (!ok) missing++;
      }
    }
    if (missing > 0) parts.push(`타일셋에 없는 gid 타일 ${missing}개`);
    runInAction(() => {
      this.status.warning = parts.length ? parts.join(", ") : null;
    });
  }

  // ---- 프레임 ----

  /** 렌더 직전(티커 우선순위 HIGH)에 모인 변경을 한 번에 반영한다 */
  private frame(): void {
    if (!this.app) return;
    if (this.pendingCenter) this.applyPendingCenter();
    if (this.needLayers) this.rebuildLayers();
    const renders = this.tilesetsSettled ? this.flushTiles() : 0;
    if (this.needWarning && this.tilesetsSettled) {
      this.needWarning = false;
      this.updateWarning();
    }
    this.flushCollision();
    if (this.needGrid) this.drawGrid();
    if (this.needObjects) this.drawObjects();
    if (this.needPreview) this.drawPreview();
    if (renders > 0) {
      let textures = 0;
      for (const node of this.layers) for (const ch of node.chunks.values()) if (ch.rt) textures++;
      runInAction(() => {
        this.stats.chunkRenders += renders;
        this.stats.chunkTextures = textures;
      });
    }
    if (!this.status.ready && this.tilesetsSettled && this.initialViewDone) {
      runInAction(() => {
        this.status.ready = true;
      });
    }
  }

  private rebuildLayers(): void {
    this.needLayers = false;
    for (const node of this.layers) this.destroyLayer(node);
    this.layers = [];
    this.layerRoot.removeChildren();
    this.grid = chunkGrid(this.model);
    for (let i = 0; i < this.model.layers.length; i++) {
      const container = new Container();
      container.label = `layer:${i}`;
      this.layerRoot.addChild(container);
      this.layers.push({ container, chunks: new Map() });
    }
    this.dirtyTiles.clear();
    this.markAllTiles();
    this.dirtyCollision = "all";
    this.applyLayerVisibility();
    this.drawStatic();
  }

  private destroyLayer(node: LayerNode): void {
    // 화면 스프라이트(display)는 container와 함께 없어진다
    node.container.destroy({ children: true });
    for (const ch of node.chunks.values()) {
      ch.content.destroy({ children: true });
      ch.rt?.destroy(true);
    }
    node.chunks.clear();
  }

  private flushTiles(): number {
    let renders = 0;
    if (this.dirtyTiles.size === 0) return 0;
    for (const [layer, chunks] of this.dirtyTiles) {
      const node = this.layers[layer];
      const data = this.model.layers[layer]?.data;
      if (!node || !data) continue;
      for (const [chunk, cells] of chunks) if (this.updateChunk(node, data, chunk, cells)) renders++;
    }
    this.dirtyTiles.clear();
    return renders;
  }

  /** 덩어리의 칸 스프라이트를 고치고 rt를 다시 그린다. 그렸으면 true */
  private updateChunk(node: LayerNode, data: readonly number[], chunk: number, cells: Set<number> | "all"): boolean {
    const m = this.model;
    const tw = m.tileWidth;
    const th = m.tileHeight;
    let ch = node.chunks.get(chunk);
    if (!ch) {
      const r = chunkCells(chunk, m, this.grid);
      const display = new Sprite(Texture.EMPTY);
      display.position.set(r.x0 * tw, r.y0 * th);
      display.visible = false;
      ch = { x0: r.x0, y0: r.y0, w: r.w, h: r.h, content: new Container(), sprites: new Array<Sprite | null>(r.w * r.h).fill(null), count: 0, rt: null, display };
      node.container.addChild(display);
      node.chunks.set(chunk, ch);
      cells = "all";
    }
    if (cells === "all") {
      for (let ly = 0; ly < ch.h; ly++) for (let lx = 0; lx < ch.w; lx++) this.setCell(ch, lx, ly, data[(ch.y0 + ly) * m.width + ch.x0 + lx]);
    } else {
      for (const i of cells) this.setCell(ch, (i % m.width) - ch.x0, Math.floor(i / m.width) - ch.y0, data[i]);
    }
    if (ch.count === 0) {
      ch.display.visible = false;
      return false;
    }
    if (!ch.rt) {
      ch.rt = RenderTexture.create({ width: ch.w * tw, height: ch.h * th, resolution: 1, scaleMode: this.scaleMode, antialias: false });
      ch.display.texture = ch.rt;
    }
    this.app!.renderer.render({ container: ch.content, target: ch.rt, clear: true, clearColor: [0, 0, 0, 0] });
    ch.display.visible = true;
    return true;
  }

  private setCell(ch: ChunkNode, lx: number, ly: number, gid: number): void {
    const k = ly * ch.w + lx;
    const tex = gid > 0 ? this.tileTexture(gid) : null;
    const sprite = ch.sprites[k];
    if (!tex) {
      if (sprite) {
        sprite.destroy();
        ch.sprites[k] = null;
        ch.count--;
      }
      return;
    }
    if (sprite) {
      sprite.texture = tex;
      return;
    }
    const s = new Sprite(tex);
    s.position.set(lx * this.model.tileWidth, ly * this.model.tileHeight);
    ch.content.addChild(s);
    ch.sprites[k] = s;
    ch.count++;
  }

  private flushCollision(): void {
    if (!this.document.showCollision) return;
    const dirty = this.dirtyCollision;
    if (dirty !== "all" && dirty.size === 0) return;
    const m = this.model;
    const data = m.collision;
    let chunks: Iterable<number>;
    if (dirty === "all") {
      for (const g of this.collisionChunks.values()) g.destroy();
      this.collisionChunks.clear();
      this.collisionRoot.removeChildren();
      chunks = Array.from({ length: this.grid.cols * this.grid.rows }, (_, i) => i);
    } else {
      chunks = dirty;
    }
    this.dirtyCollision = new Set();
    if (!data) return;
    const color = this.theme.colors.danger;
    for (const chunk of chunks) {
      let g = this.collisionChunks.get(chunk);
      if (!g) {
        g = new Graphics();
        this.collisionChunks.set(chunk, g);
        this.collisionRoot.addChild(g);
      }
      g.clear();
      const r = chunkCells(chunk, m, this.grid);
      let any = false;
      for (let y = r.y0; y < r.y0 + r.h; y++) {
        let run = -1;
        for (let x = r.x0; x <= r.x0 + r.w; x++) {
          const blocked = x < r.x0 + r.w && data[y * m.width + x] !== 0;
          if (blocked && run < 0) run = x;
          if (!blocked && run >= 0) {
            g.rect(run * m.tileWidth, y * m.tileHeight, (x - run) * m.tileWidth, m.tileHeight);
            any = true;
            run = -1;
          }
        }
      }
      if (any) g.fill({ color, alpha: COLLISION_ALPHA });
    }
  }

  /** 맵 바탕과 경계 (크기와 테마가 바뀔 때만) */
  private drawStatic(): void {
    const m = this.model;
    const c = this.theme.colors;
    this.backdrop.clear().rect(0, 0, m.pixelWidth, m.pixelHeight).fill({ color: c["scene-grid"], alpha: 0.5 });
    this.boundsG.clear().rect(0, 0, m.pixelWidth, m.pixelHeight).stroke({ width: 1, color: c["fg-muted"], pixelLine: true });
  }

  private drawGrid(): void {
    this.needGrid = false;
    const g = this.gridG;
    g.clear();
    if (!this.deps.view.grid || !this.app) return;
    const m = this.model;
    const lines = tileGridLines(this.transform, this.viewport(), m.tileWidth, m.tileHeight, m);
    if (!lines) return;
    const stroke = (xs: number[], ys: number[], color: number, alpha: number) => {
      if (xs.length === 0 && ys.length === 0) return;
      for (const x of xs) g.moveTo(x, lines.top).lineTo(x, lines.bottom);
      for (const y of ys) g.moveTo(lines.left, y).lineTo(lines.right, y);
      g.stroke({ width: 1, color, alpha, pixelLine: true });
    };
    stroke(lines.minor.xs, lines.minor.ys, this.theme.colors["scene-grid"], 0.7);
    stroke(lines.major.xs, lines.major.ys, this.theme.colors["scene-grid-major"], 0.9);
  }

  // ---- 오브젝트 ----

  private labelText(o: MapObject, spec: ObjectTypeSchema | undefined): string {
    if (!spec) return o.id;
    // 글인 값만 이름표에 쓴다 (표식 글로 실은 큰 정수는 수다)
    const enumField = spec.fields.find((f) => f.type === "enum" && isJsonText(o.props[f.name]));
    if (enumField) return `${spec.label} ${String(o.props[enumField.name])}`;
    const textField = spec.fields.find((f) => (f.type === "text" || f.type === "string") && isJsonText(o.props[f.name]) && o.props[f.name] !== "");
    if (textField) {
      const text = String(o.props[textField.name]).split("\n")[0];
      return `${spec.label} ${text.length > 12 ? text.slice(0, 12) + "..." : text}`;
    }
    return spec.label;
  }

  private drawObjects(): void {
    this.needObjects = false;
    const doc = this.document;
    const g = this.objectsG;
    g.clear();
    const show = doc.showObjects;
    this.labelRoot.visible = show;
    if (!show) return;
    const colors = this.theme.colors;
    const zoom = this.transform.zoom;
    const px = 1 / zoom;
    const mapH = this.model.pixelHeight;
    const sel = colors["scene-selection"];
    const seen = new Set<string>();
    for (const o of doc.model.objects) {
      const spec = typeOf(doc.schema, o.type);
      const shape = shapeOf(o, spec);
      const color = colors[shapeColorToken(spec?.color)];
      const selected = doc.selection.has(o.id);
      let labelAt: Point;
      if (shape.kind === "band") {
        g.rect(shape.x, 0, shape.width, mapH).fill({ color, alpha: 0.14 });
        g.moveTo(shape.x, 0).lineTo(shape.x, mapH).moveTo(shape.x + shape.width, 0).lineTo(shape.x + shape.width, mapH).stroke({ width: 1, color, alpha: 0.8, pixelLine: true });
        if (selected) g.rect(shape.x, 0, shape.width, mapH).stroke({ width: 2 * px, color: sel });
        labelAt = { x: shape.x + 3 * px, y: 3 * px };
      } else if (shape.kind === "rect") {
        g.rect(shape.x, shape.y, shape.width, shape.height).fill({ color, alpha: 0.18 }).stroke({ width: 1, color, pixelLine: true });
        if (selected) g.rect(shape.x, shape.y, shape.width, shape.height).stroke({ width: 2 * px, color: sel });
        labelAt = { x: shape.x, y: shape.y - (LABEL_FONT_SIZE + 5) * px };
      } else {
        if (shape.range) {
          const { min, max } = shape.range;
          g.moveTo(min, shape.y).lineTo(max, shape.y).stroke({ width: 1, color, alpha: 0.9, pixelLine: true });
          const hw = RANGE_HANDLE_HALF_W_PX * px;
          const hh = RANGE_HANDLE_HALF_H_PX * px;
          g.rect(min - hw, shape.y - hh, hw * 2, hh * 2).rect(max - hw, shape.y - hh, hw * 2, hh * 2).fill({ color });
        }
        g.circle(shape.x, shape.y, POINT_RADIUS_PX * px).fill({ color }).stroke({ width: 1.5 * px, color: colors["scene-bg"] });
        if (selected) g.circle(shape.x, shape.y, (POINT_RADIUS_PX + 3) * px).stroke({ width: 2 * px, color: sel });
        labelAt = { x: shape.x + (POINT_RADIUS_PX + 3) * px, y: shape.y - (POINT_RADIUS_PX + LABEL_FONT_SIZE + 4) * px };
      }
      seen.add(o.id);
      const text = this.labelText(o, spec);
      let label = this.labels.get(o.id);
      if (!label) {
        label = new Text({
          text,
          style: { fontFamily: this.theme.fonts["font-ui"], fontSize: LABEL_FONT_SIZE, fill: colors.fg, stroke: { color: colors["scene-bg"], width: 3 } },
        });
        this.labels.set(o.id, label);
        this.labelRoot.addChild(label);
      } else if (label.text !== text) {
        label.text = text;
      }
      label.scale.set(px);
      label.position.set(labelAt.x, labelAt.y);
    }
    for (const [id, label] of [...this.labels]) {
      if (seen.has(id)) continue;
      label.destroy();
      this.labels.delete(id);
    }
  }

  // ---- 미리보기 ----

  private drawPreview(): void {
    this.needPreview = false;
    const g = this.previewG;
    g.clear();
    const p: ToolPreview = this.picking()
      ? this.pickHover
        ? { kind: "cells", x0: this.pickHover.x, y0: this.pickHover.y, x1: this.pickHover.x, y1: this.pickHover.y, tone: "accent", fill: true }
        : { kind: "none" }
      : this.tools.preview;
    const m = this.model;
    const colors = this.theme.colors;
    const tw = m.tileWidth;
    const th = m.tileHeight;
    this.ghost.visible = p.kind === "brush" && this.tilesetsSettled;
    if (p.kind === "brush") {
      if (this.tilesetsSettled) this.rebuildGhost(p.brush);
      this.ghost.position.set(p.cell.x * tw, p.cell.y * th);
      g.rect(p.cell.x * tw, p.cell.y * th, p.brush.width * tw, p.brush.height * th).stroke({ width: 1, color: colors.accent, pixelLine: true });
    } else if (p.kind === "cells") {
      const color = p.tone === "danger" ? colors.danger : p.tone === "muted" ? colors["fg-muted"] : colors.accent;
      const x = p.x0 * tw;
      const y = p.y0 * th;
      const w = (p.x1 - p.x0 + 1) * tw;
      const h = (p.y1 - p.y0 + 1) * th;
      if (p.fill) g.rect(x, y, w, h).fill({ color, alpha: 0.2 });
      g.rect(x, y, w, h).stroke({ width: 1, color, pixelLine: true });
    } else if (p.kind === "box") {
      const r = p.rect;
      g.rect(r.x, r.y, r.w, r.h).fill({ color: colors.accent, alpha: 0.12 }).stroke({ width: 1, color: colors.accent, pixelLine: true });
    }
  }

  private rebuildGhost(brush: { width: number; height: number; gids: number[][] }): void {
    const key = `${brush.width}x${brush.height}:${brush.gids.map((r) => r.join(",")).join(";")}`;
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    for (const child of this.ghost.removeChildren()) child.destroy();
    const m = this.model;
    for (let y = 0; y < brush.height; y++) {
      for (let x = 0; x < brush.width; x++) {
        const tex = brush.gids[y][x] > 0 ? this.tileTexture(brush.gids[y][x]) : null;
        if (!tex) continue;
        const s = new Sprite(tex);
        s.position.set(x * m.tileWidth, y * m.tileHeight);
        this.ghost.addChild(s);
      }
    }
  }
}
