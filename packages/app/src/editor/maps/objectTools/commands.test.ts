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
  const notes = new Map<string, () => string | undefined>();
  const toasts: string[] = [];
  const runner = { unavailableReason: null as string | null, startHint: undefined as string | undefined, start: async (_opts: unknown) => {} };
  const editor = {
    commands: new CommandRegistry({ platform: "linux" }),
    menus: new MenuRegistry(),
    documents,
    runner,
    log: new LogStore(),
    toasts: { info() {}, success() {}, warn: (t: string) => void toasts.push(`warn: ${t}`), error() {} },
    modals: { confirm: async () => true },
    saveDocument: async () => {},
    setHint: (id: string, fn: () => string | undefined) => void hints.set(id, fn),
    setNote: (id: string, fn: () => string | undefined) => void notes.set(id, fn),
  } as unknown as Editor;
  registerMapObjectCommands(editor);
  return { editor, doc, documents, runner, toasts, hint: () => hints.get(PLAY_HERE_ID)?.(), note: () => notes.get(PLAY_HERE_ID)?.() };
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

  it("play.maps가 받지 않는 맵에서는 켜 두고, 그 이유가 안내와 툴팁에 있으며 실행하면 띄우지 않고 알린다", async () => {
    const { editor, doc, documents, runner, toasts, hint, note } = await setup();
    const started: unknown[] = [];
    runner.start = async (o: unknown) => void started.push(o);
    doc.setSchema({ ...SCHEMA, play: { ...SCHEMA.play!, maps: ["aldebaran_*"] } });
    documents.open(doc);
    const reason = "맵 forest은(는) 여기서 실행 대상이 아니다. 스키마의 play.maps: aldebaran_*";
    expect(editor.commands.isEnabled(PLAY_HERE_ID)).toBe(true);
    expect(hint()).toBe(reason);
    expect(note()).toBe(reason);
    await editor.commands.execute(PLAY_HERE_ID);
    expect(started).toEqual([]);
    expect(toasts).toEqual([`warn: ${reason}`]);
    expect(editor.log.entries.map((e) => e.text)).toContain(`여기서 실행하지 않았다: ${reason}`);
    // 맞는 맵이면 툴팁이 없고 위치 규칙이 안내다
    doc.setSchema({ ...SCHEMA, play: { ...SCHEMA.play!, maps: ["for*"] } });
    expect(note()).toBeUndefined();
    expect(hint()).toBe(PLAY_POSITION_RULE);
    await editor.commands.execute(PLAY_HERE_ID);
    expect(started).toHaveLength(1);
    // 러너가 못 띄우면 꺼지고 그 이유가 먼저다
    doc.setSchema({ ...SCHEMA, play: { ...SCHEMA.play!, maps: ["aldebaran_*"] } });
    runner.unavailableReason = "브라우저 모드에서는 엔진을 띄울 수 없다";
    expect(editor.commands.isEnabled(PLAY_HERE_ID)).toBe(false);
    expect(hint()).toBe("브라우저 모드에서는 엔진을 띄울 수 없다");
  });
});
