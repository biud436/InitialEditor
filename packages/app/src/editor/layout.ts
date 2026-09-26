// 도킹 레이아웃 상태: dockview api 를 쥐고 저장과 복원과 프리셋과 패널 토글을 맡는다.
// 저장은 layoutPersistence.ts, 프리셋은 layoutPresets.ts, 문서 탭 동기화는 documentDock.ts.

import type { DockviewApi } from "dockview";

type IDisposable = { dispose(): void };
import { action, makeObservable, observable, runInAction } from "mobx";
import type { DocumentDock } from "./documentDock";
import { type LayoutJson, type LayoutPersistence, restoreLayout } from "./layoutPersistence";
import { addToolPanel, applyPresetSizes, buildPreset, PANEL_IDS, type PanelId, type PresetName } from "./layoutPresets";

export interface LayoutDeps {
  persistence: LayoutPersistence;
  documents: DocumentDock;
  warn(message: string): void;
}

export const DEFAULT_PRESET: PresetName = "scene";
const PERSIST_DELAY_MS = 400;

export class LayoutStore {
  api: DockviewApi | null = null;
  /** 열린 도구 패널 (메뉴의 체크 표시용 거울) */
  readonly openPanels = observable.set<string>();
  /** clear 나 fromJSON 중이면 true. 그동안의 제거 이벤트는 사용자의 닫기가 아니다 */
  applying = false;
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
      api.onDidRemovePanel(() => this.syncOpenPanels()),
      api.onDidAddPanel(() => this.syncOpenPanels()),
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

  syncOpenPanels(): void {
    const api = this.api;
    for (const id of PANEL_IDS) {
      if (api?.getPanel(id)) this.openPanels.add(id);
      else this.openPanels.delete(id);
    }
  }

  private withApplying(fn: () => void): void {
    this.applying = true;
    try {
      fn();
    } finally {
      this.applying = false;
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
