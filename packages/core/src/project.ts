// 프로젝트 모델 (docs/plans/03-project-and-runtime.md 1절).
// 프로젝트는 game.json 이 있는 폴더다. 엔진이 읽는 키(windowWidth, windowHeight, renderScale, script)에
// 에디터가 startScene 과 name 을 더한다. 엔진은 모르는 키를 무시하므로 안전하다. 반대로 에디터도
// 모르는 키를 보존한다 (파일에 있던 것을 저장할 때 잃지 않는다).

import { action, makeObservable, observable, runInAction } from "mobx";
import { type ChangeEvent, type Entry, type ProjectBackend, type ProjectInfo, sortEntries } from "./backend";
import { Emitter } from "./events";
import { dirname, normalizeRel } from "./paths";

export type ScriptBackend = "lua" | "mruby";

export interface GameJson {
  name?: string;
  windowWidth: number;
  windowHeight: number;
  renderScale: number;
  script: ScriptBackend;
  startScene?: string;
  /** 파일에 있던 모르는 키. 저장할 때 그대로 돌려준다 */
  extra: Record<string, unknown>;
}

/** 엔진 Constants.h 의 기본값과 같다 (768x896, 배율 1, Lua) */
export const DEFAULT_GAME_JSON: GameJson = {
  windowWidth: 768,
  windowHeight: 896,
  renderScale: 1,
  script: "lua",
  extra: {},
};

const KNOWN_KEYS = new Set(["name", "windowWidth", "windowHeight", "renderScale", "script", "startScene"]);

export function parseGameJson(text: string): GameJson {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("game.json 최상위 값은 객체여야 함");
  const num = (key: string, fallback: number) => {
    const v = raw[key];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  const script = raw.script === "mruby" ? "mruby" : "lua";
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (!KNOWN_KEYS.has(k)) extra[k] = v;
  return {
    name: typeof raw.name === "string" ? raw.name : undefined,
    windowWidth: num("windowWidth", DEFAULT_GAME_JSON.windowWidth),
    windowHeight: num("windowHeight", DEFAULT_GAME_JSON.windowHeight),
    renderScale: num("renderScale", DEFAULT_GAME_JSON.renderScale),
    script,
    startScene: typeof raw.startScene === "string" ? raw.startScene : undefined,
    extra,
  };
}

/** 키 순서를 고정해 diff 가 조용하게 한다. 모르는 키는 뒤에 */
export function serializeGameJson(g: GameJson): string {
  const out: Record<string, unknown> = {};
  if (g.name !== undefined) out.name = g.name;
  out.windowWidth = g.windowWidth;
  out.windowHeight = g.windowHeight;
  out.renderScale = g.renderScale;
  out.script = g.script;
  if (g.startScene !== undefined) out.startScene = g.startScene;
  for (const [k, v] of Object.entries(g.extra)) if (!(k in out)) out[k] = v;
  return JSON.stringify(out, null, 2) + "\n";
}

export const GAME_JSON = "game.json";
export const EDITOR_DIR = ".initial-editor";

export interface ProjectEvents {
  opened: ProjectInfo;
  closed: void;
  change: ChangeEvent;
  /** 폴더 목록이 갱신됐다 (rel 은 폴더) */
  refreshed: string;
}

/**
 * 열린 프로젝트. 파일 트리 캐시(폴더별 목록)와 game.json 을 들고 있고, 백엔드의 변경 알림으로
 * 캐시를 갱신한다. 패널은 이 모델만 본다.
 */
export class Project {
  info: ProjectInfo | null = null;
  gameJson: GameJson = { ...DEFAULT_GAME_JSON, extra: {} };
  /** 폴더 rel → 정렬된 목록. 아직 안 읽은 폴더는 없다 */
  readonly folders = observable.map<string, Entry[]>({}, { deep: false });
  readonly events = new Emitter<ProjectEvents>();
  private unwatch: (() => void) | null = null;

  constructor(readonly backend: ProjectBackend) {
    makeObservable(this, {
      info: observable.ref,
      gameJson: observable.ref,
      open: action,
      close: action,
      setGameJson: action,
    });
  }

  get isOpen(): boolean {
    return this.info !== null;
  }

  get root(): string {
    return this.info?.root ?? "";
  }

  /** 프로젝트를 열고 루트 폴더와 game.json 을 읽는다. game.json 이 없으면 기본값을 들고 있는다 (파일은 만들지 않는다) */
  async open(root: string): Promise<ProjectInfo> {
    await this.close();
    const info = await this.backend.open(root);
    runInAction(() => {
      this.info = info;
      this.folders.clear();
    });
    await this.loadGameJson();
    await this.refresh("");
    if (this.backend.capabilities.watch) {
      this.unwatch = this.backend.watch((e) => this.onChange(e));
    }
    this.events.emit("opened", info);
    return info;
  }

  async close(): Promise<void> {
    if (!this.info) return;
    this.unwatch?.();
    this.unwatch = null;
    await this.backend.close();
    runInAction(() => {
      this.info = null;
      this.folders.clear();
      this.gameJson = { ...DEFAULT_GAME_JSON, extra: {} };
    });
    this.events.emit("closed", undefined);
  }

  async loadGameJson(): Promise<boolean> {
    if (!(await this.backend.exists(GAME_JSON))) {
      this.setGameJson({ ...DEFAULT_GAME_JSON, extra: {} });
      return false;
    }
    const text = await this.backend.readText(GAME_JSON);
    this.setGameJson(parseGameJson(text));
    return true;
  }

  setGameJson(g: GameJson): void {
    this.gameJson = g;
  }

  /** game.json 을 만든다 (없을 때 UI 가 묻고 부른다) 또는 고친 값을 저장한다 */
  async saveGameJson(g: GameJson = this.gameJson): Promise<void> {
    await this.backend.writeText(GAME_JSON, serializeGameJson(g));
    this.setGameJson(g);
    if (this.info) runInAction(() => (this.info = { ...this.info!, hasGameJson: true }));
    await this.refresh("");
  }

  /** 폴더 한 층을 다시 읽는다 */
  async refresh(rel: string): Promise<Entry[]> {
    const dir = normalizeRel(rel);
    const entries = sortEntries(await this.backend.list(dir));
    runInAction(() => this.folders.set(dir, entries));
    this.events.emit("refreshed", dir);
    return entries;
  }

  /** 캐시에 있으면 그것, 없으면 읽는다 */
  async entries(rel: string): Promise<Entry[]> {
    const dir = normalizeRel(rel);
    return this.folders.get(dir) ?? (await this.refresh(dir));
  }

  private onChange(e: ChangeEvent): void {
    this.events.emit("change", e);
    const dir = dirname(e.path);
    if (this.folders.has(dir)) void this.refresh(dir).catch(() => {});
    if (e.kind === "delete" && this.folders.has(e.path)) runInAction(() => this.folders.delete(e.path));
    if (e.path === GAME_JSON) void this.loadGameJson().catch(() => {});
  }
}
