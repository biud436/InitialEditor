// @vitest-environment jsdom
// 맵 렌더러의 타일 고르기와 뷰 옮기기 (WebGL 없이): 고르는 동안 왼쪽 누름은 도구 대신 고르기로 가고(맵 밖은 null),
// 오른쪽은 팬, 키와 두 번 누르기는 도구에 가지 않는다. 끝나면 도구가 다시 받는다. reveal 은 첫 화면을 맞춘 뒤 가운데에 둔다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentRegistry, Emitter, MemoryBackend } from "@initial-editor/core";
import { TilemapContrib } from "@initial-editor/ext-tilemap";
import { MapDocument, parseMap } from "@initial-editor/ext-tilemap/model";
import { observable, runInAction } from "mobx";
import { fakeLayer } from "./__fixtures__/fakeLayer";
import { MAP_COLOR_TOKENS } from "./mapColors";
import type { Cell } from "./mapGeometry";
import { MapRenderer } from "./MapRenderer";
import { MapViewState } from "./mapViewState";

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

const PATH = "resources/maps/t.json";

function mapText(): string {
  return JSON.stringify({
    version: 2,
    name: "t",
    width: 4,
    height: 2,
    tileWidth: 16,
    tileHeight: 16,
    layers: [{ name: "ground", data: new Array(8).fill(1) }],
    tilesets: [{ image: "resources/tiles/t.png", firstGid: 1, columns: 8 }],
  });
}

interface Internals {
  app: unknown;
  host: HTMLElement | null;
  initialViewDone: boolean;
  pan: unknown;
  installDom(host: HTMLElement, canvas: HTMLCanvasElement): void;
  installReactions(): void;
  resize(): void;
}

function fakeApp() {
  const canvas = document.createElement("canvas");
  canvas.setPointerCapture = () => {};
  canvas.releasePointerCapture = () => {};
  canvas.hasPointerCapture = () => false;
  return { canvas, renderer: { width: 1, height: 1, resize: () => {}, render: () => {}, background: { color: 0 } }, destroy: () => {} };
}

function setup() {
  const documents = new DocumentRegistry();
  const contrib = new TilemapContrib({ documents });
  const marks = fakeLayer({ order: 1 });
  contrib.registerMapLayer(marks.spec);
  const doc = new MapDocument(new MemoryBackend(), PATH, parseMap(mapText()));
  documents.open(doc);
  doc.setTarget({ kind: "ext", id: "test.marks" });
  const textures = { load: async () => ({ texture: {}, width: 32, height: 32 }), events: new Emitter<{ invalidated: string }>() };
  const colors = Object.fromEntries(MAP_COLOR_TOKENS.map((t) => [t, 0]));
  const picking = observable.box(false);
  const chosen: Array<Cell | null> = [];
  const r = new MapRenderer({
    document: doc,
    textures: textures as never,
    view: new MapViewState(),
    theme: () => ({ colors, fonts: { "font-ui": "sans-serif", "font-mono": "monospace" } }) as never,
    layers: () => contrib.orderedLayers(),
    pick: {
      active: () => picking.get(),
      choose: (cell) => {
        chosen.push(cell);
        runInAction(() => picking.set(false));
      },
    },
  });
  const internals = r as unknown as Internals;
  const app = fakeApp();
  const host = document.createElement("div");
  host.tabIndex = 0;
  Object.defineProperty(host, "clientWidth", { value: 200 });
  Object.defineProperty(host, "clientHeight", { value: 100 });
  document.body.append(host);
  host.appendChild(app.canvas);
  internals.app = app;
  internals.host = host;
  const setPicking = (v: boolean) => runInAction(() => picking.set(v));
  return { doc, marks, r, internals, app, host, chosen, setPicking };
}

/** 월드 점을 누르는 포인터 이벤트 (jsdom 의 캔버스 상자는 0 이라 화면 좌표 = 월드 * 줌 + 팬) */
function pointer(r: MapRenderer, type: string, world: { x: number; y: number }, button = 0): MouseEvent {
  const t = r.transform;
  return new MouseEvent(type, { clientX: world.x * t.zoom + t.panX, clientY: world.y * t.zoom + t.panY, button, bubbles: true, cancelable: true });
}

