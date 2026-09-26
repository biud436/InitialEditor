// 씬 뷰의 보기 설정 (격자 표시, 격자 크기, 스냅, 줌). MobX 저장소 하나이고 localStorage 한 키에 남는다.
// 줌은 뷰가 여럿이어도 하나다 (탭은 한 번에 하나만 보인다). 팬은 렌더러마다 따로 든다.

import { action, makeObservable, observable, reaction } from "mobx";
import type { KeyValueStorage } from "../LocalStorageSettingsStorage";
import { clampZoom, nextZoomStep, prevZoomStep } from "./geometry";

export const SCENE_VIEW_KEY = "initial-editor.sceneView";
export const GRID_SIZES = [8, 16, 32, 48, 64] as const;
export const DEFAULT_GRID_SIZE = 16;

export interface SceneViewSettings {
  grid: boolean;
  gridSize: number;
  snap: boolean;
  zoom: number;
}

export const DEFAULT_VIEW_SETTINGS: SceneViewSettings = { grid: true, gridSize: DEFAULT_GRID_SIZE, snap: false, zoom: 1 };

function sanitize(raw: unknown): Partial<SceneViewSettings> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<SceneViewSettings> = {};
  if (typeof r.grid === "boolean") out.grid = r.grid;
  if (typeof r.snap === "boolean") out.snap = r.snap;
  if (typeof r.gridSize === "number" && Number.isFinite(r.gridSize) && r.gridSize >= 1) out.gridSize = Math.round(r.gridSize);
  if (typeof r.zoom === "number") out.zoom = clampZoom(r.zoom);
  return out;
}

export class SceneViewState {
  grid = DEFAULT_VIEW_SETTINGS.grid;
  gridSize = DEFAULT_VIEW_SETTINGS.gridSize;
  snap = DEFAULT_VIEW_SETTINGS.snap;
  zoom = DEFAULT_VIEW_SETTINGS.zoom;
  private stop: (() => void) | null = null;

  constructor(
    private readonly storage: KeyValueStorage | null = null,
    private readonly key = SCENE_VIEW_KEY,
  ) {
    makeObservable(this, {
      grid: observable,
      gridSize: observable,
      snap: observable,
      zoom: observable,
      toggleGrid: action,
      toggleSnap: action,
      setGridSize: action,
      setZoom: action,
      zoomIn: action,
      zoomOut: action,
      resetZoom: action,
      load: action,
    });
    this.load();
    if (storage) {
      this.stop = reaction(
        () => this.toJSON(),
        (value) => {
          try {
            storage.setItem(this.key, JSON.stringify(value));
          } catch {
            // 저장소가 막혀 있어도 (사파리 비공개 모드 등) 보기 설정은 메모리에 남는다
          }
        },
      );
    }
  }

  toJSON(): SceneViewSettings {
    return { grid: this.grid, gridSize: this.gridSize, snap: this.snap, zoom: this.zoom };
  }

  /** 저장소의 값을 읽는다. 깨졌거나 없으면 기본값 */
  load(): void {
    let parsed: unknown = null;
    try {
      const raw = this.storage?.getItem(this.key);
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    const s = { ...DEFAULT_VIEW_SETTINGS, ...sanitize(parsed) };
    this.grid = s.grid;
    this.gridSize = s.gridSize;
    this.snap = s.snap;
    this.zoom = s.zoom;
  }

  toggleGrid(): void {
    this.grid = !this.grid;
  }

  toggleSnap(): void {
    this.snap = !this.snap;
  }

  setGridSize(size: number): void {
    if (Number.isFinite(size) && size >= 1) this.gridSize = Math.round(size);
  }

  setZoom(zoom: number): void {
    this.zoom = clampZoom(zoom);
  }

  zoomIn(): void {
    this.zoom = nextZoomStep(this.zoom);
  }

  zoomOut(): void {
    this.zoom = prevZoomStep(this.zoom);
  }

  resetZoom(): void {
    this.zoom = 1;
  }

  dispose(): void {
    this.stop?.();
    this.stop = null;
  }
}
