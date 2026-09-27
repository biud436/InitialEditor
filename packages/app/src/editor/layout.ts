// 도킹 레이아웃 상태: dockview api를 쥐고 저장과 복원과 프리셋과 패널 토글을 맡는다.
// 저장은 layoutPersistence.ts, 프리셋은 layoutPresets.ts, 문서 탭 동기화는 documentDock.ts.
// 확장 패널(ext:<id>)도 도구 패널이다: 창 메뉴로 켜고 끄고, 레이아웃이 기억한다. 되살린 레이아웃(프로젝트의 layout.json 이든
// 브라우저 저장소든)에서 등록되지 않은 확장의 패널과 visible이 거짓인 패널을 뺀다. visible이 아직 모름(undefined)이면 답이 날 때까지
// 두고 거짓이 되면 뺀다 (그 패널이 보이는 프로젝트의 레이아웃에서는 빠지지 않는다). visible이 거짓인 확장 패널은 새로 열지 않는다 (닫기는 된다).

import type { DockviewApi } from "dockview";

type IDisposable = { dispose(): void };
import { action, comparer, makeObservable, observable, reaction, runInAction } from "mobx";
import type { DocumentDock } from "./documentDock";
import { type LayoutJson, type LayoutPersistence, restoreLayout } from "./layoutPersistence";
import {
  addExtensionPanel,
  addToolPanel,
  applyPresetSizes,
  buildPreset,
  extPanelKey,
  extPanelVisibility,
  firstDocPanelId,
  isBuiltinPanelId,
  isExtPanelId,
  isExtPanelVisible,
  MAP_PANEL_HEIGHTS,
  mapPanelPlacement,
  missingMapPanels,
  PANEL_IDS,
  type ExtPanelSpec,
  type PanelId,
  type PresetName,
  type ToolPanelId,
} from "./layoutPresets";

export interface LayoutDeps {
  persistence: LayoutPersistence;
  documents: DocumentDock;
  warn(message: string): void;
  /** 확장이 등록한 패널 (registries.panels). 없으면 확장 패널이 없다 */
  extensionPanels?(): readonly ExtPanelSpec[];
}

export const DEFAULT_PRESET: PresetName = "scene";
const PERSIST_DELAY_MS = 400;

function isToolPanelId(id: string): id is ToolPanelId {
  return isBuiltinPanelId(id) || isExtPanelId(id);
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
  /** 되살린 레이아웃에서 visible이 아직 모름인 확장 패널을 지켜보는 것. 답이 다 나면 멈춘다 */
  private stopPending: (() => void) | null = null;

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
        if (!this.applying && isToolPanelId(panel.id)) this.userClosed.add(panel.id);
        this.syncOpenPanels();
      }),
      api.onDidAddPanel((panel) => {
        if (isToolPanelId(panel.id)) this.userClosed.delete(panel.id);
        this.syncOpenPanels();
      }),
    );
    this.deps.documents.attach(api, this);
    void this.restore();
  }

  detach(): void {
    this.watchPending([]);
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
        () => buildPreset(api, DEFAULT_PRESET, this.extensionPanels()),
        this.deps.warn,
      );
      this.watchPending(this.dropExtensionPanels());
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
      buildPreset(api, name, this.extensionPanels());
      this.deps.documents.reconcile();
      applyPresetSizes(api, name);
    });
    this.syncOpenPanels();
    this.schedulePersist();
  }

  reset(): void {
    this.applyPreset(DEFAULT_PRESET);
  }

  isPanelOpen(id: ToolPanelId): boolean {
    return this.openPanels.has(id);
  }

  togglePanel(id: ToolPanelId): void {
    const api = this.api;
    if (!api) return;
    const panel = api.getPanel(id);
    if (panel) api.removePanel(panel);
    else this.addPanel(api, id);
    this.syncOpenPanels();
  }

  /** 패널을 열고 활성으로 (이미 있으면 활성으로만) */
  showPanel(id: ToolPanelId): void {
    const api = this.api;
    if (!api) return;
    const panel = api.getPanel(id);
    if (panel) panel.api.setActive();
    else this.addPanel(api, id);
    this.syncOpenPanels();
  }

  private addPanel(api: DockviewApi, id: ToolPanelId): void {
    if (isBuiltinPanelId(id)) {
      addToolPanel(api, id);
      return;
    }
    const key = extPanelKey(id);
    const spec = this.extensionPanels().find((p) => p.id === key);
    if (!spec) this.deps.warn(`등록되지 않은 확장 패널이다: ${id}`);
    else if (!isExtPanelVisible(spec)) this.deps.warn(`이 프로젝트에 해당하지 않는 확장 패널이다: ${spec.title}`);
    else addExtensionPanel(api, spec);
  }

  private extensionPanels(): readonly ExtPanelSpec[] {
    return this.deps.extensionPanels?.() ?? [];
  }

  /**
   * 되살린 레이아웃에서 등록되지 않은 확장의 패널과 visible이 거짓인 패널을 뺀다.
   * visible이 아직 모름인 패널의 도킹 id 를 돌려준다 (watchPending 이 답을 기다린다)
   */
  private dropExtensionPanels(): string[] {
    const api = this.api;
    if (!api) return [];
    const specs = new Map(this.extensionPanels().map((p) => [p.id, p]));
    const pending: string[] = [];
    for (const panel of [...api.panels]) {
      const key = extPanelKey(panel.id);
      if (key === null) continue;
      const spec = specs.get(key);
      const visible = spec ? extPanelVisibility(spec) : false;
      if (visible === false) api.removePanel(panel);
      else if (visible === undefined) pending.push(panel.id);
    }
    return pending;
  }

  /** 되살린 레이아웃의 visible이 아직 모름인 확장 패널: 거짓이 되면 빼고(사용자의 닫기가 아니다), 참이 되면 둔다 */
  private watchPending(ids: string[]): void {
    this.stopPending?.();
    this.stopPending = null;
    if (ids.length === 0) return;
    const waiting = new Set(ids);
    const decided = () => {
      const out: Array<[string, boolean]> = [];
      for (const id of waiting) {
        const key = extPanelKey(id);
        const spec = key === null ? undefined : this.extensionPanels().find((p) => p.id === key);
        const visible = spec ? extPanelVisibility(spec) : false;
        if (visible !== undefined) out.push([id, visible]);
      }
      return out;
    };
    this.stopPending = reaction(decided, (answers) => {
      const api = this.api;
      if (!api) return;
      let removed = false;
      this.withApplying(() => {
        for (const [id, visible] of answers) {
          waiting.delete(id);
          const panel = api.getPanel(id);
          if (!visible && panel) {
            api.removePanel(panel);
            removed = true;
          }
        }
      });
      if (waiting.size === 0) {
        this.stopPending?.();
        this.stopPending = null;
      }
      if (removed) {
        this.syncOpenPanels();
        this.schedulePersist();
      }
    }, { equals: comparer.structural });
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
    const ext = new Set((api?.panels ?? []).map((p) => p.id).filter(isExtPanelId));
    for (const id of [...this.openPanels]) if (isExtPanelId(id) && !ext.has(id)) this.openPanels.delete(id);
    for (const id of ext) this.openPanels.add(id);
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
