import { afterEach, describe, expect, it, vi } from "vitest";
import { FsAccessBackend, OPFS_ROOT, PRIVATE_PROFILE_MESSAGE } from "@initial-editor/backend-fsaccess";
import { chooseMode, createBackend, isFolderFallback, isLocalHost, parseQuery, resolveBridgeUrl } from "./backends";

const GiB = 1024 * 1024 * 1024;

/** performance.memory 를 흉내 낸다 (undefined 면 없앤다) */
function stubHeapLimit(jsHeapSizeLimit: number | undefined) {
  Object.defineProperty(globalThis.performance, "memory", { value: jsHeapSizeLimit === undefined ? undefined : { jsHeapSizeLimit }, configurable: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis.performance as { memory?: unknown }).memory;
});

describe("backends", () => {
  it("Tauri 안이면 늘 tauri", () => {
    expect(chooseMode({ backend: "memory" }, {}, true, "example.com")).toBe("tauri");
  });

  it("명시가 우선이고, 없으면 로컬은 브리지, 배포된 페이지는 메모리", () => {
    expect(chooseMode({ backend: "memory" }, {}, false, "localhost")).toBe("memory");
    expect(chooseMode({ backend: "bridge" }, {}, false, "initial-editor.pages.dev")).toBe("bridge");
    expect(chooseMode({}, { VITE_DEFAULT_BACKEND: "memory" }, false, "localhost")).toBe("memory");
    expect(chooseMode({}, {}, false, "localhost")).toBe("bridge");
    expect(chooseMode({}, {}, false, "127.0.0.1")).toBe("bridge");
    expect(chooseMode({}, {}, false, "")).toBe("bridge");
    expect(chooseMode({}, {}, false, "initial-editor.pages.dev", false)).toBe("memory");
    expect(isLocalHost("[::1]")).toBe(true);
    expect(isLocalHost("example.com")).toBe(false);
  });

  it("배포된 페이지: 폴더 열기가 있으면(크롬, 엣지) 브라우저 폴더, 없으면(파이어폭스, 사파리) 메모리와 안내", () => {
    expect(chooseMode({}, {}, false, "initial-editor.pages.dev", true)).toBe("browser");
    expect(chooseMode({}, {}, false, "initial-editor.pages.dev", false)).toBe("memory");
    expect(isFolderFallback("memory", "initial-editor.pages.dev", false)).toBe(true);
    expect(isFolderFallback("memory", "initial-editor.pages.dev", true)).toBe(false);
    expect(isFolderFallback("memory", "localhost", false)).toBe(false);
    expect(isFolderFallback("browser", "initial-editor.pages.dev", false)).toBe(false);
    // 로컬 페이지는 여전히 브리지
    expect(chooseMode({}, {}, false, "127.0.0.1", true)).toBe("bridge");
  });

  it("?backend=browser 와 ?backend=opfs 는 브라우저 폴더를 강제하고, opfs 는 바로 연다", () => {
    expect(chooseMode({ backend: "browser" }, {}, false, "localhost", false)).toBe("browser");
    expect(chooseMode({ backend: "opfs" }, {}, false, "localhost", true)).toBe("browser");
    expect(chooseMode({}, { VITE_DEFAULT_BACKEND: "browser" }, false, "localhost", true)).toBe("browser");
    const opfs = createBackend("browser", { backend: "opfs" });
    expect(opfs.backend).toBeInstanceOf(FsAccessBackend);
    expect(opfs.backend.kind).toBe("browser");
    expect(opfs.autoOpenRoot).toBe(OPFS_ROOT);
    expect(createBackend("browser", { backend: "browser" }).autoOpenRoot).toBeUndefined();
  });

  it("브라우저 폴더 백엔드는 시크릿 짐작을 쓴다: 일반 프로필이라고 확신할 때만 기억한 핸들을 꺼낸다", async () => {
    // IndexedDB 가 있는 브라우저처럼 보이게 한다 (restoreBlocker 는 IndexedDB 를 열지 않는다)
    vi.stubGlobal("indexedDB", {});
    const blocker = async (quota: number | undefined, heapLimit: number | undefined) => {
      vi.stubGlobal("navigator", quota === undefined ? {} : { storage: { estimate: async () => ({ quota }) } });
      stubHeapLimit(heapLimit);
      const backend = createBackend("browser", { backend: "browser" }).backend as FsAccessBackend;
      return backend.handles.restoreBlocker("folder-x");
    };
    // 일반 프로필 (크롬 153: 할당량 10 GiB, 힙 한도 4192 MiB)
    expect(await blocker(10 * GiB, 4395630592)).toBeNull();
    // 할당량을 모른다
    expect(await blocker(undefined, 4395630592)).toBe(PRIVATE_PROFILE_MESSAGE);
    // performance.memory 가 없다
    expect(await blocker(10 * GiB, undefined)).toBe(PRIVATE_PROFILE_MESSAGE);
    // 시크릿 창과 게스트 창: 딱 2 GiB, 쓴 뒤에는 2 GiB 에 사용량을 더한 값. 힙 한도가 작아도 마찬가지
    expect(await blocker(2 * GiB, 4395630592)).toBe(PRIVATE_PROFILE_MESSAGE);
    expect(await blocker(2 * GiB, 1044381696)).toBe(PRIVATE_PROFILE_MESSAGE);
    expect(await blocker(2147557376, 1044381696)).toBe(PRIVATE_PROFILE_MESSAGE);
  });

  it("질의와 브리지 URL", () => {
    expect(parseQuery("?backend=memory&sample=nogame&url=http://127.0.0.1:5961/")).toEqual({ backend: "memory", sample: "nogame", url: "http://127.0.0.1:5961/" });
    expect(resolveBridgeUrl({ url: "http://127.0.0.1:5961/" }, "http://x")).toBe("http://127.0.0.1:5961");
    expect(resolveBridgeUrl({}, "http://x/")).toBe("http://x");
    expect(resolveBridgeUrl({}, undefined)).toBe("http://127.0.0.1:5960");
  });
});
