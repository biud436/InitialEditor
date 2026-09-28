// @vitest-environment jsdom
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument, parseMap } from "@initial-editor/ext-tilemap/model";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MapSizeButton } from "./MapSizeButton";

afterEach(cleanup);

const MAP = JSON.stringify({
  version: 2,
  name: "meadow",
  width: 20,
  height: 12,
  tileWidth: 16,
  tileHeight: 16,
  layers: [{ name: "ground", data: new Array(240).fill(1) }],
  tilesets: [{ image: "resources/tiles/meadow16.png", firstGid: 1, columns: 8 }],
  objects: [{ id: "start", type: "start", x: 24, y: 136 }],
});

describe("맵 뷰 머리의 크기 단추", () => {
  it("크기를 보이고, 누르면 크기 바꾸기를 부르고, 크기가 바뀌거나 되돌리면 따라간다", () => {
    const doc = new MapDocument(new MemoryBackend(), "resources/maps/meadow.json", parseMap(MAP));
    let opened = 0;
    render(<MapSizeButton document={doc} onResize={() => opened++} />);
    const button = screen.getByTestId("map-size");
    expect(button.textContent).toBe("20x12 타일 (320x192 px)");
    expect(button.getAttribute("title")).toBe("레이어 1개, 오브젝트 1개. 클릭하면 맵 크기 바꾸기");
    fireEvent.click(button);
    expect(opened).toBe(1);
    act(() => doc.apply(doc.model.resize(24, 14, "bottom-right")));
    expect(screen.getByTestId("map-size").textContent).toBe("24x14 타일 (384x224 px)");
    act(() => doc.undo.undo());
    expect(screen.getByTestId("map-size").textContent).toBe("20x12 타일 (320x192 px)");
  });
});
