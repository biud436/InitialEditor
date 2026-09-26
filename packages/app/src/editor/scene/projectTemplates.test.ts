import { parseGameJson, parseScene, validateScene } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GITIGNORE_PATH, writeProjectTemplate, type ProjectTemplateOptions } from "./projectTemplates";
import type { TemplateSource } from "./templateFiles";
import { templatePlan, type TemplateManifest } from "./templateManifest";

const TEMPLATES_DIR = fileURLToPath(new URL("../../../templates/", import.meta.url));
const manifest = JSON.parse(fs.readFileSync(TEMPLATES_DIR + "MANIFEST.json", "utf8")) as TemplateManifest;

/** 번들 대신 저장소의 templates/ 를 읽는 소스 (Node) */
const fsSource: TemplateSource = {
  text: (path) => fs.readFileSync(TEMPLATES_DIR + path, "utf8"),
  binary: async (path) => new Uint8Array(fs.readFileSync(TEMPLATES_DIR + path)),
};

async function make(options: ProjectTemplateOptions): Promise<{ be: MemoryBackend; written: string[] }> {
  const be = new MemoryBackend();
  await be.open("/mem/" + options.name);
  const written = await writeProjectTemplate(be, options, fsSource, manifest);
  return { be, written };
}

describe("writeProjectTemplate", () => {
  it("빈 프로젝트 (Lua): game.json, 진입점, 씬 로더, main.json, 폰트, .gitignore 를 만든다", async () => {
    const { be, written } = await make({ template: "empty", language: "lua", name: "mygame" });
    for (const p of ["game.json", "scripts/lua/main.lua", "scripts/lua/scene_loader.lua", "scripts/lua/scene_types/tilemap.lua", "resources/scenes/main.json", "resources/fonts/hangul.fnt", "resources/fonts/hangul_0.png", GITIGNORE_PATH]) {
      expect(written, p).toContain(p);
      expect(await be.exists(p), p).toBe(true);
    }
    // Ruby 쪽과 플래피의 것은 없다
    expect(await be.exists("scripts/ruby/main.rb")).toBe(false);
    expect(await be.exists("resources/scenes/flappy.json")).toBe(false);
    expect(await be.exists("scripts/lua/components/flappy/bird.lua")).toBe(false);
    const game = parseGameJson(await be.readText("game.json"));
    expect(game).toMatchObject({ name: "mygame", script: "lua", startScene: "main", windowWidth: 768, windowHeight: 896 });
    // 씬 파일은 코어가 읽고 검사를 통과한다
    const scene = parseScene(await be.readText("resources/scenes/main.json"));
    expect(scene.name).toBe("main");
    expect(scene.objects.map((o) => o.type)).toEqual(["text"]);
    expect(validateScene(scene)).toEqual([]);
    // 진입점은 씬 로더로 시작 씬을 연다
    expect(await be.readText("scripts/lua/main.lua")).toContain('require("scripts/lua/scene_loader")');
    expect(await be.readText(GITIGNORE_PATH)).toContain(".initial-editor/");
    for (const dir of ["resources/images", "resources/audio", "resources/maps"]) expect(await be.exists(dir), dir).toBe(true);
  });

  it("플래피버드 (Ruby): 씬과 컴포넌트 다섯과 그림 넷과 효과음 셋, startScene 은 flappy", async () => {
    const { be } = await make({ template: "flappy", language: "mruby", name: "flap" });
    for (const p of [
      "scripts/ruby/main.rb",
      "scripts/ruby/scene_loader.rb",
      "scripts/ruby/scene_types/tilemap.rb",
      "resources/scenes/flappy.json",
      ...["bird", "common", "director", "pipes", "scroller"].map((n) => `scripts/ruby/components/flappy/${n}.rb`),
      "resources/background_768x896.png",
      "resources/ground_768x64.png",
      "resources/bird_276x64.png",
      "resources/object_52x271.png",
      "resources/audio/flap.wav",
      "resources/audio/hit.wav",
      "resources/audio/point.wav",
    ]) {
      expect(await be.exists(p), p).toBe(true);
    }
    expect(await be.exists("scripts/lua/main.lua")).toBe(false);
    expect(await be.exists("scripts/lua/components/flappy/bird.lua")).toBe(false);
    expect(await be.exists("resources/scenes/main.json")).toBe(false);
    const game = parseGameJson(await be.readText("game.json"));
    expect(game.script).toBe("mruby");
    expect(game.startScene).toBe("flappy");
    // 씬이 가리키는 그림과 컴포넌트가 전부 프로젝트 안에 있다
    const scene = parseScene(await be.readText("resources/scenes/flappy.json"));
    expect(validateScene(scene)).toEqual([]);
    for (const o of scene.objects) {
      if (o.type === "sprite") expect(await be.exists(o.props.image as string), o.id).toBe(true);
      for (const s of o.scripts) expect(await be.exists(`scripts/ruby/${s}.rb`), s).toBe(true);
    }
    // 바이너리는 바이트가 같다
    const png = await be.readBinary("resources/bird_276x64.png");
    expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(png.byteLength).toBe(manifest.files.find((f) => f.path === "resources/bird_276x64.png")!.size);
  });

  it("있는 파일은 두고 없는 것만 만든다", async () => {
    const be = new MemoryBackend({ "game.json": '{ "windowWidth": 320, "windowHeight": 240, "custom": true }', "scripts/lua/main.lua": "-- mine\n" });
    await be.open("/mem/x");
    const written = await writeProjectTemplate(be, { template: "empty", language: "lua", name: "x" }, fsSource, manifest);
    expect(written).not.toContain("game.json");
    expect(written).not.toContain("scripts/lua/main.lua");
    expect(written).toContain("resources/scenes/main.json");
    expect(await be.readText("scripts/lua/main.lua")).toBe("-- mine\n");
    expect(parseGameJson(await be.readText("game.json")).windowWidth).toBe(320);
  });

  it("templatePlan: common 은 늘, 언어가 없는 파일은 두 언어 모두", () => {
    const lua = templatePlan(manifest, "empty", "lua");
    const ruby = templatePlan(manifest, "empty", "ruby");
    expect(lua.some((f) => f.path.endsWith(".rb"))).toBe(false);
    expect(ruby.some((f) => f.path.endsWith(".lua"))).toBe(false);
    for (const both of ["resources/fonts/hangul.fnt", "resources/templates/scene.json"]) {
      expect(lua.map((f) => f.path)).toContain(both);
      expect(ruby.map((f) => f.path)).toContain(both);
    }
    expect(templatePlan(manifest, "flappy", "lua").map((f) => f.to)).toContain("scripts/lua/components/flappy/pipes.lua");
  });
});
