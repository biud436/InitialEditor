// 픽스처 사본 (yarn sync:rpg) 이 MANIFEST 와 같은지, 엔진 저장소가 있으면 엔진의 파일과도 같은지 본다
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE, FIXTURES, HAS_ENGINE } from "./fixtures";

interface Manifest {
  source: string;
  syncCommand: string;
  engineCommit: string;
  dirty?: boolean;
  files: Array<{ path: string; size: number; sha256: string }>;
}

const manifest = JSON.parse(readFileSync(path.join(FIXTURES, "MANIFEST.json"), "utf8")) as Manifest;
const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

describe("ext-rpg 픽스처", () => {
  it("MANIFEST 모양: 체크아웃에서 온 사본, 동기화 명령, 40자 커밋", () => {
    expect(manifest.source).toBe("checkout");
    expect(manifest.syncCommand).toBe("yarn sync:rpg");
    expect(manifest.engineCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.dirty).toBeUndefined();
  });

  it("폴더의 파일이 MANIFEST 와 같다 (빠진 것도 남는 것도 없다)", () => {
    const listed = manifest.files.map((f) => f.path).sort();
    expect(listFiles(FIXTURES).filter((f) => f !== "MANIFEST.json").sort()).toEqual(listed);
    for (const f of manifest.files) {
      const data = readFileSync(path.join(FIXTURES, f.path));
      expect({ path: f.path, size: data.length, sha256: sha(data) }).toEqual(f);
    }
  });

  it("RTP 소재는 없다 (라이선스)", () => {
    expect(manifest.files.filter((f) => f.path.includes("/rtp/") || f.path.startsWith("resources/rtp"))).toEqual([]);
  });

  it.skipIf(!HAS_ENGINE)("엔진 저장소의 파일과 같다 (다르면 yarn sync:rpg 로 다시 맞춘다)", () => {
    const stale = manifest.files.filter((f) => {
      const src = path.join(ENGINE, f.path);
      return !existsSync(src) || sha(readFileSync(src)) !== f.sha256;
    });
    expect(stale.map((f) => f.path)).toEqual([]);
  });
});
