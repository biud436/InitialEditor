import { CORE_DEFAULT_PROPS, CORE_TYPE_LABELS, DocumentRegistry, Emitter, ExtensionRegistries, LogStore, parseScene, Project, SceneDocument, type Document } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { describe, expect, it } from "vitest";
import { SceneTools, validateLogicalScriptName, validateSceneName, type SceneToolsHost } from "./SceneTools";

const SCENE = `{
  "version": 1,
  "name": "main",
  "objects": [
    { "id": "bg", "type": "sprite", "x": 0, "y": 0, "props": { "image": "resources/bg.png" } },
    { "id": "player", "type": "sprite", "x": 100, "y": 200, "props": { "image": "resources/p.png", "frames": 4 }, "scripts": ["components/player"] },
    { "id": "world", "type": "node" }
  ]
}`;

interface Harness {
  tools: SceneTools;
  doc: SceneDocument;
  be: MemoryBackend;
  documents: DocumentRegistry;
  project: Project;
  registries: ExtensionRegistries;
  toasts: string[];
  prompts: string[];
  promptAnswer: string | null;
  opened: string[];
}

async function make(files: Record<string, string> = {}): Promise<Harness> {
  const be = new MemoryBackend({ "game.json": '{ "script": "lua", "startScene": "main" }', "resources/scenes/main.json": SCENE, ...files });
  const project = new Project(be);
  await project.open("/mem");
  const documents = new DocumentRegistry();
  const registries = new ExtensionRegistries();
  for (const type of ["node", "sprite", "text"] as const) registries.objectTypes.set(type, { type, label: CORE_TYPE_LABELS[type], defaults: CORE_DEFAULT_PROPS[type] });
  const toasts: string[] = [];
  const prompts: string[] = [];
  const opened: string[] = [];
  const h = { promptAnswer: null as string | null };
  const push = (t: string) => toasts.push(t);
  const host: SceneToolsHost = {
    documents,
    registries,
    backend: be,
    project,
    log: new LogStore(),
    toasts: { info: push, success: push, warn: push, error: push },
    modals: {
      prompt: async (o) => {
        prompts.push(o.title);
        return h.promptAnswer;
      },
    },
    tree: { reveal: async () => {} },
    events: new Emitter<{ projectOpened: never; projectClosed: never }>(),
    openPath: async (path) => {
      opened.push(path);
    },
  };
  const tools = new SceneTools(host);
  tools.install();
  const doc = await SceneDocument.open(be, "resources/scenes/main.json", () => new Set(registries.objectTypes.keys()));
  documents.open(doc as Document);
  return {
    tools,
    doc,
    be,
    documents,
    project,
    registries,
    toasts,
    prompts,
    opened,
    get promptAnswer() {
      return h.promptAnswer;
    },
    set promptAnswer(v) {
      h.promptAnswer = v;
    },
  };
}

