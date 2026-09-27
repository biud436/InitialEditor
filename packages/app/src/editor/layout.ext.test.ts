// 확장 패널은 제 도킹 탭이다 (docs/plans/e5-rpg.md 2.1): 프리셋의 presets, 창 메뉴의 켜고 끄기, 레이아웃이 기억한 패널의
// 복원(확장이 없으면 뺀다), 열린 패널 거울, 자리. dockview 대신 자리만 기억하는 가짜 api 로 돈다.
import { CommandRegistry, ExtensionRegistries, MenuRegistry, visibleMenu, type PanelSpec } from "@initial-editor/core";
import type { DockviewApi } from "dockview";
import { observable, runInAction } from "mobx";
import { describe, expect, it } from "vitest";
import type { DocumentDock } from "./documentDock";
import { extPanelCommandId, registerExtensionPanelCommands } from "./extensionPanels";
import { LayoutStore } from "./layout";
import type { LayoutJson, LayoutPersistence } from "./layoutPersistence";
import { EXT_PANEL_COMPONENT, extPanelPlacement, type ToolPanelId } from "./layoutPresets";

interface FakePanel {
  id: string;
  group: number;
  component?: string;
  title?: string;
  params?: unknown;
  position?: { referencePanel?: string; direction?: string };
  api: { isActive: boolean; setActive(): void; setSize(): void };
}

type Listener<T> = (e: T) => void;

class FakeDock {
  panels: FakePanel[] = [];
  activePanel: FakePanel | undefined;
  private nextGroup = 1;
  private listeners = { add: [] as Array<Listener<FakePanel>>, remove: [] as Array<Listener<FakePanel>>, layout: [] as Array<Listener<void>> };

  getPanel = (id: string) => this.panels.find((p) => p.id === id);

  addPanel = (opts: { id: string; component?: string; title?: string; params?: unknown; position?: { referencePanel?: string; direction?: string } }) => {
    const ref = opts.position?.referencePanel ? this.getPanel(opts.position.referencePanel) : undefined;
    const group = ref && opts.position?.direction === "within" ? ref.group : this.nextGroup++;
    const panel: FakePanel = {
      id: opts.id,
      group,
      component: opts.component,
      title: opts.title,
      params: opts.params,
      position: opts.position,
      api: { isActive: false, setActive: () => this.activate(panel), setSize: () => {} },
    };
    this.panels.push(panel);
    this.activate(panel);
    this.listeners.add.forEach((l) => l(panel));
    this.listeners.layout.forEach((l) => l());
    return panel;
  };

  removePanel = (panel: FakePanel) => {
    this.panels = this.panels.filter((p) => p !== panel);
    if (this.activePanel === panel) this.activePanel = undefined;
    this.listeners.remove.forEach((l) => l(panel));
    this.listeners.layout.forEach((l) => l());
  };

  clear = () => {
    for (const p of [...this.panels]) this.removePanel(p);
  };

  /** 되살리기: 저장한 패널 id 를 차례로 더한다 */
  fromJSON = (layout: { panels: Record<string, { component: string; title: string; params?: unknown }> }) => {
    this.clear();
    for (const [id, p] of Object.entries(layout.panels)) this.addPanel({ id, component: p.component, title: p.title, params: p.params });
  };

  activate(panel: FakePanel) {
    if (this.activePanel) this.activePanel.api.isActive = false;
    this.activePanel = panel;
    panel.api.isActive = true;
  }

  onDidRemovePanel = (l: Listener<FakePanel>) => this.sub(this.listeners.remove, l);
  onDidAddPanel = (l: Listener<FakePanel>) => this.sub(this.listeners.add, l);
  onDidLayoutChange = (l: Listener<void>) => this.sub(this.listeners.layout, l);
  toJSON = () => ({});

  private sub<T>(list: Array<Listener<T>>, l: Listener<T>) {
    list.push(l);
    return { dispose: () => list.splice(list.indexOf(l), 1) };
  }
}

const EVENTS: PanelSpec = { id: "rpg.events", title: "이벤트", Component: null, defaultDock: "left", presets: ["tilemap"] };
const NOTES: PanelSpec = { id: "notes", title: "메모", Component: null };

