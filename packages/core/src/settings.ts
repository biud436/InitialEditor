// 에디터 설정. 프로젝트와 무관한 것(테마, 엔진 경로, 최근 프로젝트)이다.
// 저장소는 셸이 준다: Tauri 는 앱 설정 폴더의 JSON, 브라우저는 localStorage.

import { action, makeObservable, observable, toJS } from "mobx";

export type ThemePreference = "system" | "dark" | "light";

export interface EditorSettings {
  theme: ThemePreference;
  /** 엔진 실행 파일. 비우면 자동 탐색 (E1) */
  enginePath: string;
  /** 스크립트 저장 시 핫 리로드 push */
  reloadOnSave: boolean;
  /** 최근 프로젝트 (Tauri 는 폴더 경로, 브리지는 URL). 앞이 최신 */
  recentProjects: string[];
  /** 브라우저 모드의 브리지 URL */
  bridgeUrl: string;
}

export const DEFAULT_SETTINGS: EditorSettings = {
  theme: "system",
  enginePath: "",
  reloadOnSave: true,
  recentProjects: [],
  bridgeUrl: "http://127.0.0.1:5960",
};

export interface SettingsStorage {
  load(): Promise<Partial<EditorSettings> | null>;
  save(settings: EditorSettings): Promise<void>;
}

export class MemorySettingsStorage implements SettingsStorage {
  data: Partial<EditorSettings> | null = null;
  async load() {
    return this.data;
  }
  async save(settings: EditorSettings) {
    this.data = { ...settings };
  }
}

const MAX_RECENT = 10;

export class SettingsStore {
  settings: EditorSettings = { ...DEFAULT_SETTINGS, recentProjects: [] };

  constructor(private readonly storage: SettingsStorage) {
    makeObservable(this, { settings: observable, update: action, addRecentProject: action, removeRecentProject: action });
  }

  async load(): Promise<void> {
    const loaded = await this.storage.load();
    if (loaded) this.update(loaded, false);
  }

  update(patch: Partial<EditorSettings>, persist = true): void {
    const next: EditorSettings = { ...this.settings, ...patch };
    if (!["system", "dark", "light"].includes(next.theme)) next.theme = "system";
    if (!Array.isArray(next.recentProjects)) next.recentProjects = [];
    this.settings = next;
    if (persist) void this.persist();
  }

  addRecentProject(root: string): void {
    const list = [root, ...this.settings.recentProjects.filter((r) => r !== root)].slice(0, MAX_RECENT);
    this.update({ recentProjects: list });
  }

  removeRecentProject(root: string): void {
    this.update({ recentProjects: this.settings.recentProjects.filter((r) => r !== root) });
  }

  private async persist(): Promise<void> {
    await this.storage.save(toJS(this.settings));
  }
}
