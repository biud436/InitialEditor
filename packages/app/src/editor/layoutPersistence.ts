// 레이아웃 저장과 복원 (02-scope-and-screens.md 3절 "레이아웃은 프로젝트의 .initial-editor/layout.json 에 저장된다").
// 프로젝트가 열려 있으면 백엔드로 그 파일에 쓰고, 마지막 레이아웃은 localStorage 에도 남긴다
// (프로젝트가 없을 때의 화면, 그리고 백엔드가 그 폴더를 못 쓸 때의 대비). 복원이 실패하면 기본 프리셋으로 돌아간다.

import { EDITOR_DIR, type Project } from "@initial-editor/core";
import type { KeyValueStorage } from "./LocalStorageSettingsStorage";

export const LAYOUT_FILE = `${EDITOR_DIR}/layout.json`;
export const LAYOUT_STORAGE_KEY = "initial-editor.layout";

/** dockview 의 SerializedDockview 중 우리가 검사하는 부분 */
export interface LayoutJson {
  grid: { root: unknown; width: number; height: number; orientation: string };
  panels: Record<string, unknown>;
  activeGroup?: string;
}

export function isLayoutJson(value: unknown): value is LayoutJson {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const grid = v.grid as Record<string, unknown> | undefined;
  if (!grid || typeof grid !== "object" || !grid.root || typeof grid.root !== "object") return false;
  if (!v.panels || typeof v.panels !== "object") return false;
  return true;
}

export interface LayoutPersistenceDeps {
  local: KeyValueStorage;
  project: () => Project | null;
  warn?: (message: string) => void;
}

export class LayoutPersistence {
  private warnedProjectWrite = false;

  constructor(private readonly deps: LayoutPersistenceDeps) {}

  /** 프로젝트 파일 > localStorage. 둘 다 없거나 깨졌으면 null */
  async load(): Promise<LayoutJson | null> {
    const project = this.deps.project();
    if (project?.isOpen) {
      try {
        if (await project.backend.exists(LAYOUT_FILE)) {
          const parsed = JSON.parse(await project.backend.readText(LAYOUT_FILE)) as unknown;
          if (isLayoutJson(parsed)) return parsed;
          this.deps.warn?.(`${LAYOUT_FILE} 의 모양이 다르다. 기본 레이아웃을 쓴다`);
        }
      } catch (e) {
        this.deps.warn?.(`${LAYOUT_FILE} 을 읽지 못했다: ${(e as Error).message}`);
      }
    }
    return this.loadLocal();
  }

  loadLocal(): LayoutJson | null {
    const raw = this.deps.local.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return isLayoutJson(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(layout: LayoutJson): Promise<void> {
    const text = JSON.stringify(layout);
    this.deps.local.setItem(LAYOUT_STORAGE_KEY, text);
    const project = this.deps.project();
    if (!project?.isOpen) return;
    try {
      await project.backend.writeText(LAYOUT_FILE, text + "\n");
      this.warnedProjectWrite = false;
    } catch (e) {
      // 브리지 서버가 .initial-editor/ 를 허용하지 않을 수 있다. 한 번만 알리고 localStorage 로 버틴다
      if (!this.warnedProjectWrite) {
        this.warnedProjectWrite = true;
        this.deps.warn?.(`${LAYOUT_FILE} 에 쓰지 못했다 (브라우저 저장소에는 남는다): ${(e as Error).message}`);
      }
    }
  }
}

/** 복원을 시도하고 실패하면 기본으로. 돌려주는 값은 복원이 됐는가 */
export function restoreLayout(
  persisted: LayoutJson | null,
  apply: (layout: LayoutJson) => void,
  applyDefault: () => void,
  warn?: (message: string) => void,
): boolean {
  if (persisted) {
    try {
      apply(persisted);
      return true;
    } catch (e) {
      warn?.(`저장된 레이아웃을 복원하지 못했다. 기본 레이아웃으로 돌아간다: ${(e as Error).message}`);
    }
  }
  applyDefault();
  return false;
}
