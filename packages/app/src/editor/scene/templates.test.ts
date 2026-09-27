// 엔진에서 복사한 템플릿 사본의 검사 (docs/plans/e2-scene.md 마일스톤 6, e6-packaging.md 4.1 절과 마일스톤 3).
//   1. packages/app/templates/ 의 파일이 MANIFEST.json 의 sha256 과 같다 (사본이 손으로 바뀌지 않았다)
//   2. INITIAL2D_DIR 의 엔진 체크아웃과 같다. 체크아웃에 없어도 되는 것은 MANIFEST 가 generated 로 적은 생성물뿐이다
//   3. INITIAL2D_TEMPLATES_SRC(풀어 둔 템플릿 묶음)가 있으면 생성물까지 빠짐없이 같다
// 2 와 3 의 견주기는 scripts/lib/templateCompare.mjs: 추적하는 파일은 바이트로, 생성물 PNG 는 풀어 낸 픽셀로
// (Pillow 판마다 압축한 바이트가 다르다. 릴리스의 check 잡은 CI 의 Pillow 로 만든 묶음과 견준다).

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { TemplateFileEntry, TemplateManifest } from "./templateManifest";

const TEMPLATES_DIR = fileURLToPath(new URL("../../../templates/", import.meta.url));
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const compare = (await import(pathToFileURL(path.join(REPO, "scripts", "lib", "templateCompare.mjs")).href)) as {
  compareTemplateCopy(
    manifest: TemplateManifest,
    copyDir: string,
    otherDir: string,
    opts?: { allowMissing?: (entry: TemplateFileEntry) => boolean },
  ): { missing: string[]; differ: Array<{ path: string; by: string; detail: string }>; compared: { bytes: number; pixels: number } };
};
const manifest = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, "MANIFEST.json"), "utf8")) as TemplateManifest;
const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? path.join(TEMPLATES_DIR, "..", "..", "..", "..", "Initial2D"));
const engineHasLoader = fs.existsSync(path.join(engineDir, "scripts", "lua", "scene_loader.lua"));
const engineList = path.join(engineDir, "tools", "templates_list.txt");
const bundleDir = process.env.INITIAL2D_TEMPLATES_SRC ? path.resolve(process.env.INITIAL2D_TEMPLATES_SRC) : null;

/** 엔진이 만드는 그림 (tools/generate_placeholder_assets.py). git 이 추적하지 않는다 */
const GENERATED = ["resources/background_768x896.png", "resources/ground_768x64.png", "resources/bird_276x64.png", "resources/object_52x271.png"];

function sha256(file: string): string {
  return createHash("sha256").update(new Uint8Array(fs.readFileSync(file))).digest("hex");
}

