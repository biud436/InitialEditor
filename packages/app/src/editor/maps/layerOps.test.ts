import { describe, expect, it } from "vitest";
import { MemoryBackend } from "@initial-editor/core";
import { MapDocument, parseMap } from "@initial-editor/ext-tilemap/model";
import { addLayer, moveLayer, removeLayer, renameLayer, uniqueLayerName } from "./layerOps";

function makeDoc(): MapDocument {
  const data = parseMap(
    JSON.stringify({
      version: 2,
      width: 2,
      height: 1,
      tileWidth: 16,
      tileHeight: 16,
      layers: [
        { name: "ground", data: [1, 1] },
        { name: "deco", data: [0, 2] },
        { name: "over", data: [0, 0] },
      ],
      tilesets: [{ image: "a.png", firstGid: 1, columns: 8 }],
    }),
  );
  return new MapDocument(new MemoryBackend(), "resources/maps/a.json", data);
}

const names = (doc: MapDocument) => doc.model.layers.map((l) => l.name);

describe("레이어 패널 동작", () => {
  it("새 이름은 겹치지 않는다", () => {
    expect(uniqueLayerName(["ground", "deco"])).toBe("layer 3");
    expect(uniqueLayerName(["layer 2", "b"])).toBe("layer 3");
    expect(uniqueLayerName(["layer 2", "layer 3"])).toBe("layer 4");
  });

  it("추가는 대상 위에 넣고, 숨긴 레이어 번호를 밀고, 새 레이어를 대상으로 한다", () => {
    const doc = makeDoc();
    doc.setTarget({ kind: "layer", index: 0 });
    doc.toggleLayer(2);
    expect(addLayer(doc)).toBe(1);
    expect(names(doc)).toEqual(["ground", "layer 4", "deco", "over"]);
    expect(doc.target).toEqual({ kind: "layer", index: 1 });
    expect([...doc.hiddenLayers]).toEqual([3]);
    doc.undo.undo();
    expect(names(doc)).toEqual(["ground", "deco", "over"]);
  });

  it("삭제는 대상을 아래로 옮기고 숨김 번호를 당긴다. 마지막 하나는 남긴다", () => {
    const doc = makeDoc();
    doc.toggleLayer(2);
    doc.setTarget({ kind: "layer", index: 1 });
    expect(removeLayer(doc)).toBe(true);
    expect(names(doc)).toEqual(["ground", "over"]);
    expect(doc.target).toEqual({ kind: "layer", index: 0 });
    expect([...doc.hiddenLayers]).toEqual([1]);
    expect(removeLayer(doc)).toBe(true);
    expect(removeLayer(doc)).toBe(false);
    expect(names(doc)).toEqual(["over"]);
  });

  it("옮기기는 대상과 숨김이 레이어를 따라간다", () => {
    const doc = makeDoc();
    doc.setTarget({ kind: "layer", index: 0 });
    doc.toggleLayer(0);
    expect(moveLayer(doc, 1)).toBe(true);
    expect(names(doc)).toEqual(["deco", "ground", "over"]);
    expect(doc.target).toEqual({ kind: "layer", index: 1 });
    expect([...doc.hiddenLayers]).toEqual([1]);
    expect(moveLayer(doc, -1)).toBe(true);
    expect(moveLayer(doc, -1)).toBe(false);
    doc.setTarget({ kind: "collision" });
    expect(moveLayer(doc, 1)).toBe(false);
  });

  it("이름 바꾸기는 비었거나 같으면 하지 않는다", () => {
    const doc = makeDoc();
    expect(renameLayer(doc, 1, "  ")).toBe(false);
    expect(renameLayer(doc, 1, "deco")).toBe(false);
    expect(renameLayer(doc, 1, " 장식 ")).toBe(true);
    expect(names(doc)[1]).toBe("장식");
    expect(doc.undo.depth).toBe(1);
  });
});
