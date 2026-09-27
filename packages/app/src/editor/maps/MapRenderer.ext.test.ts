// @vitest-environment jsdom
// 맵 렌더러의 확장 레이어 자리 (WebGL 없이): 레이어마다 Container 와 뷰, 순서, 보이기와 흐리기, 줌과 테마의 redraw,
// 도구의 키(Ctrl+C 가 전역 단축키에 닿지 않는다)와 더블클릭, 등록을 거두면 뷰와 도구를 버린다.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentRegistry, Emitter, MemoryBackend } from "@initial-editor/core";
import { TilemapContrib } from "@initial-editor/ext-tilemap";
import { MapDocument, parseMap } from "@initial-editor/ext-tilemap/model";
import { Container, TextureSource } from "pixi.js";
import { fakeLayer } from "./__fixtures__/fakeLayer";
import { MAP_COLOR_TOKENS } from "./mapColors";
import { EXT_DIM_ALPHA, MapRenderer } from "./MapRenderer";
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
    marks: [{ id: "a", x: 1, y: 1 }],
  });
}

interface Internals {
  app: unknown;
  host: HTMLElement | null;
  extRoot: Container;
  world: Container;
  labelRoot: Container;
  installDom(host: HTMLElement, canvas: HTMLCanvasElement): void;
  installReactions(): void;
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
  const under = fakeLayer({ id: "test.under", label: "아래", section: "under" });
  contrib.registerMapLayer(marks.spec);
  contrib.registerMapLayer(under.spec);
  const doc = new MapDocument(new MemoryBackend(), PATH, parseMap(mapText()));
  documents.open(doc);
  const source = new TextureSource({ width: 32, height: 32 });
  const loads: string[] = [];
  const textures = {
    load: async (path: string) => {
      loads.push(path);
      return { texture: { source }, width: 32, height: 32 };
    },
    events: new Emitter<{ invalidated: string }>(),
  };
  const full = (over: Record<string, number>) => ({ ...Object.fromEntries(MAP_COLOR_TOKENS.map((t) => [t, 0])), ...over });
  let colors: Record<string, number> = full({ accent: 0x112233, fg: 0xeeeeee });
  const r = new MapRenderer({
    document: doc,
    textures: textures as never,
    view: new MapViewState(),
    theme: () => ({ colors, fonts: { "font-ui": "sans-serif", "font-mono": "monospace" } }) as never,
    layers: () => contrib.orderedLayers(),
  });
  const internals = r as unknown as Internals;
  return { documents, contrib, marks, under, doc, r, internals, loads, full, setColors: (c: Record<string, number>) => (colors = full(c)) };
}

