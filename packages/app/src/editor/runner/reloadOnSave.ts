// 저장 시 핫 리로드 규칙 (docs/plans/e1-scripting.md 마일스톤 2). 순수 함수와 작은 디바운서라 Node 로 테스트한다.
//
// 규칙: 설정 reloadOnSave 가 켜져 있고, 저장한 문서가 scripts/ 나 resources/scenes/ 나 resources/maps/ 아래이고,
// 에디터 안 엔진(게임 탭)이 뜨는 중이거나 돌고 있으면 늘 (뜨는 중이면 뜬 뒤에 올린다), 아니면 엔진을 띄울 수 있는
// 백엔드(Tauri)는 실행 중일 때만, 띄우지 못하는 백엔드(브리지)는 늘 (사용자가 터미널에서 INITIAL2D_HMR=1 로 띄워 두었을
// 수 있다. 엔진이 없으면 실행기가 한 줄만 남긴다). 보낼 길이 없는 백엔드(웹판의 브라우저 폴더, 엔진이 없는 메모리)는
// 게임 탭이 뜨는 중이거나 돌 때만이다. 연속 저장(모두 저장)은 300ms 디바운스로 한 번만 보낸다. 그사이 저장한 경로를
// 모아 에디터 안 엔진은 그 파일들만 다시 올린다 (SaveReloader).

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
  /** 에디터 안 엔진이 뜨는 중이거나 돌고 있다 (RunnerStore.embeddedActive) */
  embeddedActive?: boolean;
  /** 밖에서 띄운 엔진으로 보낼 길이 있는가 (없으면 false, 기본 true) */
  canPush?: boolean;
}

export function shouldReloadOnSave(input: ReloadOnSaveInput): boolean {
  if (!input.reloadOnSave || !isReloadPath(input.path)) return false;
  if (input.embeddedActive) return true;
  return input.canSpawn ? input.running : input.canPush !== false;
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

/** 저장한 경로를 모아 디바운스 뒤 한 번에 reload(paths) 한다 */
export class SaveReloader {
  private readonly debouncer: Debouncer;
  private paths = new Set<string>();

  constructor(
    private readonly deps: {
      /** 이 경로를 저장하면 리로드하는가 (shouldReloadOnSave) */
      accepts(path: string | null | undefined): boolean;
      reload(paths: string[]): unknown;
    },
    delayMs = RELOAD_DEBOUNCE_MS,
  ) {
    this.debouncer = new Debouncer(delayMs);
  }

  get pending(): boolean {
    return this.debouncer.pending;
  }

  onSaved(path: string | null | undefined): void {
    if (!path || !this.deps.accepts(path)) return;
    this.paths.add(normalizeRel(path));
    this.debouncer.schedule(() => {
      const paths = [...this.paths];
      this.paths.clear();
      this.deps.reload(paths);
    });
  }

  cancel(): void {
    this.debouncer.cancel();
    this.paths.clear();
  }
}
