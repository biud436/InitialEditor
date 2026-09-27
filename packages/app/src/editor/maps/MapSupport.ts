// 맵 지원. Editor.mapSupport로 붙는다.
//   - resources/maps/*.json을 MapDocument로 연다 (openPath를 가장 바깥에서 감싼다). 맵으로 읽지 못한 파일은 텍스트로 연다
//   - 타일셋 텍스처 캐시 (이미지 파일이 바뀌면 버린다), 보기 설정(MapViewState), 열린 렌더러 목록
//   - 활성 맵, 포인터 아래 월드 좌표(cursor), 뷰 가운데, 오브젝트로 뷰 옮기기: 오브젝트 인스펙터와 "여기서 실행"이 쓴다
//   - 맵 커맨드와 메뉴 (mapCommands.ts), 맵 오브젝트 클립보드 (mapClipboard.ts, 편집 메뉴가 쓴다)
//   - 붙은 렌더러의 도구 경고(한도에 닿은 채우기)를 콘솔에 남긴다
//   - 맵 탭이 활성이 되면 레이아웃에 없는 맵 패널(팔레트, 레이어, 맵 오브젝트)을 더한다 (LayoutStore.ensureMapPanels)

import { MapDocument, MapFormatError, isMapPath, typeOf, type MapObjectSchema } from "@initial-editor/ext-tilemap/model";
import { action, computed, makeObservable, observable, reaction, runInAction } from "mobx";
import type { Editor } from "../Editor";
import { TextureCache } from "../sceneView/textures";
import { isEditableTarget } from "../shortcuts";
import { registerMapCommands } from "./mapCommands";
import { shapeBounds, shapeOf } from "./mapGeometry";
import { MapClipboard } from "./mapClipboard";
import type { MapRenderer } from "./MapRenderer";
import { MapViewState } from "./mapViewState";

export interface WorldPoint {
  x: number;
  y: number;
}

/** 다른 모듈이 editor.mapSchema로 붙이는 스키마 저장소의 모양 (없을 수 있다) */
interface SchemaSource {
  current: MapObjectSchema | null;
}

export class MapSupport {
  readonly textures: TextureCache;
  readonly view: MapViewState;
  /** 맵 오브젝트 클립보드 (씬 오브젝트의 것과 따로) */
  readonly clipboard = new MapClipboard();
  /** 활성 맵 뷰에서 포인터가 마지막으로 있던 월드 좌표 (정수 픽셀). 활성 탭이 바뀌면 null */
  cursor: WorldPoint | null = null;
  /** 초점이 입력 칸에 있다. 도구 단축키(한 글자)를 끈다 */
  editableFocus = false;
  private readonly renderers = new Map<MapDocument, Set<MapRenderer>>();
  private readonly rendererWarnings = new Map<MapRenderer, () => void>();
  private readonly lastLayers = new WeakMap<MapDocument, number>();
  private readonly docDisposers = new Map<MapDocument, () => void>();
  private disposers: Array<() => void> = [];
  private projectDisposer: (() => void) | null = null;
  private renderersVersion = 0;

  constructor(private readonly editor: Editor) {
    this.textures = new TextureCache(() => editor.backend);
    this.view = new MapViewState(safeLocalStorage());
    makeObservable<MapSupport, "renderersVersion">(this, {
      cursor: observable.ref,
      editableFocus: observable,
      renderersVersion: observable,
      activeMap: computed,
      openCount: computed,
      setCursor: action,
    });
  }

  /** 활성 탭의 맵 문서. 다른 종류의 탭이면 null */
  get activeMap(): MapDocument | null {
    const active = this.editor.documents.active;
    return active instanceof MapDocument ? active : null;
  }

  /** 열린 맵 문서 수 */
  get openCount(): number {
    return this.editor.documents.documents.filter((d) => d instanceof MapDocument).length;
  }

  /** 지금 스키마 (editor.mapSchema가 있으면 그것의 current) */
  currentSchema(): MapObjectSchema | null {
    const source = (this.editor as unknown as { mapSchema?: SchemaSource }).mapSchema;
    return source?.current ?? null;
  }