describe("확장 레이어 자리", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("상태가 붙은 레이어마다 Container 를 order 순으로 두고 뷰를 만든다. extRoot 는 오브젝트 글자 위다", async () => {
    const f = setup();
    f.internals.installReactions();
    expect(f.internals.extRoot.children.map((c) => c.label)).toEqual(["ext:test.under", "ext:test.marks"]);
    expect(f.marks.log.views).toHaveLength(1);
    const ctx = f.marks.log.views[0].ctx;
    expect(ctx.document).toBe(f.doc);
    expect(ctx.container).toBe(f.internals.extRoot.children[1]);
    expect(ctx.zoom()).toBe(1);
    expect(ctx.color("accent")).toBe(0x112233);
    expect(ctx.color("모르는 토큰")).toBe(0xeeeeee);
    expect(ctx.font("font-ui")).toBe("sans-serif");
    const tex = await ctx.loadTexture("resources/charsets/npc.png");
    expect([tex.width, tex.height]).toEqual([32, 32]);
    expect(f.loads).toEqual(["resources/charsets/npc.png"]);
    f.r.dispose();
  });

  it("월드의 겹에서 extRoot 는 오브젝트 글자(labelRoot) 바로 위, 붓 미리보기 아래다", () => {
    const f = setup();
    const internals = f.internals as unknown as { world: Container; labelRoot: Container; extRoot: Container; ghost: Container; stackWorld(): void };
    internals.stackWorld();
    const kids = internals.world.children;
    expect(kids.indexOf(internals.extRoot)).toBe(kids.indexOf(internals.labelRoot) + 1);
    expect(kids.indexOf(internals.ghost)).toBe(kids.indexOf(internals.extRoot) + 1);
    f.r.dispose();
  });

  it("눈을 끄면 숨고, 대상이 그 레이어일 때만 불투명이다", () => {
    const f = setup();
    f.internals.installReactions();
    const [under, marks] = f.internals.extRoot.children;
    expect([under.alpha, marks.alpha]).toEqual([EXT_DIM_ALPHA, EXT_DIM_ALPHA]);
    f.doc.setTarget({ kind: "ext", id: "test.marks" });
    expect([under.alpha, marks.alpha]).toEqual([EXT_DIM_ALPHA, 1]);
    f.doc.toggleExtLayer("test.under");
    expect(under.visible).toBe(false);
    f.doc.toggleExtLayer("test.under");
    expect(under.visible).toBe(true);
    f.r.dispose();
  });

  it("줌과 테마가 바뀌면 뷰의 redraw 를 부른다", () => {
    const f = setup();
    f.internals.installReactions();
    const view = f.marks.log.views[0];
    f.r.setZoom(2);
    expect(view.redraws).toBe(1);
    expect(view.ctx.zoom()).toBe(2);
    f.r.setTheme({ colors: f.full({ accent: 0x445566 }), fonts: { "font-ui": "serif" } } as never);
    expect(view.redraws).toBe(2);
    expect(view.ctx.color("accent")).toBe(0x445566);
    expect(view.ctx.font("font-ui")).toBe("serif");
    f.r.dispose();
  });

  it("등록을 거두거나 렌더러를 버리면 뷰와 도구와 Container 를 버린다. 다시 등록하면 새로 만든다", () => {
    const f = setup();
    f.internals.installReactions();
    f.doc.setTarget({ kind: "ext", id: "test.under" });
    expect(f.r.layerTool("test.under")).not.toBeNull();
    const underView = f.under.log.views[0];
    const underTool = f.under.log.tools[0];
    // 문서에서 떼면 (등록을 거두는 것과 같다) 뷰와 도구를 버린다
    f.doc.detachLayer("test.under");
    expect(underView.disposed).toBe(true);
    expect(underTool.disposed).toBe(true);
    expect(f.internals.extRoot.children.map((c) => c.label)).toEqual(["ext:test.marks"]);
    expect(f.doc.target).toEqual({ kind: "objects" });
    f.doc.refreshLayer(f.under.spec);
    expect(f.under.log.views).toHaveLength(2);
    expect(f.internals.extRoot.children.map((c) => c.label)).toEqual(["ext:test.under", "ext:test.marks"]);
    f.doc.setTarget({ kind: "ext", id: "test.under" });
    expect(f.r.layerTool("test.under")).not.toBeNull();
    expect(f.under.log.tools).toHaveLength(2);
    f.r.dispose();
    expect(f.marks.log.views[0].disposed).toBe(true);
    expect(f.under.log.views[1].disposed).toBe(true);
    expect(f.under.log.tools[1].disposed).toBe(true);
  });

  it("레이어 도구가 받은 Ctrl+C 는 뷰에서 멈춰 전역 단축키에 닿지 않고, 받지 않은 키는 지나간다. 더블클릭은 도구로 간다", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const f = setup();
    const app = fakeApp();
    const host = document.createElement("div");
    host.tabIndex = 0;
    document.body.append(host);
    host.appendChild(app.canvas);
    f.internals.app = app;
    f.internals.host = host;
    f.internals.installDom(host, app.canvas);
    f.internals.installReactions();
    f.doc.setTarget({ kind: "ext", id: "test.marks" });
    const global: string[] = [];
    const onWindow = (e: KeyboardEvent) => global.push(`${e.ctrlKey ? "Ctrl+" : ""}${e.key}`);
    window.addEventListener("keydown", onWindow);
    try {
      const copy = new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true });
      host.dispatchEvent(copy);
      expect(copy.defaultPrevented).toBe(true);
      const paste = new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true, cancelable: true });
      host.dispatchEvent(paste);
      expect(paste.defaultPrevented).toBe(false);
      expect(global).toEqual(["Ctrl+v"]);
      expect(f.marks.log.keys.map((k) => [k.key, k.mod])).toEqual([
        ["c", true],
        ["v", true],
      ]);
      app.canvas.dispatchEvent(new MouseEvent("dblclick", { clientX: 20, clientY: 40, button: 0, bubbles: true }));
      expect(f.marks.log.pointers.map(([kind]) => kind)).toEqual(["double"]);
    } finally {
      window.removeEventListener("keydown", onWindow);
      f.r.dispose();
    }
  });
});
