// 맵 탭이 활성이 되면 레이아웃에 맵 패널을 더해 달라고 한다 (LayoutStore.ensureMapPanels). 편집 메뉴가 쓰는 클립보드도 여기 있다.
import { CommandRegistry, DocumentRegistry, Emitter, LogStore, MenuRegistry, Project, SceneDocument, type Document } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import type { Editor } from "../Editor";
import { MapClipboard } from "./mapClipboard";
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
  return { support, documents, log, a, b, scene: scene as Document };
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
    expect(log.entries.map((e) => `${e.level}: ${e.text}`)).toContain("warn: 맵 패널을 더하지 못했다: dockview가 없다");
    support.dispose();
  });
});