  install(): void {
    const editor = this.editor;
    const original = editor.openPath.bind(editor);
    editor.openPath = async (path: string) => {
      if (!isMapPath(path)) return original(path);
      await this.openMap(path, original);
    };
    this.disposers.push(() => {
      editor.openPath = original;
    });
    this.disposers.push(registerMapCommands(editor, this));
    this.disposers.push(
      editor.events.on("projectOpened", () => this.watchProject()),
      editor.events.on("projectClosed", () => {
        this.unwatchProject();
        this.textures.clear();
      }),
      editor.documents.events.on("close", (doc) => {
        if (!(doc instanceof MapDocument)) return;
        this.docDisposers.get(doc)?.();
        this.docDisposers.delete(doc);
      }),
      reaction(
        () => this.activeMap,
        (doc) => {
          this.setCursor(null);
          if (doc) this.showMapPanels();
        },
      ),
    );
    if (editor.project.isOpen) this.watchProject();
    if (typeof document !== "undefined") {
      const onFocusIn = (e: FocusEvent) => runInAction(() => (this.editableFocus = isEditableTarget(e.target)));
      const onFocusOut = () => {
        setTimeout(() => runInAction(() => (this.editableFocus = isEditableTarget(document.activeElement))), 0);
      };
      document.addEventListener("focusin", onFocusIn);
      document.addEventListener("focusout", onFocusOut);
      this.disposers.push(() => {
        document.removeEventListener("focusin", onFocusIn);
        document.removeEventListener("focusout", onFocusOut);
      });
    }
  }

  /**
   * 맵을 열고(이미 열려 있으면 활성으로) 문서를 돌려준다. 읽지 못하면 null.
   * fallback을 주면 맵 형식이 아닌 파일은 그것(보통 텍스트 편집기)으로 연다.
   */
  async openMap(path: string, fallback?: (path: string) => Promise<void>): Promise<MapDocument | null> {
    const editor = this.editor;
    const existing = editor.documents.findByPath(path);
    if (existing) {
      editor.documents.activate(existing);
      return existing instanceof MapDocument ? existing : null;
    }
    let doc: MapDocument;
    try {
      doc = await MapDocument.open(editor.backend, path, this.currentSchema());
    } catch (e) {
      const reason = (e as Error).message;
      if (e instanceof MapFormatError && fallback) {
        editor.log.warn("editor", `${path} 은(는) 맵 형식이 아니라 텍스트로 연다: ${reason}`);
        editor.toasts.error(`맵으로 열지 못해 텍스트로 연다: ${reason}`);
        await fallback(path);
        return null;
      }
      const message = `${path} 을(를) 읽지 못했다: ${reason}`;
      editor.log.error("editor", message);
      editor.toasts.error(message);
      return null;
    }
    const opened = editor.documents.open(doc);
    if (opened !== doc) return opened instanceof MapDocument ? opened : null;
    this.trackDocument(doc);
    const m = doc.model;
    editor.log.info("editor", `맵을 열었다: ${path} (${m.width}x${m.height} 칸, 레이어 ${m.layers.length}, 오브젝트 ${m.objects.length})`);
    return doc;
  }

  /** 레이아웃에 없는 맵 패널을 더한다. 이 세션에서 사용자가 닫은 것은 다시 열지 않는다 */
  private showMapPanels(): void {
    try {
      this.editor.layout?.ensureMapPanels();
    } catch (e) {
      this.editor.log.warn("editor", `맵 패널을 더하지 못했다: ${(e as Error).message}`);
    }
  }

  /** 문서마다: 마지막 타일 레이어를 기억하고, 레이어 수가 줄면 대상을 범위 안으로 당긴다 */
  private trackDocument(doc: MapDocument): void {
    if (doc.target.kind === "layer") this.lastLayers.set(doc, doc.target.index);
    const stopTarget = reaction(
      () => doc.target,
      (t) => {
        if (t.kind === "layer") this.lastLayers.set(doc, t.index);
      },
    );
    const stopLayers = doc.model.events.on("layers", () => this.clampTarget(doc));
    const stopReset = doc.model.events.on("reset", () => this.clampTarget(doc));
    this.docDisposers.set(doc, () => {
      stopTarget();
      stopLayers();
      stopReset();
    });
  }

  private clampTarget(doc: MapDocument): void {
    const count = doc.model.layers.length;
    const last = this.lastLayers.get(doc) ?? 0;
    if (last >= count) this.lastLayers.set(doc, Math.max(0, count - 1));
    if (doc.target.kind === "layer" && doc.target.index >= count) doc.setTarget({ kind: "layer", index: Math.max(0, count - 1) });
  }

