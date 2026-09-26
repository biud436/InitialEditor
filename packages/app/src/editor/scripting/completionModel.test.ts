import { describe, expect, it } from "vitest";
import { parseApiSpec } from "./apiSpec";
import { SPEC_FIXTURE } from "./apiSpecFixture";
import { analyzePrefix, buildIndex, callContext, candidates, hasHook, lookupCallable, lookupHover, symbolFor } from "./completionModel";

const spec = parseApiSpec(SPEC_FIXTURE);
const lua = buildIndex(spec, "lua");
const ruby = buildIndex(spec, "ruby");
const labels = (list: { label: string }[]) => list.map((s) => s.label);

describe("buildIndex (Lua)", () => {
  it("lua 가 null 인 모듈의 함수는 전역이고, 모듈과 클래스 이름도 전역이다", () => {
    expect(labels(lua.globals)).toEqual(expect.arrayContaining(["DrawText", "WindowWidth", "SetRenderScale", "LoadScript", "Input", "Sprite"]));
    expect(labels(lua.globals)).not.toContain("env");
    expect(labels(lua.globals)).not.toContain("Graphics");
    expect(labels(lua.globals)).not.toContain("Keys");
  });

  it("모듈 멤버는 Input. 뒤에, Ruby 전용 함수는 빠진다", () => {
    expect(labels(lua.members.get("Input")!)).toEqual(["IsKeyDown", "GetMouseX"]);
  });

  it("클래스 멤버는 생성자와 메서드이고 메서드는 핸들(id)을 첫 인자로 받는다", () => {
    const members = lua.members.get("Sprite")!;
    expect(labels(members)).toEqual(["Create", "SetPosition", "GetVisible", "Draw"]);
    const setPosition = members.find((m) => m.label === "SetPosition")!;
    expect(setPosition.detail).toBe("Sprite.SetPosition(id, x, y) -> nil");
    expect(setPosition.insert).toBe("SetPosition(${1:id}, ${2:x}, ${3:y})");
    expect(setPosition.snippet).toBe(true);
    const draw = members.find((m) => m.label === "Draw")!;
    expect(draw.insert).toBe("Draw(${1:id})");
  });

  it("호출 스니펫: 필수 인자는 자리표시자, 없으면 빈 괄호", () => {
    const drawText = lua.callables.get("DrawText")!;
    expect(drawText.insert).toBe("DrawText(${1:x}, ${2:y}, ${3:text})");
    expect(lua.callables.get("WindowWidth")!.insert).toBe("WindowWidth()");
    expect(lua.callables.get("WindowWidth")!.snippet).toBe(false);
  });

  it("씬 계약 스니펫은 function 꼴이고 Symbol 은 없다", () => {
    expect(labels(lua.hooks)).toEqual(["init", "update", "render", "destroy"]);
    expect(lua.hooks[1].insert).toBe("function update(elapsed_ms)\n\t$0\nend");
    expect(lua.symbols).toEqual([]);
  });
});

describe("buildIndex (Ruby)", () => {
  it("모듈과 클래스와 상수 모듈이 전역이고 Lua 전용 함수는 빠진다", () => {
    expect(labels(ruby.globals)).toEqual(["Graphics", "Input", "Sprite", "Keys"]);
    expect(labels(ruby.members.get("Graphics")!)).toEqual(["draw_text", "width", "render_scale =", "env"]);
  });

  it("rubyKind 에 따라 getter 는 이름만, setter 는 대입, 술어는 ?(...) 이다", () => {
    const g = ruby.members.get("Graphics")!;
    expect(g.find((s) => s.label === "width")!.insert).toBe("width");
    expect(g.find((s) => s.label === "width")!.kind).toBe("property");
    expect(g.find((s) => s.label === "render_scale =")!.insert).toBe("render_scale = ${1:n}");
    expect(g.find((s) => s.label === "draw_text")!.insert).toBe("draw_text(${1:x}, ${2:y}, ${3:text})");
    const input = ruby.members.get("Input")!;
    expect(input.find((s) => s.label === "press?")!.insert).toBe("press?(${1:key})");
    expect(input.find((s) => s.label === "press?")!.alias).toBe(true);
    expect(input.find((s) => s.label === "mouse_x")!.insert).toBe("mouse_x");
  });

  it("인스턴스 메서드는 받는 쪽을 모르는 obj. 뒤에 나오고 생성자는 클래스 멤버다", () => {
    expect(labels(ruby.members.get("Sprite")!)).toEqual(["new"]);
    expect(labels(ruby.instanceMethods)).toEqual(["set_position", "visible?", "draw"]);
    expect(ruby.callables.get("#set_position")!.detail).toContain("Sprite#set_position(x, y)");
    expect(ruby.callables.get("Sprite.new")!.kind).toBe("constructor");
  });

  it("상수는 Keys:: 멤버이고 Symbol 로도 나온다", () => {
    expect(labels(ruby.members.get("Keys")!)).toEqual(["A", "SPACE", "F1"]);
    expect(labels(ruby.symbols)).toEqual([":a", ":space", ":f1"]);
    expect(symbolFor("0")).toBe(':"0"');
  });

  it("씬 계약 스니펫은 def 꼴이다", () => {
    expect(ruby.hooks[0].insert).toBe("def init\n\t$0\nend");
    expect(ruby.hooks[1].insert).toBe("def update(elapsed_ms)\n\t$0\nend");
  });
});

