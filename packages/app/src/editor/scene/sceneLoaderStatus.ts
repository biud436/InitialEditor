// 프로젝트의 씬 로더 사본(scripts/lua/scene_loader.lua, scripts/ruby/scene_loader.rb)이 컴포넌트 매개변수를 아는지 본다.
// 씬 로더는 새 프로젝트를 만들 때 템플릿에서 복사되므로 엔진 v2.0.0-alpha.2 전에 만든 프로젝트는 params 를 넘기지 않는다.
// 매개변수를 아는 로더에는 선언 파일 위치(DECLARATION_ROOT)가 있다. 바꾸기는 번들 템플릿의 로더로 덮어쓴다.

import type { ProjectBackend, ScriptBackend } from "@initial-editor/core";
import { makeObservable, observable, runInAction } from "mobx";
import type { TemplateSource } from "./templateFiles";

export const SCENE_LOADER_PATHS: Record<ScriptBackend, string> = { lua: "scripts/lua/scene_loader.lua", mruby: "scripts/ruby/scene_loader.rb" };
export const PARAMS_MARKER = "DECLARATION_ROOT";

/** params: 매개변수를 안다, old: 모른다, missing: 로더 파일이 없다 (씬을 쓰지 않는 프로젝트) */
export type SceneLoaderState = "params" | "old" | "missing";

export function sceneLoaderStateOf(text: string | null): SceneLoaderState {
  if (text === null) return "missing";
  return text.includes(PARAMS_MARKER) ? "params" : "old";
}

export class SceneLoaderStatus {
  state: SceneLoaderState | null = null;
  private run = 0;

  constructor(
    private readonly backend: () => ProjectBackend,
    private readonly language: () => ScriptBackend,
  ) {
    makeObservable(this, { state: observable });
  }

  get path(): string {
    return SCENE_LOADER_PATHS[this.language()];
  }

  /** 다시 읽는다 (프로젝트를 열 때, 로더나 game.json 이 바뀔 때) */
  async refresh(): Promise<SceneLoaderState> {
    const run = ++this.run;
    const path = this.path;
    const text = await this.backend()
      .readText(path)
      .catch(() => null);
    const state = sceneLoaderStateOf(text);
    if (run === this.run) runInAction(() => (this.state = state));
    return state;
  }

  /** 바뀐 파일이 로더나 game.json 이면 다시 읽는다 */
  changed(path: string): void {
    if (path === "game.json" || Object.values(SCENE_LOADER_PATHS).includes(path)) void this.refresh();
  }

  clear(): void {
    this.run++;
    runInAction(() => (this.state = null));
  }

  /** 번들 템플릿의 로더로 덮어쓴다 (두 언어 중 프로젝트에 있는 것만) */
  async upgrade(source: TemplateSource): Promise<string[]> {
    const backend = this.backend();
    const written: string[] = [];
    for (const path of Object.values(SCENE_LOADER_PATHS)) {
      if (path !== this.path && !(await backend.exists(path).catch(() => false))) continue;
      await backend.writeText(path, source.text(path));
      written.push(path);
    }
    await this.refresh();
    return written;
  }
}
