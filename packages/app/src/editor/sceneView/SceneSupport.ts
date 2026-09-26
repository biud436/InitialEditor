// 씬 뷰 지원 (E2 마일스톤 4). Editor.sceneSupport 로 붙는다.
//   - resources/scenes/*.json 을 SceneDocument 로 여는 것 (openPath 를 감싼다. 스크립트 지원(E1) 뒤에 설치되어 바깥에서
//     먼저 가로채므로 씬 파일이 Monaco 로 열리지 않는다)
//   - 보기 설정(격자, 스냅, 줌, SceneViewState) 과 그 커맨드와 메뉴 (viewCommands.ts)
//   - 렌더러들이 함께 쓰는 텍스처 캐시. 이미지 파일이 바뀌면 버린다
//   - 타일맵 오브젝트의 씬 노드 (타일맵 확장이 등록한 타입에 붙인다)와 그 맵 파일 캐시. 파일이 바뀌면 알린다
//   - 맵 파일이 없는 타일맵 검사 (엔진이 씬을 거부한다). 있는지는 비동기로 확인해 두고, 답이 바뀌면 그 맵을 쓰는
//     열린 씬을 다시 검사한다
//   - 열린 렌더러 목록 (카메라 맞추기 커맨드가 활성 탭의 것을 찾는다)

import { CORE_OBJECT_TYPES, SceneDocument, SCENES_DIR, type SceneObject, type Validator } from "@initial-editor/core";
import { readTilemapProps, TILEMAP_TYPE, validateTilemapMapFiles } from "@initial-editor/ext-tilemap";
import { computed, makeObservable } from "mobx";
import type { Editor } from "../Editor";
import { MapFileCache, MapFileExistence } from "./mapFiles";
import { attachObjectTypeParts } from "./objectTypeParts";
import type { SceneNodeContext, SceneRenderer } from "./SceneRenderer";
import { createTilemapNode } from "./tilemapNode";
import { TextureCache } from "./textures";
import { registerViewCommands } from "./viewCommands";
import { SceneViewState } from "./viewState";

const SCENE_PATH = new RegExp(`^${SCENES_DIR}/[^/]+\\.json$`, "i");

export function isScenePath(path: string): boolean {
  return SCENE_PATH.test(path);
}

export class SceneSupport {
  readonly view: SceneViewState;
  readonly textures: TextureCache;
  /** 타일맵 오브젝트가 가리키는 맵 파일 (씬 노드와 인스펙터가 읽는다) */
  readonly maps: MapFileCache;
  /** 타일맵이 가리키는 맵 파일이 있는지 (씬 검사가 읽는다) */
  readonly mapFiles: MapFileExistence;
  private readonly renderers = new Map<SceneDocument, Set<SceneRenderer>>();
  private disposers: Array<() => void> = [];

  constructor(private readonly editor: Editor) {
    this.view = new SceneViewState(safeLocalStorage());
    this.textures = new TextureCache(() => editor.backend);
    this.maps = new MapFileCache(() => editor.backend);
    this.mapFiles = new MapFileExistence(() => editor.backend);
    makeObservable(this, { openCount: computed, activeScene: computed });
  }

  /** 열린 씬 문서 수 (상태 바용) */
  get openCount(): number {
    return this.editor.documents.documents.filter((d) => d instanceof SceneDocument).length;
  }

  /** 활성 탭의 씬 문서. 다른 종류의 탭이면 null */
  get activeScene(): SceneDocument | null {
    const active = this.editor.documents.active;
    return active instanceof SceneDocument ? active : null;
  }

  /** 검증이 아는 타입: 코어 셋과 확장이 등록한 것 */
  readonly knownTypes = (): ReadonlySet<string> => new Set<string>([...CORE_OBJECT_TYPES, ...this.editor.registries.objectTypes.keys()]);

  /** 확장이 등록한 검사기와, 타일맵 타입이 있으면 맵 파일이 없는 타일맵 검사 */
  readonly validators = (): Validator[] => {
    const registries = this.editor.registries;
    const list = [...registries.validators];
    if (registries.objectTypes.has(TILEMAP_TYPE)) list.push(this.checkMapFiles);
    return list;
  };

  /** 맵 파일이 없는 타일맵 (모르는 경로는 확인을 보내고 넘어간다. 답이 오면 revalidateScenesUsing) */
  private readonly checkMapFiles: Validator = (scene) => validateTilemapMapFiles(scene, (path) => this.mapFiles.exists(path) === false);

  /** game.json 의 논리 해상도 (창 크기 / renderScale). 씬 좌표는 이 단위다 */
  gameSize(): { width: number; height: number } {
    const g = this.editor.project.gameJson;
    const scale = g.renderScale > 0 ? g.renderScale : 1;
    return { width: Math.max(1, Math.round(g.windowWidth / scale)), height: Math.max(1, Math.round(g.windowHeight / scale)) };
  }

