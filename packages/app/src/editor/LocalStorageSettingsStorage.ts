// 브라우저 모드의 설정 저장소: localStorage 한 키. Tauri 는 backend-tauri 의 TauriSettingsStorage 를 쓴다.

import type { EditorSettings, SettingsStorage } from "@initial-editor/core";

export const SETTINGS_KEY = "initial-editor.settings";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class LocalStorageSettingsStorage implements SettingsStorage {
  constructor(
    private readonly storage: KeyValueStorage = window.localStorage,
    private readonly key = SETTINGS_KEY,
  ) {}

  async load(): Promise<Partial<EditorSettings> | null> {
    const raw = this.storage.getItem(this.key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Partial<EditorSettings>) : null;
    } catch {
      return null;
    }
  }

  async save(settings: EditorSettings): Promise<void> {
    this.storage.setItem(this.key, JSON.stringify(settings));
  }
}
