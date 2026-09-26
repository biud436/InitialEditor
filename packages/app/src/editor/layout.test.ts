// 맵 탭이 활성이 될 때 맵 패널을 더하는 LayoutStore의 규칙. dockview 대신 자리만 기억하는 가짜 api로 돈다.
import type { DockviewApi } from "dockview";
import { describe, expect, it } from "vitest";
import type { DocumentDock } from "./documentDock";
import { LayoutStore } from "./layout";
import type { LayoutPersistence } from "./layoutPersistence";
import { mapPanelPlacement, missingMapPanels, type PanelId } from "./layoutPresets";

type Listener<T> = (e: T) => void;

interface FakePanel {
  id: string;
  group: number;
  position?: { referencePanel?: string; direction?: string };
  heights: number[];
  api: { isActive: boolean; setActive(): void; setSize(dim: { width?: number; height?: number }): void };
}

/** dockview의 쓰는 부분만: 패널 목록, 그룹 번호, 활성 패널, 더하기와 지우기 이벤트 */
class FakeDock {
  panels: FakePanel[] = [];
  activePanel: FakePanel | undefined;
  private nextGroup = 1;
  private removeListeners: Array<Listener<{ id: string }>> = [];
  private addListeners: Array<Listener<{ id: string }>> = [];
  private layoutListeners: Array<Listener<void>> = [];

  getPanel = (id: string) => this.panels.find((p) => p.id === id);

  addPanel = (opts: { id: string; position?: { referencePanel?: string; direction?: string } }) => {
    const ref = opts.position?.referencePanel ? this.getPanel(opts.position.referencePanel) : undefined;
    const group = ref && opts.position?.direction === "within" ? ref.group : this.nextGroup++;
    const panel: FakePanel = {
      id: opts.id,
      group,
      position: opts.position,
      heights: [],
      api: {
        isActive: false,
        setActive: () => this.activate(panel),
        setSize: (dim) => {
          if (dim.height !== undefined) panel.heights.push(dim.height);
        },
      },
    };
    this.panels.push(panel);
    this.activate(panel);
    this.addListeners.forEach((l) => l(panel));
    this.layoutListeners.forEach((l) => l());
    return panel;
  };

  removePanel = (panel: FakePanel) => {
    this.panels = this.panels.filter((p) => p !== panel);
    if (this.activePanel === panel) this.activePanel = undefined;
    this.removeListeners.forEach((l) => l(panel));
    this.layoutListeners.forEach((l) => l());
  };

  clear = () => {
    for (const p of [...this.panels]) this.removePanel(p);
  };

  activate(panel: FakePanel) {
    if (this.activePanel) this.activePanel.api.isActive = false;
    this.activePanel = panel;
    panel.api.isActive = true;
  }

  onDidRemovePanel = (l: Listener<{ id: string }>) => this.sub(this.removeListeners, l);
  onDidAddPanel = (l: Listener<{ id: string }>) => this.sub(this.addListeners, l);
  onDidLayoutChange = (l: Listener<void>) => this.sub(this.layoutListeners, l);
  toJSON = () => ({});

  private sub<T>(list: Array<Listener<T>>, l: Listener<T>) {
    list.push(l);
    return { dispose: () => list.splice(list.indexOf(l), 1) };
  }

  groupOf(id: string): number | undefined {
    return this.getPanel(id)?.group;
  }
}

async function setup(reconcile: (store: LayoutStore) => void = () => {}) {
  const dock = new FakeDock();
  const persistence = { load: async () => null, save: async () => {} } as unknown as LayoutPersistence;
  let store: LayoutStore | null = null;
  const documents = { attach: () => {}, detach: () => {}, reconcile: () => store && reconcile(store) } as unknown as DocumentDock;
  store = new LayoutStore({ persistence, documents, warn: () => {} });
  store.attach(dock as unknown as DockviewApi);
  await new Promise((r) => setTimeout(r, 0));
  // 문서 탭 하나 (맵)
  dock.addPanel({ id: "doc:resources/maps/a.json", position: { referencePanel: "console", direction: "above" } });
  return { dock, store };
}

