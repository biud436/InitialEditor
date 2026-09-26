// PIXI 8 씬 뷰 렌더러 (docs/plans/e2-scene.md 마일스톤 4). 씬 문서 하나에 렌더러 하나, 탭마다 따로 만든다.
//
//   world (팬과 줌) ─ gridLayer ─ cameraLayer ─ belowLayer ─ objectLayer (오브젝트마다 Container, 그리기 순서) ─ aboveLayer
//                    ─ selectionLayer
//   stage ─ bandLayer (상자 선택, 화면 좌표)
// belowLayer와 aboveLayer는 엔진 씬 로더의 drawBelow와 drawAbove 자리다. 확장 노드가 ctx.below(), ctx.above()로 받아
//   쓰며, 모든 오브젝트의 아래와 위에 오브젝트 순서로 쌓인다 (타일맵은 바닥 레이어를 아래에, 나머지를 위에).
//
// 문서 → 뷰: scene.objects 와 selection 을 MobX autorun/reaction 으로 듣고 바뀐 노드만 다시 만든다 (id 로 찾고,
//   타입이나 props 가 바뀌면 새로 만들고, x, y 만 바뀌면 옮긴다).
// 뷰 → 문서: 끌기와 방향키는 document.apply(scene.moveObjects(...)) 로만 고친다. 한 번의 끌기는 coalesceKey 하나라
//   되돌리기 한 번에 끌기 전으로 돌아간다. 선택은 document.select / clearSelection.
// 좌표 계산은 geometry.ts (순수 함수) 에 있고 여기는 PIXI 와 DOM 이벤트만 다룬다.
//
// 근사인 것: 글자는 시스템 글꼴(게임은 BMFont), 스프라이트는 시작 프레임 한 장, 회전과 배율은 엔진처럼 왼쪽 위 기준,
// 숨긴 오브젝트는 흐리게 그린다(게임은 그리지 않는다). 게임 뷰가 진실이다.
// 확장 타입은 등록된 createSceneNode가 만든 노드를 그린다 (타일맵은 tilemapNode.ts).

import type { ObjectTypeSpec, SceneDocument, SceneObject } from "@initial-editor/core";
import { autorun, comparer, observable, reaction, runInAction } from "mobx";
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import type { SceneColors, SceneFonts } from "./colors";
import {
  backgroundAt,
  clickSelection,
  dragPositions,
  fitRect,
  gridLines,
  hitTest,
  mergeSelection,
  movedEnough,
  nudgeDelta,
  rectFromPoints,
  rubberBandSelect,
  screenToWorld,
  zoomAround,
  clampZoom,
  type DragStart,
  type HitTarget,
  type Point,
  type Rect,
  type ViewTransform,
} from "./geometry";
import type { LoadedTexture, TextureCache } from "./textures";
import type { SceneViewState } from "./viewState";

/** 확장의 createSceneNode 가 받는 두 번째 인자 */
export interface SceneNodeContext {
  loadTexture(path: string): Promise<LoadedTexture>;
  colors: SceneColors;
  fonts: SceneFonts;
  document: SceneDocument;
  /** 줌과 상관없이 화면에서 같은 크기로 보이는 이름표. 노드 안에 붙여 쓴다 */
  makeLabel(text: string, color: number): Container;
  /**
   * 노드의 경계 (오브젝트 위치 기준, 월드 단위). 고르기와 선택 상자가 쓴다. 비동기로 다 그린 뒤에도 부를 수 있다.
   * background면 배경 대상이다 (geometry.ts HitTarget.background: 누르면 상자 선택, 움직이지 않고 놓으면 고른다)
   */
  setBounds(bounds: Rect, opts?: { background?: boolean }): void;
  /**
   * 모든 오브젝트보다 먼저 그리는 자리 (엔진 씬 로더의 drawBelow). 오브젝트 위치를 따라가고, 오브젝트 순서로
   * 다른 확장의 아래 자리와 쌓이며, 노드를 버리면 함께 치운다. 처음 부를 때 만든다
   */
  below(): Container;
  /** 모든 오브젝트 뒤에 그리는 자리 (drawAbove). 나머지는 below()와 같다 */
  above(): Container;
}

