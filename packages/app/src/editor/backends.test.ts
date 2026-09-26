import { describe, expect, it } from "vitest";
import { chooseMode, isLocalHost, parseQuery, resolveBridgeUrl } from "./backends";

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
    expect(chooseMode({}, {}, false, "initial-editor.pages.dev")).toBe("memory");
    expect(isLocalHost("[::1]")).toBe(true);
    expect(isLocalHost("example.com")).toBe(false);
  });

  it("질의와 브리지 URL", () => {
    expect(parseQuery("?backend=memory&sample=nogame&url=http://127.0.0.1:5961/")).toEqual({ backend: "memory", sample: "nogame", url: "http://127.0.0.1:5961/" });
    expect(resolveBridgeUrl({ url: "http://127.0.0.1:5961/" }, "http://x")).toBe("http://127.0.0.1:5961");
    expect(resolveBridgeUrl({}, "http://x/")).toBe("http://x");
    expect(resolveBridgeUrl({}, undefined)).toBe("http://127.0.0.1:5960");
  });
});
