// 씬 뷰의 타일맵 노드 (타일맵 확장의 createSceneNode). props.map이 가리키는 맵 파일을 읽어 레이어를 순서대로,
// 맵의 타일셋으로, 오브젝트 위치(왼쪽 위)에 그린다.
// 쌓는 순서는 엔진 씬 로더와 같다: 앞의 groundLayers 개 레이어는 ctx.below()에 (씬의 모든 오브젝트 아래, 타일맵보다
//   앞에 놓인 오브젝트도 그 위에 보인다), 나머지 레이어는 ctx.above()에 (모든 오브젝트 위). groundLayers가 레이어
//   수보다 크면 모두 아래다. 노드 자신(오브젝트 순서 자리)에는 테두리와 이름표만 둔다.
//
// 그리기: 맵 뷰(MapRenderer)처럼 레이어를 CHUNK_TILES 칸 덩어리로 나누고, 덩어리마다 칸 스프라이트를 모은 Container를
//   cacheAsTexture로 텍스처 한 장에 굽는다. 빈 덩어리는 만들지 않는다.
// 다시 그리기: 맵 파일이나 타일셋 그림이 바뀌면(MapFileCache의 changed) 새로 읽어 다 읽은 뒤에 바꿔 끼운다.
//   props가 바뀌면 씬 렌더러가 노드를 새로 만든다.
// 맵을 고르지 않았거나 읽지 못하면 이름표가 붙은 자리표시 상자를 그린다.

import type { SceneObject } from "@initial-editor/core";
import { readTilemapProps } from "@initial-editor/ext-tilemap";
import type { MapData } from "@initial-editor/ext-tilemap/model";
import { Container, Graphics, Sprite } from "pixi.js";
import { CHUNK_TILES, chunkCells, chunkGrid } from "../maps/mapGeometry";
import type { MapFileCache } from "./mapFiles";
import type { SceneNodeContext } from "./SceneRenderer";
import type { LoadedTexture } from "./textures";
import { TileFrameCache, tileFrame, type SheetSize } from "./tileFrames";

export const TILEMAP_PLACEHOLDER_SIZE = 48;

export interface ChunkPlan {
  layer: number;
  /** 덩어리의 맵 안 픽셀 위치 */
  x: number;
  y: number;
  /** 덩어리 안 픽셀 위치와 gid */
  tiles: Array<{ x: number; y: number; gid: number }>;
}

export interface TilemapPlan {
  pixelWidth: number;
  pixelHeight: number;
  /** 레이어 순서, 레이어 안에서는 덩어리 순서. 빈 덩어리는 없다 */
  chunks: ChunkPlan[];
  drawn: number;
  /** 타일셋 밖이거나 그림을 읽지 못해 그리지 못한 칸 */
  skipped: number;
}

/** 아래에 그릴 레이어 수 (엔진 scene_types/tilemap의 groundLayers: 레이어 수를 넘지 않는다) */
export function groundLayerCount(groundLayers: number, layerCount: number): number {
  return Math.max(0, Math.min(Math.floor(groundLayers), layerCount));
}

/** 맵을 덩어리별로 그릴 칸 목록으로 (PIXI 없이) */
export function planTilemap(map: MapData, sheets: ReadonlyArray<SheetSize | null>, chunkSize = CHUNK_TILES): TilemapPlan {
  const tw = map.tileWidth;
  const th = map.tileHeight;
  const grid = chunkGrid(map, chunkSize);
  const valid = new Map<number, boolean>();
  const chunks: ChunkPlan[] = [];
  let drawn = 0;
  let skipped = 0;
  map.layers.forEach((layer, index) => {
    for (let c = 0; c < grid.cols * grid.rows; c++) {
      const r = chunkCells(c, map, grid);
      const tiles: ChunkPlan["tiles"] = [];
      for (let y = r.y0; y < r.y0 + r.h; y++) {
        for (let x = r.x0; x < r.x0 + r.w; x++) {
          const gid = layer.data[y * map.width + x];
          if (!(gid > 0)) continue;
          let ok = valid.get(gid);
          if (ok === undefined) {
            ok = tileFrame(map.tilesets, sheets, gid, tw, th) !== null;
            valid.set(gid, ok);
          }
          if (!ok) {
            skipped++;
            continue;
          }
          tiles.push({ x: (x - r.x0) * tw, y: (y - r.y0) * th, gid });
        }
      }
      if (tiles.length === 0) continue;
      drawn += tiles.length;
      chunks.push({ layer: index, x: r.x0 * tw, y: r.y0 * th, tiles });
    }
  });
  return { pixelWidth: map.width * tw, pixelHeight: map.height * th, chunks, drawn, skipped };
}

export interface TilemapNodeDeps {
  maps: Pick<MapFileCache, "load" | "events">;
}

/** 타일맵 오브젝트의 노드. 읽기는 비동기이고, 다 그리면 ctx.setBounds로 맵 크기를 배경 대상으로 알린다 */
export function createTilemapNode(deps: TilemapNodeDeps, object: SceneObject, ctx: SceneNodeContext): Container {
  const root = new Container({ label: `tilemap:${object.id}` });
  new TilemapNode(deps, object, ctx, root).start();
  return root;
}

class TilemapNode {
  private run = 0;
  private disposed = false;
  private frames: TileFrameCache | null = null;
  /** 바뀌면 다시 그릴 경로: 맵 파일과 그 타일셋 그림 */
  private watched = new Set<string>();
  private stopWatching: (() => void) | null = null;
  private groundLayers = 1;
  /** ctx.below(), ctx.above()에 붙인 타일 묶음 */
  private tiles: Container[] = [];

