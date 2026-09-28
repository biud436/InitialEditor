// @vitest-environment jsdom
// 확장 레이어의 패널 자리: 레이어 패널의 줄(눈, 대상 고르기, 자물쇠와 이유, 오류 수)과 힌트, 인스펙터 자리.
import { DocumentRegistry, LogStore, MemoryBackend } from "@initial-editor/core";
import { TilemapContrib, type MapLayerInspectorProps } from "@initial-editor/ext-tilemap";
import { MapDocument, parseMap } from "@initial-editor/ext-tilemap/model";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { observer } from "mobx-react-lite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "../../editor/Editor";
import { EditorProvider } from "../../editor/EditorContext";
import { FakeMarksState, fakeLayer } from "../../editor/maps/__fixtures__/fakeLayer";
import { mapLayerSpecs } from "../../editor/maps/extLayers";
import { LayersPanel } from "./LayersPanel";
import { MapObjectInspector } from "./MapObjectInspector";

// 레이어 패널이 맵 뷰 모듈을 거쳐 PIXI 를 부른다. jsdom 에는 캔버스 2D 가 없어 조용히 null 을 준다
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

const PATH = "resources/maps/town.json";
const OTHER = "resources/maps/meadow.json";

function mapText(): string {
  return JSON.stringify({
    version: 2,
    name: "town",
    width: 4,
    height: 3,
    tileWidth: 16,
    tileHeight: 16,
    layers: [{ name: "ground", data: new Array(12).fill(1) }],
    tilesets: [{ image: "resources/tiles/t.png", firstGid: 1, columns: 8 }],
  });
}

const MarksInspector = observer(function MarksInspector({ document, state }: MapLayerInspectorProps) {
  const s = state as FakeMarksState;
  return (
    <div data-testid="marks-inspector">
      {document.title}: 표식 {s.items.length}개
    </div>
  );
});

function setup(active: string = PATH) {
  const documents = new DocumentRegistry();
  const tilemap = new TilemapContrib({ documents });
  const marks = fakeLayer({ order: 2, paths: [PATH], hint: "표식은 town 에만 있다", Inspector: MarksInspector });
  const plain = fakeLayer({ id: "test.plain", label: "무늬", section: "plain", toolKey: "P", paths: [PATH] });
  const quiet = fakeLayer({ id: "test.quiet", label: "조용", section: "quiet", paths: [] });
  tilemap.registerMapLayer(marks.spec);
  tilemap.registerMapLayer(plain.spec);
  tilemap.registerMapLayer(quiet.spec);
  const town = new MapDocument(new MemoryBackend(), PATH, parseMap(mapText()));
  const meadow = new MapDocument(new MemoryBackend(), OTHER, parseMap(mapText()));
  documents.open(meadow);
  documents.open(town);
  const doc = active === PATH ? town : meadow;
  documents.activate(doc);
  const editor = {
    documents,
    tilemap,
    log: new LogStore(),
    toasts: { info: () => {}, success: () => {}, warn: () => {}, error: () => {} },
    mapSupport: { activeMap: doc, layers: () => mapLayerSpecs(tilemap) },
    mapSchema: { current: null, error: null, source: "none", path: "resources/schema/map-objects.json" },
  } as unknown as Editor;
  return { documents, tilemap, town, meadow, doc, editor };
}

function renderWith(editor: Editor, node: React.ReactNode) {
  return render(<EditorProvider value={editor}>{node}</EditorProvider>);
}

const rows = () => screen.getAllByTestId("layer-row").map((r) => r.getAttribute("data-target"));

afterEach(cleanup);

