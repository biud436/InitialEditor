// 웹 엔진 사본(packages/app/public/engine, yarn sync:engine-web)의 검사.
//   1. MANIFEST.json 에 적힌 파일이 전부 있고 sha256 과 크기가 맞다 (사본이 손으로 바뀌지 않았다)
//   2. 기능 목록이 wasm 과 맞고(mruby), 로더가 에디터가 기대는 export(bootInitial2D)를 가진다
//   3. INITIAL2D_DIR 의 build-web/site/ 가 있으면 그쪽과도 같다 (어긋나면 yarn sync:engine-web). 없으면 건너뛴다

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EngineManifest } from "./engineAssets";

const ENGINE_DIR = fileURLToPath(new URL("../../../public/engine/", import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(ENGINE_DIR, "MANIFEST.json"), "utf8")) as EngineManifest;
const engineRepo = path.resolve(process.env.INITIAL2D_DIR ?? path.join(ENGINE_DIR, "..", "..", "..", "..", "..", "Initial2D"));
const siteDir = path.join(engineRepo, "build-web", "site");

function sha256(file: string): string {
  return createHash("sha256").update(new Uint8Array(fs.readFileSync(file))).digest("hex");
}

describe("웹 엔진 사본 (packages/app/public/engine)", () => {
  it("MANIFEST 의 파일이 전부 있고 sha256 과 크기가 맞다", () => {
    expect(manifest.files.map((f) => f.path).sort()).toEqual(["Initial2D.js", "Initial2D.wasm", "initial2d-loader.js"]);
    for (const f of manifest.files) {
      const file = path.join(ENGINE_DIR, f.path);
      expect(fs.existsSync(file), f.path).toBe(true);
      expect(fs.statSync(file).size, f.path).toBe(f.size);
      expect(sha256(file), f.path).toBe(f.sha256);
    }
    // 폴더에 목록 밖의 파일이 없다
    expect(fs.readdirSync(ENGINE_DIR).sort()).toEqual(["Initial2D.js", "Initial2D.wasm", "MANIFEST.json", "initial2d-loader.js"]);
  });

  it("기능 목록에 lua 와 wasm 이 있고 엔진 커밋이 적혀 있다", () => {
    expect(manifest.features).toContain("lua");
    expect(manifest.features).toContain("wasm");
    expect(manifest.engineCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("기능의 mruby 는 wasm 에 libmruby 가 링크되었는지와 맞다 (sync 가 mruby 코어의 MRUBY_COPYRIGHT 로 정한다)", () => {
    const wasm = fs.readFileSync(path.join(ENGINE_DIR, "Initial2D.wasm"));
    expect(manifest.features.includes("mruby")).toBe(wasm.includes("mruby - Copyright"));
  });

  it("로더가 bootInitial2D 를 내보내고 팩토리는 createInitial2D 다", () => {
    const loader = fs.readFileSync(path.join(ENGINE_DIR, "initial2d-loader.js"), "utf8");
    expect(loader).toMatch(/export async function bootInitial2D\(/);
    const factory = fs.readFileSync(path.join(ENGINE_DIR, "Initial2D.js"), "utf8");
    expect(factory).toContain("createInitial2D");
    const wasm = fs.readFileSync(path.join(ENGINE_DIR, "Initial2D.wasm"));
    expect([...wasm.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]); // "\0asm"
  });

  it.skipIf(!fs.existsSync(path.join(siteDir, "Initial2D.wasm")))("엔진 저장소의 build-web/site 와 같다 (다르면 yarn sync:engine-web)", () => {
    for (const f of manifest.files) {
      expect(sha256(path.join(siteDir, f.path)), f.path).toBe(f.sha256);
    }
  });
});
