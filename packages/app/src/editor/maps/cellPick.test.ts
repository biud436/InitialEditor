// @vitest-environment jsdom
// 맵 뷰의 타일 고르기 (cellPick.ts): 고른 타일과 돌아가기, 맵 밖 누름과 Esc 와 뷰 밖 누름의 취소, 다른 탭, 두 문서의 닫기,
// 새 요청이 앞의 요청을 밀어내기, 끝난 뒤에는 창의 키와 누름을 듣지 않는다.
import { DocumentRegistry, MemoryBackend } from "@initial-editor/core";
import { MapDocument, parseMap } from "@initial-editor/ext-tilemap/model";
import { afterEach, describe, expect, it } from "vitest";
import { CellPicker } from "./cellPick";

const MAP = JSON.stringify({ version: 2, name: "a", width: 4, height: 3, tileWidth: 16, tileHeight: 16, layers: [{ name: "g", data: new Array(12).fill(0) }], tilesets: [] });

function setup() {
  const be = new MemoryBackend();
  const documents = new DocumentRegistry();
  const open = (path: string) => {
    const doc = new MapDocument(be, path, parseMap(MAP));
    documents.open(doc);
    return doc;
  };
  const source = open("resources/maps/source.json");
  const target = open("resources/maps/target.json");
  const other = open("resources/maps/other.json");
  documents.activate(target);
  const picker = new CellPicker({ documents, window });
  return { documents, source, target, other, picker };
}

function key(k: string): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  document.body.dispatchEvent(e);
  return e;
}

function press(el: Element): void {
  el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("타일 고르기", () => {
  it("맵 안의 타일을 누르면 그 타일로 끝나고 returnTo 로 돌아간다", async () => {
    const f = setup();
    const result = f.picker.start(f.target, { prompt: "타일을 클릭", returnTo: f.source });
    expect(f.picker.active).toMatchObject({ doc: f.target, prompt: "타일을 클릭", returnTo: f.source });
    expect(f.picker.isPicking(f.target)).toBe(true);
    expect(f.picker.isPicking(f.source)).toBe(false);
    // 다른 문서의 뷰에서 온 누름은 무시한다
    f.picker.choose(f.source, { x: 0, y: 0 });
    expect(f.picker.active).not.toBeNull();
    f.picker.choose(f.target, { x: 2, y: 1 });
    expect(await result).toEqual({ x: 2, y: 1 });
    expect(f.picker.active).toBeNull();
    expect(f.picker.lastEnd).toBe("picked");
    expect(f.documents.active).toBe(f.source);
  });

  it("같은 맵에서 고르면 그 맵에 머문다", async () => {
    const f = setup();
    f.documents.activate(f.source);
    const result = f.picker.start(f.source, { prompt: "p", returnTo: f.source });
    f.picker.choose(f.source, { x: 3, y: 2 });
    expect(await result).toEqual({ x: 3, y: 2 });
    expect(f.documents.active).toBe(f.source);
  });

  it("맵 밖을 누르면(null) 바꾼 것 없이 끝나고 돌아간다", async () => {
    const f = setup();
    const result = f.picker.start(f.target, { prompt: "p", returnTo: f.source });
    f.picker.choose(f.target, null);
    expect(await result).toBeNull();
    expect(f.picker.lastEnd).toBe("cancel");
    expect(f.documents.active).toBe(f.source);
  });

  it("Esc 는 어디서 눌러도 취소하고 전파를 막는다. 다른 키는 두고, 끝난 뒤의 Esc 는 건드리지 않는다", async () => {
    const f = setup();
    const result = f.picker.start(f.target, { prompt: "p", returnTo: f.source });
    const other = key("a");
    expect(other.defaultPrevented).toBe(false);
    expect(f.picker.active).not.toBeNull();
    const esc = key("Escape");
    expect(esc.defaultPrevented).toBe(true);
    expect(await result).toBeNull();
    expect(f.documents.active).toBe(f.source);
    expect(key("Escape").defaultPrevented).toBe(false);
  });

  it("뷰 밖을 누르면 취소하고, 누름 자리(data-pick-surface) 안의 누름은 렌더러에 맡긴다", async () => {
    const f = setup();
    const surface = document.createElement("div");
    surface.setAttribute("data-pick-surface", "true");
    const canvas = document.createElement("canvas");
    surface.append(canvas);
    const outside = document.createElement("button");
    document.body.append(surface, outside);
    const result = f.picker.start(f.target, { prompt: "p", returnTo: f.source });
    press(canvas);
    expect(f.picker.active).not.toBeNull();
    press(outside);
    expect(await result).toBeNull();
    expect(f.picker.lastEnd).toBe("cancel");
    expect(f.documents.active).toBe(f.source);
  });

  it("다른 탭을 고르면 그 탭에 두고 취소한다", async () => {
    const f = setup();
    const result = f.picker.start(f.target, { prompt: "p", returnTo: f.source });
    f.documents.activate(f.other);
    expect(await result).toBeNull();
    expect(f.picker.lastEnd).toBe("tab");
    expect(f.documents.active).toBe(f.other);
  });

  it("returnTo 문서가 닫히면 취소하고 고르던 맵에 둔다", async () => {
    const f = setup();
    const result = f.picker.start(f.target, { prompt: "p", returnTo: f.source });
    f.documents.close(f.source);
    expect(await result).toBeNull();
    expect(f.picker.lastEnd).toBe("sourceClosed");
    expect(f.documents.active).toBe(f.target);
    expect(f.picker.active).toBeNull();
  });

  it("고르던 맵이 닫히면 취소하고 returnTo 로 돌아간다", async () => {
    const f = setup();
    const result = f.picker.start(f.target, { prompt: "p", returnTo: f.source });
    f.documents.close(f.target);
    expect(await result).toBeNull();
    expect(f.picker.lastEnd).toBe("targetClosed");
    expect(f.documents.active).toBe(f.source);
  });

  it("새 요청은 앞의 요청을 돌아가지 않고 끝낸다", async () => {
    const f = setup();
    const first = f.picker.start(f.target, { prompt: "하나", returnTo: f.source });
    const second = f.picker.start(f.target, { prompt: "둘", returnTo: f.other });
    expect(await first).toBeNull();
    expect(f.documents.active).toBe(f.target);
    expect(f.picker.active?.prompt).toBe("둘");
    f.picker.choose(f.target, { x: 1, y: 1 });
    expect(await second).toEqual({ x: 1, y: 1 });
    expect(f.documents.active).toBe(f.other);
  });

  it("닫힌 문서로는 시작하지 않는다", async () => {
    const f = setup();
    f.documents.close(f.source);
    expect(await f.picker.start(f.target, { prompt: "p", returnTo: f.source })).toBeNull();
    expect(f.picker.active).toBeNull();
    f.documents.close(f.other);
    expect(await f.picker.start(f.other, { prompt: "p" })).toBeNull();
  });

  it("dispose 는 고르던 것을 끝낸다", async () => {
    const f = setup();
    const result = f.picker.start(f.target, { prompt: "p" });
    f.picker.dispose();
    expect(await result).toBeNull();
    expect(f.picker.lastEnd).toBe("disposed");
  });
});
