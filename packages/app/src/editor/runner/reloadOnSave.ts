// 저장 시 핫 리로드 규칙 (docs/plans/e1-scripting.md 마일스톤 2). 순수 함수와 작은 디바운서라 Node 로 테스트한다.
//
// 규칙: 설정 reloadOnSave 가 켜져 있고, 저장한 문서가 scripts/ 나 resources/scenes/ 나 resources/maps/ 아래이고,
// 엔진을 띄울 수 있는 백엔드(Tauri)면 실행 중일 때만, 띄우지 못하는 백엔드(브리지)면 늘 (사용자가 터미널에서
// INITIAL2D_HMR=1 로 띄워 두었을 수 있다). 연속 저장(모두 저장)은 300ms 디바운스로 한 번만 push 한다.

import { isInside, normalizeRel } from "@initial-editor/core";

export const RELOAD_ON_SAVE_DIRS: readonly string[] = ["scripts", "resources/scenes", "resources/maps"];
export const RELOAD_DEBOUNCE_MS = 300;

/** 저장하면 push 대상이 되는 경로인가 */
export function isReloadPath(path: string | null | undefined): boolean {
  if (!path) return false;
  let rel: string;
  try {
    rel = normalizeRel(path);
  } catch {
    return false;
  }
  return RELOAD_ON_SAVE_DIRS.some((dir) => isInside(dir, rel));
}

export interface ReloadOnSaveInput {
  path: string | null | undefined;
  reloadOnSave: boolean;
  /** backend.capabilities.run */
  canSpawn: boolean;
  /** 실행기가 엔진을 띄워 둔 상태인가 (canSpawn 일 때만 본다) */
  running: boolean;
}

export function shouldReloadOnSave(input: ReloadOnSaveInput): boolean {
  if (!input.reloadOnSave || !isReloadPath(input.path)) return false;
  return input.canSpawn ? input.running : true;
}

/** 마지막 호출 뒤 delayMs 지나면 한 번만 부른다 */
export class Debouncer {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly delayMs: number) {}

  get pending(): boolean {
    return this.timer !== null;
  }

  schedule(fn: () => void): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
    }, this.delayMs);
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
