// 에디터 설정. 프로젝트와 무관한 것(테마, 엔진 경로, 최근 프로젝트)이다.
// 저장소는 셸이 준다: Tauri 는 앱 설정 폴더의 JSON, 브라우저는 localStorage.

import { action, makeObservable, observable, toJS } from "mobx";

export type ThemePreference = "system" | "dark" | "light";

/** 실행 방식. process 는 엔진 실행 파일을 띄우고, embedded 는 웹 엔진(WASM)을 에디터의 게임 뷰에서 돌린다 (E4) */
export type RunMode = "process" | "embedded";
export const RUN_MODES: readonly RunMode[] = ["process", "embedded"];

/**
 * 프로젝트가 가리키는 엔진 실행 파일(.initial-editor/engine, build/, 형제 폴더)에 대한 답 (E6 2.3 절).
 * 프로젝트 폴더가 아니라 앱 설정에 남아서 프로젝트가 스스로 신뢰를 적을 수 없다
 */
export interface EngineTrustRecord {
  /** "이 엔진 실행 허용" 이면 true, "앱에 든 엔진만 쓰기" 면 false */
  allow: boolean;
  /** 물을 때 보인 실행 파일의 절대 경로. 이 밖의 경로가 생기면 다시 묻는다 */
  exes: string[];
}

export interface EditorSettings {
  theme: ThemePreference;
  /** 엔진 실행 파일. 비우면 자동 탐색 (E1) */
  enginePath: string;
  /** 스크립트 저장 시 핫 리로드 push */
  reloadOnSave: boolean;
  /** 실행 방식. 프로세스를 띄우지 못하는 백엔드(브라우저)는 이 값과 상관없이 embedded 다 */
  runMode: RunMode;
  /** 최근 프로젝트 (Tauri 는 폴더 경로, 브리지는 URL). 앞이 최신 */
  recentProjects: string[];
  /** 브라우저 모드의 브리지 URL */
  bridgeUrl: string;
  /** 스크립트 편집기(Monaco)의 글꼴 크기 (px) */
  editorFontSize: number;
  /** 스크립트 편집기의 탭 크기 (칸) */
  editorTabSize: number;
  /** 스크립트 편집기의 자동 줄바꿈 */
  editorWordWrap: boolean;
  /** 스크립트 편집기의 미니맵 */
  editorMinimap: boolean;
  /** 프로젝트 정규 경로별 엔진 신뢰 (E6) */
  engineTrust: Record<string, EngineTrustRecord>;
  /** 안드로이드 스테이징에 쓸 엔진 저장소 (android/prepare_assets.sh 가 있는 폴더). 비우면 자동 탐색 (E6) */
  engineRepoPath: string;
  /** 프로젝트 정규 경로별로 실행을 허용한 스테이징 스크립트 (E6 6.3, 엔진 신뢰와 같은 모양. exes 가 스크립트 경로) */
  androidTrust: Record<string, EngineTrustRecord>;
}

export const DEFAULT_SETTINGS: EditorSettings = {
  theme: "system",
  enginePath: "",
  reloadOnSave: true,
  runMode: "process",
  recentProjects: [],
  bridgeUrl: "http://127.0.0.1:5960",
  editorFontSize: 13,
  editorTabSize: 2,
  editorWordWrap: false,
  editorMinimap: false,
  engineTrust: {},
  engineRepoPath: "",
  androidTrust: {},
};

export const EDITOR_FONT_SIZE_RANGE = { min: 8, max: 40 } as const;
export const EDITOR_TAB_SIZE_RANGE = { min: 1, max: 8 } as const;

/** 손으로 고친 설정 파일도 받는다: 모양이 틀린 항목은 버린다 */
function cleanEngineTrust(value: unknown): Record<string, EngineTrustRecord> {
  const out: Record<string, EngineTrustRecord> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [root, record] of Object.entries(value as Record<string, unknown>)) {
    const r = record as Partial<EngineTrustRecord> | null;
    if (!root || !r || typeof r !== "object" || typeof r.allow !== "boolean" || !Array.isArray(r.exes)) continue;
    const exes = r.exes.filter((e): e is string => typeof e === "string" && e !== "");
    out[root] = { allow: r.allow, exes };
  }
  return out;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

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
  settings: EditorSettings = { ...DEFAULT_SETTINGS, recentProjects: [], engineTrust: {}, androidTrust: {} };

  constructor(private readonly storage: SettingsStorage) {
    makeObservable(this, {
      settings: observable,
      update: action,
      addRecentProject: action,
      removeRecentProject: action,
      setEngineTrust: action,
      clearEngineTrust: action,
    });
  }

  async load(): Promise<void> {
    const loaded = await this.storage.load();
    if (loaded) this.update(loaded, false);
  }

  update(patch: Partial<EditorSettings>, persist = true): void {
    const next: EditorSettings = { ...this.settings, ...patch };
    if (!["system", "dark", "light"].includes(next.theme)) next.theme = "system";
    if (!RUN_MODES.includes(next.runMode)) next.runMode = DEFAULT_SETTINGS.runMode;
    if (!Array.isArray(next.recentProjects)) next.recentProjects = [];
    next.editorFontSize = clampInt(next.editorFontSize, EDITOR_FONT_SIZE_RANGE.min, EDITOR_FONT_SIZE_RANGE.max, DEFAULT_SETTINGS.editorFontSize);
    next.editorTabSize = clampInt(next.editorTabSize, EDITOR_TAB_SIZE_RANGE.min, EDITOR_TAB_SIZE_RANGE.max, DEFAULT_SETTINGS.editorTabSize);
    next.editorWordWrap = !!next.editorWordWrap;
    next.editorMinimap = !!next.editorMinimap;
    next.engineTrust = cleanEngineTrust(next.engineTrust);
    next.engineRepoPath = typeof next.engineRepoPath === "string" ? next.engineRepoPath : "";
    next.androidTrust = cleanEngineTrust(next.androidTrust);
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

  /** 프로젝트(정규 경로)가 가리키는 엔진에 대한 답을 남긴다 */
  setEngineTrust(root: string, record: EngineTrustRecord): void {
    this.update({ engineTrust: { ...this.settings.engineTrust, [root]: { allow: record.allow, exes: [...record.exes] } } });
  }

  /** 답을 지운다. 다음 탐색에서 다시 묻는다 */
  clearEngineTrust(root: string): void {
    if (!(root in this.settings.engineTrust)) return;
    const rest = { ...this.settings.engineTrust };
    delete rest[root];
    this.update({ engineTrust: rest });
  }

  private async persist(): Promise<void> {
    await this.storage.save(toJS(this.settings));
  }
}
