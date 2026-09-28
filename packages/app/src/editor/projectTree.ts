// 프로젝트 패널의 뷰 모델. 폴더는 펼칠 때 읽고(project.entries), 캐시(project.folders)가 갱신되면 따라간다.
// 필터(projectFilter.ts)가 켜져 있으면 프로젝트 파일만 줄에 넣고 숨긴 항목을 센다 (펼친 폴더 안에서).
// DOM 을 모르므로 Node 로 테스트한다 (projectTree.test.ts).

import { dirname, IGNORE_FILE, type Entry, type Project } from "@initial-editor/core";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { ProjectFilter } from "./projectFilter";

export interface TreeRow {
  entry: Entry;
  depth: number;
  expanded: boolean;
  loading: boolean;
}

export class ProjectTreeModel {
  readonly expanded = observable.set<string>();
  readonly loading = observable.set<string>();
  selected: string | null = null;
  readonly filter: ProjectFilter;
  private readonly disposers: Array<() => void> = [];

  constructor(
    readonly project: Project,
    deps: { warn?: (message: string) => void } = {},
  ) {
    this.filter = new ProjectFilter(project, deps.warn);
    makeObservable<ProjectTreeModel, "view">(this, { selected: observable, view: computed, select: action, collapse: action, reset: action });
    this.disposers.push(
      project.events.on("opened", () => void this.filter.load()),
      project.events.on("closed", () => this.reset()),
      project.events.on("change", (e) => {
        if (e.kind === "delete") this.forget(e.path);
        if (e.path === IGNORE_FILE) void this.filter.reloadIgnore();
      }),
    );
    if (project.isOpen) void this.filter.load();
  }

  /** 펼쳐진 상태를 평평한 줄 목록으로. 캐시에 없는 폴더는 자식이 없는 것처럼 보인다 */
  get rows(): TreeRow[] {
    return this.view.rows;
  }

  /** 필터가 숨긴 항목 수 (펼친 폴더 안에서). 필터가 꺼져 있으면 0 */
  get hiddenCount(): number {
    return this.view.hidden;
  }

  private get view(): { rows: TreeRow[]; hidden: number } {
    if (!this.project.isOpen) return { rows: [], hidden: 0 };
    const out: TreeRow[] = [];
    let hidden = 0;
    const { enabled, scope } = this.filter;
    const walk = (dir: string, depth: number) => {
      const entries = this.project.folders.get(dir);
      if (!entries) return;
      for (const entry of entries) {
        if (enabled && !scope.includes(entry.path, entry.kind)) {
          hidden++;
          continue;
        }
        const expanded = entry.kind === "dir" && this.expanded.has(entry.path);
        out.push({ entry, depth, expanded, loading: this.loading.has(entry.path) });
        if (expanded) walk(entry.path, depth + 1);
      }
    };
    walk("", 0);
    return { rows: out, hidden };
  }

  /** 필터에 숨는 경로인가 */
  isHidden(path: string, kind: Entry["kind"]): boolean {
    return this.filter.enabled && !this.filter.scope.includes(path, kind);
  }

  isExpanded(path: string): boolean {
    return this.expanded.has(path);
  }

  async toggle(path: string): Promise<void> {
    if (this.expanded.has(path)) this.collapse(path);
    else await this.expand(path);
  }

  /** 폴더를 펼친다. 아직 안 읽었으면 그때 읽는다 (게으른 로딩) */
  async expand(path: string): Promise<void> {
    if (!this.project.folders.has(path)) {
      runInAction(() => this.loading.add(path));
      try {
        await this.project.entries(path);
      } finally {
        runInAction(() => this.loading.delete(path));
      }
    }
    runInAction(() => this.expanded.add(path));
  }

  /** 경로의 조상을 전부 펼친다 (파일을 드러낼 때) */
  async reveal(path: string): Promise<void> {
    const parts = path.split("/").filter(Boolean);
    let dir = "";
    for (let i = 0; i < parts.length - 1; i++) {
      dir = dir ? `${dir}/${parts[i]}` : parts[i];
      await this.expand(dir);
    }
    this.select(path);
  }

  collapse(path: string): void {
    for (const p of [...this.expanded]) {
      if (p === path || p.startsWith(path + "/")) this.expanded.delete(p);
    }
  }

  select(path: string | null): void {
    this.selected = path;
  }

  async refresh(dir: string): Promise<void> {
    await this.project.refresh(dir);
  }

  /** 지워진 경로의 펼침과 선택을 정리한다 */
  private forget(path: string): void {
    runInAction(() => {
      this.collapse(path);
      if (this.selected === path || this.selected?.startsWith(path + "/")) this.selected = dirname(path) || null;
    });
  }

  reset(): void {
    this.expanded.clear();
    this.loading.clear();
    this.selected = null;
    this.filter.reset();
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }
}