  constructor(
    private readonly deps: TilemapNodeDeps,
    private readonly object: SceneObject,
    private readonly ctx: SceneNodeContext,
    private readonly root: Container,
  ) {}

  start(): void {
    this.root.once("destroyed", () => this.dispose());
    const { map, groundLayers } = readTilemapProps(this.object.props);
    this.groundLayers = groundLayers;
    if (!map) {
      this.placeholder("맵 없음", this.ctx.colors["fg-muted"]);
      return;
    }
    this.stopWatching = this.deps.maps.events.on("changed", (path) => {
      if (this.watched.has(path)) void this.load(map);
    });
    this.placeholder("읽는 중", this.ctx.colors["fg-muted"]);
    void this.load(map);
  }

  private stale(run: number): boolean {
    return this.disposed || run !== this.run;
  }

  private async load(path: string): Promise<void> {
    const run = ++this.run;
    this.watched = new Set([path]);
    let map: MapData;
    try {
      map = await this.deps.maps.load(path);
    } catch (e) {
      if (!this.stale(run)) this.placeholder(`${path}: ${(e as Error).message}`, this.ctx.colors.danger);
      return;
    }
    if (this.stale(run)) return;
    for (const t of map.tilesets) this.watched.add(t.image);
    const errors: string[] = [];
    const sheets = await Promise.all(
      map.tilesets.map((t) =>
        this.ctx.loadTexture(t.image).then(
          (loaded): LoadedTexture | null => loaded,
          (e: Error) => {
            errors.push(`타일셋을 읽지 못했다: ${t.image} (${e.message})`);
            return null;
          },
        ),
      ),
    );
    if (this.stale(run)) return;
    this.build(map, sheets, errors);
  }

  private build(map: MapData, sheets: Array<LoadedTexture | null>, errors: string[]): void {
    const plan = planTilemap(map, sheets);
    const frames = new TileFrameCache(map.tilesets, sheets, map.tileWidth, map.tileHeight);
    const ground = groundLayerCount(this.groundLayers, map.layers.length);
    const below = new Container({ label: "tiles-below" });
    const above = new Container({ label: "tiles-above" });
    for (const ch of plan.chunks) {
      const chunk = new Container({ label: `chunk:${ch.layer}` });
      chunk.position.set(ch.x, ch.y);
      for (const t of ch.tiles) {
        const tex = frames.get(t.gid);
        if (!tex) continue;
        const s = new Sprite(tex);
        s.position.set(t.x, t.y);
        chunk.addChild(s);
      }
      chunk.cacheAsTexture({ scaleMode: "nearest", antialias: false });
      (ch.layer < ground ? below : above).addChild(chunk);
    }
    this.clear();
    this.frames = frames;
    for (const [part, at] of [
      [below, () => this.ctx.below()],
      [above, () => this.ctx.above()],
    ] as const) {
      // 빈 쪽은 자리를 만들지 않는다
      if (part.children.length === 0) {
        part.destroy();
        continue;
      }
      at().addChild(part);
      this.tiles.push(part);
    }
    const notes = [...errors];
    if (plan.skipped > 0) notes.push(`타일셋 밖의 칸 ${plan.skipped}`);
    if (plan.drawn === 0 && errors.length === 0) notes.push("빈 맵");
    if (notes.length > 0) {
      const color = errors.length > 0 || plan.skipped > 0 ? this.ctx.colors.danger : this.ctx.colors["fg-muted"];
      const g = new Graphics();
      g.rect(0, 0, plan.pixelWidth, plan.pixelHeight).stroke({ width: 1, color, pixelLine: true });
      const label = this.ctx.makeLabel(`${this.object.type}: ${this.object.id} (${notes.join(", ")})`, color);
      label.position.set(0, plan.pixelHeight + 2);
      this.root.addChild(g, label);
    }
    // 맵 전체가 경계다. 씬을 덮으므로 배경 대상으로 (누르면 상자 선택, 누르고 놓으면 고른다)
    this.ctx.setBounds({ x: 0, y: 0, w: plan.pixelWidth, h: plan.pixelHeight }, { background: true });
  }

  /** 이름표가 붙은 상자 (씬 렌더러의 확장 자리표시와 같은 모양) */
  private placeholder(reason: string, color: number): void {
    this.clear();
    const size = TILEMAP_PLACEHOLDER_SIZE;
    const g = new Graphics();
    g.rect(0, 0, size, size).stroke({ width: 1, color, pixelLine: true });
    const label = this.ctx.makeLabel(`${this.object.type}: ${this.object.id} (${reason})`, color);
    label.position.set(0, size + 2);
    this.root.addChild(g, label);
    this.ctx.setBounds({ x: 0, y: 0, w: size, h: size });
  }

  private clear(): void {
    for (const child of this.root.removeChildren()) child.destroy({ children: true });
    this.dropTiles();
    this.frames?.destroy();
    this.frames = null;
  }

  private dropTiles(): void {
    for (const part of this.tiles.splice(0)) if (!part.destroyed) part.destroy({ children: true });
  }

  private dispose(): void {
    this.disposed = true;
    this.stopWatching?.();
    this.stopWatching = null;
    this.dropTiles();
    this.frames?.destroy();
    this.frames = null;
  }
}
