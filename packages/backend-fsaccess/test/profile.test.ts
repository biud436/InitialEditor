// 시크릿 프로필 짐작 (profile.ts). 숫자는 크롬 153 에서 잰 값이다: 시크릿 창과 게스트 창과 Playwright 기본 컨텍스트는
// 할당량이 딱 2 GiB 이거나 2 GiB 에 사용량을 더한 값, 일반 프로필과 launchPersistentContext 는 10240 MiB.
// 힙 한도는 크롬 4192 MiB, 크로미움 3586 MiB, --max-old-space-size=900 이면 약 996 MiB.

import { describe, expect, it } from "vitest";
import { detectOffTheRecord, mayBeOffTheRecord, MIN_NORMAL_QUOTA, readProfileSignals, type ProfileHost } from "../src/profile";

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const CHROME_HEAP = 4395630592;
const CHROMIUM_HEAP = 3586 * MiB;
const SMALL_HEAP = 1044381696;
const PRIVATE_QUOTA = 2 * GiB;
/** 시크릿 창에 파일을 쓴 뒤의 할당량 (2 GiB + 사용량) */
const PRIVATE_QUOTA_USED = [2147557376, 2147557709];
const NORMAL_QUOTA = 10240 * MiB;

function host(quota: number | undefined, heapLimit: number | undefined): ProfileHost {
  return {
    navigator: { storage: { estimate: async () => ({ quota }) } },
    performance: heapLimit === undefined ? {} : { memory: { jsHeapSizeLimit: heapLimit } },
  };
}

describe("mayBeOffTheRecord", () => {
  it("일반 프로필: 힙 한도가 있고 할당량이 힙 한도의 두 배보다, 4 GiB 보다 크다", () => {
    expect(MIN_NORMAL_QUOTA).toBe(4 * GiB);
    expect(mayBeOffTheRecord({ quota: NORMAL_QUOTA, heapLimit: CHROME_HEAP })).toBe(false);
    expect(mayBeOffTheRecord({ quota: NORMAL_QUOTA, heapLimit: CHROMIUM_HEAP })).toBe(false);
    expect(mayBeOffTheRecord({ quota: 2 * CHROME_HEAP + 1, heapLimit: CHROME_HEAP })).toBe(false);
    expect(mayBeOffTheRecord({ quota: 4 * GiB + 1, heapLimit: SMALL_HEAP })).toBe(false);
  });

  it("할당량이 딱 2 GiB (시크릿 창, 게스트 창): 힙 한도와 상관없이 시크릿일 수 있다", () => {
    for (const heapLimit of [CHROME_HEAP, CHROMIUM_HEAP, SMALL_HEAP, 1 * GiB, 512 * MiB, undefined]) {
      expect(mayBeOffTheRecord({ quota: PRIVATE_QUOTA, heapLimit })).toBe(true);
    }
  });

  it("할당량이 2 GiB 에 사용량을 더한 값 (쓴 뒤의 시크릿 창): 힙 한도와 상관없이 시크릿일 수 있다", () => {
    for (const quota of PRIVATE_QUOTA_USED) {
      for (const heapLimit of [CHROME_HEAP, CHROMIUM_HEAP, SMALL_HEAP, 1 * GiB, 512 * MiB, undefined]) {
        expect(mayBeOffTheRecord({ quota, heapLimit })).toBe(true);
      }
    }
  });

  it("힙 한도를 모르면 (performance.memory 가 없다) 할당량이 커도 시크릿일 수 있다", () => {
    expect(mayBeOffTheRecord({ quota: NORMAL_QUOTA })).toBe(true);
    expect(mayBeOffTheRecord({ quota: NORMAL_QUOTA, heapLimit: 0 })).toBe(true);
    expect(mayBeOffTheRecord({ quota: NORMAL_QUOTA, heapLimit: Number.NaN })).toBe(true);
    expect(mayBeOffTheRecord({ quota: NORMAL_QUOTA, heapLimit: -1 })).toBe(true);
  });

  it("경계: 두 배와 같거나 4 GiB 와 같으면 시크릿일 수 있다", () => {
    expect(mayBeOffTheRecord({ quota: 2 * CHROME_HEAP, heapLimit: CHROME_HEAP })).toBe(true);
    expect(mayBeOffTheRecord({ quota: 2 * CHROME_HEAP - 1, heapLimit: CHROME_HEAP })).toBe(true);
    expect(mayBeOffTheRecord({ quota: 4 * GiB, heapLimit: SMALL_HEAP })).toBe(true);
    expect(mayBeOffTheRecord({ quota: 4 * GiB, heapLimit: 1 * GiB })).toBe(true);
  });

  it("할당량을 모르면 시크릿일 수 있다고 본다", () => {
    expect(mayBeOffTheRecord({})).toBe(true);
    expect(mayBeOffTheRecord({ heapLimit: CHROME_HEAP })).toBe(true);
    expect(mayBeOffTheRecord({ quota: 0, heapLimit: CHROME_HEAP })).toBe(true);
    expect(mayBeOffTheRecord({ quota: Number.NaN, heapLimit: CHROME_HEAP })).toBe(true);
    expect(mayBeOffTheRecord({ quota: Number.POSITIVE_INFINITY, heapLimit: CHROME_HEAP })).toBe(true);
  });
});