describe("레이어 패널의 확장 레이어", () => {
  it("상태가 붙은 레이어가 오브젝트 줄 위에 order 큰 것부터 있고, 누르면 대상이 된다", () => {
    const f = setup();
    renderWith(f.editor, <LayersPanel />);
    expect(rows()).toEqual(["ext:test.marks", "ext:test.plain", "objects", "collision", "layer:0"]);
    fireEvent.click(screen.getByText("표식"));
    expect(f.town.target).toEqual({ kind: "ext", id: "test.marks" });
    expect(f.town.tool).toBe("ext");
    const active = screen.getAllByTestId("layer-row").find((r) => r.getAttribute("aria-selected") === "true");
    expect(active?.getAttribute("data-target")).toBe("ext:test.marks");
  });

  it("눈은 그 레이어만 숨기고 보인다", () => {
    const f = setup();
    renderWith(f.editor, <LayersPanel />);
    const eye = screen.getByRole("button", { name: "표식 숨기기" });
    fireEvent.click(eye);
    expect(f.town.hiddenExtLayers.has("test.marks")).toBe(true);
    expect(f.town.target).toEqual({ kind: "layer", index: 0 });
    fireEvent.click(screen.getByRole("button", { name: "표식 보이기" }));
    expect(f.town.hiddenExtLayers.has("test.marks")).toBe(false);
  });

  it("잠기면 자물쇠와 이유가 보이고 풀리면 사라진다. 오류 수도 따라온다", () => {
    const f = setup();
    renderWith(f.editor, <LayersPanel />);
    expect(screen.queryByTestId("layer-lock")).toBeNull();
    const state = f.town.layerState("test.marks") as FakeMarksState;
    act(() => state.lock("모르는 스키마 버전: 9"));
    expect(screen.getByTestId("layer-lock").getAttribute("title")).toBe("모르는 스키마 버전: 9");
    expect(screen.getByTestId("layer-lock-reason").textContent).toBe("모르는 스키마 버전: 9");
    act(() => f.town.apply(state.add({ id: "out", x: -1, y: 0 })));
    expect(screen.getByTestId("layer-errors").textContent).toBe("오류 1");
    act(() => state.lock(null));
    expect(screen.queryByTestId("layer-lock")).toBeNull();
    expect(screen.queryByTestId("layer-lock-reason")).toBeNull();
  });

  it("상태가 없는 맵에는 줄 대신 hint 한 줄이 있고, hint 가 없는 레이어는 아무것도 없다", () => {
    const f = setup(OTHER);
    renderWith(f.editor, <LayersPanel />);
    expect(rows()).toEqual(["objects", "collision", "layer:0"]);
    const hints = screen.getAllByTestId("layer-hint");
    expect(hints.map((h) => [h.getAttribute("data-layer"), h.textContent])).toEqual([["test.marks", "표식은 town 에만 있다"]]);
  });
});

describe("인스펙터의 확장 레이어 자리", () => {
  it("대상이 확장 레이어면 그 레이어의 Inspector 를 문서와 상태와 함께 그린다", () => {
    const f = setup();
    f.town.setTarget({ kind: "ext", id: "test.marks" });
    renderWith(f.editor, <MapObjectInspector />);
    const slot = screen.getByTestId("map-layer-inspector");
    expect(slot.getAttribute("data-layer")).toBe("test.marks");
    expect(screen.getByTestId("marks-inspector").textContent).toBe("town.json: 표식 0개");
    const state = f.town.layerState("test.marks") as FakeMarksState;
    act(() => f.town.apply(state.add({ id: "a", x: 1, y: 1 })));
    expect(screen.getByTestId("marks-inspector").textContent).toBe("town.json: 표식 1개");
  });

  it("Inspector 가 없는 레이어나 다른 대상이면 맵 요약이고, 요약의 검사 목록은 오브젝트의 문제만이다", () => {
    const f = setup();
    const state = f.town.layerState("test.plain") as FakeMarksState;
    f.town.apply(state.add({ id: "out", x: -1, y: 0 }));
    expect(f.town.problems).toHaveLength(1);
    f.town.setTarget({ kind: "ext", id: "test.plain" });
    renderWith(f.editor, <MapObjectInspector />);
    expect(screen.queryByTestId("map-layer-inspector")).toBeNull();
    expect(screen.getByTestId("map-summary")).toBeTruthy();
    expect(screen.getByTestId("map-inspector-problems").getAttribute("data-count")).toBe("0");
  });
});
