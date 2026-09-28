// 맵 탭이 활성이 되면 레이아웃에 맵 패널을 더해 달라고 한다 (LayoutStore.ensureMapPanels). 편집 메뉴가 쓰는 클립보드도 여기 있다.
import { CommandRegistry, DocumentRegistry, Emitter, LogStore, MenuRegistry, Project, SceneDocument, type Document } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import type { Editor } from "../Editor";
import { MapClipboard } from "./mapClipboard";
import type { MapRenderer, MapRendererEvents } from "./MapRenderer";
import { MapSupport } from "./MapSupport";

const MAP = JSON.stringify({ version: 2, name: "a", width: 2, height: 2, tileWidth: 16, tileHeight: 16, layers: [{ name: "g", data: [0, 0, 0, 0] }], tilesets: [] });

async function setup(ensure: () => unknown) {
  const be = new MemoryBackend({ "game.json": "{}", "resources/maps/a.json": MAP, "resources/maps/b.json": MAP, "resources/scenes/s.json": '{ "version": 1, "name": "s", "objects": [] }' });
  const project = new Project(be);
  await project.open("/mem");
  const documents = new DocumentRegistry();
  const log = new LogStore();
  const editor = {
    backend: be,
    project,
    documents,
    commands: new CommandRegistry({ platform: "win" }),
    menus: new MenuRegistry(),
    log,
    toasts: { info() {}, success() {}, warn() {}, error() {} },
    events: new Emitter(),
    setHint: () => {},
    setChecked: () => {},
    openPath: async () => {},
    layout: { ensureMapPanels: ensure },
  } as unknown as Editor;
  const support = new MapSupport(editor);
  support.install();
  const a = await MapDocument.open(be, "resources/maps/a.json");
  const b = await MapDocument.open(be, "resources/maps/b.json");
  const scene = await SceneDocument.open(be, "resources/scenes/s.json", () => new Set(["node"]));
  return { support, documents, log, a, b, scene: scene as Document, commands: editor.commands };
}

describe("MapSupport와 맵 패널", () => {
  it("맵 탭이 활성이 될 때마다 한 번 부르고, 다른 탭은 부르지 않는다", async () => {
    let calls = 0;
    const { support, documents, a, b, scene } = await setup(() => calls++);
    documents.open(scene);
    expect(calls).toBe(0);
    documents.open(a);
    expect(calls).toBe(1);
    documents.open(b);
    expect(calls).toBe(2);
    documents.activate(scene);
    expect(calls).toBe(2);
    documents.activate(a);
    expect(calls).toBe(3);
    expect(support.clipboard).toBeInstanceOf(MapClipboard);
    support.dispose();
  });

  it("레이아웃이 실패해도 맵은 열리고 경고만 남긴다", async () => {
    const { support, documents, a, log } = await setup(() => {
      throw new Error("dockview가 없다");
    });
    documents.open(a);
    expect(documents.active).toBe(a);
    expect(log.entries.map((e) => `${e.level}: ${e.text}`)).toContain("warn: 맵 패널 추가 실패: dockview가 없다");
    support.dispose();
  });

  it("붙은 렌더러의 도구 경고는 콘솔에 맵 이름과 함께 남기고, 떼면 더 남기지 않는다", async () => {
    const { support, a, log } = await setup(() => {});
    const events = new Emitter<MapRendererEvents>();
    const renderer = { events } as unknown as MapRenderer;
    support.attachRenderer(a, renderer);
    events.emit("warn", "채우기가 한도에 닿았다");
    expect(log.entries.map((e) => `${e.level}/${e.source}: ${e.text}`)).toContain("warn/maps: a.json: 채우기가 한도에 닿았다");
    // 같은 렌더러를 다시 붙여도 한 줄만 남긴다
    support.attachRenderer(a, renderer);
    events.emit("warn", "둘째");
    expect(log.entries.filter((e) => e.text.endsWith("둘째"))).toHaveLength(1);
    support.detachRenderer(a, renderer);
    expect(events.listenerCount("warn")).toBe(0);
    events.emit("warn", "셋째");
    expect(log.entries.some((e) => e.text.endsWith("셋째"))).toBe(false);
    support.attachRenderer(a, renderer);
    support.dispose();
    expect(events.listenerCount("warn")).toBe(0);
  });
});

