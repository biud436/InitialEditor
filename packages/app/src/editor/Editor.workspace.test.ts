// @vitest-environment jsdom
// 에디터가 확장에게 넘기는 작업 공간 (docs/plans/e5-rpg.md 2.1): 지금 백엔드, 프로젝트 열기와 닫기, 파일 변경, 열린 문서,
// 콘솔과 토스트, 파일 열기. 백엔드를 바꿔도 손잡이는 새 것을 본다.
import { MemoryBackend, MemorySettingsStorage, type ChangeEvent } from "@initial-editor/core";
import { describe, expect, it, vi } from "vitest";
import { Editor } from "./Editor";
import { fakeLayer } from "./maps/__fixtures__/fakeLayer";
import { layerCommandId } from "./maps/extLayers";
import { OBJECTS_PLAY_PROVIDER_ID } from "./maps/objectTools/playProvider";

// 에디터가 스크립트 편집기(Monaco)를 불러오지만 이 테스트는 쓰지 않는다. jsdom 에는 캔버스 2D 가 없어 PIXI 에 null 을 준다
vi.mock("./scripting", () => ({ installScriptSupport: () => {} }));
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

function makeEditor(backend: MemoryBackend) {
  const store = new Map<string, string>();
  return new Editor({
    mode: "memory",
    backend,
    storage: new MemorySettingsStorage(),
    platform: "mac",
    local: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    themeTarget: document.documentElement,
    themeSource: { current: () => "dark", subscribe: () => () => {} },
  });
}

describe("에디터의 작업 공간", () => {
  it("확장 호스트가 에디터의 문서, 콘솔, 토스트, 백엔드를 준다", () => {
    const backend = new MemoryBackend();
    const editor = makeEditor(backend);
    const ws = editor.extensions.workspace;
    expect(ws.documents).toBe(editor.documents);
    expect(ws.log).toBe(editor.log);
    expect(ws.toasts).toBe(editor.toasts);
    expect(ws.backend()).toBe(backend);
    expect(ws.project.isOpen).toBe(false);
    editor.dispose();
  });

  it("프로젝트를 열고 닫으면 알리고, 파일 변경을 알리며, 백엔드를 바꾸면 새 백엔드와 새 프로젝트를 본다", async () => {
    const backend = new MemoryBackend({ "game.json": "{}", "resources/schema/x.json": "{}" });
    const editor = makeEditor(backend);
    const ws = editor.extensions.workspace;
    const seen: string[] = [];
    ws.project.onOpened(() => seen.push(`opened:${ws.project.root}`));
    ws.project.onClosed(() => seen.push("closed"));
    ws.project.onFileChange((e: ChangeEvent) => seen.push(`change:${e.path}:${e.origin}`));
    expect(await editor.openProject("/p")).toBe(true);
    expect(ws.project.isOpen).toBe(true);
    backend.simulateExternalChange("resources/schema/x.json", "modify", '{"a":1}');
    expect(await editor.closeProject()).toBe(true);
    expect(seen).toEqual(["opened:/p", "change:resources/schema/x.json:external", "closed"]);

    const next = new MemoryBackend({ "game.json": "{}" });
    await editor.replaceBackend(next);
    expect(ws.backend()).toBe(next);
    await editor.openProject("/q");
    next.simulateExternalChange("game.json", "modify", "{}");
    expect(seen.slice(3)).toEqual(["opened:/q", "change:game.json:external"]);
    editor.dispose();
  });

  it("openPath 는 에디터의 열기(맵 지원이 감싼 것 포함)를 부른다", async () => {
    const editor = makeEditor(new MemoryBackend());
    const opened: string[] = [];
    editor.openPath = async (path: string) => void opened.push(path);
    await editor.extensions.workspace.openPath("resources/maps/a.json");
    expect(opened).toEqual(["resources/maps/a.json"]);
    editor.dispose();
  });
});

describe("에디터의 타일맵 자리", () => {
  it("시작하면 타일맵 확장의 내보내기를 editor.tilemap 으로 들고, 기본 실행 제공자와 레이어 커맨드를 붙인다", async () => {
    const editor = makeEditor(new MemoryBackend());
    await editor.start();
    const tilemap = editor.tilemap!;
    expect(tilemap).not.toBeNull();
    expect(tilemap.playProviders.map((p) => [p.id, p.priority])).toEqual([[OBJECTS_PLAY_PROVIDER_ID, 0]]);
    // 확장의 실행 길은 앱이 넣은 것이다 (여기서 실행과 같이 러너의 이유를 따른다)
    expect(tilemap.playBlocked()).toBe(editor.runner.startHint);
    expect(tilemap.playBlocked()).toBe("프로젝트를 먼저 연다");
    const off = tilemap.registerMapLayer(fakeLayer({ toolKey: "M" }).spec);
    expect(editor.commands.get(layerCommandId("test.marks"))?.shortcut).toBe("M");
    expect(editor.mapSupport.layers().map((l) => l.id)).toEqual(["test.marks"]);
    off();
    expect(editor.commands.get(layerCommandId("test.marks"))).toBeUndefined();
    expect(editor.mapSupport.layers()).toEqual([]);
    editor.dispose();
  });
});
