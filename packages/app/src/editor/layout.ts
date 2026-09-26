// 도킹 레이아웃 상태: dockview api를 쥐고 저장과 복원과 프리셋과 패널 토글을 맡는다.
// 저장은 layoutPersistence.ts, 프리셋은 layoutPresets.ts, 문서 탭 동기화는 documentDock.ts.

import type { DockviewApi } from "dockview";

type IDisposable = { dispose(): void };
import { action, makeObservable, observable, runInAction } from "mobx";
import type { DocumentDock } from "./documentDock";
import { type LayoutJson, type LayoutPersistence, restoreLayout } from "./layoutPersistence";
import {
  addToolPanel,
  applyPresetSizes,
  buildPreset,
  firstDocPanelId,
  MAP_PANEL_HEIGHTS,
  mapPanelPlacement,
  missingMapPanels,
  PANEL_IDS,
  type PanelId,
  type PresetName,
} from "./layoutPresets";

export interface LayoutDeps {
  persistence: LayoutPersistence;
  documents: DocumentDock;
  warn(message: string): void;
}

export const DEFAULT_PRESET: PresetName = "scene";
const PERSIST_DELAY_MS = 400;

function isPanelId(id: string): id is PanelId {
  return (PANEL_IDS as readonly string[]).includes(id);
}

export class LayoutStore {
  api: DockviewApi | null = null;
  /** 열린 도구 패널 (메뉴의 체크 표시용 거울) */
  readonly openPanels = observable.set<string>();
  /** 프리셋, 복원, 맵 패널 더하기 중이면 true. 그동안의 제거 이벤트는 사용자의 닫기가 아니다 */
  applying = false;
  /** 이 세션에서 사용자가 닫은 도구 패널 (탭의 닫기나 창 메뉴). 맵 탭이 활성이 되어도 다시 열지 않는다. 다시 열리면 빠진다 */
  readonly userClosed = new Set<string>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private disposables: IDisposable[] = [];

  constructor(private readonly deps: LayoutDeps) {
    makeObservable(this, { api: observable.ref, syncOpenPanels: action });
  }

  attach(api: DockviewApi): void {
    this.detach();
    runInAction(() => {
      this.api = api;
    });
    this.disposables.push(
      api.onDidLayoutChange(() => {
        this.syncOpenPanels();
        if (!this.applying) this.schedulePersist();
      }),
      api.onDidRemovePanel((panel) => {
        if (!this.applying && isPanelId(panel.id)) this.userClosed.add(panel.id);
        this.syncOpenPanels();
      }),
      api.onDidAddPanel((panel) => {
        if (isPanelId(panel.id)) this.userClosed.delete(panel.id);
        this.syncOpenPanels();
      }),
    );
    this.deps.documents.attach(api, this);
    void this.restore();
  }

  detach(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.deps.documents.detach();
    runInAction(() => {
      this.api = null;
    });
  }

  /** 저장된 레이아웃(프로젝트 파일, 없으면 브라우저 저장소)을 되살린다. 실패하면 기본 프리셋 */
  async restore(): Promise<boolean> {
    const api = this.api;
    if (!api) return false;
    const persisted = await this.deps.persistence.load();
    if (this.api !== api) return false;
    let restored = false;
    this.withApplying(() => {
      restored = restoreLayout(
        persisted,
        (layout) => api.fromJSON(layout as Parameters<DockviewApi["fromJSON"]>[0]),
        () => buildPreset(api, DEFAULT_PRESET),
        this.deps.warn,
      );
      this.deps.documents.reconcile();
      if (!restored) applyPresetSizes(api, DEFAULT_PRESET);
    });
    this.syncOpenPanels();
    this.schedulePersist();
    return restored;
  }

  applyPreset(name: PresetName): void {
    const api = this.api;
    if (!api) return;
    this.withApplying(() => {
      buildPreset(api, name);
      this.deps.documents.reconcile();
      applyPresetSizes(api, name);
    });
    this.syncOpenPanels();
    this.schedulePersist();
  }

  reset(): void {
    this.applyPreset(DEFAULT_PRESET);
  }

  isPanelOpen(id: PanelId): boolean {
    return this.openPanels.has(id);
  }

  togglePanel(id: PanelId): void {
    const api = this.api;
    if (!api) return;
    const panel = api.getPanel(id);
    if (panel) api.removePanel(panel);
    else addToolPanel(api, id);
    this.syncOpenPanels();
  }

  /**
   * 맵 탭이 활성이 될 때: 레이아웃에 없는 맵 패널(맵 오브젝트, 팔레트, 레이어)을 더한다 (자리는 mapPanelPlacement).
   * 이 세션에서 사용자가 닫은 것은 두고, 활성 패널(보통 맵 탭)은 그대로다. 더한 id 목록.
   * 프리셋이나 복원 중에는 하지 않는다 (사용자가 고른 레이아웃을 그대로 둔다)
   */
  ensureMapPanels(): PanelId[] {
    const api = this.api;
    if (!api || this.applying) return [];
    const has = (id: string) => !!api.getPanel(id);
    const missing = missingMapPanels(has, this.userClosed);
    if (missing.length === 0) return [];
    const active = api.activePanel;
    this.withApplying(() => {
      for (const id of missing) {
        const placement = mapPanelPlacement(has, id, firstDocPanelId(api));
        addToolPanel(api, id, placement);
        const height = MAP_PANEL_HEIGHTS[id];
        if (height && placement.direction !== "within") api.getPanel(id)?.api.setSize({ height });
      }
    });
    if (active && api.getPanel(active.id) && !active.api.isActive) active.api.setActive();
    this.syncOpenPanels();
    this.schedulePersist();
    return missing;
  }

  syncOpenPanels(): void {
    const api = this.api;
    for (const id of PANEL_IDS) {
      if (api?.getPanel(id)) this.openPanels.add(id);
      else this.openPanels.delete(id);
    }
  }

  /** 겹쳐 불려도 바깥 것이 끝날 때까지 applying을 둔다 */
  private withApplying(fn: () => void): void {
    const outer = this.applying;
    this.applying = true;
    try {
      fn();
    } finally {
      this.applying = outer;
    }
  }

  private schedulePersist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), PERSIST_DELAY_MS);
  }

  /** 지금 바로 저장한다 (프로젝트를 닫기 전) */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const api = this.api;
    if (!api) return;
    let json: LayoutJson;
    try {
      json = api.toJSON() as unknown as LayoutJson;
    } catch (e) {
      this.deps.warn(`레이아웃을 직렬화하지 못했다: ${(e as Error).message}`);
      return;
    }
    await this.deps.persistence.save(json);
  }

  dispose(): void {
    this.detach();
  }
}
