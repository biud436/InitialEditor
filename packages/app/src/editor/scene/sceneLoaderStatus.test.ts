import { MemoryBackend } from "@initial-editor/core/testing";
import { describe, expect, it } from "vitest";
import { SceneLoaderStatus, sceneLoaderStateOf } from "./sceneLoaderStatus";
import type { TemplateSource } from "./templateFiles";

const OLD = "SceneLoader.SCRIPT_ROOT = \"scripts/lua/\"\n";
const NEW = 'SceneLoader.DECLARATION_ROOT = "scripts/"\n';

describe("씬 로더 상태", () => {
  it("선언 파일 위치(DECLARATION_ROOT)가 있으면 매개변수를 안다", () => {
    expect(sceneLoaderStateOf(NEW)).toBe("params");
    expect(sceneLoaderStateOf(OLD)).toBe("old");
    expect(sceneLoaderStateOf(null)).toBe("missing");
  });

  it("game.json 의 언어의 로더를 보고, 바꾸기는 프로젝트에 있는 로더만 템플릿으로 덮어쓴다", async () => {
    const be = new MemoryBackend({ "game.json": "{}", "scripts/lua/scene_loader.lua": OLD });
    await be.open("/mem");
    let language: "lua" | "mruby" = "lua";
    const status = new SceneLoaderStatus(() => be, () => language);
    expect(await status.refresh()).toBe("old");
    expect(status.state).toBe("old");
    language = "mruby";
    expect(await status.refresh()).toBe("missing");
    language = "lua";
    const source: TemplateSource = { text: (p) => `-- ${p}\n${NEW}`, binary: async () => new Uint8Array() };
    expect(await status.upgrade(source)).toEqual(["scripts/lua/scene_loader.lua"]);
    expect(status.state).toBe("params");
    expect(await be.readText("scripts/lua/scene_loader.lua")).toBe(`-- scripts/lua/scene_loader.lua\n${NEW}`);
    expect(await be.exists("scripts/ruby/scene_loader.rb")).toBe(false);
    status.clear();
    expect(status.state).toBeNull();
  });
});
