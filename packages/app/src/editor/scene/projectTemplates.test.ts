import { CORE_OBJECT_TYPES, parseGameJson, parseScene, validateScene } from "@initial-editor/core";
import { MemoryBackend } from "@initial-editor/core/testing";
import { TILEMAP_TYPE, validateTilemapObjects } from "@initial-editor/ext-tilemap";
import { checkEngineMap, parseMap, parseObjectSchema, projectPathOf, SCHEMA_PATH, serializeMap } from "@initial-editor/ext-tilemap/model";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GITIGNORE_PATH, GITIGNORE_TEXT, writeProjectTemplate, type ProjectTemplateOptions } from "./projectTemplates";
import type { TemplateSource } from "./templateFiles";
import { TEMPLATE_LABELS, TEMPLATE_START_SCENE, templatePlan, type ProjectTemplateId, type TemplateManifest } from "./templateManifest";

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
    // .gitignore: 편집 상태와 엔진이 실행할 때 쓰는 config.setting
    expect(await be.readText(GITIGNORE_PATH)).toBe(GITIGNORE_TEXT);
    expect(GITIGNORE_TEXT.split("\n").filter((l) => l && !l.startsWith("#"))).toEqual([".initial-editor/", "config.setting"]);
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

  for (const language of ["lua", "mruby"] as const) {
    it(`타일맵 (${language}): 맵 한 장과 타일셋과 그 맵을 여는 씬과 스키마, startScene 은 main`, async () => {
      const { be, written } = await make({ template: "tilemap", language, name: "tiles" });
      const dir = language === "lua" ? "lua" : "ruby";
      const ext = language === "lua" ? "lua" : "rb";
      for (const p of [
        `scripts/${dir}/main.${ext}`,
        `scripts/${dir}/scene_loader.${ext}`,
        `scripts/${dir}/scene_types/tilemap.${ext}`,
        "resources/scenes/main.json",
        "resources/maps/start.json",
        SCHEMA_PATH,
        "resources/tiles/tileset16-8x13.png",
        "resources/fonts/hangul.fnt",
        GITIGNORE_PATH,
      ]) {
        expect(written, p).toContain(p);
      }
      // 다른 언어와 다른 템플릿의 것은 없다
      expect(await be.exists(language === "lua" ? "scripts/ruby/main.rb" : "scripts/lua/main.lua")).toBe(false);
      expect(await be.exists("resources/scenes/flappy.json")).toBe(false);
      expect(await be.exists("resources/bird_276x64.png")).toBe(false);
      const game = parseGameJson(await be.readText("game.json"));
      expect(game).toMatchObject({ name: "tiles", script: language, startScene: "main", windowWidth: 768, windowHeight: 896 });
      // 씬은 타일맵 오브젝트 하나이고 그 맵이 프로젝트 안에 있다
      const scene = parseScene(await be.readText("resources/scenes/main.json"));
      expect(scene.name).toBe("main");
      // 타일맵 타입은 확장이 등록한다 (앱과 같은 타입 목록으로 검사)
      expect(validateScene(scene, new Set([...CORE_OBJECT_TYPES, TILEMAP_TYPE]))).toEqual([]);
      expect(validateTilemapObjects(scene)).toEqual([]);
      expect(scene.objects.map((o) => o.type)).toEqual([TILEMAP_TYPE]);
      const mapPath = scene.objects[0].props.map as string;
      expect(mapPath).toBe("resources/maps/start.json");
      // 맵은 엔진이 여는 모양이고 에디터의 맵 모델이 바이트 그대로 다시 쓴다. 타일셋 그림도 프로젝트 안에 있다
      const mapText = await be.readText(mapPath);
      const check = checkEngineMap(mapText);
      expect(check).toEqual({ ok: true, images: ["resources/tiles/tileset16-8x13.png"], width: 48, height: 56 });
      const map = parseMap(mapText);
      expect(serializeMap(map)).toBe(mapText);
      expect(map).toMatchObject({ width: 48, height: 56, tileWidth: 16, tileHeight: 16 });
      expect(map.width * map.tileWidth).toBe(game.windowWidth);
      expect(map.height * map.tileHeight).toBe(game.windowHeight);
      for (const t of map.tilesets) expect(await be.exists(projectPathOf(t.image)), t.image).toBe(true);
      // 스키마는 에디터가 읽는다
      expect(parseObjectSchema(await be.readText(SCHEMA_PATH)).types.map((t) => t.type)).toEqual(["marker"]);
      // 바이너리는 바이트가 같다
      const tiles = await be.readBinary("resources/tiles/tileset16-8x13.png");
      expect(tiles.byteLength).toBe(manifest.files.find((f) => f.path === "resources/tiles/tileset16-8x13.png")!.size);
    });
  }

  it("템플릿마다 라벨과 시작 씬이 있고, 한 템플릿 안에서 새 프로젝트 경로가 겹치지 않는다", () => {
    const ids = Object.keys(TEMPLATE_LABELS) as ProjectTemplateId[];
    expect(ids).toEqual(["empty", "flappy", "tilemap"]);
    expect(TEMPLATE_LABELS.tilemap).toBe("타일맵");
    expect(TEMPLATE_START_SCENE).toEqual({ empty: "main", flappy: "flappy", tilemap: "main" });
    for (const id of ids) {
      for (const language of ["lua", "ruby"] as const) {
        const tos = templatePlan(manifest, id, language).map((f) => f.to);
        expect(new Set(tos).size, `${id}/${language}`).toBe(tos.length);
        // 시작 씬 파일이 그 템플릿에 든다
        expect(tos, `${id}/${language}`).toContain(`resources/scenes/${TEMPLATE_START_SCENE[id]}.json`);
      }
    }
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
