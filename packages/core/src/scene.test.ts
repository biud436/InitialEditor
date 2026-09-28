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
    expect(() => parseScene('{"version": 2, "objects": []}')).toThrow(/지원하지 않는 씬 버전: 2/);
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
    expect(() => undo.push(model.addObject(makeObject("node", "bg", {})))).toThrow(/id 중복: bg/);
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

  it("이미 그 값인 속성과 필드, 제자리 옮기기는 바꾸는 것이 없는 명령이라 스택이 쌓지 않는다", () => {
    const { model, undo } = setup();
    undo.push(model.setProp("bg", "anim.fps", 12));
    const id = undo.stateId;
    const bg = model.find("bg")!;
    const same = [model.setProp("bg", "anim.fps", 12), model.setProp("bg", "missing", undefined), model.setField("bg", "x", bg.x), model.setField("bg", "visible", bg.visible), model.moveObjects([{ id: "bg", x: bg.x, y: bg.y }])];
    expect(same.map((c) => c.unchanged)).toEqual([true, true, true, true, true]);
    for (const cmd of same) undo.push(cmd);
    expect([undo.depth, undo.stateId]).toEqual([1, id]);
    expect(model.setProp("bg", "anim.fps", 24).unchanged).toBe(false);
    expect(model.setProp("bg", "anim", { fps: 12 }).unchanged).toBe(true);
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

  it("스크립트 순서 옮기기: 위아래로 한 칸, 끝을 넘으면 아무것도 안 하고, 되돌리면 제자리", () => {
    const { model, undo } = setup();
    for (const name of ["components/a", "components/b", "components/c"]) undo.push(model.attachScript("world", name));
    undo.push(model.moveScript("world", "components/c", -1));
    expect(model.find("world")?.scripts).toEqual(["components/a", "components/c", "components/b"]);
    undo.push(model.moveScript("world", "components/a", 1));
    expect(model.find("world")?.scripts).toEqual(["components/c", "components/a", "components/b"]);
    const depth = undo.depth;
    // 끝을 넘거나 없는 이름은 바꾸는 것이 없어 되돌리기 단계도 남기지 않는다
    for (const [name, d] of [["components/c", -1], ["components/b", 1], ["components/nope", 1]] as const) {
      const cmd = model.moveScript("world", name, d);
      expect(cmd.unchanged).toBe(true);
      undo.push(cmd);
    }
    expect(undo.depth).toBe(depth);
    expect(model.find("world")?.scripts).toEqual(["components/c", "components/a", "components/b"]);
    undo.undo();
    expect(model.find("world")?.scripts).toEqual(["components/a", "components/c", "components/b"]);
    undo.undo();
    expect(model.find("world")?.scripts).toEqual(["components/a", "components/b", "components/c"]);
  });

  it("매개변수: 값 쓰기와 지우기, 타이핑 합치기, 떼면 같이 지워지고 되돌리면 돌아온다", () => {
    const { model, undo } = setup();
    undo.push(model.attachScript("world", "components/mover"));
    undo.push(model.setParam("world", "components/mover", "dx", 2));
    undo.push(model.setParam("world", "components/mover", "target", "bg"));
    expect(model.find("world")?.params).toEqual({ "components/mover": { dx: 2, target: "bg" } });
    const depth = undo.depth;
    undo.push(model.setParam("world", "components/mover", "dx", 3, "typing"));
    undo.push(model.setParam("world", "components/mover", "dx", 34, "typing"));
    expect(undo.depth).toBe(depth + 1);
    expect(model.find("world")?.params["components/mover"].dx).toBe(34);
    const same = model.setParam("world", "components/mover", "dx", 34);
    expect(same.unchanged).toBe(true);
    undo.push(model.setParam("world", "components/mover", "dx", undefined));
    undo.push(model.setParam("world", "components/mover", "target", undefined));
    expect(model.find("world")?.params).toEqual({});
    undo.undo();
    undo.undo();
    expect(model.find("world")?.params).toEqual({ "components/mover": { dx: 34, target: "bg" } });
    undo.push(model.detachScript("world", "components/mover"));
    expect(model.find("world")).toMatchObject({ scripts: [], params: {} });
    undo.undo();
    expect(model.find("world")).toMatchObject({ scripts: ["components/mover"], params: { "components/mover": { dx: 34, target: "bg" } } });
  });
});

describe("scene params", () => {
  const WITH_PARAMS = `{
  "version": 1,
  "name": "p",
  "objects": [
    { "id": "a", "type": "node", "scripts": ["components/mover"], "params": { "components/mover": { "dx": 2 } } },
    { "id": "b", "type": "node" }
  ]
}`;

  it("읽고 저장한다. 비어 있으면 파일에 쓰지 않고, 복제는 깊은 복사다", () => {
    const s = parseScene(WITH_PARAMS);
    expect(s.objects[0].params).toEqual({ "components/mover": { dx: 2 } });
    expect(s.objects[0].extra).toEqual({});
    const saved = JSON.parse(serializeScene(s));
    expect(Object.keys(saved.objects[0])).toEqual(["id", "type", "x", "y", "props", "scripts", "params"]);
    expect(saved.objects[1].params).toBeUndefined();
    const model = new SceneModel(s);
    const copy = model.toData().objects[0];
    copy.params["components/mover"].dx = 9;
    expect(model.find("a")?.params["components/mover"].dx).toBe(2);
  });

  it("구조 오류와 스크립트에 없는 컴포넌트의 매개변수", () => {
    expect(() => parseScene(WITH_PARAMS.replace(`"params": { "components/mover": { "dx": 2 } }`, `"params": [1]`))).toThrow(/objects\[0\]\.params는 객체/);
    expect(() => parseScene(WITH_PARAMS.replace(`{ "dx": 2 }`, `3`))).toThrow(/objects\[0\]\.params\.components\/mover는 객체/);
    // 엔진처럼 null 은 없는 것, 빈 배열은 빈 객체다
    const loose = (params: string) => parseScene(WITH_PARAMS.replace(`{ "components/mover": { "dx": 2 } }`, params)).objects[0].params;
    expect(loose(`null`)).toEqual({});
    expect(loose(`[]`)).toEqual({});
    expect(loose(`{ "components/mover": [], "components/x": null }`)).toEqual({ "components/mover": {} });
    expect(loose(`{ "components/mover": { "dx": null, "dy": 1 } }`)).toEqual({ "components/mover": { dy: 1 } });
    const s = parseScene(WITH_PARAMS.replace(`"scripts": ["components/mover"], `, ""));
    expect(validateScene(s)).toEqual([
      { severity: "error", message: "a: 매개변수의 컴포넌트가 스크립트 목록에 없음: components/mover", location: "objects[0].params.components/mover" },
    ]);
  });
});