export interface SceneTheme {
  colors: SceneColors;
  fonts: SceneFonts;
}

export interface SceneRendererDeps {
  document: SceneDocument;
  view: SceneViewState;
  textures: TextureCache;
  objectTypes: { get(type: string): ObjectTypeSpec | undefined };
  /** game.json 의 논리 해상도 (windowWidth / renderScale) */
  gameSize: () => { width: number; height: number };
  theme: () => SceneTheme;
}

interface NodeEntry {
  object: SceneObject;
  node: Container;
  /** 오브젝트 위치 기준의 경계 (월드 단위) */
  size: Rect;
  /** 화면 크기를 유지할 글자들 (줌의 역수로 배율) */
  labels: Container[];
  /** 배경 대상 (setBounds의 background) */
  background: boolean;
  /** 모든 오브젝트 아래와 위에 그리는 자리 (ctx.below(), ctx.above()로 만든 것) */
  below: Container | null;
  above: Container | null;
  imagePath: string | null;
  spec: ObjectTypeSpec | undefined;
  /** 비동기 로드가 늦게 끝나 옛 노드를 건드리지 않게 */
  run: number;
}

type PointerState =
  | { kind: "pan"; last: Point }
  | { kind: "maybeDrag"; start: Point; worldStart: Point; primary: string; starts: DragStart[] }
  | { kind: "drag"; worldStart: Point; primary: string; starts: DragStart[]; key: string; last: string }
  | { kind: "band"; start: Point; current: Point; additive: boolean; screenStart: Point; background: string | null };

/** BMFont hangul.fnt (size 32, lineHeight 32) 의 근사 */
const TEXT_FONT_SIZE = 28;
const TEXT_LINE_HEIGHT = 32;
const LABEL_FONT_SIZE = 11;
const NODE_HALF = 6;
const PLACEHOLDER_SIZE = 32;
const HANDLE_PX = 6;
const HIDDEN_ALPHA = 0.35;
const VIEW_MARGIN = 24;

let dragCounter = 0;

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** 오브젝트 자리와 숨김 표시 (노드와 아래, 위 자리가 같이 쓴다) */
function place(part: Container, o: SceneObject): void {
  part.position.set(o.x, o.y);
  part.alpha = o.visible ? 1 : HIDDEN_ALPHA;
}

export class SceneRenderer {
  /** 화면 변환. 컴포넌트가 data-zoom, data-pan-x, data-pan-y 로 내보낸다 (e2e 가 오브젝트 좌표를 화면 픽셀로 옮길 때 쓴다) */
  readonly transform = observable<ViewTransform>({ zoom: 1, panX: VIEW_MARGIN, panY: VIEW_MARGIN });
  readonly status = observable<{ ready: boolean; error: string | null }>({ ready: false, error: null });

  private app: Application | null = null;
  private host: HTMLElement | null = null;
  private readonly world = new Container();
  private readonly gridLayer = new Graphics();
  private readonly cameraLayer = new Graphics();
  private readonly belowLayer = new Container();
  private readonly objectLayer = new Container();
  private readonly aboveLayer = new Container();
  private readonly selectionLayer = new Graphics();
  private readonly bandLayer = new Graphics();
  private readonly nodes = new Map<string, NodeEntry>();
  private theme: SceneTheme;
  private pointer: PointerState | null = null;
  private spaceHeld = false;
  private pendingAnchor: Point | null = null;
  private pendingPan: Point | null = null;
  private disposers: Array<() => void> = [];
  private disposed = false;

  constructor(private readonly deps: SceneRendererDeps) {
    this.theme = deps.theme();
    this.transform.zoom = deps.view.zoom;
    this.world.addChild(this.gridLayer, this.cameraLayer, this.belowLayer, this.objectLayer, this.aboveLayer, this.selectionLayer);
  }

  get document(): SceneDocument {
    return this.deps.document;
  }