async function setup(panels: PanelSpec[], persisted: LayoutJson | null = null) {
  const registries = new ExtensionRegistries();
  runInAction(() => panels.forEach((p) => registries.panels.set(p.id, p)));
  const dock = new FakeDock();
  const warnings: string[] = [];
  const persistence = { load: async () => persisted, save: async () => {} } as unknown as LayoutPersistence;
  const documents = { attach: () => {}, detach: () => {}, reconcile: () => {} } as unknown as DocumentDock;
  const store = new LayoutStore({ persistence, documents, warn: (m) => warnings.push(m), extensionPanels: () => [...registries.panels.values()] });
  store.attach(dock as unknown as DockviewApi);
  await new Promise((r) => setTimeout(r, 0));
  return { registries, dock, store, warnings };
}

describe("확장 패널의 탭", () => {
  it("presets 에 든 프리셋을 지으면 제 탭으로 들어가고, 다른 프리셋에는 없다", async () => {
    const { dock, store } = await setup([EVENTS, NOTES]);
    expect(dock.getPanel("ext:rpg.events")).toBeUndefined();
    store.applyPreset("tilemap");
    const tab = dock.getPanel("ext:rpg.events")!;
    expect([tab.component, tab.title, tab.params]).toEqual([EXT_PANEL_COMPONENT, "이벤트", { panelId: "rpg.events" }]);
    // 왼쪽 패널이라 맵 오브젝트 옆 탭이다
    expect(tab.group).toBe(dock.getPanel("mapObjects")!.group);
    expect(dock.getPanel("ext:notes")).toBeUndefined();
    expect(store.isPanelOpen("ext:rpg.events")).toBe(true);
    store.applyPreset("scene");
    expect(dock.getPanel("ext:rpg.events")).toBeUndefined();
    expect(store.isPanelOpen("ext:rpg.events")).toBe(false);
    // 프리셋이 지운 것은 사용자가 닫은 것이 아니다
    expect(store.userClosed.has("ext:rpg.events")).toBe(false);
    store.dispose();
  });

  it("창 메뉴로 켜고 끄며, 사용자가 닫은 것을 기억한다. showPanel 은 열린 탭을 앞으로 가져온다", async () => {
    const { dock, store } = await setup([NOTES]);
    store.togglePanel("ext:notes");
    const tab = dock.getPanel("ext:notes")!;
    expect(tab.position).toEqual({ referencePanel: "extensions", direction: "within" });
    expect(store.isPanelOpen("ext:notes")).toBe(true);
    dock.getPanel("console")!.api.setActive();
    store.showPanel("ext:notes");
    expect(dock.activePanel?.id).toBe("ext:notes");
    store.togglePanel("ext:notes");
    expect(dock.getPanel("ext:notes")).toBeUndefined();
    expect(store.userClosed.has("ext:notes")).toBe(true);
    store.showPanel("ext:notes");
    expect(dock.getPanel("ext:notes")).toBeDefined();
    expect(store.userClosed.has("ext:notes")).toBe(false);
    store.dispose();
  });

  it("visible이 거짓인 패널은 프리셋이 넣지 않고 창 메뉴의 커맨드로도 열리지 않는다 (참이 되면 된다)", async () => {
    const shown = observable.box(false);
    const { dock, store, warnings } = await setup([{ ...EVENTS, visible: () => shown.get() }]);
    store.applyPreset("tilemap");
    expect(dock.getPanel("mapObjects")).toBeDefined();
    expect(dock.getPanel("ext:rpg.events")).toBeUndefined();
    store.togglePanel("ext:rpg.events");
    store.showPanel("ext:rpg.events");
    expect(dock.getPanel("ext:rpg.events")).toBeUndefined();
    expect(warnings).toEqual(["이 프로젝트에 해당하지 않는 확장 패널이다: 이벤트", "이 프로젝트에 해당하지 않는 확장 패널이다: 이벤트"]);
    runInAction(() => shown.set(true));
    store.applyPreset("tilemap");
    expect(dock.getPanel("ext:rpg.events")).toBeDefined();
    // 열린 패널은 visible이 거짓이 되어도 닫을 수 있다
    runInAction(() => shown.set(false));
    store.togglePanel("ext:rpg.events");
    expect(dock.getPanel("ext:rpg.events")).toBeUndefined();
    store.dispose();
  });

  it("등록되지 않은 확장 패널은 켜지 않고 알린다", async () => {
    const { dock, store, warnings } = await setup([]);
    store.togglePanel("ext:gone" as ToolPanelId);
    expect(dock.getPanel("ext:gone")).toBeUndefined();
    expect(warnings).toEqual(["등록되지 않은 확장 패널이다: ext:gone"]);
    store.dispose();
  });

  it("되살린 레이아웃의 확장 패널은 확장이 있으면 남고 없으면 빠진다 (사용자의 닫기가 아니다)", async () => {
    const persisted = {
      grid: { root: {}, width: 1, height: 1, orientation: "HORIZONTAL" },
      panels: {
        console: { component: "console", title: "콘솔" },
        "ext:notes": { component: EXT_PANEL_COMPONENT, title: "메모", params: { panelId: "notes" } },
        "ext:gone": { component: EXT_PANEL_COMPONENT, title: "사라진", params: { panelId: "gone" } },
      },
    } as unknown as LayoutJson;
    const { dock, store } = await setup([NOTES], persisted);
    expect(dock.panels.map((p) => p.id)).toEqual(["console", "ext:notes"]);
    expect(store.isPanelOpen("ext:notes")).toBe(true);
    expect(store.isPanelOpen("ext:gone" as ToolPanelId)).toBe(false);
    expect(store.userClosed.has("ext:gone")).toBe(false);
    store.dispose();
  });

  const RESTORED = {
    grid: { root: {}, width: 1, height: 1, orientation: "HORIZONTAL" },
    panels: {
      console: { component: "console", title: "콘솔" },
      "ext:rpg.events": { component: EXT_PANEL_COMPONENT, title: "이벤트", params: { panelId: "rpg.events" } },
      "ext:notes": { component: EXT_PANEL_COMPONENT, title: "메모", params: { panelId: "notes" } },
    },
  } as unknown as LayoutJson;

  it("되살린 레이아웃의 확장 패널은 visible이 거짓이면 빠진다 (사용자의 닫기가 아니다). 참인 것과 visible이 없는 것은 남는다", async () => {
    const { dock, store } = await setup([{ ...EVENTS, visible: () => false }, { ...NOTES, visible: () => true }], RESTORED);
    expect(dock.panels.map((p) => p.id)).toEqual(["console", "ext:notes"]);
    expect(store.isPanelOpen("ext:rpg.events")).toBe(false);
    expect(store.userClosed.has("ext:rpg.events")).toBe(false);
    store.dispose();
    const plain = await setup([EVENTS, NOTES], RESTORED);
    expect(plain.dock.panels.map((p) => p.id)).toEqual(["console", "ext:rpg.events", "ext:notes"]);
    plain.store.dispose();
  });

  it("visible이 아직 모름(undefined)이면 답이 날 때까지 두고, 거짓이 되면 빼고 참이 되면 둔다. 답이 난 뒤의 바뀜은 따르지 않는다", async () => {
    const events = observable.box<boolean | undefined>(undefined);
    const notes = observable.box<boolean | undefined>(undefined);
    const { dock, store } = await setup([{ ...EVENTS, visible: () => events.get() }, { ...NOTES, visible: () => notes.get() }], RESTORED);
    expect(dock.panels.map((p) => p.id)).toEqual(["console", "ext:rpg.events", "ext:notes"]);
    expect(store.isPanelOpen("ext:rpg.events")).toBe(true);
    runInAction(() => notes.set(true));
    runInAction(() => events.set(false));
    expect(dock.panels.map((p) => p.id)).toEqual(["console", "ext:notes"]);
    expect(store.isPanelOpen("ext:rpg.events")).toBe(false);
    expect(store.userClosed.has("ext:rpg.events")).toBe(false);
    // 답이 난 뒤: 메모가 거짓이 되어도 빼지 않는다 (열린 패널은 사용자가 닫는다)
    runInAction(() => notes.set(false));
    expect(dock.panels.map((p) => p.id)).toEqual(["console", "ext:notes"]);
    store.dispose();
  });

  it("기다리는 동안 사용자가 닫은 패널은 사용자의 닫기이고, 답이 거짓이어도 다른 패널을 건드리지 않는다. 다시 되살리면 새로 기다린다", async () => {
    const events = observable.box<boolean | undefined>(undefined);
    const { dock, store } = await setup([{ ...EVENTS, visible: () => events.get() }, NOTES], RESTORED);
    store.togglePanel("ext:rpg.events");
    expect(store.userClosed.has("ext:rpg.events")).toBe(true);
    runInAction(() => events.set(false));
    expect(dock.panels.map((p) => p.id)).toEqual(["console", "ext:notes"]);
    expect(store.userClosed.has("ext:rpg.events")).toBe(true);
    // 다른 프로젝트: 되살린 레이아웃에 다시 있고 아직 모른다. 참이 되면 남는다
    runInAction(() => events.set(undefined));
    await store.restore();
    expect(dock.panels.map((p) => p.id)).toEqual(["console", "ext:rpg.events", "ext:notes"]);
    runInAction(() => events.set(true));
    expect(dock.getPanel("ext:rpg.events")).toBeDefined();
    store.dispose();
  });

  it("자리: 왼쪽은 맵 오브젝트, 계층, 프로젝트 옆 탭, 아래는 콘솔 옆, 가운데는 문서 옆, 오른쪽은 확장 패널이나 인스펙터 옆", () => {
    const has = (ids: string[]) => (id: string) => ids.includes(id);
    expect(extPanelPlacement(has(["hierarchy", "mapObjects"]), "left", "doc:a")).toEqual({ referencePanel: "mapObjects", direction: "within" });
    expect(extPanelPlacement(has(["project"]), "left", "doc:a")).toEqual({ referencePanel: "project", direction: "within" });
    expect(extPanelPlacement(has([]), "left", "doc:a")).toEqual({ referencePanel: "doc:a", direction: "left" });
    expect(extPanelPlacement(has(["console"]), "bottom", "doc:a")).toEqual({ referencePanel: "console", direction: "within" });
    expect(extPanelPlacement(has([]), "center", "doc:a")).toEqual({ referencePanel: "doc:a", direction: "within" });
    expect(extPanelPlacement(has([]), "center", undefined)).toEqual({ direction: "right" });
    expect(extPanelPlacement(has(["inspector"]), undefined, "doc:a")).toEqual({ referencePanel: "inspector", direction: "within" });
    expect(extPanelPlacement(has([]), "right", undefined)).toEqual({ direction: "right" });
  });
});

