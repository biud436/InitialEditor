import { describe, expect, it } from "vitest";
import { countSpec, EMPTY_SPEC, hookName, inferRubyKind, paramsFor, paramType, parseApiSpec, returnsFor } from "./apiSpec";
import { LANG_SPEC_FIXTURE, SPEC_FIXTURE } from "./apiSpecFixture";

describe("parseApiSpec", () => {
  it("문자열과 객체 둘 다 받고 같은 결과다", () => {
    const fromText = parseApiSpec(JSON.stringify(SPEC_FIXTURE));
    const fromObject = parseApiSpec(SPEC_FIXTURE);
    expect(fromText).toEqual(fromObject);
    expect(fromText.version).toBe(1);
    expect(fromText.modules.map((m) => m.name)).toEqual(["Graphics", "Input"]);
    expect(fromText.classes.map((c) => c.name)).toEqual(["Sprite"]);
    expect(fromText.constants[0].names).toEqual(["A", "SPACE", "F1"]);
  });

  it("모듈의 lua 가 null 이면 Lua 함수는 전역이고, 함수의 lua 나 ruby 가 null 이면 한쪽 전용이다", () => {
    const spec = parseApiSpec(SPEC_FIXTURE);
    const graphics = spec.modules[0];
    expect(graphics.lua).toBeNull();
    expect(graphics.ruby).toBe("Graphics");
    const env = graphics.functions.find((f) => f.ruby === "env")!;
    expect(env.lua).toBeNull();
    const loadScript = graphics.functions.find((f) => f.lua === "LoadScript")!;
    expect(loadScript.ruby).toBeNull();
    expect(spec.modules[1].lua).toBe("Input");
  });

  it("rubyKind 가 없으면 이름 모양으로 짐작한다", () => {
    expect(inferRubyKind("width", [])).toBe("getter");
    expect(inferRubyKind("width=", [{ name: "w" }])).toBe("setter");
    expect(inferRubyKind("visible?", [])).toBe("predicate");
    expect(inferRubyKind("draw_text", [{ name: "x" }])).toBe("method");
    const spec = parseApiSpec(SPEC_FIXTURE);
    const visible = spec.classes[0].methods.find((m) => m.ruby === "visible?")!;
    expect(visible.rubyKind).toBe("predicate");
    const draw = spec.classes[0].methods.find((m) => m.ruby === "draw")!;
    expect(draw.rubyKind).toBe("getter");
  });

  it("빠진 칸은 너그럽게 채운다: 배열이 없으면 빈 배열, 씬 계약이 없으면 엔진 기본 네 함수", () => {
    const spec = parseApiSpec({ version: 1 });
    expect(spec.modules).toEqual([]);
    expect(spec.classes).toEqual([]);
    expect(spec.constants).toEqual([]);
    expect(spec.sceneContract.map((h) => h.name)).toEqual(["init", "update", "render", "destroy"]);
    expect(spec.sceneContract).toEqual(EMPTY_SPEC.sceneContract);
    const noVersion = parseApiSpec({ modules: [{ name: "X", functions: [{ lua: "F" }] }] });
    expect(noVersion.version).toBe(1);
    expect(noVersion.modules[0].lua).toBe("X");
    expect(noVersion.modules[0].ruby).toBe("X");
    expect(noVersion.modules[0].functions[0]).toEqual({ lua: "F", ruby: null, params: [] });
  });

  it("이름이 없는 항목과 양쪽 이름이 다 null 인 함수는 버린다", () => {
    const spec = parseApiSpec({ version: 1, modules: [{ functions: [] }, { name: "M", functions: [{ lua: null, ruby: null }, { lua: "Ok", params: ["a", { name: "b", optional: true }] }] }] });
    expect(spec.modules).toHaveLength(1);
    expect(spec.modules[0].functions).toHaveLength(1);
    expect(spec.modules[0].functions[0].params).toEqual([{ name: "a" }, { name: "b", optional: true }]);
  });

  it("객체가 아니거나 version 이 숫자가 아니면 던진다", () => {
    expect(() => parseApiSpec("[]")).toThrow();
    expect(() => parseApiSpec("null")).toThrow();
    expect(() => parseApiSpec({ version: "1" })).toThrow(/version/);
    expect(() => parseApiSpec("{ not json")).toThrow();
  });

  it("countSpec 은 함수와 메서드와 상수를 센다", () => {
    const n = countSpec(parseApiSpec(SPEC_FIXTURE));
    expect(n).toEqual({ functions: 5 + 3 + 1 + 3, classes: 1, constants: 3 });
  });

  it("씬 계약은 언어별 이름(lua, ruby)과 luaRequired 를 옮긴다", () => {
    const spec = parseApiSpec(SPEC_FIXTURE);
    expect(spec.sceneContract.map((h) => h.name)).toEqual(["init", "update", "render", "destroy"]);
    expect(spec.sceneContract.map((h) => hookName(h, "lua"))).toEqual(["Initialize", "Update", "Render", "Destroy"]);
    expect(spec.sceneContract.map((h) => hookName(h, "ruby"))).toEqual(["init", "update", "render", "destroy"]);
    expect(spec.sceneContract.every((h) => h.luaRequired === true)).toBe(true);
    expect(spec.sceneContract[1].params).toEqual([{ name: "elapsed_ms", type: "number" }]);
    expect(spec.sceneContract[0].doc).toBe("처음 한 번");
    const langOnly = parseApiSpec(LANG_SPEC_FIXTURE).sceneContract.find((h) => h.name === "lua_only")!;
    expect(langOnly).toEqual({ name: "lua_only", lua: "LuaOnly", ruby: null, params: [], doc: "Lua 에만 있는 함수" });
  });

  it("씬 계약에 lua, ruby 키가 없으면 엔진 규칙의 이름, 엔진 규칙에 없는 이름이면 name 그대로", () => {
    const spec = parseApiSpec({ sceneContract: [{ name: "update", params: [{ name: "dt" }] }, "render", { name: "custom" }, { name: "gone", lua: null }] });
    expect(spec.sceneContract.map((h) => [h.lua, h.ruby])).toEqual([
      ["Update", "update"],
      ["Render", "render"],
      ["custom", "custom"],
      [null, "gone"],
    ]);
    expect(EMPTY_SPEC.sceneContract.map((h) => [h.lua, h.ruby, h.luaRequired])).toEqual([
      ["Initialize", "init", true],
      ["Update", "update", true],
      ["Render", "render", true],
      ["Destroy", "destroy", true],
    ]);
  });

  it("언어별 인자, 반환, 타입, 기본값, 가변 인자, 다른 꼴, 별명, 프렐류드를 모두 옮긴다", () => {
    const spec = parseApiSpec(LANG_SPEC_FIXTURE);
    const [graphics, system, kernel, input, audio] = spec.modules;
    const setColor = graphics.functions[0];
    expect(setColor.params[3]).toEqual({ name: "a", type: "integer", optional: true, default: 255 });
    expect(setColor.luaParams![3]).toEqual({ name: "a", type: "integer" });
    expect(setColor.luaReturns).toBe("number");
    expect(graphics.functions[1].rubyReturns).toBe("integer");
    expect(graphics.functions[2]).toMatchObject({ lua: "draw_text", ruby: null, alias: true, aliasOf: "DrawText" });
    expect(system.functions[0].luaParams).toEqual([{ name: "slash", type: "any", optional: true, doc: "주면 / 구분자" }]);
    expect(system.functions[1].params[1]).toEqual({ name: "caption", type: "string", optional: true, default: "", doc: "제목" });
    expect(kernel.functions[0].params).toEqual([{ name: "...", type: "any", variadic: true }]);
    expect(input.functions[0].params[0]).toEqual({ name: "key", type: "integer", rubyType: "integer|symbol", doc: "가상 키 코드" });
    expect(input.functions[2].luaReturns).toEqual(["integer|nil", "number", "number", "string"]);
    expect(input.functions[3].prelude).toBe(true);
    expect(audio.functions[0].rubyParams![2]).toEqual({ name: "loop", type: "boolean|integer", optional: true, default: true, doc: "true 무한 반복, false 한 번" });
    const tilemap = spec.classes[0];
    expect(tilemap.luaStyle).toBe("handle");
    expect(spec.classes[1].luaStyle).toBeUndefined();
    expect(tilemap.constructors[0]).toMatchObject({ luaReturns: ["Tilemap|nil", "string|nil"], prelude: true });
    expect(tilemap.methods[0].params[2]).toMatchObject({ name: "cam_x", optional: true, default: 0 });
    expect(tilemap.methods[1].overloads).toEqual([[{ name: "rect", type: "table", doc: "x, y 를 가진 표" }]]);
    expect(spec.constants[0].values).toEqual({ SPACE: 32, F1: 112 });
    expect(spec.engine).toBe("Initial2D");
    expect(spec.generatedFrom).toBe("테스트 픽스처");
    expect(spec.types).toContain("symbol");
  });

  it("paramsFor, returnsFor, paramType 은 그 언어의 값을 고르고 없으면 공통 값", () => {
    const spec = parseApiSpec(LANG_SPEC_FIXTURE);
    const setColor = spec.modules[0].functions[0];
    expect(paramsFor(setColor, "lua").map((p) => p.optional ?? false)).toEqual([false, false, false, false]);
    expect(paramsFor(setColor, "ruby").map((p) => p.optional ?? false)).toEqual([false, false, false, true]);
    expect(returnsFor(setColor, "lua")).toBe("number");
    expect(returnsFor(setColor, "ruby")).toBe("nil");
    const playMusic = spec.modules[4].functions[0];
    expect(paramsFor(playMusic, "lua")[2].optional).toBeUndefined();
    expect(paramsFor(playMusic, "ruby")[2]).toMatchObject({ optional: true, default: true });
    expect(returnsFor(playMusic, "ruby")).toBe("boolean");
    const key = spec.modules[3].functions[0].params[0];
    expect(paramType(key, "lua")).toBe("integer");
    expect(paramType(key, "ruby")).toBe("integer|symbol");
    expect(paramType({ name: "v", type: "number", luaType: "integer" }, "lua")).toBe("integer");
  });

  it("rubyKind 짐작은 Ruby 의 인자 목록(rubyParams)으로 한다", () => {
    const spec = parseApiSpec({ modules: [{ name: "M", functions: [{ lua: "F", ruby: "f", params: [], rubyParams: [{ name: "a" }] }, { lua: "G", ruby: "g", params: [{ name: "a" }], rubyParams: [] }] }] });
    expect(spec.modules[0].functions.map((f) => f.rubyKind)).toEqual(["method", "getter"]);
  });
});
