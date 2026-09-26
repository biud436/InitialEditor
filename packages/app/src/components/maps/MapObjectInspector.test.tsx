// @vitest-environment jsdom
import { DocumentRegistry, LogStore } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument, parseObjectSchema } from "@initial-editor/ext-tilemap/model";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "../../editor/Editor";
import { EditorProvider } from "../../editor/EditorContext";
import { MapObjectInspector } from "./MapObjectInspector";

const MAP_PATH = "resources/maps/sample.json";
const MAP = JSON.stringify({
  version: 2,
  name: "sample",
  width: 20,
  height: 12,
  tileWidth: 16,
  tileHeight: 16,
  layers: [{ name: "ground", data: new Array(240).fill(1) }],
  tilesets: [{ image: "resources/images/checker.png", firstGid: 1, columns: 1 }],
  objects: [
    { id: "start", type: "start", x: 24, y: 160 },
    { id: "slime_1", type: "spawn", x: 120, y: 160, props: { species: "slime", minX: 80, maxX: 200 } },
  ],
});

const SCHEMA = parseObjectSchema(
  JSON.stringify({
    version: 1,
    types: [
      {
        type: "spawn",
        label: "몬스터",
        fields: [
          { name: "species", type: "enum", values: ["slime", "bat"], label: "종" },
          { name: "minX", type: "number", role: "rangeMin", label: "순찰 왼끝" },
          { name: "maxX", type: "number", role: "rangeMax", label: "순찰 오른끝" },
        ],
      },
      { type: "start", label: "시작 지점", unique: true },
    ],
  }),
);

async function setup() {
  const mem = new MemoryBackend({ [MAP_PATH]: MAP });
  await mem.open("/p");
  const doc = await MapDocument.open(mem, MAP_PATH, SCHEMA);
  const documents = new DocumentRegistry();
  documents.open(doc);
  doc.select(["slime_1"]);
  const toasts: string[] = [];
  const toast = (level: string) => (text: string) => void toasts.push(`${level}: ${text}`);
  const editor = {
    documents,
    log: new LogStore(),
    toasts: { info: toast("info"), success: toast("success"), warn: toast("warn"), error: toast("error") },
    mapSchema: { current: SCHEMA, error: null, source: "project", path: "resources/schema/map-objects.json" },
  } as unknown as Editor;
  render(
    <EditorProvider value={editor}>
      <MapObjectInspector />
    </EditorProvider>,
  );
  return { doc, toasts };
}

function idInput(): HTMLInputElement {
  return screen.getByTestId("map-inspector-id") as HTMLInputElement;
}

function type(input: HTMLInputElement, value: string): void {
  act(() => input.focus());
  fireEvent.change(input, { target: { value } });
}

afterEach(cleanup);

describe("맵 오브젝트 인스펙터의 id 칸", () => {
  it("Escape는 이름 바꾸기를 취소한다: 원래 id로 돌아가고 초점을 놓으며 명령이 없다", async () => {
    const { doc, toasts } = await setup();
    const input = idInput();
    type(input, "renamed_by_escape");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(doc.model.objectIds()).toEqual(["start", "slime_1"]);
    expect(doc.undo.depth).toBe(0);
    expect(doc.dirty).toBe(false);
    expect(idInput().value).toBe("slime_1");
    expect(document.activeElement).not.toBe(idInput());
    expect(toasts).toEqual([]);
  });

  it("겹치는 id를 치고 Escape를 눌러도 경고 없이 취소한다", async () => {
    const { doc, toasts } = await setup();
    type(idInput(), "start");
    fireEvent.keyDown(idInput(), { key: "Escape" });
    expect(toasts).toEqual([]);
    expect(doc.model.objectIds()).toEqual(["start", "slime_1"]);
  });

  it("Escape 뒤에 다시 고치면 초점을 잃을 때 이름을 바꾼다", async () => {
    const { doc } = await setup();
    type(idInput(), "typo");
    fireEvent.keyDown(idInput(), { key: "Escape" });
    type(idInput(), "slime_boss");
    act(() => idInput().blur());
    expect(doc.model.objectIds()).toEqual(["start", "slime_boss"]);
    expect(doc.undo.depth).toBe(1);
  });
});