describe("detectOffTheRecord", () => {
  it("일반 프로필: 힙 한도가 있고 할당량이 크면 꺼내도 된다", async () => {
    expect(await readProfileSignals(host(NORMAL_QUOTA, CHROME_HEAP))).toEqual({ quota: NORMAL_QUOTA, heapLimit: CHROME_HEAP });
    expect(await detectOffTheRecord(host(NORMAL_QUOTA, CHROME_HEAP))).toBe(false);
    expect(await detectOffTheRecord(host(NORMAL_QUOTA, CHROMIUM_HEAP))).toBe(false);
  });

  it("performance.memory 가 없으면 시크릿일 수 있다 (일반 프로필의 할당량이어도)", async () => {
    expect(await readProfileSignals(host(PRIVATE_QUOTA, undefined))).toEqual({ quota: PRIVATE_QUOTA, heapLimit: undefined });
    expect(await detectOffTheRecord(host(NORMAL_QUOTA, undefined))).toBe(true);
    expect(await detectOffTheRecord(host(PRIVATE_QUOTA, undefined))).toBe(true);
    expect(await detectOffTheRecord({ navigator: { storage: { estimate: async () => ({ quota: NORMAL_QUOTA }) } } })).toBe(true);
    const throwing: ProfileHost = {
      navigator: { storage: { estimate: async () => ({ quota: NORMAL_QUOTA }) } },
      performance: Object.defineProperty({}, "memory", {
        get() {
          throw new Error("blocked");
        },
      }),
    };
    expect(await detectOffTheRecord(throwing)).toBe(true);
  });

  it("할당량이 딱 2 GiB 거나 2 GiB 에 사용량을 더한 값이면 시크릿일 수 있다", async () => {
    expect(await detectOffTheRecord(host(PRIVATE_QUOTA, CHROME_HEAP))).toBe(true);
    expect(await detectOffTheRecord(host(PRIVATE_QUOTA, SMALL_HEAP))).toBe(true);
    for (const quota of PRIVATE_QUOTA_USED) {
      expect(await detectOffTheRecord(host(quota, CHROME_HEAP))).toBe(true);
      expect(await detectOffTheRecord(host(quota, SMALL_HEAP))).toBe(true);
    }
  });

  it("estimate 가 없거나 실패하면 시크릿일 수 있다고 본다", async () => {
    const memory = { memory: { jsHeapSizeLimit: CHROME_HEAP } };
    expect(await detectOffTheRecord({})).toBe(true);
    expect(await detectOffTheRecord({ performance: memory })).toBe(true);
    expect(await detectOffTheRecord({ navigator: {}, performance: memory })).toBe(true);
    expect(await detectOffTheRecord({ navigator: { storage: {} }, performance: memory })).toBe(true);
    expect(await detectOffTheRecord({ navigator: { storage: { estimate: () => Promise.reject(new Error("denied")) } }, performance: memory })).toBe(true);
    expect(await detectOffTheRecord({ navigator: { storage: { estimate: async () => ({}) } }, performance: memory })).toBe(true);
  });
});
