// @vitest-environment jsdom
import { DocumentRegistry, LogStore } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument, parseObjectSchema } from "@initial-editor/ext-tilemap/model";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "../../editor/Editor";
import { EditorProvider } from "../../editor/EditorContext";
import { FakeMarksState } from "../../editor/maps/__fixtures__/fakeLayer";
import { ObjectsPanel } from "./ObjectsPanel";

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
    { id: "slime_1", type: "spawn", x: 120, y: 160, props: { species: "slime" } },
    { id: "sign_1", type: "landmark", x: 16, y: 0, width: 16, props: { text: "a" } },
  ],
});

const SCHEMA = parseObjectSchema(
  JSON.stringify({
    version: 1,
    types: [
      { type: "spawn", label: "몬스터", fields: [{ name: "species", type: "enum", values: ["slime", "bat"] }] },
      { type: "start", label: "시작 지점", unique: true },
      { type: "landmark", label: "흔적", shape: "band", defaultWidth: 16, fields: [{ name: "text", type: "text" }] },
    ],
  }),
);

async function setup(schema = SCHEMA) {
  const mem = new MemoryBackend({ [MAP_PATH]: MAP });
  await mem.open("/p");
  const doc = await MapDocument.open(mem, MAP_PATH, schema);
  const documents = new DocumentRegistry();
  documents.open(doc);
  const toasts: string[] = [];
  const toast = (level: string) => (text: string) => void toasts.push(`${level}: ${text}`);
  const editor = {
    documents,
    log: new LogStore(),
    toasts: { info: toast("info"), success: toast("success"), warn: toast("warn"), error: toast("error") },
    mapSchema: { current: schema, error: null },
  } as unknown as Editor;
  render(
    <EditorProvider value={editor}>
      <ObjectsPanel />
    </EditorProvider>,
  );
  return { doc, toasts };
}

function row(id: string): HTMLElement {
  return document.querySelector(`[data-testid="map-objects-row"][data-id="${id}"]`) as HTMLElement;
}

function renameInput(): HTMLInputElement | null {
  return screen.queryByTestId("map-objects-rename") as HTMLInputElement | null;
}

/** 줄을 누르고 F2로 이름 칸을 열어 text를 친다 */
function startRename(id: string, text: string): HTMLInputElement {
  fireEvent.click(row(id));
  act(() => row(id).focus());
  fireEvent.keyDown(row(id), { key: "F2" });
  const input = renameInput()!;
  expect(document.activeElement).toBe(input);
  fireEvent.change(input, { target: { value: text } });
  return input;
}

// jsdom에는 CSS.escape가 없다 (줄을 찾을 때 쓴다)
const g = globalThis as { CSS?: { escape(s: string): string } };
g.CSS ??= { escape: (s: string) => s.replace(/["\\]/g, "\\$&") };

afterEach(cleanup);

describe("맵 오브젝트 목록의 이름 바꾸기", () => {
  it("거부된 이름으로 초점을 잃으면 칸을 닫고 원래 id로 돌아가며, 초점을 목록 줄로 돌려 키가 다시 듣는다", async () => {
    const { doc, toasts } = await setup();
    const input = startRename("slime_1", "start");
    act(() => input.blur());
    expect(toasts).toEqual(["warn: 이미 있는 id: start"]);
    expect(renameInput()).toBeNull();
    expect(row("slime_1").textContent).toContain("slime_1");
    expect(doc.model.objectIds()).toEqual(["start", "slime_1", "sign_1"]);
    await waitFor(() => expect(document.activeElement).toBe(row("slime_1")));

    // 목록 키: 화살표, F2, Delete가 다시 듣는다
    fireEvent.keyDown(row("slime_1"), { key: "ArrowDown" });
    expect(doc.selectedIds).toEqual(["start"]);
    fireEvent.keyDown(row("start"), { key: "F2" });
    expect(renameInput()).not.toBeNull();
    fireEvent.keyDown(renameInput()!, { key: "Escape" });
    fireEvent.keyDown(row("start"), { key: "Delete" });
    expect(doc.model.objectIds()).toEqual(["slime_1", "sign_1"]);
  });

  it("거부된 이름으로 다른 줄을 누르면 칸을 닫고 초점은 누른 줄에 둔다", async () => {
    const { doc } = await setup();
    const input = startRename("slime_1", "");
    fireEvent.blur(input, { relatedTarget: row("sign_1") });
    act(() => row("sign_1").focus());
    fireEvent.click(row("sign_1"));
    expect(renameInput()).toBeNull();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(document.activeElement).toBe(row("sign_1"));
    fireEvent.keyDown(row("sign_1"), { key: "ArrowUp" });
    expect(doc.selectedIds).toEqual(["start"]);
  });

  it("Enter로 거부되면 칸에 남아 고칠 수 있고, 고친 이름은 확정된다", async () => {
    const { doc, toasts } = await setup();
    const input = startRename("slime_1", "start");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(toasts).toEqual(["warn: 이미 있는 id: start"]);
    expect(renameInput()).toBe(input);
    fireEvent.change(input, { target: { value: "slime_boss" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(renameInput()).toBeNull();
    expect(doc.model.objectIds()).toEqual(["start", "slime_boss", "sign_1"]);
  });
});

describe("맵 오브젝트 목록의 검사", () => {
  it("추가 버튼으로 더한 흔적은 필수 제목과 글이 비어 있어 검사에 오른다", async () => {
    const required = parseObjectSchema(
      JSON.stringify({
        version: 1,
        types: [
          { type: "spawn", label: "몬스터", fields: [{ name: "species", type: "enum", values: ["slime", "bat"] }] },
          { type: "start", label: "시작 지점", unique: true },
          {
            type: "landmark",
            label: "흔적",
            shape: "band",
            defaultWidth: 16,
            fields: [
              { name: "title", type: "string", required: true, label: "제목" },
              { name: "text", type: "text", required: true, label: "글" },
            ],
          },
        ],
      }),
    );
    const { doc } = await setup(required);
    // 원래 흔적(sign_1)은 제목이 없어 이미 걸린다
    const problems = () => screen.getByTestId("map-objects-problems");
    expect(problems().getAttribute("data-count")).toBe("1");
    const addLandmark = document.querySelector('[data-testid="map-objects-add"][data-type="landmark"]') as HTMLElement;
    fireEvent.click(addLandmark);
    const added = doc.selectedIds[0];
    expect(doc.model.findObject(added)?.props).toEqual({ title: "", text: "" });
    expect(problems().getAttribute("data-count")).toBe("3");
    const texts = screen.getAllByTestId("map-objects-problem").map((p) => p.textContent ?? "");
    expect(texts.filter((t) => t.includes(`${added}: 필수 속성 제목 값이 비어 있습니다`))).toHaveLength(1);
    expect(texts.filter((t) => t.includes(`${added}: 필수 속성 글 값이 비어 있습니다`))).toHaveLength(1);
  });
});

describe("맵 오브젝트 패널의 검사와 확장 레이어", () => {
  it("확장 레이어의 문제는 오브젝트 검사 목록에 넣지 않는다 (그 레이어가 보인다)", async () => {
    const { doc } = await setup();
    const state = new FakeMarksState([{ id: "out", x: -1, y: 0 }]);
    act(() => void doc.refreshLayer({ id: "test.marks", section: "marks", attach: () => state }));
    expect(doc.problems).toHaveLength(1);
    expect(screen.getByTestId("map-objects-problems").getAttribute("data-count")).toBe("0");
  });
});
