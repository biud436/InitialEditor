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
/** 숨긴 레이어와 대상 레이어를 이름으로 */
const hiddenNames = (doc: MapDocument) => [...doc.hiddenLayers].sort().map((i) => doc.model.layers[i]?.name ?? `?${i}`);
const targetName = (doc: MapDocument) => (doc.target.kind === "layer" ? doc.model.layers[doc.target.index]?.name ?? `?${doc.target.index}` : doc.target.kind);

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

  it("추가를 되돌리고 다시 해도 숨김과 대상이 같은 레이어에 남는다", () => {
    const doc = makeDoc();
    doc.toggleLayer(1);
    doc.setTarget({ kind: "layer", index: 0 });
    addLayer(doc);
    expect(hiddenNames(doc)).toEqual(["deco"]);
    expect(targetName(doc)).toBe("layer 4");
    doc.undo.undo();
    expect(names(doc)).toEqual(["ground", "deco", "over"]);
    expect(hiddenNames(doc)).toEqual(["deco"]);
    expect(targetName(doc)).toBe("ground");
    doc.undo.redo();
    expect(names(doc)).toEqual(["ground", "layer 4", "deco", "over"]);
    expect(hiddenNames(doc)).toEqual(["deco"]);
    expect(targetName(doc)).toBe("layer 4");
  });

  it("삭제를 되돌리면 지운 레이어가 대상이고, 숨김은 제 레이어에 남는다", () => {
    const doc = makeDoc();
    doc.toggleLayer(2);
    doc.setTarget({ kind: "layer", index: 1 });
    removeLayer(doc);
    expect(hiddenNames(doc)).toEqual(["over"]);
    doc.undo.undo();
    expect(names(doc)).toEqual(["ground", "deco", "over"]);
    expect(hiddenNames(doc)).toEqual(["over"]);
    expect(targetName(doc)).toBe("deco");
    doc.undo.redo();
    expect(names(doc)).toEqual(["ground", "over"]);
    expect(hiddenNames(doc)).toEqual(["over"]);
    expect(targetName(doc)).toBe("ground");
  });

  it("숨긴 레이어를 지웠다 되돌리면 다시 숨겨져 있다", () => {
    const doc = makeDoc();
    doc.toggleLayer(1);
    doc.setTarget({ kind: "layer", index: 1 });
    removeLayer(doc);
    expect(hiddenNames(doc)).toEqual([]);
    doc.undo.undo();
    expect(hiddenNames(doc)).toEqual(["deco"]);
    expect(targetName(doc)).toBe("deco");
  });

  it("옮기기를 되돌리고 다시 해도 숨김과 대상이 같은 레이어를 따라간다", () => {
    const doc = makeDoc();
    doc.toggleLayer(1);
    doc.setTarget({ kind: "layer", index: 0 });
    moveLayer(doc, 1);
    expect(names(doc)).toEqual(["deco", "ground", "over"]);
    expect(hiddenNames(doc)).toEqual(["deco"]);
    expect(targetName(doc)).toBe("ground");
    doc.undo.undo();
    expect(names(doc)).toEqual(["ground", "deco", "over"]);
    expect(hiddenNames(doc)).toEqual(["deco"]);
    expect(targetName(doc)).toBe("ground");
    doc.undo.redo();
    expect(hiddenNames(doc)).toEqual(["deco"]);
    expect(targetName(doc)).toBe("ground");
  });

  it("명령 뒤에 대상을 바꿨으면 되돌려도 그 레이어를 따라간다", () => {
    const doc = makeDoc();
    doc.setTarget({ kind: "layer", index: 0 });
    addLayer(doc);
    doc.setTarget({ kind: "layer", index: 3 });
    expect(targetName(doc)).toBe("over");
    doc.undo.undo();
    expect(targetName(doc)).toBe("over");
    doc.undo.redo();
    expect(targetName(doc)).toBe("over");
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
