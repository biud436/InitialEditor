import { describe, expect, it } from "vitest";
import { countSpec, EMPTY_SPEC, inferRubyKind, parseApiSpec } from "./apiSpec";
import { SPEC_FIXTURE } from "./apiSpecFixture";

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
});
