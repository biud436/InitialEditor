// @vitest-environment jsdom
import { CommandRegistry, ExtensionHost, ExtensionRegistries, makeObject, MemoryBackend, MenuRegistry, Project, SceneDocument } from "@initial-editor/core";
import { tilemapExtension } from "@initial-editor/ext-tilemap";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { observer } from "mobx-react-lite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "../Editor";
import { EditorProvider } from "../EditorContext";
import { MapFileCache } from "../sceneView/mapFiles";
import { inspectorFor, registerCoreObjectTypes } from "./coreTypes";
import { TilemapInspector } from "./tilemapInspector";

const A = "resources/maps/a.json";
const B = "resources/maps/b.json";

function mapText(width: number, layers: number): string {
  return JSON.stringify({
    version: 2,
    width,
    height: 2,
    tileWidth: 16,
    tileHeight: 16,
    tilesets: [],
    layers: Array.from({ length: layers }, (_, i) => ({ name: `l${i}`, data: new Array(width * 2).fill(0) })),
  });
}

const FILES: Record<string, string> = {
  [A]: mapText(4, 2),
  [B]: "{ 맵 아님",
  "resources/maps/notes.txt": "x",
  "resources/maps/old/c.json": mapText(1, 1),
};

async function setup(props: Record<string, unknown> = { map: "", groundLayers: 1 }, files: Record<string, string> = FILES) {
  const backend = new MemoryBackend(files);
  const project = new Project(backend);
  await project.open("/p");
  const maps = new MapFileCache(() => backend);
  const doc = new SceneDocument(backend, "resources/scenes/s.json", { version: 1, name: "s", objects: [makeObject("tilemap", "tilemap1", props)], extra: {} }, () => new Set(["tilemap"]));
  const openPath = vi.fn(async () => {});
  const editor = {
    backend,
    project,
    sceneSupport: { maps },
    sceneTools: { apply: (d: SceneDocument, cmd: Parameters<SceneDocument["apply"]>[0]) => d.apply(cmd) },
    openPath,
  } as unknown as Editor;
  const Host = observer(function Host() {
    const o = doc.scene.find("tilemap1");
    return o ? <TilemapInspector document={doc} object={o} /> : null;
  });
  render(
    <EditorProvider value={editor}>
      <Host />
    </EditorProvider>,
  );
  const prop = (k: string) => doc.scene.find("tilemap1")!.props[k];
  return { backend, project, doc, maps, openPath, prop };
}

function select(): HTMLSelectElement {
  return screen.getByTestId("prop-map") as HTMLSelectElement;
}

afterEach(cleanup);

describe("타일맵 인스펙터", () => {
  it("resources/maps 바로 아래의 json만 고를 수 있고, 고르면 명령으로 props.map을 바꾼다", async () => {
    const { doc, prop } = await setup();
    await screen.findByRole("option", { name: A });
    const options = [...select().options].map((o) => o.value);
    expect(options).toEqual(["", A, B]);
    act(() => void fireEvent.change(select(), { target: { value: A } }));
    expect(prop("map")).toBe(A);
    act(() => void doc.undo.undo());
    expect(prop("map")).toBe("");
  });

  it("맵의 크기와 레이어 수를 보이고, 읽지 못하면 이유를 보인다", async () => {
    await setup({ map: A, groundLayers: 1 });
    expect(await screen.findByText("4x2 칸, 타일 16x16, 레이어 2")).toBeTruthy();
    cleanup();
    await setup({ map: B, groundLayers: 1 });
    await waitFor(() => expect(screen.getByTestId("tilemap-map-info").textContent).toMatch(/^읽지 못했다: /));
  });

  it("목록에 없는 현재 값도 고른 채로 보인다", async () => {
    await setup({ map: "resources/maps/gone.json", groundLayers: 1 });
    await screen.findByRole("option", { name: A });
    expect(select().value).toBe("resources/maps/gone.json");
    expect([...select().options].map((o) => o.value)).toContain("resources/maps/gone.json");
  });

  it("바닥 레이어 수를 고치고, 맵의 레이어보다 많으면 알린다", async () => {
    const { prop } = await setup({ map: A, groundLayers: 1 });
    await screen.findByText("4x2 칸, 타일 16x16, 레이어 2");
    expect(screen.queryByTestId("tilemap-ground-note")).toBeNull();
    const input = screen.getByTestId("prop-groundLayers") as HTMLInputElement;
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "3" } });
    expect(prop("groundLayers")).toBe(3);
    expect(screen.getByTestId("tilemap-ground-note").textContent).toContain("레이어 수(2)");
    fireEvent.change(input, { target: { value: "-2" } });
    expect(prop("groundLayers")).toBe(0);
  });

  it("맵 열기는 고른 맵을 문서로 연다. 맵이 없으면 누를 수 없다", async () => {
    const { openPath } = await setup();
    const button = screen.getByTestId("tilemap-open-map") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await screen.findByRole("option", { name: A });
    act(() => void fireEvent.change(select(), { target: { value: A } }));
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(openPath).toHaveBeenCalledWith(A);
  });

  it("맵 파일이 바뀌면 요약을 다시 읽고, 새 맵 파일은 목록에 들어온다", async () => {
    const { backend, maps } = await setup({ map: A, groundLayers: 1 });
    await screen.findByText("4x2 칸, 타일 16x16, 레이어 2");
    await backend.writeText(A, mapText(6, 3));
    act(() => maps.fileChanged(A));
    expect(await screen.findByText("6x2 칸, 타일 16x16, 레이어 3")).toBeTruthy();
    await act(async () => {
      await backend.writeText("resources/maps/d.json", mapText(1, 1));
    });
    expect(await screen.findByRole("option", { name: "resources/maps/d.json" })).toBeTruthy();
  });
});

describe("resources/maps 폴더가 없는 프로젝트", () => {
  it("목록은 비어 있다가, 그 폴더에 첫 맵 파일이 생기면 폴더를 읽어 목록에 넣는다", async () => {
    const { backend, project } = await setup(undefined, { "resources/tiles/t.png": "x" });
    await waitFor(() => expect(select().options).toHaveLength(1));
    expect(project.folders.has("resources/maps")).toBe(false);
    // 맵이 아닌 다른 폴더의 변경은 읽지 않는다
    await act(async () => {
      await backend.writeText("resources/tiles/u.png", "x");
    });
    expect(project.folders.has("resources/maps")).toBe(false);
    await act(async () => {
      await backend.writeText("resources/maps/first.json", mapText(1, 1));
    });
    expect(await screen.findByRole("option", { name: "resources/maps/first.json" })).toBeTruthy();
    expect(project.folders.has("resources/maps")).toBe(true);
  });
});

describe("인스펙터 붙이기", () => {
  it("코어 타입을 넣을 때 타일맵 확장의 타입에 인스펙터가 붙는다", async () => {
    const registries = new ExtensionRegistries();
    registerCoreObjectTypes(registries);
    expect(registries.objectTypes.has("tilemap")).toBe(false);
    const host = new ExtensionHost({ commands: new CommandRegistry({ platform: "mac" }), menus: new MenuRegistry(), registries });
    await host.activateAll([tilemapExtension]);
    const spec = registries.objectTypes.get("tilemap");
    expect(spec?.Inspector).toBe(TilemapInspector);
    expect(inspectorFor(spec, "tilemap")).toBe(TilemapInspector);
    // 확장이 없으면 인스펙터도 없다
    expect(inspectorFor(undefined, "tilemap")).toBeNull();
  });
});