  /** 문서에서 마지막으로 고른 타일 레이어 번호 (통행이나 오브젝트로 갔다가 타일 도구로 돌아올 때) */
  lastLayer(doc: MapDocument): number {
    const n = this.lastLayers.get(doc) ?? 0;
    return Math.min(n, Math.max(0, doc.model.layers.length - 1));
  }

  attachRenderer(doc: MapDocument, renderer: MapRenderer): void {
    let set = this.renderers.get(doc);
    if (!set) this.renderers.set(doc, (set = new Set()));
    set.add(renderer);
    // 도구의 경고(한도에 닿은 채우기)는 콘솔에도 남긴다
    this.rendererWarnings.get(renderer)?.();
    this.rendererWarnings.set(
      renderer,
      renderer.events.on("warn", (message) => this.editor.log.warn("maps", `${doc.title}: ${message}`)),
    );
    runInAction(() => this.renderersVersion++);
  }

  detachRenderer(doc: MapDocument, renderer: MapRenderer): void {
    this.rendererWarnings.get(renderer)?.();
    this.rendererWarnings.delete(renderer);
    const set = this.renderers.get(doc);
    if (!set) return;
    set.delete(renderer);
    if (set.size === 0) this.renderers.delete(doc);
    runInAction(() => this.renderersVersion++);
  }

  /** 문서를 그리는 렌더러 (같은 문서의 뷰가 여럿이면 첫 것). 관찰 가능: 뷰가 붙고 떨어지면 다시 계산된다 */
  rendererFor(doc: MapDocument | null): MapRenderer | null {
    void this.renderersVersion;
    if (!doc) return null;
    const set = this.renderers.get(doc);
    return set ? (set.values().next().value ?? null) : null;
  }

  /** 활성 맵 뷰의 가운데 (월드 정수 픽셀). 맵 뷰가 없으면 null */
  viewCenter(): WorldPoint | null {
    const r = this.rendererFor(this.activeMap);
    if (!r) return null;
    const c = r.viewCenter();
    return { x: Math.round(c.x), y: Math.round(c.y) };
  }

  /** 활성 맵 뷰를 오브젝트가 가운데 오게 옮긴다 (줌은 그대로). 오브젝트나 뷰가 없으면 false */
  focusObject(id: string): boolean {
    const doc = this.activeMap;
    const r = this.rendererFor(doc);
    const o = doc?.model.findObject(id);
    if (!doc || !r || !o) return false;
    const b = shapeBounds(shapeOf(o, typeOf(doc.schema, o.type)), doc.model.pixelHeight);
    // 띠는 맵 높이 전체라 세로 가운데 대신 지금 보고 있는 높이를 둔다
    const center = { x: b.x + b.w / 2, y: b.h >= doc.model.pixelHeight ? r.viewCenter().y : b.y + b.h / 2 };
    r.centerOn(center);
    return true;
  }

  /** 렌더러가 포인터 아래 좌표를 알린다. 활성 맵의 뷰일 때만 cursor에 남는다 */
  setCursor(p: WorldPoint | null, from?: MapRenderer): void {
    if (from && this.rendererFor(this.activeMap) !== from) return;
    if (p && this.cursor && p.x === this.cursor.x && p.y === this.cursor.y) return;
    this.cursor = p;
  }

  /** 이미지가 바뀌면(밖에서든 에디터가 썼든) 텍스처를 버린다. 렌더러와 팔레트는 invalidated를 듣고 다시 읽는다 */
  private watchProject(): void {
    this.unwatchProject();
    this.projectDisposer = this.editor.project.events.on("change", (e) => {
      if (this.textures.has(e.path)) this.textures.invalidate(e.path);
    });
  }

  private unwatchProject(): void {
    this.projectDisposer?.();
    this.projectDisposer = null;
  }

  dispose(): void {
    this.unwatchProject();
    for (const d of this.docDisposers.values()) d();
    this.docDisposers.clear();
    for (const off of this.rendererWarnings.values()) off();
    this.rendererWarnings.clear();
    for (const d of this.disposers.reverse()) d();
    this.disposers = [];
    this.textures.dispose();
    this.view.dispose();
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