describe("맵 패널 자리 (순수)", () => {
  it("더할 것: 없고, 사용자가 닫지 않은 것", () => {
    const open = new Set<string>(["mapLayers"]);
    expect(missingMapPanels((id) => open.has(id), new Set())).toEqual(["mapObjects", "mapPalette"]);
    expect(missingMapPanels((id) => open.has(id), new Set(["mapPalette"]))).toEqual(["mapObjects"]);
    expect(missingMapPanels(() => true, new Set())).toEqual([]);
  });

  it("맵 오브젝트는 계층 탭 옆, 팔레트는 프로젝트 아래, 레이어는 인스펙터 아래. 없으면 다음 이웃이나 문서 옆", () => {
    const has = (ids: string[]) => (id: string) => ids.includes(id);
    const scene = has(["hierarchy", "project", "inspector", "extensions", "console"]);
    expect(mapPanelPlacement(scene, "mapObjects", "doc:a")).toEqual({ referencePanel: "hierarchy", direction: "within" });
    expect(mapPanelPlacement(scene, "mapPalette", "doc:a")).toEqual({ referencePanel: "project", direction: "below" });
    expect(mapPanelPlacement(scene, "mapLayers", "doc:a")).toEqual({ referencePanel: "inspector", direction: "below" });
    const script = has(["project", "console"]);
    expect(mapPanelPlacement(script, "mapObjects", "doc:a")).toEqual({ referencePanel: "project", direction: "within" });
    expect(mapPanelPlacement(script, "mapPalette", "doc:a")).toEqual({ referencePanel: "project", direction: "below" });
    expect(mapPanelPlacement(script, "mapLayers", "doc:a")).toEqual({ referencePanel: "doc:a", direction: "right" });
    const bare = has([]);
    expect(mapPanelPlacement(bare, "mapObjects", undefined)).toEqual({ direction: "left" });
    expect(mapPanelPlacement(has(["mapObjects"]), "mapPalette", "doc:a")).toEqual({ referencePanel: "mapObjects", direction: "below" });
    expect(mapPanelPlacement(has(["extensions"]), "mapLayers", "doc:a")).toEqual({ referencePanel: "extensions", direction: "below" });
  });
});