describe("analyzePrefix", () => {
  it("받는 쪽과 단어를 나눈다", () => {
    expect(analyzePrefix("  Graphics.dr", "ruby")).toEqual({ receiver: "Graphics", separator: ".", word: "dr", symbolArg: false });
    expect(analyzePrefix("x = Input.", "lua")).toEqual({ receiver: "Input", separator: ".", word: "", symbolArg: false });
    expect(analyzePrefix("Inpu", "lua")).toEqual({ receiver: null, separator: null, word: "Inpu", symbolArg: false });
    expect(analyzePrefix("", "lua")).toEqual({ receiver: null, separator: null, word: "", symbolArg: false });
  });

  it("Ruby 의 :: 와 Symbol 인자 자리를 안다. Lua 는 :: 를 모른다", () => {
    expect(analyzePrefix("Keys::SP", "ruby")).toEqual({ receiver: "Keys", separator: "::", word: "SP", symbolArg: false });
    expect(analyzePrefix("Keys::SP", "lua").receiver).toBeNull();
    expect(analyzePrefix("if Input.press?(:sp", "ruby")).toEqual({ receiver: null, separator: null, word: "sp", symbolArg: true });
    expect(analyzePrefix("Input.press?(", "ruby").symbolArg).toBe(false);
    expect(analyzePrefix("foo(1, :", "ruby")).toEqual({ receiver: null, separator: null, word: "", symbolArg: true });
  });
});

describe("candidates", () => {
  it("받는 쪽이 없으면 전역과 아직 없는 씬 함수", () => {
    const list = candidates(lua, analyzePrefix("Inpu", "lua"), "lua", "function init()\nend\n");
    expect(labels(list)).toContain("Input");
    expect(labels(list)).toContain("update");
    expect(labels(list)).not.toContain("init");
  });

  it("받는 쪽이 있으면 그 멤버, 모르는 받는 쪽은 Ruby 에서만 인스턴스 메서드", () => {
    expect(labels(candidates(lua, analyzePrefix("Input.", "lua"), "lua", ""))).toEqual(["IsKeyDown", "GetMouseX"]);
    expect(labels(candidates(ruby, analyzePrefix("sprite.", "ruby"), "ruby", ""))).toEqual(["set_position", "visible?", "draw"]);
    expect(candidates(lua, analyzePrefix("sprite.", "lua"), "lua", "")).toEqual([]);
    expect(labels(candidates(ruby, analyzePrefix("Keys::", "ruby"), "ruby", ""))).toEqual(["A", "SPACE", "F1"]);
  });

  it("Symbol 인자 자리에는 :space 같은 것", () => {
    expect(labels(candidates(ruby, analyzePrefix("Input.press?(:", "ruby"), "ruby", ""))).toEqual([":a", ":space", ":f1"]);
  });

  it("hasHook 은 정의된 씬 함수를 안다", () => {
    expect(hasHook("local function init()", "init", "lua")).toBe(true);
    expect(hasHook("function update(e)\nend", "update", "lua")).toBe(true);
    expect(hasHook("-- function render()", "render", "lua")).toBe(false);
    expect(hasHook("def update(elapsed)\nend", "update", "ruby")).toBe(true);
    expect(hasHook("def updater", "update", "ruby")).toBe(false);
  });
});

describe("callContext 와 lookupCallable", () => {
  it("닫히지 않은 가장 안쪽 괄호의 호출과 인자 번호", () => {
    expect(callContext("Graphics.draw_text(1, \"a,b\", ")).toEqual({ callee: "Graphics.draw_text", activeParameter: 2 });
    expect(callContext("DrawText(")).toEqual({ callee: "DrawText", activeParameter: 0 });
    expect(callContext("foo(bar(1), ")).toEqual({ callee: "foo", activeParameter: 1 });
    expect(callContext("Input.press?(")).toEqual({ callee: "Input.press?", activeParameter: 0 });
    expect(callContext("print(\"(\", ")).toEqual({ callee: "print", activeParameter: 1 });
  });

  it("괄호가 없거나 닫혔거나 이름이 없으면 null", () => {
    expect(callContext("x = 1")).toBeNull();
    expect(callContext("foo(1)")).toBeNull();
    expect(callContext("(1, ")).toBeNull();
    expect(callContext("t[")).toBeNull();
  });

  it("Ruby 의 obj.method 는 인스턴스 메서드로 다시 찾는다", () => {
    expect(lookupCallable(ruby, "sprite.set_position")!.params.map((p) => p.name)).toEqual(["x", "y"]);
    expect(lookupCallable(ruby, "Graphics.draw_text")!.detail).toBe("Graphics.draw_text(x, y, text) -> nil");
    expect(lookupCallable(lua, "Sprite.SetPosition")!.params.map((p) => p.name)).toEqual(["id", "x", "y"]);
    expect(lookupCallable(lua, "Nope")).toBeUndefined();
  });
});

describe("lookupHover", () => {
  it("받는 쪽과 단어로 설명을 찾는다", () => {
    expect(lookupHover(ruby, "Graphics", "draw_text")!.doc).toBe("글자를 그린다");
    expect(lookupHover(ruby, "Graphics", "render_scale")!.label).toBe("render_scale =");
    expect(lookupHover(ruby, null, "Input")!.doc).toBe("입력");
    expect(lookupHover(ruby, "sprite", "set_position")!.doc).toBe("위치");
    expect(lookupHover(lua, null, "DrawText")!.detail).toBe("DrawText(x, y, text) -> nil");
    expect(lookupHover(lua, "Input", "IsKeyDown")!.doc).toBe("눌렸다");
    expect(lookupHover(lua, null, "nothing")).toBeUndefined();
  });
});