describe("타일 고르기와 뷰 옮기기", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("고르는 동안 왼쪽 누름은 맵 안이면 타일, 맵 밖이면 null 이고 도구는 받지 않는다. 끝나면 도구가 다시 받는다", () => {
    const f = setup();
    f.internals.installDom(f.host, f.app.canvas);
    f.internals.installReactions();
    f.setPicking(true);
    f.app.canvas.dispatchEvent(pointer(f.r, "pointermove", { x: 40, y: 20 }));
    f.app.canvas.dispatchEvent(pointer(f.r, "pointerdown", { x: 40, y: 20 }));
    f.app.canvas.dispatchEvent(pointer(f.r, "pointerup", { x: 40, y: 20 }));
    expect(f.chosen).toEqual([{ x: 2, y: 1 }]);
    f.setPicking(true);
    f.app.canvas.dispatchEvent(pointer(f.r, "pointerdown", { x: -5, y: 10 }));
    f.setPicking(true);
    f.app.canvas.dispatchEvent(pointer(f.r, "pointerdown", { x: 70, y: 10 }));
    expect(f.chosen).toEqual([{ x: 2, y: 1 }, null, null]);
    expect(f.marks.log.pointers).toEqual([]);
    // 끝나면 도구가 누름을 받는다
    f.app.canvas.dispatchEvent(pointer(f.r, "pointerdown", { x: 8, y: 8 }));
    expect(f.marks.log.pointers.map(([kind]) => kind)).toEqual(["down"]);
    expect(f.chosen).toHaveLength(3);
    f.r.dispose();
  });

  it("고르는 동안 오른쪽 누름은 팬이고, 키와 두 번 누르기는 도구에 가지 않는다", () => {
    const f = setup();
    f.internals.installDom(f.host, f.app.canvas);
    f.internals.installReactions();
    f.setPicking(true);
    f.app.canvas.dispatchEvent(pointer(f.r, "pointerdown", { x: 20, y: 10 }, 2));
    expect(f.internals.pan).not.toBeNull();
    f.app.canvas.dispatchEvent(pointer(f.r, "pointerup", { x: 20, y: 10 }, 2));
    f.app.canvas.dispatchEvent(new MouseEvent("dblclick", { clientX: 40, clientY: 40, button: 0, bubbles: true }));
    const del = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true });
    f.host.dispatchEvent(del);
    expect(del.defaultPrevented).toBe(false);
    expect(f.marks.log.pointers).toEqual([]);
    expect(f.marks.log.keys).toEqual([]);
    expect(f.chosen).toEqual([]);
    expect(f.host.style.cursor).toBe("crosshair");
    f.setPicking(false);
    expect(f.host.style.cursor).not.toBe("crosshair");
    f.host.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    expect(f.marks.log.keys.map((k) => k.key)).toEqual(["Delete"]);
    f.r.dispose();
  });

  it("reveal 은 첫 화면을 맞춘 뒤에 월드 점을 뷰 가운데에 둔다 (줌은 그대로)", () => {
    const f = setup();
    f.r.reveal({ x: 40, y: 24 });
    // 첫 화면 전에는 기다린다
    expect(f.internals.initialViewDone).toBe(false);
    const before = { ...f.r.transform };
    expect({ ...f.r.transform }).toEqual(before);
    f.internals.resize();
    expect(f.internals.initialViewDone).toBe(true);
    const t = f.r.transform;
    expect([t.panX, t.panY]).toEqual([Math.round(100 - 40 * t.zoom), Math.round(50 - 24 * t.zoom)]);
    // 이미 보이는 뷰는 바로 옮긴다
    f.r.setZoom(2);
    f.r.reveal({ x: 8, y: 8 });
    expect([f.r.transform.zoom, f.r.transform.panX, f.r.transform.panY]).toEqual([2, 100 - 16, 50 - 16]);
    f.r.dispose();
  });
});
