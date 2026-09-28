// 프로젝트 뷰의 필터 (docs/plans/next-goals.md 1절). 켜져 있으면 프로젝트 파일(코어의 ProjectScope)만 보인다.
// 무시 파일(.initial-editorignore)은 프로젝트를 열 때와 그 파일이 바뀔 때 읽고, 켜고 끈 상태는 .initial-editor/project-view.json 에 남긴다.
// 브리지 모드는 브리지의 허용 목록 밖이라 무시 파일을 읽지 못하면 기본 규칙만 쓴다.

import { IGNORE_FILE, IgnoreRules, ProjectScope, type Project } from "@initial-editor/core";
import { action, makeObservable, observable, runInAction } from "mobx";

export const PROJECT_VIEW_FILE = ".initial-editor/project-view.json";

interface ProjectViewState {
  filter: boolean;
}

function parseViewState(text: string): ProjectViewState | null {
  try {
    const v = JSON.parse(text) as unknown;
    if (v && typeof v === "object" && typeof (v as { filter?: unknown }).filter === "boolean") return { filter: (v as ProjectViewState).filter };
  } catch {
    // 틀린 파일은 기본값으로
  }
  return null;
}

export class ProjectFilter {
  enabled = true;
  scope = new ProjectScope();
  private generation = 0;
  private warnedWrite = false;

  constructor(
    private readonly project: Project,
    private readonly warn: (message: string) => void = () => {},
  ) {
    makeObservable<ProjectFilter>(this, { enabled: observable, scope: observable.ref, toggle: action });
  }

  /** 무시 파일과 저장한 상태를 읽는다 (프로젝트를 열었을 때) */
  async load(): Promise<void> {
    const gen = ++this.generation;
    const [rules, state] = await Promise.all([this.readIgnore(), this.readState()]);
    if (gen !== this.generation) return;
    runInAction(() => {
      this.scope = new ProjectScope(rules);
      this.enabled = state?.filter ?? true;
    });
  }

  /** 무시 파일만 다시 읽는다 (그 파일이 바뀌었을 때) */
  async reloadIgnore(): Promise<void> {
    const gen = this.generation;
    const rules = await this.readIgnore();
    if (gen !== this.generation) return;
    runInAction(() => (this.scope = new ProjectScope(rules)));
  }

  reset(): void {
    this.generation++;
    runInAction(() => {
      this.enabled = true;
      this.scope = new ProjectScope();
    });
  }

  /** 켜고 끄고, 프로젝트의 .initial-editor/ 에 남긴다 */
  toggle(): void {
    this.enabled = !this.enabled;
    const text = JSON.stringify({ filter: this.enabled }, null, 2) + "\n";
    if (!this.project.isOpen) return;
    this.project.backend.writeText(PROJECT_VIEW_FILE, text).then(
      () => (this.warnedWrite = false),
      (e: unknown) => {
        if (this.warnedWrite) return;
        this.warnedWrite = true;
        this.warn(`${PROJECT_VIEW_FILE} 쓰기 실패 (이번 실행 중에만 유지): ${(e as Error).message}`);
      },
    );
  }

  private async readIgnore(): Promise<IgnoreRules> {
    try {
      if (!this.project.isOpen || !(await this.project.backend.exists(IGNORE_FILE))) return IgnoreRules.empty();
      return IgnoreRules.parse(await this.project.backend.readText(IGNORE_FILE));
    } catch {
      return IgnoreRules.empty();
    }
  }

  private async readState(): Promise<ProjectViewState | null> {
    try {
      if (!this.project.isOpen || !(await this.project.backend.exists(PROJECT_VIEW_FILE))) return null;
      return parseViewState(await this.project.backend.readText(PROJECT_VIEW_FILE));
    } catch {
      return null;
    }
  }
}
