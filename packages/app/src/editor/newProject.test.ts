// 새 프로젝트 (newProject.ts). 웹판(브라우저 폴더 모드)은 폴더를 먼저 고르고(클릭 안에서), 열린 프로젝트를 닫고,
// 브라우저가 기억한 뒤 브라우저 폴더 백엔드로 바꿔 템플릿을 쓰고 연다. 샘플(메모리 백엔드)을 열어 둔 채로도 된다.
// 폴더 고르기나 닫기를 취소하면 아무것도 바꾸지 않는다. 메모리와 브리지 모드는 이유와 함께 꺼진다. 데스크톱 흐름은 그대로다.

import { FsAccessBackend, HandleStore, MemoryFolderTable, type FsDirHandle } from "@initial-editor/backend-fsaccess";
import { MemoryBackend, parseGameJson } from "@initial-editor/core";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeFs } from "../../../backend-fsaccess/test/fakeFs";
import { WEB_NO_RUBY } from "./about";
import { SAMPLE_ROOT } from "./backends";
import { browserFolders } from "./browserFolders";
import type { Editor } from "./Editor";
import { createNewProject, NEW_PROJECT_BRIDGE, NEW_PROJECT_MEMORY, NEW_PROJECT_NO_PICKER, newProjectBlocker, type NewProjectDeps, type NewProjectDialogDefaults } from "./newProject";
import { writeProjectTemplate, type ProjectTemplateOptions } from "./scene/projectTemplates";
import type { TemplateSource } from "./scene/templateFiles";

const TEMPLATES_DIR = fileURLToPath(new URL("../../templates/", import.meta.url));
/** 번들 대신 저장소의 templates/ 를 읽는 소스 (Node) */
const fsSource: TemplateSource = {
  text: (p) => fs.readFileSync(TEMPLATES_DIR + p, "utf8"),
  binary: async (p) => new Uint8Array(fs.readFileSync(TEMPLATES_DIR + p)),
};

type PickerHost = { showDirectoryPicker?: unknown };
const host = globalThis as PickerHost;
let hadPicker = false;

beforeAll(() => {
  hadPicker = "showDirectoryPicker" in host;
  // 폴더 열기가 있는 브라우저처럼 (BrowserFolders.supported). 실제 고르기는 FsAccessBackend 의 picker 가짜가 한다
  host.showDirectoryPicker = async () => null;
});

afterAll(() => {
  if (!hadPicker) delete host.showDirectoryPicker;
});

interface SetupOptions {
  mode?: Editor["mode"];
  /** 처음 백엔드: 샘플을 연 메모리, 또는 브라우저 폴더 */
  start?: "sample" | "folder";
  /** 닫을 때 저장하지 않은 문서가 있어 묻고, 이 답을 한다 */
  dirtyAnswer?: boolean;
  /** 폴더가 비어 있지 않을 때 묻는 확인의 답 */
  confirmAnswer?: boolean;
}

function setup(opts: SetupOptions = {}) {
  const disk = new FakeFs({ name: "newgame" });
  const handles = new HandleStore(new MemoryFolderTable(), { offTheRecord: async () => true });
  const picks: (FsDirHandle | null)[] = [];
  const folderBackend = new FsAccessBackend({ handles, picker: async () => picks.shift() ?? null });
  const sample = new MemoryBackend({ "game.json": "{}\n" });
  const state = {
    open: (opts.start ?? "sample") === "sample" ? SAMPLE_ROOT : null as string | null,
    dirty: opts.dirtyAnswer !== undefined,
    closeAsked: 0,
    confirms: [] as string[],
    opened: [] as string[],
    replaced: [] as unknown[],
    success: [] as string[],
    warn: [] as string[],
    errors: [] as string[],
    logs: [] as string[],
  };
  const editor = {
    mode: opts.mode ?? "browser",
    backend: (opts.start ?? "sample") === "sample" ? (sample as unknown as Editor["backend"]) : folderBackend,
    gameView: undefined,
    events: { on: () => () => {} },
    settings: { settings: { recentProjects: [] as string[] }, removeRecentProject: () => {} },
    modals: {
      confirm: async ({ message }: { message: string }) => {
        state.confirms.push(message);
        return opts.confirmAnswer ?? true;
      },
    },
    toasts: {
      info: () => {},
      success: (t: string) => state.success.push(t),
      warn: (t: string) => state.warn.push(t),
      error: (t: string) => state.errors.push(t),
    },
    log: { info: (_s: string, t: string) => state.logs.push(t), error: (_s: string, t: string) => state.errors.push(t), append: () => {}, warn: () => {} },
    async closeProject(): Promise<boolean> {
      if (!state.open) return true;
      if (state.dirty) {
        state.closeAsked++;
        if (!opts.dirtyAnswer) return false;
      }
      state.open = null;
      state.dirty = false;
      return true;
    },
    async replaceBackend(backend: unknown): Promise<boolean> {
      if (!(await editor.closeProject())) return false;
      editor.backend = backend as Editor["backend"];
      state.replaced.push(backend);
      return true;
    },
    async openProject(root: string): Promise<boolean> {
      state.open = root;
      state.opened.push(root);
      return true;
    },
  };
  const e = editor as unknown as Editor;
  browserFolders(e, folderBackend);
  const dialogs: NewProjectDialogDefaults[] = [];
  const deps = (answer: ProjectTemplateOptions | null, features: string[] | null = ["lua", "mruby", "wasm"]): NewProjectDeps => ({
    dialog: async (_editor, defaults) => {
      dialogs.push(defaults);
      return answer;
    },
    webFeatures: async () => features,
    write: (backend, options) => writeProjectTemplate(backend, options, fsSource),
  });
  return { editor, e, disk, handles, picks, folderBackend, sample, state, dialogs, deps };
}

