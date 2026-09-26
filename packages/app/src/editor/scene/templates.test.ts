// 엔진에서 복사한 템플릿 사본의 검사 (docs/plans/e2-scene.md 마일스톤 6, 03-project-and-runtime.md 6절의 sha 비교).
//   1. packages/app/templates/ 의 파일이 MANIFEST.json 의 sha256 과 같다 (사본이 손으로 바뀌지 않았다)
//   2. INITIAL2D_DIR 이 R1 이 든 엔진 저장소를 가리키면 엔진 쪽 파일과도 같다 (어긋나면 yarn sync:templates)
//      엔진 저장소에 그 파일이 없으면 그 검사는 건너뛴다.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TemplateManifest } from "./templateManifest";

const TEMPLATES_DIR = fileURLToPath(new URL("../../../templates/", import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, "MANIFEST.json"), "utf8")) as TemplateManifest;
const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? path.join(TEMPLATES_DIR, "..", "..", "..", "..", "Initial2D"));
const engineHasLoader = fs.existsSync(path.join(engineDir, "scripts", "lua", "scene_loader.lua"));

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

  it("빈 프로젝트와 플래피가 필요한 파일이 목록에 있다", () => {
    const paths = manifest.files.map((f) => f.to);
    for (const p of ["scripts/lua/main.lua", "scripts/ruby/main.rb", "scripts/lua/scene_loader.lua", "scripts/ruby/scene_loader.rb", "resources/scenes/main.json", "resources/scenes/flappy.json", "resources/fonts/hangul.fnt"]) {
      expect(paths, p).toContain(p);
    }
    // 언어별 파일은 언어가 적혀 있다
    for (const f of manifest.files) {
      if (f.path.endsWith(".lua")) expect(f.language, f.path).toBe("lua");
      if (f.path.endsWith(".rb")) expect(f.language, f.path).toBe("ruby");
    }
  });

  it.skipIf(!engineHasLoader)("엔진 저장소(INITIAL2D_DIR)의 원본과 같다", () => {
    const stale: string[] = [];
    for (const f of manifest.files) {
      const original = path.join(engineDir, f.path);
      if (!fs.existsSync(original)) continue; // 선택 파일 (API 명세) 이 없는 트리
      if (sha256(original) !== f.sha256) stale.push(f.path);
    }
    expect(stale, `엔진과 다른 사본이 있다. INITIAL2D_DIR=${engineDir} yarn sync:templates 로 다시 복사한다`).toEqual([]);
  });
});
