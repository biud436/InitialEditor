// @vitest-environment jsdom
// 씬 뷰 지원의 타일맵 연결: 타일맵 타입에 씬 노드를 붙이고, 프로젝트 파일이 바뀌면 맵 파일 캐시에 알린다.
// 맵 파일이 없거나 맵으로 읽히지 않는 타일맵은 씬 검사 결과의 오류이고, 파일이 생기거나 바뀌거나 지워지거나 이름이 바뀌면 다시 검사한다.
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
const TILES = "resources/tiles/t.png";
const MAP = JSON.stringify({
  version: 2, width: 1, height: 1, tileWidth: 16, tileHeight: 16,
  tilesets: [{ image: TILES, firstGid: 1, columns: 1 }], layers: [{ name: "g", data: [0] }],
});

async function setup(scene = SCENE) {
  const backend = new MemoryBackend({ [MAP_PATH]: MAP, [SCENE_PATH]: scene, [TILES]: "png" });
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
  return { backend, project, registries, events, support, host, editor };
}

const tilemapScene = (maps: string[]) =>
  JSON.stringify({ version: 1, name: "s", objects: maps.map((map, i) => ({ id: `tm${i}`, type: "tilemap", props: { map, groundLayers: 1 } })) });
const locations = (doc: SceneDocument) => doc.problems.map((p) => p.location);

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

  it("맵 파일이 없는 타일맵은 오류이고, 파일이 생기거나 지워지거나 이름이 바뀌면 다시 검사한다", async () => {
    const GONE = "resources/maps/gone.json";
    const { backend, support, host } = await setup(tilemapScene([MAP_PATH, GONE]));
    await host.activateAll([tilemapExtension]);
    const doc = (await support.openScene(SCENE_PATH))!;
    // 있는지 확인이 끝나면 없는 파일만 오른다 (엔진이 씬을 거부한다)
    await vi.waitFor(() => expect(locations(doc)).toEqual(["objects[1].props.map"]));
    expect(doc.problems[0]).toMatchObject({ severity: "error", message: `타일맵 tm1의 맵 파일이 없다: ${GONE}. 엔진이 씬을 거부한다` });
    // 편집으로 다시 검사해도 기억한 답으로 곧바로 오른다
    expect(doc.revalidate().map((p) => p.location)).toEqual(["objects[1].props.map"]);

    // 파일이 생기면 사라진다
    await backend.writeText(GONE, MAP);
    await vi.waitFor(() => expect(locations(doc)).toEqual([]));
    // 지우면 다시 오른다
    await backend.remove(MAP_PATH);
    await vi.waitFor(() => expect(locations(doc)).toEqual(["objects[0].props.map"]));
    // 이름을 바꾸면 옛 이름을 쓰는 타일맵이 오른다
    await backend.rename(GONE, "resources/maps/renamed.json");
    await vi.waitFor(() => expect(locations(doc)).toEqual(["objects[0].props.map", "objects[1].props.map"]));
    // 폴더 이름을 바꿔도 그 아래 맵을 다시 확인한다
    await backend.writeText(MAP_PATH, MAP);
    await backend.writeText(GONE, MAP);
    await vi.waitFor(() => expect(locations(doc)).toEqual([]));
    await backend.rename("resources/maps", "resources/levels");
    await vi.waitFor(() => expect(locations(doc)).toEqual(["objects[0].props.map", "objects[1].props.map"]));
    support.dispose();
  });

  it("맵 파일이 JSON이 아니거나 맵 형식이 아니면 오류이고, 파일을 고치면 다시 검사해 사라진다", async () => {
    const { backend, support, host } = await setup(tilemapScene([MAP_PATH]));
    await host.activateAll([tilemapExtension]);
    const doc = (await support.openScene(SCENE_PATH))!;
    await vi.waitFor(() => expect(support.mapFiles.status(MAP_PATH)).toEqual({ kind: "ok" }));
    expect(locations(doc)).toEqual([]);

    // JSON이 아니다
    await backend.writeText(MAP_PATH, "{ not json");
    await vi.waitFor(() => expect(locations(doc)).toEqual(["objects[0].props.map"]));
    expect(doc.problems[0].severity).toBe("error");
    expect(doc.problems[0].message).toMatch(new RegExp(`^타일맵 tm0의 맵 파일을 맵으로 읽지 못한다: ${MAP_PATH} \\(JSON 이 아니다: .+\\)\\. 엔진이 씬을 거부한다$`));
    // JSON이지만 맵이 아니다
    await backend.writeText(MAP_PATH, "{}");
    await vi.waitFor(() => expect(doc.problems[0]?.message).toContain("모르는 맵 버전이다"));
    expect(locations(doc)).toEqual(["objects[0].props.map"]);
    // 고치면 사라진다
    await backend.writeText(MAP_PATH, MAP);
    await vi.waitFor(() => expect(locations(doc)).toEqual([]));
    support.dispose();
  });

  it("타일맵 확장이 없으면 맵 파일 검사를 하지 않는다", async () => {
    const { support, registries, host } = await setup(tilemapScene(["resources/maps/gone.json"]));
    expect(support.validators()).toEqual([]);
    await host.activateAll([tilemapExtension]);
    expect(support.validators()).toHaveLength(registries.validators.length + 1);
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
