// 타일 gid를 타일셋 그림의 잘린 텍스처로 (씬 뷰의 타일맵 노드가 쓴다. 맵 뷰의 tileTexture와 같은 규칙).
//   - gid 0은 빈 칸. 어느 타일셋에도 속하지 않거나 칸이 그림 밖으로 나가면 그리지 않는다
//   - 타일셋 그림을 읽지 못했으면(null) 그 타일셋의 칸도 그리지 않는다
// 잘린 텍스처는 gid마다 한 번만 만든다. 원본(TextureSource)은 텍스처 캐시의 것이라 놓지 않는다.

import { tileSource, type Tileset } from "@initial-editor/ext-tilemap/model";
import { Rectangle, Texture, type TextureSource } from "pixi.js";

export interface SheetSize {
  width: number;
  height: number;
}

export interface TileFrame {
  tileset: number;
  sx: number;
  sy: number;
}

/** gid의 그림 속 자리. 그릴 수 없으면 null */
export function tileFrame(tilesets: readonly Tileset[], sheets: ReadonlyArray<SheetSize | null>, gid: number, tileWidth: number, tileHeight: number): TileFrame | null {
  const src = tileSource(tilesets, gid, tileWidth, tileHeight);
  if (!src) return null;
  const sheet = sheets[src.tilesetIndex];
  if (!sheet || src.sx + tileWidth > sheet.width || src.sy + tileHeight > sheet.height) return null;
  return { tileset: src.tilesetIndex, sx: src.sx, sy: src.sy };
}

export interface LoadedSheet extends SheetSize {
  texture: { source: TextureSource };
}

export class TileFrameCache {
  private readonly frames = new Map<number, Texture | null>();

  constructor(
    private readonly tilesets: readonly Tileset[],
    private readonly sheets: ReadonlyArray<LoadedSheet | null>,
    private readonly tileWidth: number,
    private readonly tileHeight: number,
  ) {}

  /** gid의 잘린 텍스처. 그릴 수 없으면 null */
  get(gid: number): Texture | null {
    const cached = this.frames.get(gid);
    if (cached !== undefined) return cached;
    const f = tileFrame(this.tilesets, this.sheets, gid, this.tileWidth, this.tileHeight);
    const sheet = f ? this.sheets[f.tileset] : null;
    const tex = f && sheet ? new Texture({ source: sheet.texture.source, frame: new Rectangle(f.sx, f.sy, this.tileWidth, this.tileHeight) }) : null;
    this.frames.set(gid, tex);
    return tex;
  }

  /** 만든 잘린 텍스처를 놓는다 (원본은 두고) */
  destroy(): void {
    for (const tex of this.frames.values()) tex?.destroy(false);
    this.frames.clear();
  }
}