  /** PIXI 를 띄우고 host 에 캔버스를 붙인다. WebGL 이 없으면 status.error 에 이유를 적고 조용히 끝난다 */
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
        // 헤드리스나 약한 GPU: 저전력 힌트로 한 번 더
        try {
          await app.init({ ...base, powerPreference: "low-power" });
        } catch {
          throw first;
        }
      }
    } catch (e) {
      runInAction(() => {
        this.status.error = `WebGL 을 쓸 수 없다: ${(e as Error).message}`;
      });
      return;
    }
    if (this.disposed) {
      app.destroy({ removeView: true }, { children: true });
      return;
    }
    this.app = app;
    app.stage.eventMode = "none";
    app.stage.addChild(this.world, this.bandLayer);
    host.appendChild(app.canvas);
    app.canvas.style.display = "block";
    this.installDom(host, app.canvas);
    this.installReactions();
    this.applyTransform();
    runInAction(() => {
      this.status.ready = true;
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const d of this.disposers.reverse()) d();
    this.disposers = [];
    for (const entry of this.nodes.values()) this.destroyEntry(entry);
    this.nodes.clear();
    if (this.app) {
      // 텍스처 캐시의 원본은 놓지 않는다 (다른 탭이 쓴다)
      this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
      this.app = null;
    }
    this.host = null;
  }

  // ---- 화면 변환 ----

  private viewport(): { width: number; height: number } {
    const host = this.host;
    return { width: host?.clientWidth ?? 1, height: host?.clientHeight ?? 1 };
  }

  private setTransform(zoom: number, pan: Point): void {
    runInAction(() => {
      this.transform.zoom = zoom;
      this.transform.panX = pan.x;
      this.transform.panY = pan.y;
    });
    this.applyTransform();
  }

  private applyTransform(): void {
    const t = this.transform;
    this.world.scale.set(t.zoom);
    this.world.position.set(t.panX, t.panY);
    for (const entry of this.nodes.values()) for (const label of entry.labels) if (!label.destroyed) label.scale.set(1 / t.zoom);
    this.redrawGrid();
    this.redrawCamera();
    this.redrawSelection();
  }

  private applyZoom(zoom: number): void {
    if (this.pendingPan) {
      const pan = this.pendingPan;
      this.pendingPan = null;
      this.setTransform(zoom, pan);
      return;
    }
    const vp = this.viewport();
    const anchor = this.pendingAnchor ?? { x: vp.width / 2, y: vp.height / 2 };
    const next = zoomAround(this.transform, zoom, anchor);
    this.setTransform(next.zoom, { x: next.panX, y: next.panY });
  }

  /** 뷰포트 가운데의 월드 좌표 (새 오브젝트를 놓을 자리) */
  viewCenter(): Point {
    const vp = this.viewport();
    return screenToWorld(this.transform, { x: vp.width / 2, y: vp.height / 2 });
  }

  /** 카메라 사각형(논리 해상도)이 여백을 두고 들어가게 줌과 팬을 맞춘다 */
  fitCamera(): void {
    const size = this.deps.gameSize();
    const fit = fitRect(this.viewport(), { x: 0, y: 0, w: size.width, h: size.height }, VIEW_MARGIN);
    this.pendingPan = { x: fit.panX, y: fit.panY };
    this.deps.view.setZoom(fit.zoom);
    if (this.pendingPan) {
      // 줌이 그대로라 reaction 이 돌지 않았다
      const pan = this.pendingPan;
      this.pendingPan = null;
      this.setTransform(this.transform.zoom, pan);
    }
  }

  /** 테마가 바뀌었다: 바탕과 선 색을 바꾸고 색이 박힌 노드(글자, 자리표시자)는 다시 만든다 */
  setTheme(theme: SceneTheme): void {
    this.theme = theme;
    if (this.app) this.app.renderer.background.color = theme.colors["scene-bg"];
    this.rebuildAll();
    this.applyTransform();
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
    on(canvas, "pointerdown", (e) => this.onPointerDown(e));
    on(canvas, "pointermove", (e) => this.onPointerMove(e));
    on(canvas, "pointerup", (e) => this.onPointerUp(e));
    on(canvas, "pointercancel", (e) => this.onPointerUp(e));
    on(canvas, "wheel", (e) => this.onWheel(e), { passive: false });
    on(canvas, "contextmenu", (e) => e.preventDefault());
    on(host, "keydown", (e) => this.onKeyDown(e));
    on(host, "keyup", (e) => this.onKeyUp(e));
    on(host, "blur", () => {
      this.spaceHeld = false;
      this.updateCursor();
    });
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
    this.redrawGrid();
  }

  private updateCursor(): void {
    const host = this.host;
    if (!host) return;
    const p = this.pointer;
    host.style.cursor = p?.kind === "pan" ? "grabbing" : this.spaceHeld ? "grab" : p?.kind === "drag" ? "move" : "default";
  }

  private hitTargets(): HitTarget[] {
    const out: HitTarget[] = [];
    for (const o of this.document.scene.objects) {
      const entry = this.nodes.get(o.id);
      if (!entry) continue;
      out.push({ id: o.id, bounds: { x: o.x + entry.size.x, y: o.y + entry.size.y, w: entry.size.w, h: entry.size.h }, background: entry.background });
    }
    return out;
  }

  private onPointerDown(e: PointerEvent): void {
    const host = this.host;
    if (!host || !this.app) return;
    host.focus({ preventScroll: true });
    const screen = this.screenPoint(e);
    this.app.canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || this.spaceHeld) {
      this.pointer = { kind: "pan", last: screen };
      this.updateCursor();
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const doc = this.document;
    const world = screenToWorld(this.transform, screen);
    const targets = this.hitTargets();
    const hit = hitTest(targets, world, doc.selection);
    const next = clickSelection(doc.selection, hit, e.shiftKey);
    doc.select(next);
    if (hit === null) {
      // 고르지 않은 배경 위면 상자 선택으로 시작하고, 움직이지 않고 놓으면 그 배경을 고른다
      this.pointer = { kind: "band", start: world, current: world, additive: e.shiftKey, screenStart: screen, background: backgroundAt(targets, world) };
      return;
    }
    if (e.shiftKey) return; // Shift 는 토글만, 끌지 않는다
    const starts: DragStart[] = doc.selectedIds.map((id) => {
      const o = doc.scene.find(id)!;
      return { id, x: o.x, y: o.y };
    });
    this.pointer = { kind: "maybeDrag", start: screen, worldStart: world, primary: hit, starts };
  }

  private onPointerMove(e: PointerEvent): void {
    const p = this.pointer;
    if (!p) return;
    const screen = this.screenPoint(e);
    if (p.kind === "pan") {
      const t = this.transform;
      this.setTransform(t.zoom, { x: t.panX + screen.x - p.last.x, y: t.panY + screen.y - p.last.y });
      p.last = screen;
      return;
    }
    if (p.kind === "band") {
      p.current = screenToWorld(this.transform, screen);
      this.redrawBand(p);
      return;
    }
    if (p.kind === "maybeDrag") {
      if (!movedEnough(p.start, screen)) return;
      this.pointer = { kind: "drag", worldStart: p.worldStart, primary: p.primary, starts: p.starts, key: `scene-drag:${++dragCounter}`, last: "" };
      this.updateCursor();
    }
    const drag = this.pointer;
    if (!drag || drag.kind !== "drag") return;
    const world = screenToWorld(this.transform, screen);
    const view = this.deps.view;
    const moves = dragPositions(drag.starts, { x: world.x - drag.worldStart.x, y: world.y - drag.worldStart.y }, drag.primary, view.snap, view.gridSize);
    const signature = moves.map((m) => `${m.id}:${m.x},${m.y}`).join("|");
    if (signature === drag.last) return;
    drag.last = signature;
    const doc = this.document;
    doc.apply(doc.scene.moveObjects(moves, drag.key));
  }

  private onPointerUp(e: PointerEvent): void {
    const p = this.pointer;
    this.pointer = null;
    this.updateCursor();
    if (!p) return;
    if (this.app?.canvas.hasPointerCapture(e.pointerId)) this.app.canvas.releasePointerCapture(e.pointerId);
    if (p.kind === "band") {
      this.bandLayer.clear();
      if (p.background !== null && !movedEnough(p.screenStart, this.screenPoint(e))) {
        this.document.select(clickSelection(this.document.selection, p.background, p.additive));
        return;
      }
      const band = rectFromPoints(p.start, p.current);
      if (band.w === 0 && band.h === 0) return; // 빈 곳 클릭은 pointerdown 에서 이미 비웠다
      const hits = rubberBandSelect(this.hitTargets(), band);
      this.document.select(mergeSelection(this.document.selection, hits, p.additive));
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const t = this.transform;
    if (e.shiftKey || e.altKey) {
      // 트랙패드 쓰는 이의 팬
      this.setTransform(t.zoom, { x: t.panX - e.deltaX, y: t.panY - e.deltaY });
      return;
    }
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002));
    const next = clampZoom(t.zoom * factor);
    if (next === t.zoom) return;
    this.pendingAnchor = this.screenPoint(e);
    this.deps.view.setZoom(next);
    this.pendingAnchor = null;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === " " && !e.repeat) {
      this.spaceHeld = true;
      this.updateCursor();
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      this.document.clearSelection();
      e.preventDefault();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return; // 전역 단축키의 몫
    const delta = nudgeDelta(e.key, e.shiftKey);
    if (!delta) return;
    const doc = this.document;
    const ids = doc.selectedIds;
    if (ids.length === 0) return;
    e.preventDefault();
    const moves = ids.map((id) => {
      const o = doc.scene.find(id)!;
      return { id, x: o.x + delta.x, y: o.y + delta.y };
    });
    doc.apply(doc.scene.moveObjects(moves));
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.key === " ") {
      this.spaceHeld = false;
      this.updateCursor();
    }
  }

  // ---- 문서 → 뷰 ----

  private installReactions(): void {
    const { document: doc, view, textures } = this.deps;
    this.disposers.push(
      autorun(() => this.reconcile()),
      reaction(
        () => [...doc.selection],
        () => this.redrawSelection(),
        { equals: comparer.structural },
      ),
      reaction(
        () => view.zoom,
        (zoom) => this.applyZoom(zoom),
      ),
      reaction(
        () => [view.grid, view.gridSize],
        () => this.redrawGrid(),
      ),
      reaction(
        () => this.deps.gameSize(),
        () => this.redrawCamera(),
        { equals: comparer.structural },
      ),
      textures.events.on("invalidated", (path) => {
        for (const entry of [...this.nodes.values()]) if (entry.imagePath === path) this.rebuildEntry(entry.object);
        this.reorder();
      }),
    );
  }

  /** scene.objects 를 노드와 맞춘다. 같은 오브젝트 객체면 그대로, 타입이나 props 가 바뀌면 새로, x/y/visible 만 바뀌면 고친다 */
  private reconcile(): void {
    const objects = this.document.scene.objects.slice();
    const seen = new Set<string>();
    for (const o of objects) {
      seen.add(o.id);
      const spec = this.deps.objectTypes.get(o.type);
      const entry = this.nodes.get(o.id);
      if (!entry) {
        this.nodes.set(o.id, this.createEntry(o, spec));
        continue;
      }
      if (entry.object === o && entry.spec === spec) continue;
      const prev = entry.object;
      if (prev.type !== o.type || prev.props !== o.props || entry.spec !== spec) {
        this.destroyEntry(entry);
        this.nodes.set(o.id, this.createEntry(o, spec));
        continue;
      }
      entry.object = o;
      for (const part of [entry.node, entry.below, entry.above]) if (part) place(part, o);
    }
    for (const [id, entry] of [...this.nodes]) {
      if (seen.has(id)) continue;
      this.destroyEntry(entry);
      this.nodes.delete(id);
    }
    this.reorder();
    this.redrawSelection();
  }

  private reorder(): void {
    this.belowLayer.removeChildren();
    this.objectLayer.removeChildren();
    this.aboveLayer.removeChildren();
    for (const o of this.document.scene.objects) {
      const entry = this.nodes.get(o.id);
      if (!entry) continue;
      if (entry.below) this.belowLayer.addChild(entry.below);
      this.objectLayer.addChild(entry.node);
      if (entry.above) this.aboveLayer.addChild(entry.above);
    }
  }

  private rebuildAll(): void {
    for (const entry of [...this.nodes.values()]) this.rebuildEntry(entry.object);
    this.reorder();
  }

  private rebuildEntry(object: SceneObject): void {
    const old = this.nodes.get(object.id);
    if (old) this.destroyEntry(old);
    const current = this.document.scene.find(object.id) ?? object;
    this.nodes.set(current.id, this.createEntry(current, this.deps.objectTypes.get(current.type)));
  }

  private destroyEntry(entry: NodeEntry): void {
    entry.run = -1;
    entry.node.destroy({ children: true, texture: false, textureSource: false });
    this.dropParts(entry);
  }

  /** 아래와 위 자리를 치운다 */
  private dropParts(entry: NodeEntry): void {
    for (const part of [entry.below, entry.above]) part?.destroy({ children: true, texture: false, textureSource: false });
    entry.below = null;
    entry.above = null;
  }

  /** 확장 노드의 아래(below)나 위(above) 자리. 처음 부를 때 만들고, 이미 그려진 노드면 층에 끼운다 */
  private partFor(entry: NodeEntry, which: "below" | "above"): Container {
    const existing = entry[which];
    if (existing) return existing;
    const part = new Container({ label: `${which}:${entry.object.id}` });
    place(part, entry.object);
    // 버린 노드의 늦은 호출은 붙이지 않는 자리를 준다
    if (entry.run === -1 || this.disposed) return part;
    entry[which] = part;
    if (this.nodes.get(entry.object.id) === entry) this.reorder();
    return part;
  }

  private createEntry(o: SceneObject, spec: ObjectTypeSpec | undefined): NodeEntry {
    const node = new Container();
    node.label = o.id;
    place(node, o);
    const entry: NodeEntry = { object: o, node, size: { x: 0, y: 0, w: 0, h: 0 }, labels: [], background: false, below: null, above: null, imagePath: null, spec, run: 0 };
    if (o.type === "sprite") this.buildSprite(entry);
    else if (o.type === "text") this.buildText(entry);
    else if (o.type === "node") this.buildNode(entry);
    else this.buildExtension(entry, spec);
    for (const label of entry.labels) if (!label.destroyed) label.scale.set(1 / this.transform.zoom);
    return entry;
  }

  private makeLabel(text: string, color: number): Text {
    return new Text({ text, style: { fontFamily: this.theme.fonts["font-mono"], fontSize: LABEL_FONT_SIZE, fill: color } });
  }

  private buildSprite(entry: NodeEntry): void {
    const o = entry.object;
    const props = o.props;
    const image = typeof props.image === "string" ? props.image : "";
    const scale = num(props.scale, 1);
    entry.imagePath = image || null;
    if (!image) {
      this.buildPlaceholder(entry, `${o.id} (이미지 없음)`, this.theme.colors.danger);
      return;
    }
    this.buildPlaceholder(entry, o.id, this.theme.colors.border);
    const run = ++entry.run;
    this.deps.textures
      .load(image)
      .then((loaded) => {
        if (entry.run !== run || this.disposed) return;
        entry.node.removeChildren().forEach((c) => c.destroy({ children: true }));
        entry.labels = [];
        const frames = Math.max(1, Math.floor(num(props.frames, 1)));
        const frameW = Math.max(1, Math.floor(num(props.width, 0)) || Math.floor(loaded.width / frames));
        const frameH = Math.max(1, Math.floor(num(props.height, 0)) || loaded.height);
        const startFrame = Math.max(0, Math.floor(num(props.startFrame, 0)));
        const fx = Math.min(startFrame, frames - 1) * frameW;
        // 시트 밖으로 나가면 잘라서 PIXI 가 던지지 않게
        const w = Math.max(1, Math.min(frameW, loaded.width - fx));
        const h = Math.max(1, Math.min(frameH, loaded.height));
        const texture = fx >= loaded.width ? loaded.texture : new Texture({ source: loaded.texture.source, frame: new Rectangle(fx, 0, w, h) });
        const sprite = new Sprite(texture);
        sprite.scale.set(scale);
        sprite.angle = num(props.angle, 0);
        sprite.alpha = Math.max(0, Math.min(1, num(props.opacity, 255) / 255));
        entry.node.addChild(sprite);
        entry.size = { x: 0, y: 0, w: frameW * scale, h: frameH * scale };
        this.redrawSelection();
      })
      .catch((e: Error) => {
        if (entry.run !== run || this.disposed) return;
        entry.node.removeChildren().forEach((c) => c.destroy({ children: true }));
        entry.labels = [];
        this.buildPlaceholder(entry, `${o.id} (${image}: ${e.message})`, this.theme.colors.danger);
        for (const label of entry.labels) label.scale.set(1 / this.transform.zoom);
        this.redrawSelection();
      });
  }

  /** 이미지가 없거나 못 읽은 스프라이트: 테두리 상자와 대각선과 id */
  private buildPlaceholder(entry: NodeEntry, caption: string, color: number): void {
    const g = new Graphics();
    g.rect(0, 0, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE)
      .stroke({ width: 1, color, pixelLine: true })
      .moveTo(0, 0)
      .lineTo(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE)
      .moveTo(PLACEHOLDER_SIZE, 0)
      .lineTo(0, PLACEHOLDER_SIZE)
      .stroke({ width: 1, color, pixelLine: true, alpha: 0.6 });
    const label = this.makeLabel(caption, color);
    label.position.set(0, PLACEHOLDER_SIZE + 2);
    entry.node.addChild(g, label);
    entry.labels.push(label);
    entry.size = { x: 0, y: 0, w: PLACEHOLDER_SIZE, h: PLACEHOLDER_SIZE };
  }

  private buildText(entry: NodeEntry): void {
    const props = entry.object.props;
    const raw = props.text;
    const content = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "";
    const text = new Text({
      text: content,
      style: { fontFamily: this.theme.fonts["font-ui"], fontSize: TEXT_FONT_SIZE, lineHeight: TEXT_LINE_HEIGHT, fill: this.theme.colors.fg, whiteSpace: "pre" },
    });
    entry.node.addChild(text);
    if (content === "") {
      // 빈 글자도 고를 수 있게 한 줄 높이의 자리
      entry.size = { x: 0, y: 0, w: TEXT_LINE_HEIGHT, h: TEXT_LINE_HEIGHT };
      return;
    }
    entry.size = { x: 0, y: 0, w: Math.max(1, text.width), h: Math.max(1, text.height) };
  }

  private buildNode(entry: NodeEntry): void {
    const color = this.theme.colors.accent;
    const g = new Graphics();
    g.moveTo(-NODE_HALF, 0).lineTo(NODE_HALF, 0).moveTo(0, -NODE_HALF).lineTo(0, NODE_HALF).stroke({ width: 1, color, pixelLine: true });
    g.circle(0, 0, 2).fill(color);
    const label = this.makeLabel(entry.object.id, this.theme.colors["fg-muted"]);
    label.position.set(NODE_HALF + 3, -NODE_HALF);
    entry.node.addChild(g, label);
    entry.labels.push(label);
    entry.size = { x: -NODE_HALF, y: -NODE_HALF, w: NODE_HALF * 2, h: NODE_HALF * 2 };
  }

  private buildExtension(entry: NodeEntry, spec: ObjectTypeSpec | undefined): void {
    const o = entry.object;
    if (spec?.createSceneNode) {
      let bounded = false;
      let failed = false;
      const ctx: SceneNodeContext = {
        loadTexture: (p) => this.deps.textures.load(p),
        colors: this.theme.colors,
        fonts: this.theme.fonts,
        document: this.document,
        makeLabel: (text, color) => {
          const label = this.makeLabel(text, color);
          label.scale.set(1 / this.transform.zoom);
          if (!failed) entry.labels.push(label);
          return label;
        },
        setBounds: (b, opts) => {
          bounded = true;
          if (failed || entry.run === -1 || this.disposed) return;
          entry.size = { x: b.x, y: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h) };
          entry.background = opts?.background === true;
          entry.labels = entry.labels.filter((label) => !label.destroyed);
          this.redrawSelection();
        },
        // 만들지 못한 노드의 늦은 호출은 붙이지 않는 자리를 준다
        below: () => (failed ? new Container() : this.partFor(entry, "below")),
        above: () => (failed ? new Container() : this.partFor(entry, "above")),
      };
      try {
        const made = spec.createSceneNode(o, ctx);
        if (made instanceof Container) {
          entry.node.addChild(made);
          if (!bounded) {
            const b = made.getLocalBounds();
            entry.size = { x: b.x, y: b.y, w: Math.max(1, b.width), h: Math.max(1, b.height) };
          }
          return;
        }
      } catch {
        // 아래의 이름표 상자로
      }
      // 확장이 노드를 만들지 못했다: 만든 이름표와 자리를 치우고 이름표 상자를 그린다
      failed = true;
      for (const label of entry.labels) if (!label.destroyed) label.destroy();
      entry.labels = [];
      this.dropParts(entry);
    }
    const color = this.theme.colors["fg-muted"];
    const size = 48;
    const g = new Graphics();
    g.rect(0, 0, size, size).stroke({ width: 1, color, pixelLine: true });
    const label = this.makeLabel(`${o.type}: ${o.id}`, color);
    label.position.set(0, size + 2);
    entry.node.addChild(g, label);
    entry.labels.push(label);
    entry.size = { x: 0, y: 0, w: size, h: size };
  }

  // ---- 그리기 ----

  private redrawGrid(): void {
    const g = this.gridLayer;
    g.clear();
    const view = this.deps.view;
    if (!view.grid || !this.app) return;
    const vp = this.viewport();
    const t = this.transform;
    const lines = gridLines(t, vp, view.gridSize);
    const topLeft = screenToWorld(t, { x: 0, y: 0 });
    const bottomRight = screenToWorld(t, { x: vp.width, y: vp.height });
    const colors = this.theme.colors;
    const strokeSet = (xs: number[], ys: number[], color: number) => {
      if (xs.length === 0 && ys.length === 0) return;
      for (const x of xs) g.moveTo(x, topLeft.y).lineTo(x, bottomRight.y);
      for (const y of ys) g.moveTo(topLeft.x, y).lineTo(bottomRight.x, y);
      g.stroke({ width: 1, color, pixelLine: true });
    };
    strokeSet(lines.minor.xs, lines.minor.ys, colors["scene-grid"]);
    strokeSet(lines.major.xs, lines.major.ys, colors["scene-grid-major"]);
  }

  private redrawCamera(): void {
    const g = this.cameraLayer;
    g.clear();
    const size = this.deps.gameSize();
    g.rect(0, 0, size.width, size.height).stroke({ width: 1, color: this.theme.colors["scene-camera"], pixelLine: true });
  }

  private redrawSelection(): void {
    const g = this.selectionLayer;
    g.clear();
    const doc = this.document;
    if (doc.selection.size === 0) return;
    const color = this.theme.colors["scene-selection"];
    const handle = HANDLE_PX / this.transform.zoom;
    for (const o of doc.scene.objects) {
      if (!doc.selection.has(o.id)) continue;
      const entry = this.nodes.get(o.id);
      if (!entry) continue;
      const r: Rect = { x: o.x + entry.size.x, y: o.y + entry.size.y, w: entry.size.w, h: entry.size.h };
      g.rect(r.x, r.y, r.w, r.h).stroke({ width: 1, color, pixelLine: true });
      for (const [hx, hy] of [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x, r.y + r.h],
        [r.x + r.w, r.y + r.h],
      ]) {
        g.rect(hx - handle / 2, hy - handle / 2, handle, handle).fill(color);
      }
    }
  }

  private redrawBand(p: { start: Point; current: Point }): void {
    const g = this.bandLayer;
    g.clear();
    const t = this.transform;
    const a = { x: p.start.x * t.zoom + t.panX, y: p.start.y * t.zoom + t.panY };
    const b = { x: p.current.x * t.zoom + t.panX, y: p.current.y * t.zoom + t.panY };
    const r = rectFromPoints(a, b);
    const color = this.theme.colors.accent;
    g.rect(r.x, r.y, r.w, r.h).fill({ color, alpha: 0.12 }).stroke({ width: 1, color, pixelLine: true });
  }
}
