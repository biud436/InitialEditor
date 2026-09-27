// 크로미움의 시크릿(off-the-record) 프로필 짐작. 시크릿 프로필에서 IndexedDB 의 폴더 핸들을 꺼내면 브라우저
// 프로세스가 통째로 죽으므로 (handleStore.ts), 일반 프로필이라고 확신할 때만 핸들을 꺼낸다.
// 일반 프로필: performance.memory.jsHeapSizeLimit 가 있고, 저장 할당량(navigator.storage.estimate 의 quota)이
// 힙 한도의 두 배보다 크고 4 GiB 보다도 크다. 나머지는 모두 시크릿일 수 있다고 본다 (힙 한도나 할당량을 모를 때,
// 크롬 153 의 시크릿 창과 게스트 창처럼 할당량이 2 GiB 이거나 2 GiB 에 사용량을 더한 값일 때).

/** 일반 프로필로 보려면 할당량이 이보다 커야 한다 */
export const MIN_NORMAL_QUOTA = 4 * 1024 ** 3;

export interface ProfileSignals {
  /** 저장 할당량 (바이트) */
  quota?: number;
  /** JS 힙 한도 (바이트) */
  heapLimit?: number;
}

function positive(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** 시크릿 프로필일 수 있는가. 일반 프로필이라고 확신할 때만 false */
export function mayBeOffTheRecord({ quota, heapLimit }: ProfileSignals): boolean {
  if (!positive(quota) || !positive(heapLimit)) return true;
  return !(quota > 2 * heapLimit && quota > MIN_NORMAL_QUOTA);
}

export interface ProfileHost {
  navigator?: { storage?: { estimate?: () => Promise<{ quota?: number }> } };
  performance?: { memory?: { jsHeapSizeLimit?: number } };
}

/** 브라우저에서 할당량과 힙 한도를 읽는다. 못 읽은 것은 비워 둔다 */
export async function readProfileSignals(host: ProfileHost = globalThis as ProfileHost): Promise<ProfileSignals> {
  let quota: number | undefined;
  try {
    quota = (await host.navigator?.storage?.estimate?.())?.quota;
  } catch {
    quota = undefined;
  }
  let heapLimit: number | undefined;
  try {
    heapLimit = host.performance?.memory?.jsHeapSizeLimit;
  } catch {
    heapLimit = undefined;
  }
  return { quota, heapLimit };
}

/** 이 페이지가 시크릿 프로필일 수 있는가 */
export async function detectOffTheRecord(host?: ProfileHost): Promise<boolean> {
  return mayBeOffTheRecord(await readProfileSignals(host));
}
