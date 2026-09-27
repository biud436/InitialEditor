// @vitest-environment jsdom
// 정보 창 (AboutDialog.tsx): 판, 커밋, 웹 엔진 커밋, 데스크톱 앱의 찾은 엔진, 모드별 링크(데스크톱은 opener, 브라우저는 window.open), 제3자 고지.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RELEASES_URL, WEB_EDITION_URL } from "../editor/about";
import type { BackendMode } from "../editor/backends";
import type { EngineManifest } from "../editor/gameView/engineAssets";
import { ModalStore } from "../editor/modals";
import { OPEN_URL_COMMAND, type OpenExternalDeps } from "../editor/openExternal";
import { openAboutDialog, webEngineText, type AboutHost } from "./AboutDialog";

afterEach(cleanup);

const MANIFEST: EngineManifest = { engineCommit: "179cecce0a0918d06061af8ff58009fc494dc7ae", engineDirty: false, features: ["lua", "mruby", "wasm"], files: [] };

function setup(mode: BackendMode, loadFeatures: () => Promise<string[]> = async () => MANIFEST.features) {
  const modals = new ModalStore();
  const warnings: string[] = [];
  const view = { manifest: null as EngineManifest | null, loadFeatures: async () => {
    const f = await loadFeatures();
    view.manifest = MANIFEST;
    return f;
  } };
  const host: AboutHost = {
    mode,
    version: "2.0.0-dev",
    platform: "mac",
    modals,
    gameView: view,
    log: { warn: (_s, t) => warnings.push(t) },
    toasts: { warn: () => undefined },
  };
  const invoked: Array<[string, Record<string, unknown>]> = [];
  const opened: string[] = [];
  const open: OpenExternalDeps = {
    tauri: () => mode === "tauri",
    invoke: async (command, args) => {
      invoked.push([command, args]);
    },
    open: (url) => {
      opened.push(url);
      return null;
    },
  };
  return { host, modals, invoked, opened, open, warnings };
}

/** 맨 위의 사용자 정의 모달을 그린다 (Modals.tsx 처럼 닫기는 resolve 다) */
function renderTop(modals: ModalStore) {
  const spec = modals.top;
  if (!spec || spec.kind !== "custom") throw new Error("사용자 정의 모달이 없다");
  render(<>{spec.render(() => spec.resolve())}</>);
  return spec;
}

