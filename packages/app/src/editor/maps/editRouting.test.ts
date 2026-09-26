// 편집 커맨드(edit.*)가 활성 문서의 종류로 갈리는지: 씬이면 씬 오브젝트, 맵이면 맵 오브젝트. 클립보드는 종류마다 하나다.
import { CommandRegistry, CORE_DEFAULT_PROPS, CORE_TYPE_LABELS, DocumentRegistry, Emitter, ExtensionRegistries, LogStore, MenuRegistry, Project, SceneDocument, type Document } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument, parseObjectSchema } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import type { Editor } from "../Editor";
import { registerSceneCommands } from "../scene/sceneCommands";
import { SceneTools, type SceneToolsHost } from "../scene/SceneTools";
import { MapClipboard, NEED_MAP_SELECTION } from "./mapClipboard";

const SCENE_PATH = "resources/scenes/main.json";
const MAP_PATH = "resources/maps/sample.json";

async function setup() {
  const be = new MemoryBackend({
    "game.json": '{ "script": "lua" }',
    [SCENE_PATH]: JSON.stringify({ version: 1, name: "main", objects: [{ id: "player", type: "node", x: 10, y: 20 }] }),
    [MAP_PATH]: JSON.stringify({
      version: 2,
      name: "sample",
      width: 20,
      height: 12,
      tileWidth: 16,
      tileHeight: 16,
      layers: [{ name: "ground", data: new Array(240).fill(1) }],
      tilesets: [],
      objects: [{ id: "slime_1", type: "spawn", x: 120, y: 160, props: { species: "slime" } }],
    }),
  });
  const project = new Project(be);
  await project.open("/mem");
  const documents = new DocumentRegistry();
  const registries = new ExtensionRegistries();
  for (const type of ["node", "sprite", "text"] as const) registries.objectTypes.set(type, { type, label: CORE_TYPE_LABELS[type], defaults: CORE_DEFAULT_PROPS[type] });
  const toasts: string[] = [];
  const push = (t: string) => void toasts.push(t);
  const log = new LogStore();
  const host: SceneToolsHost = {
    documents,
    registries,
    backend: be,
    project,
    log,
    toasts: { info: push, success: push, warn: push, error: push },
    modals: { prompt: async () => null },
    tree: { reveal: async () => {} },
    events: new Emitter<{ projectOpened: never; projectClosed: never }>(),
    openPath: async () => {},
  };
  const tools = new SceneTools(host);
  const commands = new CommandRegistry({ platform: "win" });
  const hints = new Map<string, () => string | undefined>();
  const clipboard = new MapClipboard();
  const editor = {
    ...host,
    commands,
    menus: new MenuRegistry(),
    setHint: (id: string, fn: () => string | undefined) => hints.set(id, fn),
    setChecked: () => {},
    mapSupport: { clipboard },
  } as unknown as Editor;
  const dispose = registerSceneCommands(editor, tools);
  const scene = await SceneDocument.open(be, SCENE_PATH, () => new Set(registries.objectTypes.keys()));
  const map = await MapDocument.open(be, MAP_PATH, parseObjectSchema(JSON.stringify({ version: 1, types: [{ type: "spawn", label: "몬스터" }] })));
  documents.open(scene as Document);
  documents.open(map);
  const hint = (id: string) => hints.get(id)?.();
  return { commands, documents, tools, clipboard, scene, map, hint, toasts, dispose };
}

const key = (k: string, ctrl = true) => ({ key: k, ctrlKey: ctrl, metaKey: false, shiftKey: false, altKey: false });

describe("편집 커맨드의 갈래", () => {
  it("맵 탭이면 맵 오브젝트를 복사하고 붙이며, 씬의 클립보드는 그대로 둔다", async () => {
    const { commands, documents, tools, clipboard, scene, map, hint } = await setup();
    // 씬에서 복사해 둔다
    documents.activate(scene as Document);
    scene.select(["player"]);
    expect(await commands.execute("edit.copy")).toBe(true);
    expect(tools.clipboard.map((o) => o.id)).toEqual(["player"]);

    // 맵 탭: 선택이 없으면 꺼지고 안내는 맵의 것
    documents.activate(map);
    expect(commands.isEnabled("edit.copy")).toBe(false);
    expect(commands.isEnabled("edit.paste")).toBe(false);
    expect(hint("edit.copy")).toBe(NEED_MAP_SELECTION);
    map.select(["slime_1"]);
    expect(commands.findByKey(key("c"))).toBe("edit.copy");
    await commands.execute("edit.copy");
    expect(clipboard.objects.map((o) => o.id)).toEqual(["slime_1"]);
    expect(tools.clipboard.map((o) => o.id)).toEqual(["player"]);
    await commands.execute("edit.paste");
    expect(map.model.objectIds()).toEqual(["slime_1", "slime_2"]);
    expect(map.model.findObject("slime_2")).toMatchObject({ x: 136, y: 160 });
    await commands.execute("edit.duplicate");
    expect(map.model.objectIds()).toEqual(["slime_1", "slime_2", "slime_3"]);
    expect(map.model.findObject("slime_3")).toMatchObject({ x: 152, y: 160 });
    expect(commands.findByKey(key("Delete", false))).toBe("edit.delete");
    await commands.execute("edit.delete");
    expect(map.model.objectIds()).toEqual(["slime_1", "slime_2"]);
    map.select(["slime_2"]);
    await commands.execute("edit.cut");
    expect(map.model.objectIds()).toEqual(["slime_1"]);
    expect(map.undo.depth).toBe(4);
    // 씬은 건드리지 않았다
    expect(scene.scene.ids()).toEqual(["player"]);

    // 씬 탭으로 돌아가면 씬의 클립보드로 붙인다
    documents.activate(scene as Document);
    expect(commands.isEnabled("edit.paste")).toBe(true);
    await commands.execute("edit.paste");
    expect(scene.scene.ids()).toEqual(["player", "player_2"]);
    expect(map.model.objectIds()).toEqual(["slime_1"]);
  });

  it("씬 탭의 켜짐과 안내는 전과 같다", async () => {
    const { commands, documents, scene, hint } = await setup();
    documents.activate(scene as Document);
    expect(commands.isEnabled("edit.delete")).toBe(false);
    expect(hint("edit.delete")).toBe("계층이나 씬 뷰에서 오브젝트를 고른다");
    expect(hint("edit.paste")).toBe("복사한 오브젝트가 없다");
    scene.select(["player"]);
    expect(commands.isEnabled("edit.delete")).toBe(true);
    await commands.execute("edit.delete");
    expect(scene.scene.ids()).toEqual([]);
  });
});
