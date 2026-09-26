import { describe, expect, it } from "vitest";
import { basename, dirname, extname, isInside, joinRel, normalizeRel, PathError } from "./paths";

describe("normalizeRel", () => {
  it("구분자와 점을 정리한다", () => {
    expect(normalizeRel("./scripts//lua/./main.lua")).toBe("scripts/lua/main.lua");
    expect(normalizeRel("scripts\\lua\\main.lua")).toBe("scripts/lua/main.lua");
    expect(normalizeRel("a/b/../c")).toBe("a/c");
    expect(normalizeRel("")).toBe("");
    expect(normalizeRel("/")).toBe("");
    expect(normalizeRel("./")).toBe("");
  });

  it("루트 밖과 절대 경로를 거부한다", () => {
    expect(() => normalizeRel("../x")).toThrow(PathError);
    expect(() => normalizeRel("a/../../x")).toThrow(PathError);
    expect(() => normalizeRel("C:\\x\\y")).toThrow(PathError);
    expect(() => normalizeRel("//server/share")).toThrow(PathError);
  });

  it("절대 경로는 거부하고 '/' 하나만 루트다", () => {
    expect(() => normalizeRel("/scripts/lua")).toThrow(PathError);
    expect(() => normalizeRel("/etc/passwd")).toThrow(PathError);
    expect(normalizeRel("/")).toBe("");
  });
});

describe("path helpers", () => {
  it("join, basename, dirname, extname", () => {
    expect(joinRel("scripts", "lua", "main.lua")).toBe("scripts/lua/main.lua");
    expect(joinRel("", "game.json")).toBe("game.json");
    expect(basename("scripts/lua/main.lua")).toBe("main.lua");
    expect(basename("game.json")).toBe("game.json");
    expect(dirname("scripts/lua/main.lua")).toBe("scripts/lua");
    expect(dirname("game.json")).toBe("");
    expect(extname("a/b.Lua")).toBe("lua");
    expect(extname("a/.gitignore")).toBe("");
    expect(extname("a/noext")).toBe("");
  });

  it("isInside", () => {
    expect(isInside("", "anything")).toBe(true);
    expect(isInside("scripts", "scripts/lua/x.lua")).toBe(true);
    expect(isInside("scripts", "scripts")).toBe(true);
    expect(isInside("scripts", "scriptsx/y")).toBe(false);
    expect(isInside("scripts/lua", "scripts/ruby/x.rb")).toBe(false);
  });
});
