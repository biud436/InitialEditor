// 인스펙터가 고르는 프로젝트 파일 목록: resources/ 아래의 그림과 BMFont, scripts/<언어>/components/ 아래의 컴포넌트.
// 백엔드로 폴더를 재귀로 훑는다 (프로젝트를 열 때와 파일이 바뀔 때, 잠깐 모아서). DOM 을 모르므로 Node 로 테스트한다.

import { extname, type ProjectBackend, type ScriptBackend } from "@initial-editor/core";
import { makeObservable, observable, runInAction } from "mobx";

export const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif"]);
export const FONT_EXT = "fnt";
export const RESOURCES_DIR = "resources";
export const COMPONENT_DIRS: Record<"lua" | "ruby", string> = { lua: "scripts/lua/components", ruby: "scripts/ruby/components" };
const SKIP_DIRS = new Set([".initial-editor", ".git", "node_modules"]);
const MAX_DEPTH = 8;
const DEBOUNCE_MS = 150;

export interface ProjectAssetsHost {
  backend(): ProjectBackend;
  isOpen(): boolean;
}

/** 폴더 아래의 파일 경로 전부 (없는 폴더면 빈 목록) */
export async function walkFiles(backend: ProjectBackend, root: string, depth = MAX_DEPTH): Promise<string[]> {
  const out: string[] = [];
  const visit = async (dir: string, left: number) => {
    let entries;
    try {
      entries = await backend.list(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.kind === "dir") {
        if (left > 0 && !SKIP_DIRS.has(e.name)) await visit(e.path, left - 1);
      } else out.push(e.path);
    }
  };
  if (!(await backend.exists(root).catch(() => false))) return out;
  await visit(root, depth);
  return out.sort((a, b) => a.localeCompare(b));
}

/** 컴포넌트 파일 경로를 씬 파일의 논리 이름으로: scripts/lua/components/flappy/bird.lua → components/flappy/bird */
export function logicalComponentName(path: string, language: "lua" | "ruby"): string | null {
  const dir = COMPONENT_DIRS[language];
  const ext = language === "lua" ? ".lua" : ".rb";
  if (!path.startsWith(dir + "/") || !path.endsWith(ext)) return null;
  return "components/" + path.slice(dir.length + 1, path.length - ext.length);
}

export class ProjectAssets {
  images: string[] = [];
  fonts: string[] = [];
  luaComponents: string[] = [];
  rubyComponents: string[] = [];
  loading = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private run = 0;

  constructor(private readonly host: ProjectAssetsHost) {
    makeObservable(this, { images: observable.ref, fonts: observable.ref, luaComponents: observable.ref, rubyComponents: observable.ref, loading: observable });
  }

  components(language: ScriptBackend): string[] {
    return language === "mruby" ? this.rubyComponents : this.luaComponents;
  }

  /** 바뀐 경로가 목록에 영향을 주면 잠깐 뒤에 다시 훑는다 */
  changed(path: string): void {
    if (!path.startsWith(RESOURCES_DIR) && !path.startsWith("scripts/")) return;
    this.schedule();
  }

  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refresh();
    }, DEBOUNCE_MS);
  }

  async refresh(): Promise<void> {
    const run = ++this.run;
    if (!this.host.isOpen()) {
      this.clear();
      return;
    }
    runInAction(() => (this.loading = true));
    const backend = this.host.backend();
    try {
      const [resources, lua, ruby] = await Promise.all([walkFiles(backend, RESOURCES_DIR), walkFiles(backend, COMPONENT_DIRS.lua), walkFiles(backend, COMPONENT_DIRS.ruby)]);
      if (run !== this.run) return;
      runInAction(() => {
        this.images = resources.filter((p) => IMAGE_EXTS.has(extname(p)));
        this.fonts = resources.filter((p) => extname(p) === FONT_EXT);
        this.luaComponents = lua.map((p) => logicalComponentName(p, "lua")).filter((n): n is string => n !== null);
        this.rubyComponents = ruby.map((p) => logicalComponentName(p, "ruby")).filter((n): n is string => n !== null);
      });
    } finally {
      if (run === this.run) runInAction(() => (this.loading = false));
    }
  }

  clear(): void {
    runInAction(() => {
      this.images = [];
      this.fonts = [];
      this.luaComponents = [];
      this.rubyComponents = [];
      this.loading = false;
    });
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.run++;
  }
}