  install(): void {
    const editor = this.editor;
    const original = editor.openPath.bind(editor);
    editor.openPath = async (path: string) => {
      if (!isScenePath(path)) return original(path);
      await this.openScene(path);
    };
    this.disposers.push(() => {
      editor.openPath = original;
    });
    this.disposers.push(registerViewCommands(editor, this));
    this.disposers.push(
      attachObjectTypeParts(editor.registries.objectTypes, TILEMAP_TYPE, {
        createSceneNode: (object, ctx) => createTilemapNode({ maps: this.maps }, object as SceneObject, ctx as SceneNodeContext),
      }),
    );
    this.disposers.push(
      editor.events.on("projectOpened", () => this.watchProject()),
      editor.events.on("projectClosed", () => {
        this.unwatchProject();
        this.textures.clear();
        this.maps.clear();
        this.mapFiles.clear();
      }),
      this.mapFiles.events.on("changed", (path) => this.revalidateScenesUsing(path)),
    );
    if (editor.project.isOpen) this.watchProject();
  }

  /** 씬을 열고(이미 열려 있으면 활성으로) 문서를 돌려준다. 못 열면 null */
  async openScene(path: string): Promise<SceneDocument | null> {
    const editor = this.editor;
    const existing = editor.documents.findByPath(path);
    if (existing) {
      editor.documents.activate(existing);
      return existing instanceof SceneDocument ? existing : null;
    }
    try {
      const doc = await SceneDocument.open(editor.backend, path, this.knownTypes, this.validators);
      const opened = editor.documents.open(doc);
      if (opened !== doc) return opened instanceof SceneDocument ? opened : null;
      // 맵 파일 확인이 문서를 등록하기 전에 끝났을 수 있어 한 번 더 검사한다 (기억한 답을 읽는다)
      doc.revalidate();
      const errors = doc.problems.filter((p) => p.severity === "error");
      if (errors.length) editor.log.warn("editor", `${path}: 문제 ${errors.length}건 (${errors[0].message})`);
      return doc;
    } catch (e) {
      const message = `${path} 을(를) 읽지 못했다: ${(e as Error).message}`;
      editor.log.error("editor", message);
      editor.toasts.error(message);
      return null;
    }
  }

  attachRenderer(doc: SceneDocument, renderer: SceneRenderer): void {
    let set = this.renderers.get(doc);
    if (!set) this.renderers.set(doc, (set = new Set()));
    set.add(renderer);
  }

  detachRenderer(doc: SceneDocument, renderer: SceneRenderer): void {
    const set = this.renderers.get(doc);
    if (!set) return;
    set.delete(renderer);
    if (set.size === 0) this.renderers.delete(doc);
  }

  /** 문서를 그리는 렌더러 (같은 문서의 탭이 여럿이면 첫 것) */
  rendererFor(doc: SceneDocument | null): SceneRenderer | null {
    if (!doc) return null;
    const set = this.renderers.get(doc);
    return set ? (set.values().next().value ?? null) : null;
  }

  /** 새 오브젝트를 놓을 자리: 활성 씬 뷰의 가운데(월드 좌표), 씬 뷰가 없으면 카메라의 가운데 (씬 도구 SceneTools.spawnPoint 가 쓴다) */
  center(): { x: number; y: number } {
    const renderer = this.rendererFor(this.activeScene);
    if (renderer) {
      const c = renderer.viewCenter();
      return { x: Math.round(c.x), y: Math.round(c.y) };
    }
    const size = this.gameSize();
    return { x: Math.round(size.width / 2), y: Math.round(size.height / 2) };
  }

  /** path의 맵 파일을 쓰는 타일맵이 있는 열린 씬을 다시 검사한다 */
  private revalidateScenesUsing(path: string): void {
    for (const doc of this.editor.documents.documents) {
      if (!(doc instanceof SceneDocument)) continue;
      if (doc.scene.objects.some((o) => o.type === TILEMAP_TYPE && readTilemapProps(o.props).map === path)) doc.revalidate();
    }
  }

  private projectDisposer: (() => void) | null = null;

  /**
   * 파일이 바뀌면(밖에서든 에디터가 썼든) 그 텍스처를 버리고(렌더러는 invalidated를 듣고 다시 만든다), 맵 파일 캐시에
   * 알린다 (타일맵 노드는 제 맵 파일이나 타일셋 그림이면 다시 그린다). 텍스처를 먼저 버려야 노드가 새 그림을 읽는다.
   * 맵 파일이 있는지도 다시 확인한다 (지우거나 이름을 바꾸면 검사 결과에 오른다)
   */
  private watchProject(): void {
    this.unwatchProject();
    this.projectDisposer = this.editor.project.events.on("change", (e) => {
      if (this.textures.has(e.path)) this.textures.invalidate(e.path);
      this.maps.fileChanged(e.path);
      this.mapFiles.fileChanged(e.path);
    });
  }

  private unwatchProject(): void {
    this.projectDisposer?.();
    this.projectDisposer = null;
  }

  dispose(): void {
    this.unwatchProject();
    for (const d of this.disposers.reverse()) d();
    this.disposers = [];
    this.textures.dispose();
    this.maps.clear();
    this.mapFiles.clear();
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
