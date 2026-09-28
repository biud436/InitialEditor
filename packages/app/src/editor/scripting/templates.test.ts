import { describe, expect, it } from "vitest";
import { pascalCase, scriptPathFor, scriptTemplate, validateScriptName, type TemplateKind, type TemplateLanguage } from "./templates";

/** 진입점(scene)은 엔진이 부르는 이름, 컴포넌트는 언어 중립 이름 */
const HOOKS: Record<TemplateLanguage, Record<TemplateKind, string[]>> = {
  lua: { scene: ["Initialize", "Update", "Render", "Destroy"], component: ["init", "update", "render", "destroy"] },
  ruby: { scene: ["init", "update", "render", "destroy"], component: ["init", "update", "render", "destroy"] },
};

describe("scriptTemplate", () => {
  it.each([
    ["lua", "scene"],
    ["lua", "component"],
    ["ruby", "scene"],
    ["ruby", "component"],
  ] as Array<[TemplateLanguage, TemplateKind]>)("%s %s 템플릿에 씬 계약 네 함수가 있다", (language, kind) => {
    const text = scriptTemplate({ language, kind, name: "player" });
    for (const hook of HOOKS[language][kind]) {
      const re = language === "lua" ? new RegExp(`function (Player\\.)?${hook}\\(`) : new RegExp(`def ${hook}\\b`);
      expect(text).toMatch(re);
    }
    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toContain("\r");
  });

  it("Lua 씬 템플릿은 엔진이 부르는 전역 함수(Initialize 등)이고 Update 는 elapsed 를 받는다", () => {
    const text = scriptTemplate({ language: "lua", kind: "scene", name: "main" });
    expect(text).toContain("function Initialize()\nend\n");
    expect(text).toContain("function Update(elapsed)\nend\n");
    expect(text).toContain("function Render()\nend\n");
    expect(text).toContain("function Destroy()\nend\n");
    expect(text).not.toMatch(/function (init|update|render|destroy)\(/);
    expect(text).toContain("-- 필수 함수 (엔진이 정의 여부를 확인하지 않고 호출): Initialize, Update, Render, Destroy");
    expect(text).not.toContain("local ");
  });

  it("Lua 컴포넌트는 모듈 테이블이고 (obj, scene) 과 마지막 인자 params 를 받고 테이블을 돌려준다", () => {
    const text = scriptTemplate({ language: "lua", kind: "component", name: "player_ship" });
    expect(text).toContain("local PlayerShip = {}");
    expect(text).toContain("function PlayerShip.init(obj, scene, params)");
    expect(text).toContain("function PlayerShip.update(obj, scene, elapsed, params)");
    expect(text).toContain("function PlayerShip.render(obj, scene, params)");
    expect(text).toContain("function PlayerShip.destroy(obj, scene, params)");
    expect(text).toContain("-- params 는 매개변수 선언(scripts/<논리 이름>.json)의 기본값에");
    expect(text.trimEnd().endsWith("return PlayerShip")).toBe(true);
  });

  it("Ruby 씬 템플릿은 최상위 def 이고 인자 없는 함수는 괄호가 없다", () => {
    const text = scriptTemplate({ language: "ruby", kind: "scene", name: "main" });
    expect(text).toContain("def init\nend\n");
    expect(text).toContain("def update(elapsed)\nend\n");
  });

  it("Ruby 컴포넌트는 클래스이고 initialize 가 params 를 받고 (없으면 빈 Hash), 훅은 (obj, scene) 을 받는다", () => {
    const text = scriptTemplate({ language: "ruby", kind: "component", name: "games/flappy" });
    expect(text).toContain("class Flappy\n  def initialize(params = {})\n    @params = params\n  end\n");
    expect(text).toContain("  def init(obj, scene)\n  end\n");
    expect(text).toContain("  def update(obj, scene, elapsed)\n  end\n");
    expect(text.trimEnd().endsWith("end")).toBe(true);
  });

  it("명세의 씬 계약이 있으면 그 이름과 인자를 쓴다 (진입점은 언어별 이름, 컴포넌트는 name)", () => {
    const hooks = [
      { name: "init", lua: "Initialize", ruby: "init", params: [], luaRequired: true },
      { name: "update", lua: "Update", ruby: "update", params: [{ name: "elapsed_ms", type: "number" }], luaRequired: true },
      { name: "render", lua: "Render", ruby: "render", params: [] },
      { name: "destroy", lua: "Destroy", ruby: null, params: [] },
    ];
    const luaScene = scriptTemplate({ language: "lua", kind: "scene", name: "main", hooks });
    expect(luaScene).toContain("function Update(elapsed_ms)");
    expect(luaScene).toContain("-- 필수 함수 (엔진이 정의 여부를 확인하지 않고 호출): Initialize, Update\n");
    const rubyScene = scriptTemplate({ language: "ruby", kind: "scene", name: "main", hooks });
    expect(rubyScene).toContain("def update(elapsed_ms)");
    expect(rubyScene).not.toContain("def destroy");
    expect(scriptTemplate({ language: "lua", kind: "component", name: "x", hooks })).toContain("function X.update(obj, scene, elapsed_ms, params)");
    expect(scriptTemplate({ language: "ruby", kind: "component", name: "x", hooks })).toContain("def update(obj, scene, elapsed_ms)");
  });
});

describe("pascalCase, validateScriptName, scriptPathFor", () => {
  it("이름을 PascalCase 로 (마지막 경로 조각만)", () => {
    expect(pascalCase("player")).toBe("Player");
    expect(pascalCase("player_ship")).toBe("PlayerShip");
    expect(pascalCase("games/flappy-bird")).toBe("FlappyBird");
    expect(pascalCase("2d")).toBe("_2d");
  });

  it("이름 검사", () => {
    expect(validateScriptName("main")).toBeNull();
    expect(validateScriptName("games/flappy")).toBeNull();
    expect(validateScriptName("")).not.toBeNull();
    expect(validateScriptName("main.lua")).not.toBeNull();
    expect(validateScriptName("../x")).not.toBeNull();
    expect(validateScriptName("a//b")).not.toBeNull();
    expect(validateScriptName("한글")).not.toBeNull();
    expect(validateScriptName("a\\b")).not.toBeNull();
  });

  it("경로는 언어 폴더와 확장자를 붙인다", () => {
    expect(scriptPathFor("lua", "main")).toBe("scripts/lua/main.lua");
    expect(scriptPathFor("ruby", " games/flappy ")).toBe("scripts/ruby/games/flappy.rb");
    expect(scriptPathFor("lua", "/x/")).toBe("scripts/lua/x.lua");
  });
});
