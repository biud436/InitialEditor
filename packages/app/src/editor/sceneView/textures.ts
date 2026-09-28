// 씬 뷰의 텍스처 캐시. 경로마다 한 번만 읽는다: backend.readBinary → Blob URL → Image → PIXI Texture (nearest, 픽셀 아트).
// 파일이 밖에서 바뀌면(project change 이벤트) 그 경로를 버리고 invalidated 를 알려 렌더러가 스프라이트를 다시 만든다.
// 렌더러가 여럿이어도 캐시는 하나다 (SceneSupport 가 들고 있다).

import { Emitter, extname, type ProjectBackend } from "@initial-editor/core";
import { Texture } from "pixi.js";

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

export interface LoadedTexture {
  texture: Texture;
  width: number;
  height: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 디코딩 실패"));
    img.src = url;
  });
}

export class TextureCache {
  private readonly entries = new Map<string, Promise<LoadedTexture>>();
  private readonly urls = new Map<string, string>();
  readonly events = new Emitter<{ invalidated: string }>();

  constructor(private readonly backend: () => ProjectBackend) {}

  /** 경로의 텍스처. 실패하면 거부된 Promise 를 돌려주되 캐시에는 남기지 않는다 (다음에 다시 시도한다) */
  load(path: string): Promise<LoadedTexture> {
    const existing = this.entries.get(path);
    if (existing) return existing;
    const promise = this.read(path).catch((e) => {
      if (this.entries.get(path) === promise) this.entries.delete(path);
      throw e;
    });
    this.entries.set(path, promise);
    return promise;
  }

  private async read(path: string): Promise<LoadedTexture> {
    const data = await this.backend().readBinary(path);
    const blob = new Blob([data as BlobPart], { type: MIME[extname(path)] ?? "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      const texture = Texture.from(img);
      texture.source.scaleMode = "nearest";
      texture.source.label = path;
      this.urls.set(path, url);
      return { texture, width: img.naturalWidth, height: img.naturalHeight };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  }

  has(path: string): boolean {
    return this.entries.has(path);
  }

  /** 경로 하나를 버린다 (파일이 바뀌었다). 쓰던 렌더러는 invalidated 를 듣고 다시 만든다 */
  invalidate(path: string): void {
    const entry = this.entries.get(path);
    if (!entry) return;
    this.entries.delete(path);
    this.release(path, entry);
    this.events.emit("invalidated", path);
  }

  clear(): void {
    for (const [path, entry] of [...this.entries]) {
      this.entries.delete(path);
      this.release(path, entry);
      this.events.emit("invalidated", path);
    }
  }

  private release(path: string, entry: Promise<LoadedTexture>): void {
    const url = this.urls.get(path);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(path);
    void entry.then((t) => t.texture.destroy(true)).catch(() => {});
  }

  dispose(): void {
    this.clear();
  }
}