describe("LayoutStore.ensureMapPanels", () => {
  it("씬 레이아웃에 맵 패널 셋을 제자리에 더하고, 맵 탭을 활성으로 두고, 나머지는 건드리지 않는다", async () => {
    const { dock, store } = await setup();
    const before = dock.panels.map((p) => [p.id, p.group]);
    const docPanel = dock.getPanel("doc:resources/maps/a.json")!;
    expect(docPanel.api.isActive).toBe(true);
    expect(store.ensureMapPanels()).toEqual(["mapObjects", "mapPalette", "mapLayers"]);
    expect(dock.panels.slice(0, before.length).map((p) => [p.id, p.group])).toEqual(before);
    expect(dock.groupOf("mapObjects")).toBe(dock.groupOf("hierarchy"));
    expect(dock.getPanel("mapPalette")!.position).toEqual({ referencePanel: "project", direction: "below" });
    expect(dock.getPanel("mapLayers")!.position).toEqual({ referencePanel: "inspector", direction: "below" });
    expect(dock.getPanel("mapPalette")!.heights).toEqual([260]);
    expect(dock.getPanel("mapLayers")!.heights).toEqual([220]);
    expect(dock.getPanel("mapObjects")!.heights).toEqual([]);
    expect(docPanel.api.isActive).toBe(true);
    expect(store.isPanelOpen("mapPalette")).toBe(true);
    // 이미 있으면 다시 더하지 않는다
    expect(store.ensureMapPanels()).toEqual([]);
    store.dispose();
  });

  it("사용자가 닫은 패널은 이 세션에서 다시 열지 않는다. 프리셋이 지운 것은 닫은 것이 아니다", async () => {
    const { dock, store } = await setup();
    store.ensureMapPanels();
    dock.removePanel(dock.getPanel("mapPalette")!);
    store.togglePanel("mapLayers");
    expect(store.userClosed).toEqual(new Set(["mapPalette", "mapLayers"]));
    expect(store.ensureMapPanels()).toEqual([]);

    // 프리셋은 맵 패널을 지우지만 사용자의 닫기가 아니다: 맵 오브젝트는 다시 더하고 닫은 둘은 그대로 둔다
    store.applyPreset("scene");
    dock.addPanel({ id: "doc:resources/maps/a.json", position: { referencePanel: "console", direction: "above" } });
    expect(store.ensureMapPanels()).toEqual(["mapObjects"]);

    // 창 메뉴로 다시 켜면 닫은 목록에서 빠진다
    store.togglePanel("mapPalette");
    expect(store.userClosed.has("mapPalette")).toBe(false);
    expect(store.isPanelOpen("mapPalette")).toBe(true);
    store.dispose();
  });

  it("프리셋이 다시 연 패널은 닫은 목록에서 빠진다", async () => {
    const { dock, store } = await setup();
    store.ensureMapPanels();
    dock.removePanel(dock.getPanel("mapPalette")!);
    expect(store.userClosed.has("mapPalette")).toBe(true);
    // 타일맵 프리셋이 팔레트를 다시 열고, 씬 프리셋이 지운다 (사용자의 닫기가 아니다)
    store.applyPreset("tilemap");
    expect(store.userClosed.has("mapPalette")).toBe(false);
    store.applyPreset("scene");
    dock.addPanel({ id: "doc:resources/maps/a.json", position: { referencePanel: "console", direction: "above" } });
    expect(store.ensureMapPanels()).toEqual(["mapObjects", "mapPalette", "mapLayers"]);
    store.dispose();
  });

  it("프리셋과 복원 중(문서 탭을 맞추다 맵 탭이 활성이 될 때)에는 더하지 않고, applying은 바깥이 끝날 때까지 남는다", async () => {
    const seen: Array<{ added: string[]; applying: boolean }> = [];
    const { dock, store } = await setup((s) => {
      const added = s.ensureMapPanels();
      seen.push({ added, applying: s.applying });
      // 맞춘 뒤에 문서 탭 하나가 빠져도 사용자의 닫기가 아니다
      const extra = s.api?.getPanel("hierarchy");
      if (extra) s.api?.removePanel(extra);
    });
    seen.length = 0;
    store.applyPreset("scene");
    expect(seen).toEqual([{ added: [], applying: true }]);
    expect(store.applying).toBe(false);
    expect(store.userClosed.has("hierarchy")).toBe(false);
    expect(dock.getPanel("mapPalette")).toBeUndefined();
    await store.restore();
    expect(seen.at(-1)).toEqual({ added: [], applying: true });
    expect(store.applying).toBe(false);
    // 프리셋이 끝난 뒤 맵 탭이 다시 활성이 되면 더한다
    dock.addPanel({ id: "doc:resources/maps/a.json", position: { referencePanel: "console", direction: "above" } });
    expect(store.ensureMapPanels()).toEqual(["mapObjects", "mapPalette", "mapLayers"]);
    store.dispose();
  });

  it("프리셋 안에서 또 프리셋을 적용해도 바깥이 끝날 때까지 applying이 남는다", async () => {
    let nest = false;
    const after: boolean[] = [];
    const { dock, store } = await setup((s) => {
      if (!nest) return;
      nest = false;
      s.applyPreset("script");
      after.push(s.applying);
      // 안쪽 프리셋이 끝난 뒤의 제거도 사용자의 닫기가 아니다
      const extra = s.api?.getPanel("console");
      if (extra) s.api?.removePanel(extra);
    });
    nest = true;
    store.applyPreset("scene");
    expect(after).toEqual([true]);
    expect(store.applying).toBe(false);
    expect(store.userClosed.has("console")).toBe(false);
    expect(dock.getPanel("console")).toBeUndefined();
    store.dispose();
  });

  it("스크립트 레이아웃(프로젝트와 콘솔)에서는 프로젝트 옆과 아래, 문서 오른쪽", async () => {
    const { dock, store } = await setup();
    store.applyPreset("script");
    dock.addPanel({ id: "doc:resources/maps/a.json", position: { referencePanel: "console", direction: "above" } });
    expect(store.ensureMapPanels()).toEqual(["mapObjects", "mapPalette", "mapLayers"]);
    expect(dock.groupOf("mapObjects")).toBe(dock.groupOf("project"));
    expect(dock.getPanel("mapPalette")!.position).toEqual({ referencePanel: "project", direction: "below" });
    expect(dock.getPanel("mapLayers")!.position).toEqual({ referencePanel: "doc:resources/maps/a.json", direction: "right" });
    store.dispose();
  });

  it("dockview가 붙기 전에는 아무것도 하지 않는다", () => {
    const store = new LayoutStore({
      persistence: { load: async () => null, save: async () => {} } as unknown as LayoutPersistence,
      documents: { attach: () => {}, detach: () => {}, reconcile: () => {} } as unknown as DocumentDock,
      warn: () => {},
    });
    expect(store.ensureMapPanels()).toEqual([] as PanelId[]);
  });
});
