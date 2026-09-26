// @vitest-environment jsdom
// 씬 뷰의 타일맵 노드 (WebGL 없이). 텍스처 캐시와 렌더러 흉내를 ctx로 넣고 PIXI 노드의 모양을 본다.
// ctx.below()와 ctx.above()는 렌더러의 아래 자리와 위 자리 흉내다 (타일은 노드가 아니라 거기에 붙는다).
import { Emitter, makeObject, MemoryBackend, type SceneObject } from "@initial-editor/core";
import { parseMap } from "@initial-editor/ext-tilemap/model";
import { Container, Sprite, TextureSource } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { MapFileCache } from "./mapFiles";
import type { SceneNodeContext } from "./SceneRenderer";
import { tileFrame, TileFrameCache } from "./tileFrames";
import { createTilemapNode, groundLayerCount, planTilemap, TILEMAP_PLACEHOLDER_SIZE } from "./tilemapNode";

// jsdom 에는 캔버스 2D가 없다. PIXI가 불러올 때 캔버스를 시험하므로 조용히 null을 준다
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

const MAP_PATH = "resources/maps/m.json";
const SHEET = "resources/tiles/t.png";

/** 4x2 칸, 타일셋 한 장(4열 2행 = 64x32) */
function mapText(ground: number[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 2,
    name: "m",
    width: 4,
    height: 2,
    tileWidth: 16,
    tileHeight: 16,
    layers: [
      { name: "ground", data: ground },
      { name: "deco", data: [0, 0, 0, 0, 0, 5, 0, 0] },
    ],
    tilesets: [{ image: SHEET, firstGid: 1, columns: 4 }],
    ...extra,
  });
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function setup(
  files: Record<string, string> = { [MAP_PATH]: mapText([1, 2, 3, 4, 5, 6, 7, 8]) },
  props: Record<string, unknown> = { map: MAP_PATH, groundLayers: 1 },
  failingSheets: string[] = [],
) {
  const backend = new MemoryBackend(files);
  await backend.open("/p");
  const maps = new MapFileCache(() => backend);
  const source = new TextureSource({ width: 64, height: 32 });
  const failing = new Set<string>(failingSheets);
  const loads: string[] = [];
  const labels: Container[] = [];
  const bounds: Array<{ x: number; y: number; w: number; h: number }> = [];
  /** setBounds마다 배경 대상이었는가 */
  const backgrounds: boolean[] = [];
  const below = new Container({ label: "below" });
  const above = new Container({ label: "above" });
  const ctx: SceneNodeContext = {
    loadTexture: async (p) => {
      loads.push(p);
      if (failing.has(p)) throw new Error("없다");
      return { texture: { source } as never, width: 64, height: 32 };
    },
    colors: new Proxy({}, { get: (_t, k) => (k === "danger" ? 0xff0000 : 0x888888) }) as never,
    fonts: new Proxy({}, { get: () => "sans-serif" }) as never,
    document: null as never,
    makeLabel: (text) => {
      const c = new Container({ label: text });
      labels.push(c);
      return c;
    },
    setBounds: (b, opts) => {
      bounds.push(b);
      backgrounds.push(opts?.background === true);
    },
    below: () => below,
    above: () => above,
  };
  const object: SceneObject = makeObject("tilemap", "tilemap1", props, { x: 32, y: 48 });
  const root = createTilemapNode({ maps }, object, ctx);
  /** 노드와 아래, 위 자리의 스프라이트 전부 */
  const all = () => [...sprites(below), ...sprites(root), ...sprites(above)];
  return { backend, maps, ctx, root, below, above, all, labels, bounds, backgrounds, loads };
}

function sprites(root: Container): Sprite[] {
  const out: Sprite[] = [];
  const visit = (c: Container) => {
    for (const child of c.children) {
      if (child instanceof Sprite) out.push(child);
      else visit(child);
    }
  };
  visit(root);
  return out;
}

