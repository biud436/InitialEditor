// @vitest-environment jsdom
// 맵 뷰의 타일 애니메이션 (WebGL 없이). 칸 스프라이트의 텍스처가 엔진과 같은 프레임을 가리키는지, 프레임이 바뀔 때만
// 그 덩어리를 다시 그리는지, 보기 설정을 끄면 게임을 시작할 때의 프레임으로 돌아가는지 본다.
import { describe, expect, it, vi } from "vitest";
import { Emitter, MemoryBackend } from "@initial-editor/core";
import { MapDocument, parseMap } from "@initial-editor/ext-tilemap/model";
import { TextureSource, type Sprite } from "pixi.js";
import { MapRenderer } from "./MapRenderer";
import { MapViewState } from "./mapViewState";

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

interface Internals {
  app: unknown;
  layers: Array<{ chunks: Map<number, { sprites: Array<Sprite | null> }> }>;
  installReactions(): void;
  frame(): void;
  advanceAnimation(ms: number): void;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// 8열 타일셋. 타일 1..2(gid 2..3)가 프레임 [1, 3, 5] 를 100ms 마다 돈다
function makeRenderer(animations: unknown) {
  const map = {
    version: 2,
    name: "t",
    width: 4,
    height: 1,
    tileWidth: 16,
    tileHeight: 16,
    layers: [{ name: "ground", data: [1, 2, 3, 8] }],
    tilesets: [{ image: "resources/tiles/t.png", firstGid: 1, columns: 8, animations }],
  };
  const doc = new MapDocument(new MemoryBackend(), "resources/maps/t.json", parseMap(JSON.stringify(map)));
  const source = new TextureSource({ width: 128, height: 128 });
  const textures = { load: async () => ({ texture: { source }, width: 128, height: 128 }), events: new Emitter<{ invalidated: string }>() };
  const view = new MapViewState();
  const r = new MapRenderer({
    document: doc,
    textures: textures as never,
    view,
    theme: () => ({ colors: new Proxy({}, { get: () => 0 }), fonts: new Proxy({}, { get: () => "sans-serif" }) }) as never,
  });
  const internals = r as unknown as Internals;
  const render = vi.fn();
  internals.app = { canvas: document.createElement("canvas"), renderer: { width: 1, height: 1, resize: () => {}, render, background: { color: 0 } }, destroy: () => {} };
  return { doc, r, internals, view, render };
}

/** 칸마다 스프라이트가 가리키는 타일셋 안의 번호 */
function shownLocals(internals: Internals): number[] {
  const sprites = internals.layers[0].chunks.get(0)!.sprites.slice(0, 4);
  return sprites.map((s) => (s ? s.texture.frame.x / 16 + (s.texture.frame.y / 16) * 8 : -1));
}

async function ready(animations: unknown) {
  const f = makeRenderer(animations);
  f.internals.installReactions();
  (f.internals as unknown as { loadTilesets(): void }).loadTilesets();
  await tick();
  f.internals.frame();
  return f;
}

const WATER = [{ tile: 1, count: 2, frames: [1, 3, 5], duration: 100 }];

describe("맵 뷰의 타일 애니메이션", () => {
  it("시계에 따라 범위의 칸이 프레임의 첫 타일 + i 를 그린다", async () => {
    const { r, internals } = await ready(WATER);
    expect(r.status.animations).toBe(1);
    expect(shownLocals(internals)).toEqual([0, 1, 2, 7]);
    internals.advanceAnimation(100);
    expect(shownLocals(internals)).toEqual([0, 3, 4, 7]);
    internals.advanceAnimation(150);
    expect(shownLocals(internals)).toEqual([0, 5, 6, 7]);
    internals.advanceAnimation(50);
    expect(shownLocals(internals)).toEqual([0, 1, 2, 7]);
    r.dispose();
  });

  it("프레임이 바뀔 때만 덩어리를 다시 그린다", async () => {
    const { r, internals, render } = await ready(WATER);
    const before = render.mock.calls.length;
    const renders = r.stats.chunkRenders;
    internals.advanceAnimation(40);
    internals.advanceAnimation(40);
    expect(render.mock.calls.length).toBe(before);
    internals.advanceAnimation(40);
    expect(render.mock.calls.length).toBe(before + 1);
    expect(r.stats.chunkRenders).toBe(renders + 1);
    r.dispose();
  });

  it("보기 설정을 끄면 시계 0 의 프레임으로 돌아가고 멈춘다. 켜면 처음부터 간다", async () => {
    const { r, internals, view } = await ready(WATER);
    internals.advanceAnimation(120);
    expect(shownLocals(internals)).toEqual([0, 3, 4, 7]);
    view.toggleAnimate();
    expect(shownLocals(internals)).toEqual([0, 1, 2, 7]);
    internals.advanceAnimation(500);
    expect(shownLocals(internals)).toEqual([0, 1, 2, 7]);
    view.toggleAnimate();
    internals.advanceAnimation(100);
    expect(shownLocals(internals)).toEqual([0, 3, 4, 7]);
    r.dispose();
  });

  it("칠한 칸이 범위에 들어오고 나가는 것을 따라간다", async () => {
    const { doc, r, internals } = await ready(WATER);
    internals.advanceAnimation(100);
    doc.apply(doc.model.paintCells(0, [{ index: 0, value: 2 }, { index: 1, value: 1 }]));
    internals.frame();
    expect(shownLocals(internals)).toEqual([3, 0, 4, 7]);
    internals.advanceAnimation(100);
    expect(shownLocals(internals)).toEqual([5, 0, 6, 7]);
    r.dispose();
  });

  it("게임에서 읽지 못하는 항목은 헤더 경고에 남고 그 항목은 재생하지 않는다", async () => {
    const { r, internals } = await ready([{ tile: 1, frames: [], duration: 100 }]);
    expect(r.status.animations).toBe(0);
    expect(r.status.warning).toContain("게임에서 읽지 못하는 타일 애니메이션 항목 1개");
    internals.advanceAnimation(100);
    expect(shownLocals(internals)).toEqual([0, 1, 2, 7]);
    r.dispose();
  });
});
