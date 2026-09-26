// 시크릿 프로필 짐작 (profile.ts). 숫자는 크롬에서 잰 값이다: 시크릿 창과 Playwright 기본 컨텍스트는 할당량 2048 MiB,
// 일반 프로필과 launchPersistentContext 는 10240 MiB, 힙 한도는 3586 MiB(크로미움)와 4192 MiB(크롬).

import { describe, expect, it } from "vitest";
import { detectOffTheRecord, FALLBACK_HEAP_LIMIT, mayBeOffTheRecord, readProfileSignals, type ProfileHost } from "../src/profile";

const MiB = 1024 * 1024;

function host(quota: number | undefined, heapLimit: number | undefined): ProfileHost {
  return {
    navigator: { storage: { estimate: async () => ({ quota }) } },
    performance: heapLimit === undefined ? {} : { memory: { jsHeapSizeLimit: heapLimit } },
  };
}

describe("mayBeOffTheRecord", () => {
  it("할당량이 힙 한도의 두 배보다 작으면 시크릿일 수 있다", () => {
    expect(mayBeOffTheRecord({ quota: 2048 * MiB, heapLimit: 4192 * MiB })).toBe(true);
    expect(mayBeOffTheRecord({ quota: 2048 * MiB, heapLimit: 3586 * MiB })).toBe(true);
    expect(mayBeOffTheRecord({ quota: 2 * 4192 * MiB - 1, heapLimit: 4192 * MiB })).toBe(true);
  });

  it("할당량이 힙 한도의 두 배 이상이면 일반 프로필이다", () => {
    expect(mayBeOffTheRecord({ quota: 10240 * MiB, heapLimit: 4192 * MiB })).toBe(false);
    expect(mayBeOffTheRecord({ quota: 10240 * MiB, heapLimit: 3586 * MiB })).toBe(false);
    expect(mayBeOffTheRecord({ quota: 2 * 4192 * MiB, heapLimit: 4192 * MiB })).toBe(false);
  });

  it("힙 한도를 모르면 1 GiB 로 친다", () => {
    expect(FALLBACK_HEAP_LIMIT).toBe(1024 * MiB);
    expect(mayBeOffTheRecord({ quota: 1536 * MiB })).toBe(true);
    expect(mayBeOffTheRecord({ quota: 2048 * MiB })).toBe(false);
    expect(mayBeOffTheRecord({ quota: 1536 * MiB, heapLimit: 0 })).toBe(true);
    expect(mayBeOffTheRecord({ quota: 4096 * MiB, heapLimit: Number.NaN })).toBe(false);
  });

  it("할당량을 모르면 시크릿일 수 있다고 본다", () => {
    expect(mayBeOffTheRecord({})).toBe(true);
    expect(mayBeOffTheRecord({ heapLimit: 4192 * MiB })).toBe(true);
    expect(mayBeOffTheRecord({ quota: 0, heapLimit: 4192 * MiB })).toBe(true);
    expect(mayBeOffTheRecord({ quota: Number.NaN, heapLimit: 4192 * MiB })).toBe(true);
  });
});

describe("detectOffTheRecord", () => {
  it("브라우저에서 잰 값으로 가른다", async () => {
    expect(await detectOffTheRecord(host(10240 * MiB, 4192 * MiB))).toBe(false);
    expect(await detectOffTheRecord(host(2048 * MiB, 4192 * MiB))).toBe(true);
    expect(await readProfileSignals(host(2048 * MiB, undefined))).toEqual({ quota: 2048 * MiB, heapLimit: undefined });
    expect(await detectOffTheRecord(host(1536 * MiB, undefined))).toBe(true);
    expect(await detectOffTheRecord(host(4096 * MiB, undefined))).toBe(false);
  });

  it("estimate 가 없거나 실패하면 시크릿일 수 있다고 본다", async () => {
    expect(await detectOffTheRecord({})).toBe(true);
    expect(await detectOffTheRecord({ navigator: {} })).toBe(true);
    expect(await detectOffTheRecord({ navigator: { storage: { estimate: () => Promise.reject(new Error("denied")) } } })).toBe(true);
  });
});
