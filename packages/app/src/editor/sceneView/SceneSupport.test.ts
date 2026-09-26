// @vitest-environment jsdom
// 씬 뷰 지원의 타일맵 연결: 타일맵 타입에 씬 노드를 붙이고, 프로젝트 파일이 바뀌면 맵 파일 캐시에 알린다.
import { CommandRegistry, DocumentRegistry, Emitter, ExtensionHost, ExtensionRegistries, LogStore, MemoryBackend, MenuRegistry, Project, SceneDocument } from "@initial-editor/core";
import { tilemapExtension } from "@initial-editor/ext-tilemap";
import { describe, expect, it, vi } from "vitest";
import type { Editor } from "../Editor";
import { SceneSupport } from "./SceneSupport";

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

const MAP_PATH = "resources/maps/a.json";
const SCENE_PATH = "resources/scenes/s.json";
const SCENE = JSON.stringify({ version: 1, name: "s", objects: [{ id: "tm", type: "tilemap", props: { map: "", groundLayers: 1 } }] });
const MAP = JSON.stringify({ version: 2, width: 1, height: 1, tileWidth: 16, tileHeight: 16, tilesets: [], layers: [{ name: "g", data: [0] }] });

async function setup() {
  const backend = new MemoryBackend({ [MAP_PATH]: MAP, [SCENE_PATH]: SCENE });
  const project = new Project(backend);
  await project.open("/p");
  const registries = new ExtensionRegistries();
  const commands = new CommandRegistry({ platform: "mac" });
  const menus = new MenuRegistry();
  const events = new Emitter<{ projectOpened: unknown; projectClosed: void }>();
  const editor = {
    backend,
    project,
    registries,
    commands,
    menus,
    events,
    documents: new DocumentRegistry(),
    log: new LogStore(),
    openPath: async () => {},
    setChecked: () => {},
    setHint: () => {},
  } as unknown as Editor;
  const support = new SceneSupport(editor);
  support.install();
  const host = new ExtensionHost({ commands, menus, registries });
  return { backend, project, registries, events, support, host };
}

describe("씬 뷰 지원의 타일맵", () => {
  it("타일맵 확장이 등록한 타입에 씬 노드를 붙이고, 지원을 버리면 뗀다", async () => {
    const { registries, support, host } = await setup();
    await host.activateAll([tilemapExtension]);
    const spec = registries.objectTypes.get("tilemap")!;
    expect(typeof spec.createSceneNode).toBe("function");
    support.dispose();
    expect(spec.createSceneNode).toBeUndefined();
  });

  it("씬을 열면 확장의 검사기도 돈다 (맵 파일이 없는 타일맵은 오류)", async () => {
    const { support, host } = await setup();
    await host.activateAll([tilemapExtension]);
    const doc = await support.openScene(SCENE_PATH);
    expect(doc).toBeInstanceOf(SceneDocument);
    expect(doc!.problems.map((p) => [p.severity, p.location])).toEqual([["error", "objects[0].props.map"]]);
    doc!.apply(doc!.scene.setProp("tm", "map", MAP_PATH));
    expect(doc!.revalidate()).toEqual([]);
    support.dispose();
  });

  it("프로젝트 파일이 바뀌면 읽어 둔 맵을 버리고 알린다. 프로젝트를 닫으면 비운다", async () => {
    const { backend, support, events } = await setup();
    const changed: string[] = [];
    support.maps.events.on("changed", (p) => changed.push(p));
    await support.maps.load(MAP_PATH);
    expect(support.maps.has(MAP_PATH)).toBe(true);
    await backend.writeText(MAP_PATH, MAP);
    await vi.waitFor(() => expect(changed).toContain(MAP_PATH));
    expect(support.maps.has(MAP_PATH)).toBe(false);
    await backend.writeText("resources/tiles/t.png", "x");
    await vi.waitFor(() => expect(changed).toContain("resources/tiles/t.png"));

    await support.maps.load(MAP_PATH);
    events.emit("projectClosed", undefined);
    expect(support.maps.has(MAP_PATH)).toBe(false);
    support.dispose();
  });
});