describe("템플릿 사본 (packages/app/templates)", () => {
  it("MANIFEST 에 적힌 파일이 전부 있고 sha256 이 맞다", () => {
    expect(manifest.files.length).toBeGreaterThan(20);
    for (const f of manifest.files) {
      const file = path.join(TEMPLATES_DIR, f.path);
      expect(fs.existsSync(file), f.path).toBe(true);
      expect(sha256(file), f.path).toBe(f.sha256);
      expect(fs.statSync(file).size, f.path).toBe(f.size);
      if (f.kind === "text") expect(fs.readFileSync(file, "utf8"), f.path).not.toContain("\r");
    }
  });

  it("MANIFEST 는 출처와 다시 맞추는 명령과 엔진 커밋 40자를 적는다", () => {
    expect(["checkout", "release"]).toContain(manifest.source);
    expect(manifest.syncCommand).toMatch(/^yarn sync:templates( --from-zip .+)?$/);
    expect(manifest.engineCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.dirty, "엔진의 작업 트리가 커밋과 다를 때 복사한 사본이다. 엔진을 커밋한 뒤 다시 맞춘다").toBeUndefined();
  });

  it("생성물 표시는 플래피 그림 넷에만 있다", () => {
    for (const f of manifest.files) expect(typeof f.generated, f.path).toBe("boolean");
    expect(manifest.files.filter((f) => f.generated).map((f) => f.path)).toEqual(GENERATED);
  });

  it("빈 프로젝트, 플래피, 타일맵이 필요한 파일이 목록에 있다", () => {
    const paths = manifest.files.map((f) => f.to);
    for (const p of [
      "scripts/lua/main.lua",
      "scripts/ruby/main.rb",
      "scripts/lua/scene_loader.lua",
      "scripts/ruby/scene_loader.rb",
      "resources/scenes/main.json",
      "resources/scenes/flappy.json",
      "resources/fonts/hangul.fnt",
      "resources/maps/start.json",
      "resources/schema/map-objects.json",
      "resources/tiles/tileset16-8x13.png",
    ]) {
      expect(paths, p).toContain(p);
    }
    const byPath = new Map(manifest.files.map((f) => [f.path, f]));
    expect(byPath.get("resources/templates/tilemap/scene.json")).toMatchObject({ to: "resources/scenes/main.json", groups: ["tilemap"] });
    expect(byPath.get("resources/templates/tilemap/map.json")).toMatchObject({ to: "resources/maps/start.json", groups: ["tilemap"] });
    expect(byPath.get("resources/templates/tilemap/map-objects.json")).toMatchObject({ to: "resources/schema/map-objects.json", groups: ["tilemap"] });
    expect(byPath.get("resources/tiles/tileset16-8x13.png")).toMatchObject({ groups: ["tilemap"], kind: "binary" });
    for (const entry of ["resources/templates/main.lua", "resources/templates/main.rb"]) {
      expect(byPath.get(entry)?.groups, entry).toEqual(["empty", "flappy", "tilemap"]);
    }
    // 언어별 파일은 언어가 적혀 있다
    for (const f of manifest.files) {
      if (f.path.endsWith(".lua")) expect(f.language, f.path).toBe("lua");
      if (f.path.endsWith(".rb")) expect(f.language, f.path).toBe("ruby");
    }
  });

  it.skipIf(!engineHasLoader)("엔진 저장소(INITIAL2D_DIR)의 원본과 같다 (없어도 되는 것은 생성물뿐, 생성물은 픽셀로)", () => {
    const r = compare.compareTemplateCopy(manifest, TEMPLATES_DIR, engineDir, { allowMissing: (f) => f.generated });
    expect(r.missing, `엔진 체크아웃에 없다 (INITIAL2D_DIR=${engineDir})`).toEqual([]);
    expect(r.differ, `엔진과 다른 사본이 있다. INITIAL2D_DIR=${engineDir} yarn sync:templates 로 다시 복사한다`).toEqual([]);
  });

  it.skipIf(!fs.existsSync(engineList))("엔진의 tools/templates_list.txt 와 복사 목록이 같다", () => {
    const listed = fs
      .readFileSync(engineList, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    expect([...listed].sort()).toEqual(manifest.files.map((f) => f.path).sort());
  });

  it.skipIf(!bundleDir)("템플릿 묶음(INITIAL2D_TEMPLATES_SRC)과 생성물까지 빠짐없이 같다 (생성물은 픽셀로)", () => {
    const dir = bundleDir!;
    const r = compare.compareTemplateCopy(manifest, TEMPLATES_DIR, dir);
    expect(r.missing, `묶음에 없다: ${dir}`).toEqual([]);
    expect(r.differ, "묶음과 다른 사본이 있다. yarn sync:templates --from-zip 으로 다시 맞춘다").toEqual([]);
    expect(r.compared).toEqual({ bytes: manifest.files.length - GENERATED.length, pixels: GENERATED.length });
    // 묶음의 MANIFEST(tools/pack_templates.py)가 있으면 생성물 표시도 같다
    const bundleManifest = path.join(dir, "MANIFEST.json");
    if (fs.existsSync(bundleManifest)) {
      const bundle = JSON.parse(fs.readFileSync(bundleManifest, "utf8")) as { files: Array<{ path: string; generated?: boolean }> };
      const flags = new Map(bundle.files.map((f) => [f.path, f.generated === true]));
      for (const f of manifest.files) expect(flags.get(f.path), f.path).toBe(f.generated);
    }
  });
});
