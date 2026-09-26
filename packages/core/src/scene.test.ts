import { describe, expect, it } from "vitest";
import { UndoStack } from "./document";
import {
  CORE_DEFAULT_PROPS,
  makeObject,
  parseScene,
  SceneFormatError,
  SceneModel,
  scriptPathFor,
  serializeScene,
  uniqueObjectId,
  validateScene,
} from "./scene";

const SAMPLE = `{
  "version": 1,
  "name": "main",
  "editorOnly": { "note": "보존" },
  "objects": [
    { "id": "bg", "type": "sprite", "x": 0, "y": 0, "props": { "image": "resources/images/bg.png" } },
    { "id": "score", "type": "text", "x": 8, "y": 8, "visible": false, "props": { "text": "점수\\n0" }, "scripts": ["components/score"], "camera": true },
    { "id": "world", "type": "node" }
  ]
}`;

describe("scene format", () => {
  it("읽고 기본값을 채우고 모르는 키를 보존한다", () => {
    const s = parseScene(SAMPLE);
    expect(s.name).toBe("main");
    expect(s.objects.length).toBe(3);
    expect(s.objects[2]).toMatchObject({ id: "world", type: "node", x: 0, y: 0, visible: true, props: {}, scripts: [] });
    expect(s.objects[1].visible).toBe(false);
    expect(s.objects[1].extra).toEqual({ camera: true });
    expect(s.extra).toEqual({ editorOnly: { note: "보존" } });
  });

  it("저장하면 키 순서가 고정되고 왕복이 동등하다", () => {
    const s = parseScene(SAMPLE);
    const text = serializeScene(s);
    expect(text.endsWith("\n")).toBe(true);
    const again = parseScene(text);
    expect(again).toEqual(s);
    const obj = JSON.parse(text);
    expect(Object.keys(obj)).toEqual(["version", "name", "objects", "editorOnly"]);
    expect(Object.keys(obj.objects[1])).toEqual(["id", "type", "x", "y", "visible", "props", "scripts", "camera"]);
    expect(Object.keys(obj.objects[0])).toEqual(["id", "type", "x", "y", "props", "scripts"]);
    expect(obj.objects[1].props.text).toBe("점수\n0");
  });

  it("구조 오류는 자리를 말한다", () => {
    expect(() => parseScene("[]")).toThrow(SceneFormatError);
    expect(() => parseScene('{"version": 2, "objects": []}')).toThrow(/모르는 씬 버전이다: 2/);
    expect(() => parseScene('{"version": 1, "objects": [{"type": "node"}]}')).toThrow(/objects\[0\]\.id/);
    expect(() => parseScene('{"version": 1, "objects": [{"id": "a", "type": "node", "x": "1"}]}')).toThrow(/objects\[0\]\.x/);
    expect(() => parseScene('{"version": 1, "objects": [{"id": "a", "type": "node", "scripts": [1]}]}')).toThrow(/scripts/);
    expect(() => parseScene("{")).toThrow(/JSON/);
  });

  it("의미 검사: 겹치는 id, 모르는 타입, 논리 이름이 아닌 스크립트", () => {
    const s = parseScene(`{"version": 1, "objects": [
      {"id": "a", "type": "node"}, {"id": "a", "type": "tilemap"},
      {"id": "b", "type": "sprite", "props": {}, "scripts": ["scripts/lua/x.lua", "../x", "components/ok"]}
    ]}`);
    const problems = validateScene(s);
    expect(problems.map((p) => p.location)).toEqual(["objects[1].id", "objects[1].type", "objects[2].props.image", "objects[2].scripts[0]", "objects[2].scripts[1]"]);
    expect(validateScene(s, new Set(["node", "sprite", "text", "tilemap"])).some((p) => p.message.includes("tilemap"))).toBe(false);
  });

  it("스크립트 경로와 id 생성", () => {
    expect(scriptPathFor("components/bird", "lua")).toBe("scripts/lua/components/bird.lua");
    expect(scriptPathFor("components/bird", "mruby")).toBe("scripts/ruby/components/bird.rb");
    expect(uniqueObjectId("sprite", ["sprite", "sprite_2"])).toBe("sprite_3");
    expect(uniqueObjectId("새 오브젝트!", [])).toBe("새_오브젝트_");
    expect(uniqueObjectId("", [])).toBe("object");
  });
});

describe("SceneModel commands", () => {
  function setup() {
    const model = new SceneModel(parseScene(SAMPLE));
    const undo = new UndoStack();
    return { model, undo };
  }

  it("추가, 삭제, 되돌리기", () => {
    const { model, undo } = setup();
    undo.push(model.addObject(makeObject("sprite", "player", CORE_DEFAULT_PROPS.sprite, { x: 10, y: 20 })));
    expect(model.ids()).toEqual(["bg", "score", "world", "player"]);
    expect(model.find("player")?.props.frames).toBe(1);
    undo.push(model.removeObject("score"));
    expect(model.ids()).toEqual(["bg", "world", "player"]);
    undo.undo();
    expect(model.ids()).toEqual(["bg", "score", "world", "player"]);
    undo.undo();
    expect(model.ids()).toEqual(["bg", "score", "world"]);
    undo.redo();
    expect(model.ids()).toEqual(["bg", "score", "world", "player"]);
    expect(() => undo.push(model.addObject(makeObject("node", "bg", {})))).toThrow(/겹친다/);
  });

  it("이동은 드래그 동안 합쳐지고 한 번에 되돌아간다", () => {
    const { model, undo } = setup();
    undo.push(model.moveObjects([{ id: "bg", x: 1, y: 1 }], "drag-1"));
    undo.push(model.moveObjects([{ id: "bg", x: 2, y: 2 }], "drag-1"));
    undo.push(model.moveObjects([{ id: "bg", x: 3, y: 3 }], "drag-1"));
    expect(model.find("bg")).toMatchObject({ x: 3, y: 3 });
    expect(undo.depth).toBe(1);
    undo.undo();
    expect(model.find("bg")).toMatchObject({ x: 0, y: 0 });
    undo.redo();
    expect(model.find("bg")).toMatchObject({ x: 3, y: 3 });
  });

  it("속성과 필드와 이름과 순서와 스크립트", () => {
    const { model, undo } = setup();
    undo.push(model.setProp("bg", "image", "resources/images/x.png"));
    undo.push(model.setProp("bg", "anim.fps", 12));
    expect(model.find("bg")?.props).toEqual({ image: "resources/images/x.png", anim: { fps: 12 } });
    undo.undo();
    expect(model.find("bg")?.props).toEqual({ image: "resources/images/x.png" });
    undo.push(model.setField("score", "visible", true));
    expect(model.find("score")?.visible).toBe(true);
    undo.push(model.renameObject("score", "hud"));
    expect(model.ids()).toEqual(["bg", "hud", "world"]);
    expect(() => undo.push(model.renameObject("hud", "bg"))).toThrow();
    undo.push(model.reorder(2, 0));
    expect(model.ids()).toEqual(["world", "bg", "hud"]);
    undo.push(model.attachScript("world", "components/spawner"));
    undo.push(model.attachScript("world", "components/spawner"));
    expect(model.find("world")?.scripts).toEqual(["components/spawner"]);
    undo.push(model.detachScript("world", "components/spawner"));
    expect(model.find("world")?.scripts).toEqual([]);
    for (let i = 0; i < 20; i++) undo.undo();
    expect(serializeScene(model.toData())).toBe(serializeScene(parseScene(SAMPLE)));
  });
});