describe("새 프로젝트 (웹판, 브라우저 폴더)", () => {
  it("샘플을 연 채로: 폴더를 고르고, 샘플을 닫고, 기억하고, 브라우저 폴더 백엔드로 바꿔 플래피 템플릿을 쓴 뒤 연다", async () => {
    const t = setup();
    t.picks.push(t.disk.root());
    expect(await createNewProject(t.e, t.deps({ template: "flappy", language: "lua", name: "newgame" }))).toBe(true);

    const records = await t.handles.list();
    expect(records.map((r) => r.name)).toEqual(["newgame"]);
    expect(t.editor.backend).toBe(t.folderBackend);
    expect(t.state.replaced).toEqual([t.folderBackend]);
    expect(t.state.opened).toEqual([records[0].key]);
    expect(t.dialogs).toEqual([{ name: "newgame", folder: "newgame", rubyNote: null }]);
    expect(t.state.confirms).toEqual([]);

    const game = parseGameJson(t.disk.readFile("game.json")!);
    expect(game).toMatchObject({ name: "newgame", script: "lua", startScene: "flappy" });
    for (const p of ["scripts/lua/main.lua", "scripts/lua/scene_loader.lua", "resources/scenes/flappy.json", "scripts/lua/components/flappy/bird.lua", ".gitignore"]) {
      expect(t.disk.readFile(p), p).not.toBeNull();
    }
    expect(t.disk.nodeAt(["resources", "bird_276x64.png"])?.kind).toBe("file");
    expect(t.disk.readFile("scripts/ruby/main.rb")).toBeNull();
    expect(t.state.success).toEqual(["새 프로젝트: newgame"]);
    expect(t.state.errors).toEqual([]);
  });

  it("웹 엔진에 mruby 가 없으면 대화상자가 Ruby 안내를 받는다", async () => {
    const t = setup();
    t.picks.push(t.disk.root());
    expect(await createNewProject(t.e, t.deps({ template: "empty", language: "mruby", name: "newgame" }, ["lua", "wasm"]))).toBe(true);
    expect(t.dialogs).toEqual([{ name: "newgame", folder: "newgame", rubyNote: WEB_NO_RUBY }]);
    expect(parseGameJson(t.disk.readFile("game.json")!)).toMatchObject({ script: "mruby", startScene: "main" });
    expect(t.disk.readFile("scripts/ruby/main.rb")).not.toBeNull();
  });

  it("대화상자에서 취소하면 기억하지도 백엔드를 바꾸지도 않고 폴더에 쓰지 않는다 (샘플은 닫혔다)", async () => {
    const t = setup();
    t.picks.push(t.disk.root());
    expect(await createNewProject(t.e, t.deps(null))).toBe(false);
    expect(t.dialogs).toHaveLength(1);
    expect(t.state.open).toBeNull();
    expect(await t.handles.list()).toEqual([]);
    expect(t.editor.backend).toBe(t.sample);
    expect(t.state.replaced).toEqual([]);
    expect(t.disk.rootNode.children.size).toBe(0);
    expect(t.state.errors).toEqual([]);
  });

  it("폴더 고르기를 취소하면 샘플을 닫지도, 기억하지도, 백엔드를 바꾸지도 않는다", async () => {
    const t = setup();
    t.picks.push(null);
    expect(await createNewProject(t.e, t.deps({ template: "empty", language: "lua", name: "x" }))).toBe(false);
    expect(t.state.open).toBe(SAMPLE_ROOT);
    expect(await t.handles.list()).toEqual([]);
    expect(t.editor.backend).toBe(t.sample);
    expect(t.dialogs).toEqual([]);
  });

  it("저장하지 않은 문서를 묻는 곳에서 취소하면 기억하지 않고 백엔드와 폴더가 그대로다", async () => {
    const t = setup({ dirtyAnswer: false });
    t.picks.push(t.disk.root());
    expect(await createNewProject(t.e, t.deps({ template: "empty", language: "lua", name: "x" }))).toBe(false);
    expect(t.state.closeAsked).toBe(1);
    expect(t.state.open).toBe(SAMPLE_ROOT);
    expect(await t.handles.list()).toEqual([]);
    expect(t.editor.backend).toBe(t.sample);
    expect(t.dialogs).toEqual([]);
    expect(t.disk.readFile("game.json")).toBeNull();
  });

  it("비어 있지 않은 폴더는 한 번 묻고, 거절하면 쓰지 않는다. 동의하면 있는 파일은 두고 없는 것만 만든다", async () => {
    const declined = setup({ start: "folder", confirmAnswer: false });
    declined.disk.writeFile("notes.txt", "메모\n");
    declined.picks.push(declined.disk.root());
    expect(await createNewProject(declined.e, declined.deps({ template: "empty", language: "lua", name: "x" }))).toBe(false);
    expect(declined.state.confirms).toEqual(["폴더가 비어 있지 않습니다 (항목 1개). 기존 파일은 그대로 두고 없는 파일만 만듭니다. 이 폴더에 프로젝트를 만들까요?"]);
    expect(declined.disk.readFile("game.json")).toBeNull();
    expect(declined.dialogs).toEqual([]);
    expect(await declined.handles.list()).toEqual([]);

    const agreed = setup({ start: "folder" });
    agreed.disk.writeFile("scripts/lua/main.lua", "-- 내 것\n");
    agreed.picks.push(agreed.disk.root());
    expect(await createNewProject(agreed.e, agreed.deps({ template: "empty", language: "lua", name: "newgame" }))).toBe(true);
    expect(agreed.state.replaced).toEqual([]);
    expect(agreed.disk.readFile("scripts/lua/main.lua")).toBe("-- 내 것\n");
    expect(agreed.disk.readFile("scripts/lua/scene_loader.lua")).not.toBeNull();
  });
});