describe("정보 창", () => {
  it("판, 커밋(빌드 도장, 테스트는 dev), 모드를 보이고 웹 엔진 줄은 MANIFEST 를 읽은 뒤 커밋과 기능이다", async () => {
    const t = setup("browser");
    void openAboutDialog(t.host, { open: t.open });
    expect(renderTop(t.modals).title).toBe("InitialEditor 정보");
    expect(screen.getByTestId("about-version").textContent).toBe("2.0.0-dev");
    expect(screen.getByTestId("about-commit").textContent).toBe("dev");
    expect(screen.getByTestId("about-mode").textContent).toBe("브라우저 폴더, 플랫폼 mac");
    const engine = screen.getByTestId("about-web-engine");
    await waitFor(() => expect(engine.getAttribute("data-state")).toBe("ready"));
    expect(engine.textContent).toBe("179cecc (lua mruby wasm)");
  });

  it("웹 엔진을 읽지 못하면 그 이유를 적는다", async () => {
    const t = setup("tauri", async () => {
      throw new Error("웹 엔진 파일이 없다");
    });
    void openAboutDialog(t.host, { open: t.open });
    renderTop(t.modals);
    const engine = screen.getByTestId("about-web-engine");
    await waitFor(() => expect(engine.getAttribute("data-state")).toBe("error"));
    expect(engine.textContent).toBe("읽지 못했다: 웹 엔진 파일이 없다");
  });

  it("데스크톱 앱은 찾은 엔진 줄을 보인다 (앱에 든 엔진이면 판). 웹판에는 그 줄이 없다", async () => {
    const t = setup("tauri");
    const runner = { engineDescription: "앱에 든 엔진 (cac4b94, lua mruby)" as string | null, resolving: false };
    void openAboutDialog({ ...t.host, runner, project: { isOpen: true } }, { open: t.open });
    renderTop(t.modals);
    expect(screen.getByTestId("about-engine").textContent).toBe("앱에 든 엔진 (cac4b94, lua mruby)");
    await waitFor(() => expect(screen.getByTestId("about-web-engine").getAttribute("data-state")).toBe("ready"));

    cleanup();
    const missing = setup("tauri");
    void openAboutDialog({ ...missing.host, runner: { engineDescription: null, resolving: false }, project: { isOpen: true } }, { open: missing.open });
    renderTop(missing.modals);
    expect(screen.getByTestId("about-engine").textContent).toBe("없음 (F5 는 에디터 안에서 돈다)");
    await waitFor(() => expect(screen.getByTestId("about-web-engine").getAttribute("data-state")).toBe("ready"));

    cleanup();
    const web = setup("browser");
    void openAboutDialog({ ...web.host, runner, project: { isOpen: true } }, { open: web.open });
    renderTop(web.modals);
    expect(screen.queryByTestId("about-engine")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("about-web-engine").getAttribute("data-state")).toBe("ready"));
  });

  it("webEngineText: 커밋 일곱 자리와 기능, 커밋 안 된 변경이면 그렇다고", () => {
    expect(webEngineText(MANIFEST)).toBe("179cecc (lua mruby wasm)");
    expect(webEngineText({ ...MANIFEST, engineCommit: null, engineDirty: true, features: ["lua", "wasm"] })).toBe("커밋 모름 (lua wasm, 커밋 안 된 변경)");
  });

  it("데스크톱 앱은 웹판 열기이고 opener 플러그인으로 연다", () => {
    const t = setup("tauri");
    void openAboutDialog(t.host, { open: t.open });
    renderTop(t.modals);
    const link = screen.getByTestId("about-edition");
    expect(link.textContent).toBe("웹판 열기");
    expect(link.getAttribute("target")).toBeNull();
    fireEvent.click(link);
    expect(t.invoked).toEqual([[OPEN_URL_COMMAND, { url: WEB_EDITION_URL }]]);
    expect(t.opened).toEqual([]);
    fireEvent.click(screen.getByTestId("about-plans"));
    expect(t.invoked[1]).toEqual([OPEN_URL_COMMAND, { url: "https://github.com/biud436/InitialEditor/blob/next/docs/plans/index.md" }]);
  });

  it("웹판은 데스크톱 앱 받기이고 새 탭으로 연다", () => {
    const t = setup("browser");
    void openAboutDialog(t.host, { open: t.open });
    renderTop(t.modals);
    const link = screen.getByTestId("about-edition");
    expect(link.textContent).toBe("데스크톱 앱 받기");
    fireEvent.click(link);
    expect(t.opened).toEqual([RELEASES_URL]);
    expect(t.invoked).toEqual([]);
  });

  it("제3자 고지는 엔진 고지 파일의 글을 보이고, 읽지 못하면 이유를 보인다", async () => {
    const t = setup("browser");
    void openAboutDialog(t.host, { open: t.open, notices: async () => "# 제3자 고지\n\n| SDL2 | zlib |\n" });
    renderTop(t.modals);
    fireEvent.click(screen.getByTestId("about-notices"));
    expect(t.modals.stack.map((m) => m.title)).toEqual(["InitialEditor 정보", "제3자 고지"]);
    cleanup();
    renderTop(t.modals);
    await waitFor(() => expect(screen.getByTestId("notices-text").textContent).toBe("# 제3자 고지\n\n| SDL2 | zlib |\n"));
    fireEvent.click(screen.getByTestId("notices-editor"));
    expect(t.opened).toEqual(["https://github.com/biud436/InitialEditor/tree/next/src-tauri/licenses"]);

    cleanup();
    const failing = setup("browser");
    void openAboutDialog(failing.host, {
      open: failing.open,
      notices: async () => {
        throw new Error("engine/THIRD-PARTY.md 을(를) 읽지 못했다 (HTTP 404)");
      },
    });
    renderTop(failing.modals);
    fireEvent.click(screen.getByTestId("about-notices"));
    cleanup();
    renderTop(failing.modals);
    await waitFor(() => expect(screen.getByTestId("notices-error").textContent).toBe("engine/THIRD-PARTY.md 을(를) 읽지 못했다 (HTTP 404)"));
  });
});