describe("맵 뷰 길 (pickCell, revealCell)", () => {
  it("pickCell 은 맵을 탭으로 열고 그 뷰에서 고른다. 고르면 returnTo 로 돌아가고, 열지 못하면 null", async () => {
    const { support, documents, a } = await setup(() => {});
    documents.open(a);
    const result = support.pickCell({ path: "resources/maps/b.json", prompt: "타일을 클릭", returnTo: a });
    await expect.poll(() => support.picker.active?.doc.path).toBe("resources/maps/b.json");
    const b = support.picker.active!.doc;
    expect(documents.active).toBe(b);
    expect(support.picker.active?.prompt).toBe("타일을 클릭");
    support.picker.choose(b, { x: 1, y: 0 });
    expect(await result).toEqual({ x: 1, y: 0 });
    expect(documents.active).toBe(a);
    expect(await support.pickCell({ path: "resources/maps/none.json", prompt: "p", returnTo: a })).toBeNull();
    expect(support.picker.active).toBeNull();
    support.dispose();
  });

  it("타일을 고르는 동안 도구 단축키(map.tool.*)가 꺼지고, 고르기가 끝나면 다시 켜진다", async () => {
    const { support, documents, a, commands } = await setup(() => {});
    documents.open(a);
    const key = (k: string) => commands.findByKey({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false });
    expect([support.toolKeysOff, commands.isEnabled("map.tool.pen"), key("b"), key("c")]).toEqual([false, true, "map.tool.pen", "map.tool.collision"]);
    const result = support.pickCell({ path: "resources/maps/a.json", prompt: "타일을 클릭", returnTo: a });
    await expect.poll(() => support.picker.active !== null).toBe(true);
    expect([support.toolKeysOff, commands.isEnabled("map.tool.pen"), key("b"), key("c")]).toEqual([true, false, null, null]);
    expect(a.tool).toBe("pen");
    support.picker.cancel();
    expect(await result).toBeNull();
    expect([support.toolKeysOff, commands.isEnabled("map.tool.pen"), key("b")]).toEqual([false, true, "map.tool.pen"]);
    support.dispose();
  });

  it("revealCell 은 맵을 열고 타일 가운데를 렌더러에 넘긴다. 렌더러가 아직 없으면 붙을 때 넘긴다", async () => {
    const { support, documents, a } = await setup(() => {});
    documents.open(a);
    const reveals: unknown[] = [];
    const renderer = { events: new Emitter<MapRendererEvents>(), reveal: (p: unknown) => void reveals.push(p) } as unknown as MapRenderer;
    support.attachRenderer(a, renderer);
    expect(await support.revealCell("resources/maps/a.json", { x: 1, y: 1 })).toBe(true);
    expect(reveals).toEqual([{ x: 24, y: 24 }]);
    expect(await support.revealCell("resources/maps/b.json", { x: 0, y: 1 })).toBe(true);
    const b = documents.active as MapDocument;
    expect(b.path).toBe("resources/maps/b.json");
    expect(reveals).toHaveLength(1);
    const later = { events: new Emitter<MapRendererEvents>(), reveal: (p: unknown) => void reveals.push(p) } as unknown as MapRenderer;
    support.attachRenderer(b, later);
    expect(reveals).toEqual([{ x: 24, y: 24 }, { x: 8, y: 24 }]);
    // 한 번만 넘긴다
    support.detachRenderer(b, later);
    support.attachRenderer(b, later);
    expect(reveals).toHaveLength(2);
    expect(await support.revealCell("resources/maps/none.json", { x: 0, y: 0 })).toBe(false);
    support.dispose();
  });
});
