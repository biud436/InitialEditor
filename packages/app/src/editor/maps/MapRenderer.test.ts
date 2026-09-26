// @vitest-environment jsdom
// 맵 렌더러의 입력과 상태 (WebGL 없이). PIXI 앱 대신 캔버스와 렌더러 흉내를 넣고 비공개 단계를 직접 부른다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Emitter, MemoryBackend } from "@initial-editor/core";
import { MapDocument, parseMap } from "@initial-editor/ext-tilemap/model";
import { Container, TextureSource } from "pixi.js";
import { MapRenderer } from "./MapRenderer";
import { MapViewState } from "./mapViewState";

// jsdom에는 캔버스 2D가 없다. PIXI가 불러올 때 캔버스를 시험하므로 조용히 null을 준다
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

function mapText(gid: number): string {
  return JSON.stringify({
    version: 2,
    name: "t",
    width: 4,
    height: 2,
    tileWidth: 16,
    tileHeight: 16,
    layers: [{ name: "ground", data: [1, 1, 1, gid, 1, 1, 1, 1] }],
    tilesets: [{ image: "resources/tiles/t.png", firstGid: 1, columns: 8 }],
  });
}

/** 비공개 멤버를 테스트에서만 들여다본다 */
interface Internals {
  app: unknown;
  host: HTMLElement | null;
  layers: Array<{ container: Container; chunks: Map<number, { rt: unknown }> }>;
  spaceHeld: boolean;
  installDom(host: HTMLElement, canvas: HTMLCanvasElement): void;
  installReactions(): void;
  loadTilesets(): void;
  frame(): void;
  grid: { cols: number; rows: number; size: number };
  needGrid: boolean;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function makeRenderer(gid = 1) {
  const backend = new MemoryBackend();
  const doc = new MapDocument(backend, "resources/maps/t.json", parseMap(mapText(gid)));
  const source = new TextureSource({ width: 128, height: 128 });
  const textures = { load: async () => ({ texture: { source }, width: 128, height: 128 }), events: new Emitter<{ invalidated: string }>() };
  const notices: string[] = [];
  const r = new MapRenderer({
    document: doc,
    textures: textures as never,
    view: new MapViewState(),
    theme: () => ({ colors: new Proxy({}, { get: () => 0 }), fonts: new Proxy({}, { get: () => "sans-serif" }) }) as never,
    onNotice: (m) => notices.push(m),
  });
  const internals = r as unknown as Internals;
  return { doc, r, internals, backend, notices };
}

/** PIXI 앱 흉내: 캔버스와 아무것도 그리지 않는 렌더러 */
function fakeApp() {
  const canvas = document.createElement("canvas");
  canvas.setPointerCapture = () => {};
  canvas.releasePointerCapture = () => {};
  canvas.hasPointerCapture = () => false;
  return { canvas, renderer: { width: 1, height: 1, resize: () => {}, render: () => {}, background: { color: 0 } }, destroy: () => {} };
}

function stubResizeObserver(): void {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
}

function pointer(type: string, x: number, y: number, button = 0): Event {
  const e = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true, cancelable: true });
  Object.defineProperty(e, "pointerId", { value: 1 });
  return e;
}