/** 자리에 붙은 타일 묶음의 덩어리들 */
function chunks(part: Container): Container[] {
  return part.children.flatMap((tiles) => tiles.children) as Container[];
}

describe("타일 자리", () => {
  const tilesets = [{ image: SHEET, firstGid: 1, columns: 4, extra: {} }];

  it("gid를 그림 속 자리로. 빈 칸, 타일셋 밖, 그림 밖, 못 읽은 그림은 null", () => {
    expect(tileFrame(tilesets, [{ width: 64, height: 32 }], 6, 16, 16)).toEqual({ tileset: 0, sx: 16, sy: 16 });
    expect(tileFrame(tilesets, [{ width: 64, height: 32 }], 0, 16, 16)).toBeNull();
    expect(tileFrame(tilesets, [{ width: 64, height: 32 }], 9, 16, 16)).toBeNull();
    expect(tileFrame(tilesets, [{ width: 64, height: 16 }], 6, 16, 16)).toBeNull();
    expect(tileFrame(tilesets, [null], 1, 16, 16)).toBeNull();
  });

  it("잘린 텍스처는 gid마다 한 번만 만들고, 놓아도 원본은 남는다", () => {
    const source = new TextureSource({ width: 64, height: 32 });
    const cache = new TileFrameCache(tilesets, [{ texture: { source }, width: 64, height: 32 }], 16, 16);
    const a = cache.get(6)!;
    expect(a.frame.x).toBe(16);
    expect(a.frame.y).toBe(16);
    expect(cache.get(6)).toBe(a);
    expect(cache.get(99)).toBeNull();
    cache.destroy();
    expect(source.destroyed).toBe(false);
  });
});

describe("타일맵 그리기 계획", () => {
  it("레이어 순서로 덩어리를 나누고 빈 덩어리와 그릴 수 없는 칸은 뺀다", () => {
    const map = parseMap(mapText([1, 2, 0, 0, 5, 6, 0, 99]));
    const plan = planTilemap(map, [{ width: 64, height: 32 }], 2);
    expect(plan.pixelWidth).toBe(64);
    expect(plan.pixelHeight).toBe(32);
    // ground: 왼쪽 덩어리(1,2,5,6), 오른쪽 덩어리는 99 뿐이라 빠진다. deco: 5 한 칸 (x=1, y=1)
    expect(plan.chunks.map((c) => [c.layer, c.x, c.y, c.tiles.length])).toEqual([
      [0, 0, 0, 4],
      [1, 0, 0, 1],
    ]);
    expect(plan.chunks[1].tiles[0]).toEqual({ x: 16, y: 16, gid: 5 });
    expect(plan.drawn).toBe(5);
    expect(plan.skipped).toBe(1);
  });

  it("오른쪽 아래 덩어리의 칸은 덩어리 안 좌표다", () => {
    const map = parseMap(mapText([0, 0, 0, 0, 0, 0, 0, 3]));
    const plan = planTilemap(map, [{ width: 64, height: 32 }], 2);
    expect(plan.chunks[0]).toMatchObject({ layer: 0, x: 32, y: 0 });
    expect(plan.chunks[0].tiles).toEqual([{ x: 16, y: 16, gid: 3 }]);
  });

  it("타일셋 그림을 못 읽었으면 그 칸은 모두 건너뛴다", () => {
    const plan = planTilemap(parseMap(mapText([1, 2, 3, 4, 5, 6, 7, 8])), [null]);
    expect(plan.chunks).toEqual([]);
    expect(plan.skipped).toBe(9);
  });
});

