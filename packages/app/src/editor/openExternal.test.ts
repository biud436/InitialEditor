// 바깥 링크 열기 (openExternal.ts): 데스크톱은 opener 플러그인의 open_url, 브라우저는 window.open. 주소는 http, https 만.

import { describe, expect, it } from "vitest";
import { externalUrl, OPEN_URL_COMMAND, openExternal, openLink, type OpenExternalDeps } from "./openExternal";

function fakeDeps(tauri: boolean, fail?: Error) {
  const invoked: Array<[string, Record<string, unknown>]> = [];
  const opened: Array<[string, string, string]> = [];
  const deps: OpenExternalDeps = {
    tauri: () => tauri,
    invoke: async (command, args) => {
      invoked.push([command, args]);
      if (fail) throw fail;
    },
    open: (url, target, features) => {
      opened.push([url, target, features]);
      return null;
    },
  };
  return { deps, invoked, opened };
}

describe("openExternal", () => {
  it("데스크톱 앱은 tauri-plugin-opener 의 open_url 로 연다 (window.open 은 부르지 않는다)", async () => {
    const t = fakeDeps(true);
    await openExternal("https://github.com/biud436/InitialEditor/releases", t.deps);
    expect(OPEN_URL_COMMAND).toBe("plugin:opener|open_url");
    expect(t.invoked).toEqual([[OPEN_URL_COMMAND, { url: "https://github.com/biud436/InitialEditor/releases" }]]);
    expect(t.opened).toEqual([]);
  });

  it("브라우저는 새 탭(window.open, noopener)으로 연다 (플러그인을 부르지 않는다)", async () => {
    const t = fakeDeps(false);
    await openExternal("https://initial-editor.biud436.com", t.deps);
    expect(t.opened).toEqual([["https://initial-editor.biud436.com/", "_blank", "noopener,noreferrer"]]);
    expect(t.invoked).toEqual([]);
  });

  it("http 와 https 만 연다. 다른 것은 두 모드 모두 아무것도 부르지 않고 던진다", async () => {
    for (const tauri of [true, false]) {
      const t = fakeDeps(tauri);
      await expect(openExternal("file:///etc/passwd", t.deps)).rejects.toThrow("http 나 https URL 만 열기 가능: file:///etc/passwd");
      await expect(openExternal("javascript:alert(1)", t.deps)).rejects.toThrow("http 나 https URL 만 열기 가능: javascript:alert(1)");
      await expect(openExternal("그냥 글", t.deps)).rejects.toThrow("URL 형식 아님: 그냥 글");
      expect(t.invoked).toEqual([]);
      expect(t.opened).toEqual([]);
    }
    expect(externalUrl("  http://127.0.0.1:8788/a b ")).toBe("http://127.0.0.1:8788/a%20b");
  });

  it("openLink: 열지 못하면 콘솔에 한 줄, 토스트 하나를 남기고 false", async () => {
    const lines: string[] = [];
    const toasts: string[] = [];
    const host = { log: { warn: (_s: string, t: string) => lines.push(t) }, toasts: { warn: (t: string) => toasts.push(t) } };
    const ok = fakeDeps(true);
    expect(await openLink(host, "https://github.com/biud436/Initial2D", ok.deps)).toBe(true);
    expect(lines).toEqual([]);

    const denied = fakeDeps(true, new Error("url not allowed on the configured scope"));
    expect(await openLink(host, "https://example.com/", denied.deps)).toBe(false);
    expect(lines).toEqual(["링크 열기 실패: https://example.com/ (url not allowed on the configured scope)"]);
    expect(toasts).toEqual(lines);
  });
});