describe("MapRenderer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("크기를 바꾸면(reset) 덩어리 격자를 새 크기로 짓고 격자 선을 다시 그린다. 되돌려도 같다", () => {
    const { doc, r, internals } = makeRenderer();
    internals.app = fakeApp();
    internals.installReactions();
    internals.frame();
    expect(internals.needGrid).toBe(false);
    const cols = internals.grid.cols;
    doc.apply(doc.model.resize(internals.grid.size * 3, 2));
    expect(internals.needGrid).toBe(true);
    expect(internals.grid.cols).toBe(3);
    internals.frame();
    expect(internals.needGrid).toBe(false);
    doc.undo.undo();
    expect(internals.needGrid).toBe(true);
    expect(internals.grid.cols).toBe(cols);
    r.dispose();
  });

  it("줌이 100%를 넘나들면 이미 만든 덩어리 텍스처의 거르기를 다시 건다", () => {
    const { r, internals } = makeRenderer();
    const rt = { source: { scaleMode: "nearest", style: { update: vi.fn() } } };
    internals.layers = [{ container: new Container(), chunks: new Map([[0, { rt }]]) }];
    r.setZoom(0.5);
    expect(rt.source.scaleMode).toBe("linear");
    expect(rt.source.style.update).toHaveBeenCalledTimes(1);
    r.setZoom(2);
    expect(rt.source.scaleMode).toBe("nearest");
    expect(rt.source.style.update).toHaveBeenCalledTimes(2);
  });

  it("초점이 팔레트에 있어도 포인터가 캔버스 위면 Space+끌기는 팬이다", () => {
    stubResizeObserver();
    const { doc, r, internals } = makeRenderer();
    const app = fakeApp();
    const host = document.createElement("div");
    host.tabIndex = 0;
    const palette = document.createElement("div");
    palette.tabIndex = -1;
    document.body.append(palette, host);
    host.appendChild(app.canvas);
    internals.app = app;
    internals.host = host;
    internals.installDom(host, app.canvas);
    const down = vi.spyOn(r.tools, "pointerDown");

    palette.focus();
    expect(document.activeElement).toBe(palette);
    app.canvas.dispatchEvent(pointer("pointermove", 20, 20));
    palette.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    app.canvas.dispatchEvent(pointer("pointerdown", 20, 20));
    const panX = r.transform.panX;
    app.canvas.dispatchEvent(pointer("pointermove", 60, 20));
    app.canvas.dispatchEvent(pointer("pointerup", 60, 20));

    expect(down).not.toHaveBeenCalled();
    expect(r.transform.panX).toBe(panX + 40);
    expect(doc.undo.depth).toBe(0);

    // Space를 떼면 다시 도구다
    window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
    expect(internals.spaceHeld).toBe(false);
    app.canvas.dispatchEvent(pointer("pointerdown", 20, 20));
    expect(down).toHaveBeenCalledTimes(1);
    app.canvas.dispatchEvent(pointer("pointerup", 20, 20));
    r.dispose();
  });

  it("포인터가 캔버스 밖이고 뷰에 초점이 없으면 Space를 가져가지 않는다", () => {
    stubResizeObserver();
    const { internals, r } = makeRenderer();
    const app = fakeApp();
    const host = document.createElement("div");
    const input = document.createElement("input");
    document.body.append(input, host);
    internals.app = app;
    internals.host = host;
    internals.installDom(host, app.canvas);
    const e = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    input.dispatchEvent(e);
    expect(internals.spaceHeld).toBe(false);
    expect(e.defaultPrevented).toBe(false);
    // 캔버스 위라도 입력 칸의 Space는 글자다
    app.canvas.dispatchEvent(pointer("pointermove", 5, 5));
    input.focus();
    const typed = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    input.dispatchEvent(typed);
    expect(internals.spaceHeld).toBe(false);
    expect(typed.defaultPrevented).toBe(false);
    r.dispose();
  });

  it("대상 레이어를 숨기면 커서가 바로 금지 모양이 되고, 칠하려 하면 알린다", () => {
    const { doc, r, internals, notices } = makeRenderer();
    internals.installReactions();
    const at = { world: { x: 8, y: 8 }, button: 0, shift: false, alt: false };
    r.tools.pointerMove(at);
    expect(r.tools.cursor).toBe("crosshair");
    doc.toggleLayer(0);
    expect(r.tools.cursor).toBe("not-allowed");
    expect(r.tools.preview).toEqual({ kind: "none" });
    r.tools.pointerDown(at);
    r.tools.pointerUp(at);
    expect(notices.length).toBe(1);
    expect(doc.undo.depth).toBe(0);
    doc.toggleLayer(0);
    expect(r.tools.cursor).toBe("crosshair");
    r.dispose();
  });

  it("타일셋 밖의 gid 경고는 칸을 고치거나 다시 읽으면 다시 센다", async () => {
    const { doc, r, internals, backend } = makeRenderer(999);
    await backend.open("/p");
    await backend.writeText("resources/maps/t.json", mapText(999));
    internals.app = fakeApp();
    internals.installReactions();
    internals.loadTilesets();
    await tick();
    await tick();
    expect(r.status.warning).toBe("타일셋 밖의 gid 1칸");
    doc.apply(doc.model.paintCells(0, [{ index: 3, value: 0 }]));
    internals.frame();
    expect(r.status.warning).toBeNull();
    // 밖에서 다시 나쁜 gid를 쓰고 다시 읽는다 (타일셋은 같다)
    doc.markSaved();
    await backend.writeText("resources/maps/t.json", mapText(999));
    await doc.reload();
    internals.frame();
    expect(r.status.warning).toBe("타일셋 밖의 gid 1칸");
    r.dispose();
  });
});