describe("확장 패널의 창 메뉴", () => {
  it("등록된 패널마다 커맨드와 창 메뉴가 생기고 체크는 열림을 따른다. 등록을 거두면 빠진다", async () => {
    const { registries, dock, store } = await setup([NOTES]);
    const commands = new CommandRegistry({ platform: "mac" });
    const menus = new MenuRegistry();
    const checked = new Map<string, () => boolean>();
    const off = registerExtensionPanelCommands({ registries, commands, menus, layout: store, setChecked: (id, fn) => checked.set(id, fn) });
    const id = extPanelCommandId("notes");
    expect(id).toBe("window.panel.ext:notes");
    expect(commands.get(id)?.label).toBe("메모");
    expect(menus.items.find((m) => m.commandId === id)?.path).toBe("창/메모");
    expect(checked.get(id)!()).toBe(false);
    await commands.execute(id);
    expect(dock.getPanel("ext:notes")).toBeDefined();
    expect(checked.get(id)!()).toBe(true);
    runInAction(() => registries.panels.set("rpg.events", EVENTS));
    expect(commands.get(extPanelCommandId("rpg.events"))?.label).toBe("이벤트");
    runInAction(() => registries.panels.delete("notes"));
    expect(commands.get(id)).toBeUndefined();
    expect(menus.items.some((m) => m.commandId === id)).toBe(false);
    off();
    expect(commands.get(extPanelCommandId("rpg.events"))).toBeUndefined();
    store.dispose();
  });

  it("패널의 visible 이 거짓이면(이 프로젝트에 해당하지 않는 패널) 창 메뉴에서 빠진다", async () => {
    const shown = observable.box(false);
    const { registries, store } = await setup([{ ...EVENTS, visible: () => shown.get() }]);
    const commands = new CommandRegistry({ platform: "mac" });
    const menus = new MenuRegistry();
    const off = registerExtensionPanelCommands({ registries, commands, menus, layout: store, setChecked: () => {} });
    const id = extPanelCommandId("rpg.events");
    const windowMenu = () => visibleMenu(menus.tree(), (cid) => commands.isVisible(cid)).find((n) => n.label === "창")?.children.map((n) => n.label) ?? [];
    expect(commands.isVisible(id)).toBe(false);
    expect(windowMenu()).toEqual([]);
    runInAction(() => shown.set(true));
    expect(windowMenu()).toEqual(["이벤트"]);
    off();
    store.dispose();
  });
});
