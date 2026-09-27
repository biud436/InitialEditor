// 정보 창과 시작 화면의 판과 링크 (about.ts).

import { describe, expect, it } from "vitest";
import { APP_COMMIT, editionLink, foundEngineText, loadEngineNotices, RELEASES_URL, rubyNoteFor, WEB_EDITION_URL, WEB_NO_RUBY, webLimits } from "./about";

describe("about", () => {
  it("테스트에는 빌드 도장이 없어 커밋이 dev 다", () => {
    expect(APP_COMMIT).toBe("dev");
  });

  it("데스크톱 앱은 웹판 열기, 나머지 모드는 데스크톱 앱 받기 (릴리스 페이지)", () => {
    expect(editionLink("tauri")).toEqual({ label: "웹판 열기", url: WEB_EDITION_URL });
    for (const mode of ["browser", "memory", "bridge"] as const) expect(editionLink(mode)).toEqual({ label: "데스크톱 앱 받기", url: RELEASES_URL });
    expect(WEB_EDITION_URL).toBe("https://initial-editor.biud436.com/");
    expect(RELEASES_URL).toBe("https://github.com/biud436/InitialEditor/releases");
  });

  it("찾은 엔진 한 줄: 찾은 것이 있으면 그것, 없으면 프로젝트가 열렸는지와 찾는 중인지로", () => {
    expect(foundEngineText({ engineDescription: "앱에 든 엔진 (cac4b94, lua mruby)", resolving: false }, true)).toBe("앱에 든 엔진 (cac4b94, lua mruby)");
    expect(foundEngineText({ engineDescription: null, resolving: false }, false)).toBe("프로젝트를 열면 찾는다");
    expect(foundEngineText({ engineDescription: null, resolving: true }, true)).toBe("찾는 중");
    expect(foundEngineText({ engineDescription: null, resolving: false }, true)).toBe("없음 (F5 는 에디터 안에서 돈다)");
  });

  it("웹판에서 안 되는 것: Ruby 실행은 웹 엔진에 mruby 가 없다고 알 때만 더한다", () => {
    expect(webLimits(null)).toEqual(["엔진 프로세스 실행", "안드로이드 스테이징"]);
    expect(webLimits(["lua", "mruby", "wasm"])).toEqual(["엔진 프로세스 실행", "안드로이드 스테이징"]);
    expect(webLimits(["lua", "wasm"])).toEqual(["엔진 프로세스 실행", "안드로이드 스테이징", "Ruby 게임 실행"]);
  });

  it("새 프로젝트의 Ruby 안내는 웹판에서 웹 엔진에 mruby 가 없을 때만", () => {
    expect(rubyNoteFor("browser", ["lua", "wasm"])).toBe(WEB_NO_RUBY);
    expect(rubyNoteFor("browser", ["lua", "mruby", "wasm"])).toBeNull();
    expect(rubyNoteFor("browser", null)).toBeNull();
    expect(rubyNoteFor("tauri", ["lua", "wasm"])).toBeNull();
  });

  it("엔진 제3자 고지는 engine/THIRD-PARTY.md 에서 캐시를 거치지 않고 읽는다. 없으면 이유를 던진다", async () => {
    const asked: Array<[string, RequestInit | undefined]> = [];
    const ok = (async (url: string, init?: RequestInit) => {
      asked.push([url, init]);
      return new Response("# 제3자 고지\n", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await loadEngineNotices(ok, "https://initial-editor.biud436.com/engine/")).toBe("# 제3자 고지\n");
    expect(asked).toEqual([["https://initial-editor.biud436.com/engine/THIRD-PARTY.md", { cache: "no-cache" }]]);

    const missing = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await expect(loadEngineNotices(missing, "http://127.0.0.1:4173/engine/")).rejects.toThrow("engine/THIRD-PARTY.md 을(를) 읽지 못했다 (HTTP 404)");
  });
});