describe("타일맵 노드", () => {
  it("맵을 고르지 않았으면 이름표 상자다", async () => {
    const { all, labels, bounds, backgrounds, loads } = await setup({}, { map: "", groundLayers: 1 });
    expect(labels.map((l) => l.label)).toEqual(["tilemap: tilemap1 (맵 없음)"]);
    expect(bounds).toEqual([{ x: 0, y: 0, w: TILEMAP_PLACEHOLDER_SIZE, h: TILEMAP_PLACEHOLDER_SIZE }]);
    // 자리표시 상자는 보통 대상이다 (누르면 고르고 끈다)
    expect(backgrounds).toEqual([false]);
    expect(all()).toHaveLength(0);
    expect(loads).toEqual([]);
  });

  it("맵의 레이어를 타일셋으로 그리고 맵 크기를 배경 대상의 경계로 알린다", async () => {
    const { root, below, above, labels, bounds, backgrounds, loads } = await setup();
    expect(labels.at(-1)?.label).toBe("tilemap: tilemap1 (읽는 중)");
    await tick();
    expect(loads).toEqual([SHEET]);
    // groundLayers 1: ground(8칸)는 아래 자리에, deco(1칸)는 위 자리에. 노드 자신에는 타일이 없다
    const ground = sprites(below);
    expect(ground).toHaveLength(8);
    expect(sprites(above)).toHaveLength(1);
    expect(sprites(root)).toHaveLength(0);
    // ground의 둘째 칸 (gid 2)은 (16, 0)에, 그림 속 (16, 0)을 쓴다
    expect(ground[1].position.x).toBe(16);
    expect(ground[1].texture.frame.x).toBe(16);
    expect(bounds.at(-1)).toEqual({ x: 0, y: 0, w: 64, h: 32 });
    expect(backgrounds).toEqual([false, true]);
    // 레이어마다 덩어리 하나, 덩어리는 텍스처로 굽는다
    const cs = [...chunks(below), ...chunks(above)];
    expect(cs.map((c) => c.label)).toEqual(["chunk:0", "chunk:1"]);
    expect(cs.every((c) => c.isCachedAsTexture)).toBe(true);
    // 자리표시 이름표는 치웠다
    expect(root.children.some((c) => labels.includes(c as Container))).toBe(false);
  });

  it("엔진처럼 앞의 groundLayers 개 레이어만 아래 자리에, 나머지는 위 자리에 둔다", async () => {
    const layersOf = (part: Container) => chunks(part).map((c) => c.label);
    const none = await setup(undefined, { map: MAP_PATH, groundLayers: 0 });
    await tick();
    expect(layersOf(none.below)).toEqual([]);
    expect(layersOf(none.above)).toEqual(["chunk:0", "chunk:1"]);
    // 빈 쪽에는 묶음을 붙이지 않는다
    expect(none.below.children).toHaveLength(0);

    const both = await setup(undefined, { map: MAP_PATH, groundLayers: 2 });
    await tick();
    expect(layersOf(both.below)).toEqual(["chunk:0", "chunk:1"]);
    expect(both.above.children).toHaveLength(0);

    // 레이어 수보다 크면 모두 아래 (엔진은 레이어 수로 자른다)
    const more = await setup(undefined, { map: MAP_PATH, groundLayers: 5 });
    await tick();
    expect(layersOf(more.below)).toEqual(["chunk:0", "chunk:1"]);
    expect(more.above.children).toHaveLength(0);
  });

  it("아래에 그릴 레이어 수는 0 이상, 레이어 수 이하의 정수다", () => {
    expect(groundLayerCount(1, 2)).toBe(1);
    expect(groundLayerCount(0, 2)).toBe(0);
    expect(groundLayerCount(5, 2)).toBe(2);
    expect(groundLayerCount(1.7, 3)).toBe(1);
    expect(groundLayerCount(-1, 3)).toBe(0);
    expect(groundLayerCount(1, 0)).toBe(0);
  });

  it("맵 파일이 없거나 맵 형식이 아니면 이유가 붙은 이름표 상자다", async () => {
    const missing = await setup({});
    await tick();
    expect(missing.labels.at(-1)?.label).toMatch(/^tilemap: tilemap1 \(resources\/maps\/m\.json: /);
    expect(missing.bounds.at(-1)).toEqual({ x: 0, y: 0, w: TILEMAP_PLACEHOLDER_SIZE, h: TILEMAP_PLACEHOLDER_SIZE });

    const invalid = await setup({ [MAP_PATH]: '{"version": 9}' });
    await tick();
    expect(invalid.labels.at(-1)?.label).toMatch(/모르는 맵 버전이다: 9/);
    expect(invalid.all()).toHaveLength(0);
  });

  it("타일셋을 읽지 못하면 맵 테두리와 이유를 그린다", async () => {
    const s = await setup(undefined, undefined, [SHEET]);
    await tick();
    expect(s.all()).toHaveLength(0);
    expect(s.labels.at(-1)?.label).toMatch(/타일셋을 읽지 못했다: resources\/tiles\/t\.png \(없다\)/);
    expect(s.bounds.at(-1)).toEqual({ x: 0, y: 0, w: 64, h: 32 });
  });

  it("맵 파일이나 타일셋 그림이 바뀌면 다시 그리고, 다른 파일은 무시한다", async () => {
    const s = await setup();
    await tick();
    expect(s.all()).toHaveLength(9);
    const first = [...s.below.children, ...s.above.children];
    await s.backend.writeText(MAP_PATH, mapText([1, 0, 0, 0, 0, 0, 0, 0]));
    s.maps.fileChanged(MAP_PATH);
    await tick();
    expect(s.all()).toHaveLength(2);
    // 옛 타일 묶음은 치웠다
    expect(first.every((c) => c.destroyed)).toBe(true);
    expect(s.below.children).toHaveLength(1);
    expect(s.above.children).toHaveLength(1);

    s.maps.fileChanged("resources/tiles/other.png");
    await tick();
    expect(s.loads).toEqual([SHEET, SHEET]);

    s.maps.fileChanged(SHEET);
    await tick();
    expect(s.loads).toEqual([SHEET, SHEET, SHEET]);
    expect(s.all()).toHaveLength(2);

    // 맵 파일이 지워지면 이름표 상자
    await s.backend.remove(MAP_PATH);
    s.maps.fileChanged(MAP_PATH);
    await tick();
    expect(s.all()).toHaveLength(0);
    expect(s.below.children).toHaveLength(0);
    expect(s.above.children).toHaveLength(0);
    expect(s.labels.at(-1)?.label).toMatch(/resources\/maps\/m\.json: /);
  });

  it("빈 맵은 테두리와 '빈 맵' 이름표", async () => {
    const s = await setup({ [MAP_PATH]: JSON.stringify({ version: 2, width: 2, height: 1, tileWidth: 8, tileHeight: 8, tilesets: [], layers: [{ name: "a", data: [0, 0] }] }) });
    await tick();
    expect(s.labels.at(-1)?.label).toBe("tilemap: tilemap1 (빈 맵)");
    expect(s.bounds.at(-1)).toEqual({ x: 0, y: 0, w: 16, h: 8 });
  });

  it("노드를 버리면 듣기를 멈추고 늦게 끝난 읽기는 그리지 않는다", async () => {
    const s = await setup();
    const events = s.maps.events as Emitter<{ changed: string }>;
    expect(events.listenerCount("changed")).toBe(1);
    s.root.destroy({ children: true });
    expect(events.listenerCount("changed")).toBe(0);
    await tick();
    expect(s.bounds).toHaveLength(1);
    expect(s.all()).toHaveLength(0);
  });

  it("다 그린 노드를 버리면 아래와 위 자리에 붙인 타일도 치운다", async () => {
    const s = await setup();
    await tick();
    const parts = [...s.below.children, ...s.above.children];
    expect(parts).toHaveLength(2);
    s.root.destroy({ children: true });
    expect(parts.every((c) => c.destroyed)).toBe(true);
    expect(s.below.children).toHaveLength(0);
    expect(s.above.children).toHaveLength(0);
  });
});
