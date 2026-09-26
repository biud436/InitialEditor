import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_JSON, parseGameJson, Project, serializeGameJson } from "./project";
import { MemoryBackend } from "./testing/memory-backend";

describe("game.json", () => {
  it("기본값과 모르는 키 보존", () => {
    const g = parseGameJson('{"windowWidth": 320, "windowHeight": 240, "renderScale": 2, "custom": {"a": 1}}');
    expect(g.windowWidth).toBe(320);
    expect(g.renderScale).toBe(2);
    expect(g.script).toBe("lua");
    expect(g.extra).toEqual({ custom: { a: 1 } });
    const text = serializeGameJson(g);
    expect(JSON.parse(text)).toEqual({ windowWidth: 320, windowHeight: 240, renderScale: 2, script: "lua", custom: { a: 1 } });
    expect(text.endsWith("\n")).toBe(true);
  });

  it("빈 객체는 엔진 기본값이 된다", () => {
    const g = parseGameJson("{}");
    expect(g.windowWidth).toBe(DEFAULT_GAME_JSON.windowWidth);
    expect(g.windowHeight).toBe(DEFAULT_GAME_JSON.windowHeight);
  });

  it("script 는 lua 아니면 mruby", () => {
    expect(parseGameJson('{"script": "mruby"}').script).toBe("mruby");
    expect(parseGameJson('{"script": "python"}').script).toBe("lua");
  });

  it("객체가 아니면 오류", () => {
    expect(() => parseGameJson("[1]")).toThrow();
  });
});

describe("Project", () => {
  it("열면 루트 목록과 game.json 을 읽고, 변경 알림으로 캐시를 갱신한다", async () => {
    const be = new MemoryBackend({
      "game.json": '{"windowWidth": 400, "windowHeight": 300}',
      "scripts/lua/main.lua": "print(1)",
      "resources/images/a.png": "\u0000",
    });
    const p = new Project(be);
    const info = await p.open("/mem");
    expect(info.hasGameJson).toBe(true);
    expect(p.gameJson.windowWidth).toBe(400);
    expect(p.folders.get("")!.map((e) => e.name)).toEqual(["resources", "scripts", "game.json"]);
    await p.entries("scripts");
    expect(p.folders.get("scripts")!.map((e) => e.name)).toEqual(["lua"]);

    await be.writeText("scripts/new.lua", "x");
    expect(p.folders.get("scripts")!.map((e) => e.name)).toEqual(["lua", "new.lua"]);
    await be.remove("scripts/new.lua");
    expect(p.folders.get("scripts")!.map((e) => e.name)).toEqual(["lua"]);
  });

  it("game.json 이 없으면 기본값을 들고, 저장하면 생긴다", async () => {
    const be = new MemoryBackend({ "scripts/lua/main.lua": "" });
    const p = new Project(be);
    const info = await p.open("/mem");
    expect(info.hasGameJson).toBe(false);
    expect(p.gameJson.script).toBe("lua");
    await p.saveGameJson({ ...p.gameJson, name: "테스트" });
    expect(await be.exists("game.json")).toBe(true);
    expect(p.info!.hasGameJson).toBe(true);
    expect(p.folders.get("")!.some((e) => e.name === "game.json")).toBe(true);
    await p.close();
    expect(p.isOpen).toBe(false);
  });
});
