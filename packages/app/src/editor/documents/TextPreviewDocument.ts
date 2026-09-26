// 텍스트 미리보기 문서 (E0). 읽기 전용 <pre> 로 보인다. Monaco 편집기는 E1 에서 이 자리를 대신한다.

import { Document, basename, type ProjectBackend } from "@initial-editor/core";
import { action, makeObservable, observable, runInAction } from "mobx";

export const TEXT_PREVIEW_KIND = "text-preview";
export const TEXT_EXTENSIONS = new Set(["lua", "rb", "json", "md", "txt", "csv", "fnt"]);

export class TextPreviewDocument extends Document {
  text = "";
  loaded = false;
  error: string | null = null;

  constructor(
    private readonly backend: ProjectBackend,
    path: string,
  ) {
    super(TEXT_PREVIEW_KIND, path, basename(path));
    makeObservable(this, { text: observable, loaded: observable, error: observable, setText: action });
  }

  async load(): Promise<void> {
    if (!this.path) return;
    try {
      const text = await this.backend.readText(this.path);
      this.setText(text);
    } catch (e) {
      runInAction(() => {
        this.error = (e as Error).message;
        this.loaded = true;
      });
      throw e;
    }
  }

  setText(text: string): void {
    this.text = text;
    this.loaded = true;
    this.error = null;
  }

  async save(): Promise<void> {
    if (!this.path) return;
    await this.backend.writeText(this.path, this.text);
    this.markSaved();
  }

  async reload(): Promise<void> {
    await this.load();
    this.markSaved();
  }
}
