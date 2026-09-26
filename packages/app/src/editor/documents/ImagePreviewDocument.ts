// 이미지 미리보기 문서. readBinary 로 받은 바이트를 Blob URL 로 만들고 픽셀 아트답게(image-rendering: pixelated) 보인다.

import { Document, basename, extname, type ProjectBackend } from "@initial-editor/core";
import { action, makeObservable, observable, runInAction } from "mobx";

export const IMAGE_PREVIEW_KIND = "image-preview";
export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif"]);

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif" };

export const ZOOM_STEPS = [0.25, 0.5, 1, 2, 3, 4, 6, 8];

export class ImagePreviewDocument extends Document {
  url: string | null = null;
  bytes = 0;
  width = 0;
  height = 0;
  zoom = 1;
  error: string | null = null;

  constructor(
    private readonly backend: ProjectBackend,
    path: string,
  ) {
    super(IMAGE_PREVIEW_KIND, path, basename(path));
    makeObservable(this, {
      url: observable,
      bytes: observable,
      width: observable,
      height: observable,
      zoom: observable,
      error: observable,
      setNaturalSize: action,
      setZoom: action,
    });
  }

  async load(): Promise<void> {
    if (!this.path) return;
    try {
      const data = await this.backend.readBinary(this.path);
      const blob = new Blob([data as BlobPart], { type: MIME[extname(this.path)] ?? "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      runInAction(() => {
        this.revoke();
        this.url = url;
        this.bytes = data.byteLength;
        this.error = null;
      });
    } catch (e) {
      runInAction(() => {
        this.error = (e as Error).message;
      });
      throw e;
    }
  }

  setNaturalSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  setZoom(zoom: number): void {
    this.zoom = Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], Math.max(ZOOM_STEPS[0], zoom));
  }

  zoomIn(): void {
    const next = ZOOM_STEPS.find((z) => z > this.zoom);
    if (next !== undefined) this.setZoom(next);
  }

  zoomOut(): void {
    const prev = [...ZOOM_STEPS].reverse().find((z) => z < this.zoom);
    if (prev !== undefined) this.setZoom(prev);
  }

  async save(): Promise<void> {
    // 이미지는 편집하지 않는다 (03-project-and-runtime.md 파일 규칙 6)
    this.markSaved();
  }

  async reload(): Promise<void> {
    await this.load();
    this.markSaved();
  }

  private revoke(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  dispose(): void {
    this.revoke();
    super.dispose();
  }
}
