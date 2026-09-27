// 웹 엔진 사본(packages/app/public/engine, yarn sync:engine-web)의 검사.
//   1. MANIFEST.json 에 적힌 파일이 전부 있고 sha256 과 크기가 맞다 (사본이 손으로 바뀌지 않았다)
//   2. 기능 목록이 wasm 과 맞고(mruby), 로더가 에디터가 기대는 export(bootInitial2D)를 가진다
//   3. 엔진 저장소(INITIAL2D_DIR, 기본 ../Initial2D)가 MANIFEST 의 엔진 커밋에 있고 build-web/site/ 가 있으면 그쪽과도
//      같다 (어긋나면 yarn sync:engine-web). 저장소가 다른 커밋이거나 빌드가 없으면 그 까닭을 이름에 적고 건너뛴다

import { execFileSync } from "node:child_process";
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

/** 엔진 저장소의 HEAD 커밋. git 저장소가 아니면 null */
function engineHead(repo: string): string | null {
  try {
    return execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** build-web/site 와 견줄 수 없는 까닭. 견줄 수 있으면 null */
function siteSkipReason(): string | null {
  if (!fs.existsSync(path.join(siteDir, "Initial2D.wasm"))) return `${siteDir} 에 웹 빌드가 없다`;
  const head = engineHead(engineRepo);
  if (!head) return `${engineRepo} 의 git HEAD 를 읽지 못했다`;
  if (head !== manifest.engineCommit) return `${engineRepo} 는 ${head.slice(0, 7)} 이고 MANIFEST 는 ${manifest.engineCommit?.slice(0, 7)} 이다`;
  return null;
}

const skipSite = siteSkipReason();
// 보고서(verbose)는 건너뛴 테스트를 적지 않으므로 까닭을 한 줄 남긴다
if (skipSite) console.info(`build-web/site 대조를 건너뛴다: ${skipSite}`);

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

  it.skipIf(skipSite !== null)(`엔진 저장소의 build-web/site 와 같다 (다르면 yarn sync:engine-web)${skipSite ? `. 건너뜀: ${skipSite}` : ""}`, () => {
    for (const f of manifest.files) {
      expect(sha256(path.join(siteDir, f.path)), f.path).toBe(f.sha256);
    }
  });
});