describe("새 프로젝트를 켜는 조건 (newProjectBlocker)", () => {
  it("웹판은 폴더 열기가 있으면 켜지고(샘플을 연 메모리 백엔드여도), 데스크톱은 켜진다. 메모리와 브리지는 이유와 함께 꺼진다", () => {
    expect(newProjectBlocker(setup().e)).toBeNull();
    const tauri = { mode: "tauri", backend: { capabilities: { pickFolder: true } } } as unknown as Editor;
    expect(newProjectBlocker(tauri)).toBeNull();
    const memory = { mode: "memory", backend: new MemoryBackend() } as unknown as Editor;
    expect(newProjectBlocker(memory)).toBe(NEW_PROJECT_MEMORY);
    const bridge = { mode: "bridge", backend: { capabilities: { pickFolder: false } } } as unknown as Editor;
    expect(newProjectBlocker(bridge)).toBe(NEW_PROJECT_BRIDGE);
  });

  it("폴더 열기가 없는 브라우저의 웹판은 꺼지고, 불러도 토스트로 이유만 알린다", async () => {
    delete host.showDirectoryPicker;
    try {
      const t = setup();
      expect(newProjectBlocker(t.e)).toBe(NEW_PROJECT_NO_PICKER);
      t.picks.push(t.disk.root());
      expect(await createNewProject(t.e, t.deps({ template: "empty", language: "lua", name: "x" }))).toBe(false);
      expect(t.state.warn).toEqual([NEW_PROJECT_NO_PICKER]);
      expect(t.picks).toHaveLength(1);
    } finally {
      host.showDirectoryPicker = async () => null;
    }
  });
});

describe("새 프로젝트 (데스크톱)", () => {
  it("열린 프로젝트를 닫고 OS 대화상자로 고른 폴더에 쓰고 연다 (백엔드는 바꾸지 않는다)", async () => {
    const backend = new MemoryBackend();
    Object.assign(backend, { capabilities: { ...backend.capabilities, pickFolder: true }, pickFolder: async () => "/home/me/mygame" });
    const t = setup({ mode: "tauri" });
    t.editor.backend = backend as unknown as Editor["backend"];
    expect(await createNewProject(t.e, { ...t.deps({ template: "empty", language: "lua", name: "mygame" }), webFeatures: undefined })).toBe(true);
    expect(t.state.opened).toEqual(["/home/me/mygame"]);
    expect(t.state.replaced).toEqual([]);
    expect(t.dialogs).toEqual([{ name: "mygame", folder: "/home/me/mygame", rubyNote: null }]);
    await backend.open("/home/me/mygame");
    expect(parseGameJson(await backend.readText("game.json"))).toMatchObject({ name: "mygame", startScene: "main" });
  });
});
