// scripts/lib/templateCompare.mjs: 템플릿 사본을 엔진 체크아웃이나 템플릿 묶음과 견준다 (templates.test.ts 와 릴리스의 check 잡).
// 추적하는 파일은 바이트로, 생성물 PNG 는 풀어 낸 픽셀로 견주는지를 가짜 사본과 가짜 묶음으로 본다.

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
interface Entry {
  path: string;
  sha256: string;
  generated: boolean;
}
type Result = { missing: string[]; differ: Array<{ path: string; by: string; detail: string }>; compared: { bytes: number; pixels: number } };
const compare = (await import(pathToFileURL(path.join(REPO, "scripts", "lib", "templateCompare.mjs")).href)) as {
  compareTemplateCopy(manifest: { files: Entry[] }, copyDir: string, otherDir: string, opts?: { allowMissing?: (e: Entry) => boolean }): Result;
  comparesByPixels(e: Entry): boolean;
};
const png = (await import(pathToFileURL(path.join(REPO, "scripts", "lib", "png.mjs")).href)) as {
  encodePng(width: number, height: number, rgba: Uint8Array, opts?: { filter?: number }): Buffer;
};

let tmp = "";
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "template-compare-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function write(dir: string, rel: string, data: Buffer) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), data);
}

const W = 6;
const H = 5;
function pixels(change?: { x: number; y: number }): Uint8Array {
  const rgba = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) rgba.set([i * 9, 255 - i * 5, 60, i % 4 === 0 ? 128 : 255], i * 4);
  if (change) rgba[(change.y * W + change.x) * 4] ^= 0x10;
  return rgba;
}

/** 같은 픽셀을 다른 바이트로: 필터와 압축 수준이 다른 PNG (Pillow 판이 다를 때와 같은 모양) */
function samePixelsOtherBytes(rgba: Uint8Array): Buffer {
  const a = png.encodePng(W, H, rgba, { filter: 0 });
  const b = png.encodePng(W, H, rgba, { filter: 2 });
  expect(Buffer.compare(a, b)).not.toBe(0);
  return b;
}

/** 사본: 추적하는 글 파일 하나, 추적하는 PNG 하나(타일셋), 생성물 PNG 하나(플래피 그림) */
function copy() {
  const dir = path.join(tmp, "copy");
  const text = Buffer.from("-- scene loader\n");
  const tileset = png.encodePng(W, H, pixels(), { filter: 0 });
  const generated = png.encodePng(W, H, pixels(), { filter: 0 });
  write(dir, "scripts/lua/scene_loader.lua", text);
  write(dir, "resources/tiles/tileset.png", tileset);
  write(dir, "resources/background.png", generated);
  const manifest = {
    files: [
      { path: "scripts/lua/scene_loader.lua", sha256: sha(text), generated: false },
      { path: "resources/tiles/tileset.png", sha256: sha(tileset), generated: false },
      { path: "resources/background.png", sha256: sha(generated), generated: true },
    ],
  };
  return { dir, manifest, text, tileset, generated };
}

describe("템플릿 사본 견주기 (templateCompare.mjs)", () => {
  it("생성물 PNG 만 픽셀로 견준다", () => {
    expect(compare.comparesByPixels({ path: "resources/bird.png", sha256: "", generated: true })).toBe(true);
    expect(compare.comparesByPixels({ path: "resources/tiles/t.PNG", sha256: "", generated: false })).toBe(false);
    expect(compare.comparesByPixels({ path: "resources/sound.ogg", sha256: "", generated: true })).toBe(false);
  });

  it("생성물은 바이트가 달라도 픽셀이 같으면 같다 (CI 의 다른 Pillow)", () => {
    const c = copy();
    const bundle = path.join(tmp, "bundle");
    write(bundle, "scripts/lua/scene_loader.lua", c.text);
    write(bundle, "resources/tiles/tileset.png", c.tileset);
    write(bundle, "resources/background.png", samePixelsOtherBytes(pixels()));
    expect(compare.compareTemplateCopy(c.manifest, c.dir, bundle)).toEqual({ missing: [], differ: [], compared: { bytes: 2, pixels: 1 } });
  });

  it("생성물의 픽셀 하나가 다르거나 PNG 가 아니면 다르다", () => {
    const c = copy();
    const bundle = path.join(tmp, "bundle");
    write(bundle, "scripts/lua/scene_loader.lua", c.text);
    write(bundle, "resources/tiles/tileset.png", c.tileset);
    write(bundle, "resources/background.png", png.encodePng(W, H, pixels({ x: 4, y: 3 })));
    const r = compare.compareTemplateCopy(c.manifest, c.dir, bundle);
    expect(r.differ).toEqual([{ path: "resources/background.png", by: "pixels", detail: expect.stringContaining("1개 픽셀이 다르다 (처음 (4, 3)") }]);
    write(bundle, "resources/background.png", Buffer.from("not png"));
    expect(compare.compareTemplateCopy(c.manifest, c.dir, bundle).differ).toEqual([{ path: "resources/background.png", by: "pixels", detail: expect.stringContaining("PNG 를 읽지 못했다") }]);
  });

  it("추적하는 파일은 바이트로 견준다: 픽셀이 같은 PNG 라도 바이트가 다르면 다르다", () => {
    const c = copy();
    const bundle = path.join(tmp, "bundle");
    write(bundle, "scripts/lua/scene_loader.lua", Buffer.from("-- scene loader\r\n"));
    write(bundle, "resources/tiles/tileset.png", samePixelsOtherBytes(pixels()));
    write(bundle, "resources/background.png", c.generated);
    const r = compare.compareTemplateCopy(c.manifest, c.dir, bundle);
    expect(r.differ.map((d) => [d.path, d.by])).toEqual([
      ["scripts/lua/scene_loader.lua", "bytes"],
      ["resources/tiles/tileset.png", "bytes"],
    ]);
    expect(r.compared).toEqual({ bytes: 2, pixels: 1 });
  });

  it("없는 파일: 묶음은 빠짐없이, 체크아웃은 allowMissing 이 허락한 것(생성물)만 없어도 된다", () => {
    const c = copy();
    const checkout = path.join(tmp, "checkout");
    write(checkout, "scripts/lua/scene_loader.lua", c.text);
    expect(compare.compareTemplateCopy(c.manifest, c.dir, checkout).missing).toEqual(["resources/tiles/tileset.png", "resources/background.png"]);
    const r = compare.compareTemplateCopy(c.manifest, c.dir, checkout, { allowMissing: (e) => e.generated });
    expect(r.missing).toEqual(["resources/tiles/tileset.png"]);
    expect(r.compared).toEqual({ bytes: 1, pixels: 0 });
  });

  it("이 저장소의 생성물 사본 넷은 픽셀로 견주어지는 PNG 다", () => {
    // 다른 Pillow 로 만든 묶음과의 진짜 대조는 templates.test.ts 가 INITIAL2D_TEMPLATES_SRC 로 한다 (릴리스의 check 잡)
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO, "packages/app/templates/MANIFEST.json"), "utf8")) as { files: Entry[] };
    const generated = manifest.files.filter((f) => f.generated);
    expect(generated.length).toBe(4);
    const self = compare.compareTemplateCopy({ files: generated }, path.join(REPO, "packages/app/templates"), path.join(REPO, "packages/app/templates"));
    expect(self).toEqual({ missing: [], differ: [], compared: { bytes: 0, pixels: 4 } });
  });
});