describe("SceneTools", () => {
  it("활성 탭이 씬 문서일 때만 activeScene 이다", async () => {
    const h = await make();
    expect(h.tools.activeScene).toBe(h.doc);
    h.documents.activate(null);
    expect(h.tools.activeScene).toBeNull();
    expect(h.tools.addObject("sprite")).toBeNull();
    expect(h.toasts.at(-1)).toContain("씬 탭");
  });

  it("addObject: 겹치지 않는 id, 기본 props 의 복사본, 놓을 자리, 선택", async () => {
    const h = await make();
    const a = h.tools.addObject("sprite", { x: 7, y: 9 })!;
    expect(a.id).toBe("sprite");
    expect(a.x).toBe(7);
    expect(a.props).toEqual(CORE_DEFAULT_PROPS.sprite);
    expect(a.props).not.toBe(CORE_DEFAULT_PROPS.sprite);
    expect(h.doc.selectedIds).toEqual(["sprite"]);
    const b = h.tools.addObject("sprite")!;
    expect(b.id).toBe("sprite_2");
    expect([b.x, b.y]).toEqual([0, 0]);
    expect(h.doc.scene.ids()).toEqual(["bg", "player", "world", "sprite", "sprite_2"]);
    // 검사도 따라온다 (이미지 없는 스프라이트 경고 둘)
    expect(h.doc.problems.filter((p) => p.severity === "warning").length).toBe(2);
    expect(h.tools.addObject("ghost")).toBeNull();
    expect(h.toasts.at(-1)).toContain("ghost");
  });

  it("duplicate: 원본 바로 뒤에 +16, 여러 개는 되돌리기 한 단계", async () => {
    const h = await make();
    h.doc.select(["bg", "player"]);
    const created = h.tools.duplicateSelected();
    expect(created).toEqual(["bg_2", "player_2"]);
    expect(h.doc.scene.ids()).toEqual(["bg", "bg_2", "player", "player_2", "world"]);
    const p2 = h.doc.scene.find("player_2")!;
    expect([p2.x, p2.y]).toEqual([116, 216]);
    expect(p2.props).toEqual({ image: "resources/p.png", frames: 4 });
    expect(p2.scripts).toEqual(["components/player"]);
    expect(h.doc.selectedIds).toEqual(["bg_2", "player_2"]);
    expect(h.doc.undo.depth).toBe(1);
    h.doc.undo.undo();
    expect(h.doc.scene.ids()).toEqual(["bg", "player", "world"]);
    h.doc.undo.redo();
    expect(h.doc.scene.ids()).toEqual(["bg", "bg_2", "player", "player_2", "world"]);
  });

  it("copy, paste, cut: 새 id 로 맨 뒤에, 붙일 때마다 16 씩 더 밀린다", async () => {
    const h = await make();
    h.doc.select(["player"]);
    expect(h.tools.copy()).toBe(1);
    expect(h.tools.clipboard[0].id).toBe("player");
    expect(h.tools.paste()).toEqual(["player_2"]);
    expect(h.tools.paste()).toEqual(["player_3"]);
    const p2 = h.doc.scene.find("player_2")!;
    const p3 = h.doc.scene.find("player_3")!;
    expect([p2.x, p2.y, p3.x, p3.y]).toEqual([116, 216, 132, 232]);
    expect(h.doc.scene.ids()).toEqual(["bg", "player", "world", "player_2", "player_3"]);
    // 클립보드는 원본이 바뀌어도 그대로다 (복사본)
    h.doc.apply(h.doc.scene.setProp("player", "frames", 8));
    expect(h.tools.clipboard[0].props.frames).toBe(4);
    // 잘라내기
    h.doc.select(["world"]);
    expect(h.tools.cut()).toBe(1);
    expect(h.doc.scene.find("world")).toBeUndefined();
    expect(h.tools.clipboard[0].id).toBe("world");
    expect(h.tools.paste()).toEqual(["world"]);
  });

  it("delete: 여러 개를 한 단계로 지우고 되돌리면 자리까지 돌아온다", async () => {
    const h = await make();
    h.doc.select(["bg", "world"]);
    expect(h.tools.deleteSelected()).toBe(2);
    expect(h.doc.scene.ids()).toEqual(["player"]);
    expect(h.doc.selectedIds).toEqual([]);
    h.doc.undo.undo();
    expect(h.doc.scene.ids()).toEqual(["bg", "player", "world"]);
    expect(h.tools.deleteSelected()).toBe(0);
  });

  it("rename: 겹치면 거절하고 토스트, 선택이 따라간다", async () => {
    const h = await make();
    h.doc.select(["player"]);
    expect(h.tools.rename("player", "bg")).toBe(false);
    expect(h.toasts.at(-1)).toContain("bg");
    expect(h.tools.rename("player", " ")).toBe(false);
    expect(h.tools.rename("player", "hero")).toBe(true);
    expect(h.doc.scene.ids()).toEqual(["bg", "hero", "world"]);
    expect(h.doc.selectedIds).toEqual(["hero"]);
    expect(h.tools.rename("hero", "hero")).toBe(true);
    expect(h.doc.undo.depth).toBe(1);
  });

  it("순서: reorder, 맨 앞으로(끝), 맨 뒤로(처음)", async () => {
    const h = await make();
    h.tools.reorder(0, 2);
    expect(h.doc.scene.ids()).toEqual(["player", "world", "bg"]);
    h.tools.sendToBack("bg");
    expect(h.doc.scene.ids()).toEqual(["bg", "player", "world"]);
    h.tools.bringToFront("bg");
    expect(h.doc.scene.ids()).toEqual(["player", "world", "bg"]);
    h.tools.reorder(5, 0);
    expect(h.doc.scene.ids()).toEqual(["player", "world", "bg"]);
  });

  it("표시 여부와 스크립트 붙이기와 떼기, 스크립트 경로는 game.json 의 언어를 따른다", async () => {
    const h = await make();
    h.tools.setVisible("bg", false);
    expect(h.doc.scene.find("bg")!.visible).toBe(false);
    expect(h.tools.attachScript("world", "components/spawner")).toBe(true);
    expect(h.tools.attachScript("world", "components/spawner")).toBe(false);
    expect(h.doc.scene.find("world")!.scripts).toEqual(["components/spawner"]);
    h.tools.detachScript("world", "components/spawner");
    expect(h.doc.scene.find("world")!.scripts).toEqual([]);
    expect(h.tools.scriptPath("components/spawner")).toBe("scripts/lua/components/spawner.lua");
    await h.project.saveGameJson({ ...h.project.gameJson, script: "mruby" });
    expect(h.tools.scriptPath("components/spawner")).toBe("scripts/ruby/components/spawner.rb");
  });

  it("되돌리기와 다시 실행 뒤에도 검사 결과가 맞다", async () => {
    const h = await make();
    expect(h.doc.problems).toEqual([]);
    h.tools.addObject("sprite");
    expect(h.doc.problems.length).toBe(1);
    h.doc.undo.undo();
    expect(h.doc.problems).toEqual([]);
    h.doc.undo.redo();
    expect(h.doc.problems.length).toBe(1);
  });

  it("newScene: 이름을 묻고 빈 씬을 쓰고 연다 (씬 뷰가 없으면 직접 SceneDocument 로), 있으면 거절", async () => {
    const h = await make();
    h.promptAnswer = null;
    expect(await h.tools.newScene()).toBeNull();
    h.promptAnswer = "stage1";
    const doc = await h.tools.newScene();
    expect(h.prompts).toEqual(["새 씬", "새 씬"]);
    expect(doc).toBeInstanceOf(SceneDocument);
    expect(doc!.path).toBe("resources/scenes/stage1.json");
    expect(h.opened).toEqual(["resources/scenes/stage1.json"]);
    expect(h.tools.activeScene).toBe(doc);
    const saved = parseScene(await h.be.readText("resources/scenes/stage1.json"));
    expect(saved).toEqual({ version: 1, name: "stage1", objects: [], extra: {} });
    expect(h.project.folders.get("resources/scenes")!.map((e) => e.name)).toEqual(["main.json", "stage1.json"]);
    expect(await h.tools.newScene()).toBeNull();
    expect(h.toasts.at(-1)).toContain("이미 있는 파일: resources/scenes/stage1.json");
    // 열려 있는 씬을 다시 열면 그 탭이 활성이 된다
    h.documents.activate(h.doc);
    expect(await h.tools.openScene("resources/scenes/stage1.json")).toBe(doc);
    expect(h.opened.length).toBe(1);
  });

  it("openScene 이 직접 연 씬에도 확장의 검사기가 돈다", async () => {
    const h = await make({ "resources/scenes/other.json": '{ "version": 1, "name": "other", "objects": [{ "id": "a", "type": "node" }] }' });
    h.registries.validators.push((data) => (data as { objects: Array<{ id: string }> }).objects.map((o) => ({ severity: "warning" as const, message: `검사 ${o.id}` })));
    const doc = await h.tools.openScene("resources/scenes/other.json");
    expect(doc?.problems.map((p) => p.message)).toEqual(["검사 a"]);
  });

  it("매개변수: 선언으로 검사하고, 선언 파일이 바뀌면 다시 검사하고, 없으면 값의 형식으로 만들어 연다", async () => {
    const decl = (fields: unknown[]) => JSON.stringify({ version: 1, fields });
    const h = await make({
      "resources/scenes/p.json": JSON.stringify({
        version: 1,
        name: "p",
        objects: [
          { id: "a", type: "node", scripts: ["components/mover"], params: { "components/mover": { dx: 20, target: "ghost" } } },
          { id: "b", type: "node", scripts: ["components/free"], params: { "components/free": { speed: 1.5, on: true } } },
        ],
      }),
      "scripts/components/mover.json": decl([
        { key: "dx", type: "number", max: 10 },
        { key: "target", type: "object" },
      ]),
    });
    const doc = (await h.tools.openScene("resources/scenes/p.json"))!;
    await h.tools.declarations.resolve("components/mover");
    await h.tools.declarations.resolve("components/free");
    expect(doc.problems.map((p) => p.message)).toEqual(["a: components/mover.dx: 10 이하여야 합니다", "a: components/mover.target: 씬에 없는 오브젝트: ghost"]);
    // 고치면 문제가 사라진다 (되돌리기 스택의 변경이 다시 검사한다)
    h.tools.setParam("a", "components/mover", "dx", 5);
    h.tools.setParam("a", "components/mover", "target", "b");
    expect(doc.problems).toEqual([]);
    // 선언 파일이 바뀌면 다시 읽고 다시 검사한다
    await h.be.writeText("scripts/components/mover.json", decl([{ key: "dx", type: "integer", max: 3 }]));
    h.tools.declarations.fileChanged("scripts/components/mover.json");
    await h.tools.declarations.resolve("components/mover");
    expect(doc.problems.map((p) => p.message)).toEqual(["a: components/mover.dx: 3 이하여야 합니다", "a: components/mover에 선언되지 않은 매개변수: target"]);
    // 깨진 선언은 씬 검사에 오른다
    await h.be.writeText("scripts/components/mover.json", "{");
    h.tools.declarations.fileChanged("scripts/components/mover.json");
    const broken = await h.tools.declarations.resolve("components/mover");
    expect(broken.kind).toBe("broken");
    expect(doc.problems[0].message).toMatch(/^컴포넌트 선언 오류 \(scripts\/components\/mover\.json\): JSON 구문 오류/);
    // 선언이 없는 컴포넌트: 오브젝트의 값의 형식으로 필드를 적어 만들고 연다
    expect(await h.tools.openDeclaration("b", "components/free")).toBe(true);
    expect(h.opened.at(-1)).toBe("scripts/components/free.json");
    expect(JSON.parse(await h.be.readText("scripts/components/free.json"))).toEqual({
      version: 1,
      fields: [
        { key: "speed", type: "number", label: "speed" },
        { key: "on", type: "boolean", label: "on" },
      ],
    });
    expect((await h.tools.declarations.resolve("components/free")).kind).toBe("declared");
    // 이미 있으면 덮어쓰지 않고 연다
    await h.be.writeText("scripts/components/free.json", decl([]));
    expect(await h.tools.openDeclaration("b", "components/free")).toBe(true);
    expect(await h.be.readText("scripts/components/free.json")).toBe(decl([]));
  });

  it("이름 바꾸기는 선언의 object 필드가 가리키는 매개변수도 바꾸고, 되돌리기 한 번에 돌아온다", async () => {
    const h = await make({
      "scripts/components/follow.json": JSON.stringify({ version: 1, fields: [{ key: "target", type: "object" }, { key: "label", type: "string" }] }),
      "resources/scenes/p.json": JSON.stringify({
        version: 1,
        name: "p",
        objects: [
          { id: "hero", type: "node", scripts: ["components/follow"], params: { "components/follow": { target: "hero", label: "hero" } } },
          { id: "cam", type: "node", scripts: ["components/follow"], params: { "components/follow": { target: "hero" } } },
        ],
      }),
    });
    const doc = (await h.tools.openScene("resources/scenes/p.json"))!;
    await h.tools.declarations.resolve("components/follow");
    const depth = doc.undo.depth;
    expect(h.tools.rename("hero", "player")).toBe(true);
    expect(doc.undo.depth).toBe(depth + 1);
    expect(doc.scene.find("player")?.params).toEqual({ "components/follow": { target: "player", label: "hero" } });
    expect(doc.scene.find("cam")?.params).toEqual({ "components/follow": { target: "player" } });
    expect(doc.problems).toEqual([]);
    doc.undo.undo();
    expect(doc.scene.find("hero")?.params).toEqual({ "components/follow": { target: "hero", label: "hero" } });
    expect(doc.scene.find("cam")?.params).toEqual({ "components/follow": { target: "hero" } });
  });

  it("씬 로더가 매개변수를 모르면 params 가 있는 씬에 경고하고, 로더를 바꾸면 사라진다", async () => {
    const h = await make({
      "scripts/lua/scene_loader.lua": "-- 예전 로더\n",
      "resources/scenes/p.json": JSON.stringify({ version: 1, name: "p", objects: [{ id: "a", type: "node", scripts: ["components/free"], params: { "components/free": { n: 1 } } }] }),
    });
    const doc = (await h.tools.openScene("resources/scenes/p.json"))!;
    await h.tools.loader.refresh();
    await h.tools.declarations.resolve("components/free");
    expect(h.tools.loader.state).toBe("old");
    expect(doc.problems.map((p) => `${p.severity} ${p.location}`)).toEqual(["warning objects[0].params"]);
    expect(doc.problems[0].message).toContain("씬 로더(scripts/lua/scene_loader.lua)가 매개변수를 전달하지 않아");
    await h.tools.loader.upgrade({ text: () => 'SceneLoader.DECLARATION_ROOT = "scripts/"\n', binary: async () => new Uint8Array() });
    expect(h.tools.loader.state).toBe("params");
    expect(doc.problems).toEqual([]);
  });

  it("setStartScene: 활성 씬 이름을 game.json 에 쓴다", async () => {
    const h = await make();
    h.promptAnswer = "title";
    await h.tools.newScene();
    expect(h.tools.isStartScene()).toBe(false);
    expect(await h.tools.setStartScene()).toBe(true);
    expect(h.project.gameJson.startScene).toBe("title");
    expect(h.tools.isStartScene()).toBe(true);
    expect(await h.be.readText("game.json")).toContain('"startScene": "title"');
    h.documents.activate(null);
    expect(await h.tools.setStartScene()).toBe(false);
  });

  it("프로젝트 자산 목록: 그림, 폰트, 언어별 컴포넌트, 매개변수 선언", async () => {
    const h = await make({
      "resources/images/a.png": "x",
      "resources/images/deep/b.jpg": "x",
      "resources/fonts/hangul.fnt": "x",
      "resources/readme.txt": "x",
      "scripts/lua/components/flappy/bird.lua": "x",
      "scripts/lua/components/mover.lua": "x",
      "scripts/lua/main.lua": "x",
      "scripts/ruby/components/bird.rb": "x",
      "scripts/components/mover.json": "{}",
      "scripts/components/flappy/bird.json": "{}",
      "scripts/components/notes.txt": "x",
      "scripts/lua/components/mover.json": "{}",
    });
    await h.tools.assets.refresh();
    expect(h.tools.assets.declaredComponents).toEqual(["components/flappy/bird", "components/mover"]);
    expect(h.tools.assets.images).toEqual(["resources/images/a.png", "resources/images/deep/b.jpg"]);
    expect(h.tools.assets.fonts).toEqual(["resources/fonts/hangul.fnt"]);
    expect(h.tools.assets.components("lua")).toEqual(["components/flappy/bird", "components/mover"]);
    expect(h.tools.assets.components("mruby")).toEqual(["components/bird"]);
  });

  it("이름 검사", () => {
    expect(validateSceneName("stage1")).toBeNull();
    expect(validateSceneName("마을-1")).toBeNull();
    expect(validateSceneName("")).not.toBeNull();
    expect(validateSceneName("a/b")).not.toBeNull();
    expect(validateSceneName("x.json")).not.toBeNull();
    expect(validateLogicalScriptName("components/bird")).toBeNull();
    expect(validateLogicalScriptName("components/bird.lua")).not.toBeNull();
    expect(validateLogicalScriptName("../x")).not.toBeNull();
    expect(validateLogicalScriptName("")).not.toBeNull();
  });
});

describe("spawnPoint 는 씬 뷰의 center 를 그 객체에 묶어 부른다", () => {
  it("this 를 쓰는 center 메서드", async () => {
    const { SceneTools } = await import("./SceneTools");
    const support = {
      offset: 7,
      center(this: { offset: number }) {
        return { x: 10 + this.offset, y: 20 + this.offset };
      },
    };
    const tools = Object.create(SceneTools.prototype) as { host: unknown; spawnPoint(): { x: number; y: number } };
    tools.host = { sceneSupport: support };
    expect(tools.spawnPoint()).toEqual({ x: 17, y: 27 });
  });
});
