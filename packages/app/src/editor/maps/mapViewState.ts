// 맵 뷰의 보기 설정: 격자, 현재 레이어 위를 흐리게, 팔레트 배율. localStorage 한 키에 남는다.
// 줌과 팬은 렌더러마다 따로 든다 (맵마다 크기가 달라서).

import { action, makeObservable, observable, reaction } from "mobx";
import type { KeyValueStorage } from "../LocalStorageSettingsStorage";

export const MAP_VIEW_KEY = "initial-editor.mapView";
export const PALETTE_ZOOMS = [1, 2, 3] as const;

export interface MapViewSettings {
  grid: boolean;
  dimAbove: boolean;
  paletteZoom: number;
}

export const DEFAULT_MAP_VIEW: MapViewSettings = { grid: true, dimAbove: false, paletteZoom: 2 };

function sanitize(raw: unknown): Partial<MapViewSettings> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<MapViewSettings> = {};
  if (typeof r.grid === "boolean") out.grid = r.grid;
  if (typeof r.dimAbove === "boolean") out.dimAbove = r.dimAbove;
  if (typeof r.paletteZoom === "number" && (PALETTE_ZOOMS as readonly number[]).includes(r.paletteZoom)) out.paletteZoom = r.paletteZoom;
  return out;
}

export class MapViewState {
  grid = DEFAULT_MAP_VIEW.grid;
  dimAbove = DEFAULT_MAP_VIEW.dimAbove;
  paletteZoom = DEFAULT_MAP_VIEW.paletteZoom;
  private stop: (() => void) | null = null;

  constructor(
    private readonly storage: KeyValueStorage | null = null,
    private readonly key = MAP_VIEW_KEY,
  ) {
    makeObservable(this, {
      grid: observable,
      dimAbove: observable,
      paletteZoom: observable,
      toggleGrid: action,
      toggleDimAbove: action,
      setPaletteZoom: action,
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
            // 저장소가 막혀 있으면 메모리에만 둔다
          }
        },
      );
    }
  }

  toJSON(): MapViewSettings {
    return { grid: this.grid, dimAbove: this.dimAbove, paletteZoom: this.paletteZoom };
  }

  load(): void {
    let parsed: unknown = null;
    try {
      const raw = this.storage?.getItem(this.key);
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    const s = { ...DEFAULT_MAP_VIEW, ...sanitize(parsed) };
    this.grid = s.grid;
    this.dimAbove = s.dimAbove;
    this.paletteZoom = s.paletteZoom;
  }

  toggleGrid(): void {
    this.grid = !this.grid;
  }

  toggleDimAbove(): void {
    this.dimAbove = !this.dimAbove;
  }

  setPaletteZoom(zoom: number): void {
    if ((PALETTE_ZOOMS as readonly number[]).includes(zoom)) this.paletteZoom = zoom;
  }

  dispose(): void {
    this.stop?.();
    this.stop = null;
  }
}
