// 크로미움의 시크릿(off-the-record) 프로필 짐작. 시크릿 프로필에서 IndexedDB 의 폴더 핸들을 꺼내면 브라우저
// 프로세스가 통째로 죽으므로 (handleStore.ts), 그럴 수 있는 곳에서는 핸들을 꺼내지 않는다.
// 기준은 흔한 시크릿 판별과 같다: 저장 할당량(navigator.storage.estimate 의 quota)이 JS 힙 한도
// (performance.memory.jsHeapSizeLimit)의 두 배보다 작으면 시크릿일 수 있다. 힙 한도를 모르면 1 GiB 로 치고,
// 할당량을 모르면 시크릿일 수 있다고 본다 (틀려도 폴더 고르기로 돌 뿐이다).

/** performance.memory 가 없을 때 쓰는 힙 한도 */
export const FALLBACK_HEAP_LIMIT = 1024 ** 3;

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
  if (!positive(quota)) return true;
  return quota < 2 * (positive(heapLimit) ? heapLimit : FALLBACK_HEAP_LIMIT);
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
