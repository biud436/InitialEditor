import { CommandRegistry, DocumentRegistry, LogStore, MenuRegistry } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument, parseObjectSchema } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import type { Editor } from "../../Editor";
import { PLAY_HERE_ID, registerMapObjectCommands } from "./commands";
import { NEED_MAP_TAB } from "./playHere";
import { PLAY_POSITION_RULE } from "./rules";

const MAP_PATH = "resources/maps/forest.json";
const MAP = JSON.stringify({
  version: 2,
  name: "forest",
  width: 4,
  height: 4,
  tileWidth: 16,
  tileHeight: 16,
  layers: [{ name: "ground", data: new Array(16).fill(1) }],
  tilesets: [{ image: "resources/images/a.png", firstGid: 1, columns: 1 }],
  objects: [],
});
const SCHEMA = parseObjectSchema(JSON.stringify({ version: 1, types: [{ type: "start" }], play: { env: { AT: "{x}" } } }));

async function setup() {
  const mem = new MemoryBackend({ [MAP_PATH]: MAP });
  await mem.open("/p");
  const doc = await MapDocument.open(mem, MAP_PATH, SCHEMA);
  const documents = new DocumentRegistry();
  const hints = new Map<string, () => string | undefined>();
  const runner = { unavailableReason: null as string | null, startHint: undefined as string | undefined, start: async () => {} };
  const editor = {
    commands: new CommandRegistry({ platform: "linux" }),
    menus: new MenuRegistry(),
    documents,
    runner,
    log: new LogStore(),
    toasts: { info() {}, success() {}, warn() {}, error() {} },
    modals: { confirm: async () => true },
    saveDocument: async () => {},
    setHint: (id: string, fn: () => string | undefined) => void hints.set(id, fn),
  } as unknown as Editor;
  registerMapObjectCommands(editor);
  return { editor, doc, documents, runner, hint: () => hints.get(PLAY_HERE_ID)?.() };
}

describe("여기서 실행 커맨드의 안내", () => {
  it("켜져 있으면 위치 규칙, 꺼져 있으면 그 이유 (맵 탭이 아니면 규칙도 함께)", async () => {
    const { editor, doc, documents, runner, hint } = await setup();
    expect(hint()).toBe(NEED_MAP_TAB);
    expect(hint()).toContain(PLAY_POSITION_RULE);
    documents.open(doc);
    expect(editor.commands.isEnabled(PLAY_HERE_ID)).toBe(true);
    expect(hint()).toBe(PLAY_POSITION_RULE);
    runner.unavailableReason = "브라우저 모드에서는 엔진을 띄울 수 없다";
    expect(editor.commands.isEnabled(PLAY_HERE_ID)).toBe(false);
    expect(hint()).toBe("브라우저 모드에서는 엔진을 띄울 수 없다");
  });
});
