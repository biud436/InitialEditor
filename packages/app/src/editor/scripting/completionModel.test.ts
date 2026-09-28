import { describe, expect, it } from "vitest";
import { parseApiSpec } from "./apiSpec";
import { LANG_SPEC_FIXTURE, SPEC_FIXTURE } from "./apiSpecFixture";
import { analyzePrefix, buildIndex, callContext, candidates, describe as describeSuggestion, hasHook, literal, lookupCallable, lookupHover, pickSignature, symbolFor, type Signature } from "./completionModel";

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

  it("씬 계약 스니펫은 엔진이 부르는 Lua 이름의 function 꼴이고 Symbol 은 없다", () => {
    expect(labels(lua.hooks)).toEqual(["Initialize", "Update", "Render", "Destroy"]);
    expect(lua.hooks[0].insert).toBe("function Initialize()\n\t$0\nend");
    expect(lua.hooks[1].insert).toBe("function Update(elapsed_ms)\n\t$0\nend");
    expect(lua.hooks[1].detail).toBe("씬 계약: Update(elapsed_ms)");
    expect(lua.hooks[1].params).toEqual([{ name: "elapsed_ms", type: "number" }]);
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

  it("씬 계약 스니펫은 엔진이 부르는 Ruby 이름의 def 꼴이다", () => {
    expect(labels(ruby.hooks)).toEqual(["init", "update", "render", "destroy"]);
    expect(ruby.hooks[0].insert).toBe("def init\n\t$0\nend");
    expect(ruby.hooks[1].insert).toBe("def update(elapsed_ms)\n\t$0\nend");
    expect(ruby.hooks[1].detail).toBe("씬 계약: update(elapsed_ms)");
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
  it("받는 쪽이 없으면 전역과 아직 없는 씬 함수 (Lua 는 Initialize 로 판단)", () => {
    const list = candidates(lua, analyzePrefix("Inpu", "lua"), "lua", "function Initialize()\nend\n");
    expect(labels(list)).toContain("Input");
    expect(labels(list)).toContain("Update");
    expect(labels(list)).not.toContain("Initialize");
    // 엔진이 부르지 않는 소문자 init 은 Initialize 를 대신하지 않는다
    const lower = candidates(lua, analyzePrefix("", "lua"), "lua", "function init()\nend\nfunction update(e)\nend\n");
    expect(labels(lower)).toEqual(expect.arrayContaining(["Initialize", "Update", "Render", "Destroy"]));
    const all = candidates(lua, analyzePrefix("", "lua"), "lua", "function Initialize() init() end\nfunction Update(e) update(e) end\nfunction Render() end\nfunction Destroy() end\n");
    expect(all.filter((s) => s.kind === "hook")).toEqual([]);
  });

  it("Ruby 는 def init 이 있으면 init 스니펫을 내지 않는다", () => {
    const list = candidates(ruby, analyzePrefix("", "ruby"), "ruby", "def init\nend\n\ndef update(elapsed_ms)\nend\n");
    expect(labels(list.filter((s) => s.kind === "hook"))).toEqual(["render", "destroy"]);
    const none = candidates(ruby, analyzePrefix("", "ruby"), "ruby", "def initialize\nend\ndef updater\nend\n");
    expect(labels(none.filter((s) => s.kind === "hook"))).toEqual(["init", "update", "render", "destroy"]);
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
    expect(hasHook("function Initialize()\nend", "Initialize", "lua")).toBe(true);
    expect(hasHook("function initialize()\nend", "Initialize", "lua")).toBe(false);
    expect(hasHook("function Initialize ()", "Initialize", "lua")).toBe(true);
    expect(hasHook("  def init # 처음\n  end", "init", "ruby")).toBe(true);
    expect(hasHook("def init_state\nend", "init", "ruby")).toBe(false);
    expect(hasHook("def init?\nend", "init", "ruby")).toBe(false);
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
    expect(lookupHover(ruby, "Graphics", "draw_text")!.doc).toBe("텍스트 그리기");
    expect(lookupHover(ruby, "Graphics", "render_scale")!.label).toBe("render_scale =");
    expect(lookupHover(ruby, null, "Input")!.doc).toBe("입력");
    expect(lookupHover(ruby, "sprite", "set_position")!.doc).toBe("위치");
    expect(lookupHover(lua, null, "DrawText")!.detail).toBe("DrawText(x, y, text) -> nil");
    expect(lookupHover(lua, "Input", "IsKeyDown")!.doc).toBe("눌려 있으면 true");
    expect(lookupHover(lua, null, "nothing")).toBeUndefined();
  });
});

const langSpec = parseApiSpec(LANG_SPEC_FIXTURE);
const luaL = buildIndex(langSpec, "lua");
const rubyL = buildIndex(langSpec, "ruby");
const spans = (sig: Signature) => sig.params.map((p) => sig.label.slice(p.range[0], p.range[1]));

describe("언어별 인자와 반환 (luaParams, rubyParams, luaReturns, rubyReturns, default)", () => {
  it("Ruby 전용 선택 인자는 스니펫에 들어가지 않는다: Audio.play_music 의 loop", () => {
    const rb = rubyL.callables.get("Audio.play_music")!;
    expect(rb.insert).toBe("play_music(${1:path}, ${2:id})");
    expect(rb.snippet).toBe(true);
    expect(rb.detail).toBe("Audio.play_music(path, id, loop = true) -> boolean");
    expect(rb.returns).toBe("boolean");
    expect(rb.params[2]).toEqual({ name: "loop", type: "boolean|integer", optional: true, default: true, doc: "true 무한 반복, false 한 번" });
    const lu = luaL.callables.get("Audio.PlayMusic")!;
    expect(lu.insert).toBe("PlayMusic(${1:path}, ${2:id}, ${3:loop})");
    expect(lu.detail).toBe("Audio.PlayMusic(path, id, loop) -> nil");
  });

  it("Lua 전용 필수 인자와 Lua 반환: draw_set_color 는 넷 다, Ruby set_color 는 a = 255", () => {
    const lu = luaL.callables.get("draw_set_color")!;
    expect(lu.insert).toBe("draw_set_color(${1:r}, ${2:g}, ${3:b}, ${4:a})");
    expect(lu.detail).toBe("draw_set_color(r, g, b, a) -> number");
    const rb = rubyL.callables.get("Graphics.set_color")!;
    expect(rb.insert).toBe("set_color(${1:r}, ${2:g}, ${3:b})");
    expect(rb.detail).toBe("Graphics.set_color(r, g, b, a = 255) -> nil");
    expect(rubyL.callables.get("Graphics.draw_text")!.detail).toBe("Graphics.draw_text(x, y, text) -> integer");
    expect(luaL.callables.get("DrawText")!.detail).toBe("DrawText(x, y, text) -> number");
  });

  it("Lua 선택 인자는 name? 이고 Ruby 기본값은 리터럴이다", () => {
    expect(luaL.callables.get("MessageBox")!.detail).toBe("MessageBox(text, caption?) -> nil");
    expect(luaL.callables.get("MessageBox")!.insert).toBe("MessageBox(${1:text})");
    expect(rubyL.callables.get("System.message_box")!.detail).toBe('System.message_box(text, caption = "") -> nil');
    const cwd = luaL.callables.get("GetCurrentDirectory")!;
    expect(cwd.detail).toBe("GetCurrentDirectory(slash?) -> string");
    expect(cwd.insert).toBe("GetCurrentDirectory($1)");
    expect(rubyL.members.get("System")!.find((s) => s.label === "current_directory")!.detail).toBe("System.current_directory -> string");
  });

  it("가변 인자는 Lua ... 이고 스니펫은 인자 없는 $1", () => {
    const print = luaL.callables.get("print")!;
    expect(print.detail).toBe("print(...) -> nil");
    expect(print.insert).toBe("print($1)");
  });

  it("인자 타입은 그 언어의 것 (rubyType), Lua 의 여러 반환은 쉼표로 잇는다", () => {
    expect(rubyL.callables.get("Input.key_down?")!.params[0].type).toBe("integer|symbol");
    expect(luaL.callables.get("Input.IsKeyDown")!.params[0].type).toBe("integer");
    expect(luaL.callables.get("Input.GetTouch")!.detail).toBe("Input.GetTouch(index) -> integer|nil, number, number, string");
    expect(rubyL.callables.get("Input.touch")!.detail).toBe("Input.touch(index) -> array|nil");
    expect(luaL.callables.get("Tilemap.Load")!.returns).toBe("Tilemap|nil, string|nil");
    expect(rubyL.callables.get("Tilemap.load")!.returns).toBe("Tilemap|nil");
  });

  it("luaStyle 이 handle 인 클래스만 Lua 메서드에 핸들을 붙인다", () => {
    expect(luaL.callables.get("Tilemap.Draw")!.detail).toBe("Tilemap.Draw(handle, layer_from, layer_to, cam_x?) -> nil");
    expect(luaL.callables.get("Tilemap.Draw")!.insert).toBe("Draw(${1:handle}, ${2:layer_from}, ${3:layer_to})");
    expect(luaL.callables.get("Plain.Reset")!.detail).toBe("Plain.Reset() -> nil");
    expect(luaL.callables.get("Plain.Reset")!.insert).toBe("Reset()");
    expect(rubyL.callables.get("#draw")!.detail).toBe("Tilemap#draw(layer_from, layer_to, cam_x = 0) -> Tilemap  (Tilemap)");
  });

  it("다른 인자 꼴(overloads)은 시그니처 도움말의 둘째 꼴이다", () => {
    const lu = luaL.callables.get("Tilemap.SetRect")!;
    expect(lu.signatures.map((s) => s.label)).toEqual(["Tilemap.SetRect(handle, x, y) -> nil", "Tilemap.SetRect(handle, rect) -> nil"]);
    const rb = rubyL.callables.get("#set_rect")!;
    expect(rb.signatures.map((s) => s.label)).toEqual(["Tilemap#set_rect(x, y) -> Tilemap", "Tilemap#set_rect(rect) -> Tilemap"]);
    expect(rb.signatures[1].params[0].doc).toBe("타입: table. x, y 를 가진 표");
  });

  it("시그니처의 인자 범위는 시그니처 글 속 그 인자이고, 설명은 타입과 기본값과 doc", () => {
    const rb = rubyL.callables.get("Audio.play_music")!;
    expect(spans(rb.signatures[0])).toEqual(["path", "id", "loop = true"]);
    expect(rb.signatures[0].params[2].doc).toBe("타입: boolean|integer. 기본값: true. true 무한 반복, false 한 번");
    expect(spans(luaL.callables.get("Tilemap.Draw")!.signatures[0])).toEqual(["handle", "layer_from", "layer_to", "cam_x?"]);
    const setter = rubyL.members.get("Graphics")!;
    expect(setter.find((s) => s.label === "set_color")!.signatures[0].params[3].doc).toBe("타입: integer. 기본값: 255");
    expect(spans(ruby.members.get("Graphics")!.find((s) => s.label === "render_scale =")!.signatures[0])).toEqual(["n"]);
  });

  it("pickSignature 는 인자 번호가 들어가는 첫 꼴, 없으면 본 꼴", () => {
    const sig = (n: number): Signature => ({ label: "f()", params: Array.from({ length: n }, () => ({ range: [0, 0] as [number, number], doc: "" })) });
    expect(pickSignature([sig(1), sig(3)], 0)).toBe(0);
    expect(pickSignature([sig(1), sig(3)], 2)).toBe(1);
    expect(pickSignature([sig(1), sig(3)], 5)).toBe(0);
    expect(pickSignature(luaL.callables.get("Tilemap.SetRect")!.signatures, 1)).toBe(0);
  });

  it("상수는 값을 보이고 리터럴은 Lua, Ruby 표기다", () => {
    expect(rubyL.members.get("Keys")!.map((s) => s.detail)).toEqual(["Keys::SPACE = 32", "Keys::F1 = 112"]);
    expect(literal(null)).toBe("nil");
    expect(literal("")).toBe('""');
    expect(literal(true)).toBe("true");
    expect(literal(255)).toBe("255");
  });

  it("씬 계약: 그 언어에 없는 함수는 빼고, Lua luaRequired 는 필수, Ruby 는 선택으로 설명한다", () => {
    expect(labels(luaL.hooks)).toEqual(["Initialize", "Update", "Render", "Destroy", "LuaOnly"]);
    expect(labels(rubyL.hooks)).toEqual(["init", "update", "render", "destroy"]);
    expect(luaL.hooks[0].doc).toBe("처음 한 번\n\n필수 함수 (엔진이 정의 여부를 확인하지 않고 호출)");
    expect(luaL.hooks[4].doc).toContain("선택 함수 (정의된 것만 호출)");
    expect(rubyL.hooks[0].doc).toBe("처음 한 번\n\n선택 함수 (정의된 것만 호출)");
    expect(luaL.hooks[4].insert).toBe("function LuaOnly()\n\t$0\nend");
  });

  it("호버와 완성 문서: 시그니처(다른 꼴 포함), 설명, 인자별 타입과 기본값, 별명의 원래 이름", () => {
    const md = describeSuggestion(rubyL.callables.get("Audio.play_music")!);
    expect(md).toContain("```\nAudio.play_music(path, id, loop = true) -> boolean\n```");
    expect(md).toContain("배경 음악");
    expect(md).toContain("- `loop`: 타입: boolean|integer. 기본값: true. true 무한 반복, false 한 번");
    expect(describeSuggestion(luaL.callables.get("Tilemap.SetRect")!)).toContain("```\nTilemap.SetRect(handle, x, y) -> nil\nTilemap.SetRect(handle, rect) -> nil\n```");
    expect(describeSuggestion(rubyL.callables.get("Input.trigger?")!)).toContain("_별칭_: `key_down?`");
    expect(describeSuggestion(luaL.callables.get("draw_text")!)).toContain("_별칭_: `DrawText`");
    expect(describeSuggestion(lookupHover(rubyL, "Input", "key_down?")!)).toContain("- `key`: 타입: integer|symbol. 가상 키 코드");
    expect(describeSuggestion(lookupHover(luaL, "Input", "IsKeyDown")!)).toContain("- `key`: 타입: integer. 가상 키 코드");
    expect(describeSuggestion(lookupHover(rubyL, "Keys", "SPACE")!)).toBe("```\nKeys::SPACE = 32\n```");
  });

  it("lookupCallable 은 그 언어의 인자를 돌려준다", () => {
    expect(lookupCallable(rubyL, "Audio.play_music")!.params.map((p) => p.optional ?? false)).toEqual([false, false, true]);
    expect(lookupCallable(luaL, "Audio.PlayMusic")!.params.map((p) => p.optional ?? false)).toEqual([false, false, false]);
    expect(lookupCallable(rubyL, "map.set_rect")!.signatures).toHaveLength(2);
  });
});
