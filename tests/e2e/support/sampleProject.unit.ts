// 샘플 프로젝트(packages/app/src/editor/sampleProject.ts)의 게임을 네이티브 엔진으로 돌려 본다 (헤드리스, 유한 실행).
// 진입 파일(Lua, Ruby)이 초원 맵(meadow.json)을 화면 가운데에 그리는지 픽셀로 보고, 맵 파일의 한 칸을 모래로 바꾸면
// 화면의 그 칸만 모래 타일이 되는지 본다 (맵 뷰에서 칠하고 저장한 것과 같은 파일 변화).
// 엔진 실행 파일(INITIAL2D_DIR, 기본 ../Initial2D 의 build/Initial2D)이 없으면 까닭을 적고 건너뛴다.
// Ruby 판은 엔진의 --features 에 mruby 가 있을 때만 돈다.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SAMPLE_MAP_PATH, sampleProjectFiles } from "../../../packages/app/src/editor/sampleProject";
import { readBmp, type BmpImage } from "./bmp";
import { engineLayout, errorLines, missingFiles, probeFeatures, runEngine, type ScriptLanguage } from "./engine";

const engine = engineLayout(path.resolve(process.env.INITIAL2D_DIR ?? "../Initial2D"));
const missing = missingFiles([engine.exe]);
const features = missing.length === 0 ? probeFeatures(engine.exe) : new Set<string>();
const skipReason = missing.length > 0 ? `엔진 실행 파일이 없다: ${missing.join(", ")}` : null;
if (skipReason) console.info(`샘플 프로젝트의 네이티브 실행을 건너뛴다: ${skipReason}`);

interface MapJson {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  layers: Array<{ name: string; data: number[] }>;
  tilesets: Array<{ image: string; firstGid: number; columns: number }>;
}

/** 타일셋 PNG(8비트 RGBA, 필터 0)를 RGBA 로 푼다 */
function decodePng(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const buf = Buffer.from(bytes);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([data[8], data[9]], "8비트 RGBA").toEqual([8, 6]);
    } else if (type === "IDAT") idat.push(data);
    offset += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (stride + 1)], "필터 0").toBe(0);
    rgba.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  }
  return { width, height, rgba };
}

interface Expected {
  map: MapJson;
  tiles: ReturnType<typeof decodePng>;
  /** 맵 왼쪽 위의 화면 자리 */
  originX: number;
  originY: number;
}

/** 화면 (sx, sy) 의 기대 색: 맵 칸의 맨 위 레이어 타일의 그 픽셀 (타일은 모두 불투명하다) */
function expectedColor(e: Expected, sx: number, sy: number): [number, number, number] {
  const { map, tiles } = e;
  const wx = sx - e.originX;
  const wy = sy - e.originY;
  const cx = Math.floor(wx / map.tileWidth);
  const cy = Math.floor(wy / map.tileHeight);
  let gid = 0;
  for (const layer of map.layers) {
    const g = layer.data[cy * map.width + cx];
    if (g > 0) gid = g;
  }
  const local = gid - map.tilesets[0].firstGid;
  const tx = (local % map.tilesets[0].columns) * map.tileWidth + (wx % map.tileWidth);
  const ty = Math.floor(local / map.tilesets[0].columns) * map.tileHeight + (wy % map.tileHeight);
  const o = (ty * tiles.width + tx) * 4;
  return [tiles.rgba[o], tiles.rgba[o + 1], tiles.rgba[o + 2]];
}

/** 맵 칸 (cx, cy) 안의 픽셀 가운데 기대 색과 채널이 2 넘게 다른 수 */
function cellMismatches(img: BmpImage, e: Expected, cx: number, cy: number): number {
  let n = 0;
  for (let y = 0; y < e.map.tileHeight; y++) {
    for (let x = 0; x < e.map.tileWidth; x++) {
      const sx = e.originX + cx * e.map.tileWidth + x;
      const sy = e.originY + cy * e.map.tileHeight + y;
      const p = img.pixel(sx, sy);
      const [r, g, b] = expectedColor(e, sx, sy);
      if (Math.abs(p.r - r) > 2 || Math.abs(p.g - g) > 2 || Math.abs(p.b - b) > 2) n++;
    }
  }
  return n;
}

let root = "";

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "initial-editor-sample-"));
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

/** 샘플 프로젝트를 폴더에 쓴다. map 을 주면 meadow.json 을 그것으로 바꾼다 */
function writeSample(dir: string, script: ScriptLanguage, map?: MapJson): void {
  const files = sampleProjectFiles();
  const game = JSON.parse(files["game.json"] as string) as Record<string, unknown>;
  files["game.json"] = JSON.stringify({ ...game, script }, null, 2) + "\n";
  if (map) files[SAMPLE_MAP_PATH] = JSON.stringify(map, null, 2) + "\n";
  for (const [rel, data] of Object.entries(files)) {
    const file = path.join(dir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, data);
  }
}

async function runSample(name: string, script: ScriptLanguage, map?: MapJson) {
  const dir = path.join(root, name);
  const shots = path.join(root, `${name}-shots`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(shots, { recursive: true });
  writeSample(dir, script, map);
  const run = await runEngine({ exe: engine.exe, cwd: dir, script, playEnv: {}, exitAfter: 12, shot: { dir: shots, prefix: "sample", frame: 6 }, timeoutMs: 30_000 });
  expect(run.timedOut, run.log).toBe(false);
  expect(run.code, run.log).toBe(0);
  expect(errorLines(run.log), run.log).toEqual([]);
  expect(run.log).toContain("샘플 프로젝트 시작");
  expect(run.log).toContain("sample:frame");
  expect(run.log).toContain("sample:map layers=2");
  return readBmp(readFileSync(run.shot!));
}

const files = sampleProjectFiles();
const baseMap = JSON.parse(files[SAMPLE_MAP_PATH] as string) as MapJson;
const tiles = decodePng(files[baseMap.tilesets[0].image] as Uint8Array);
/** 모래 한 칸을 둘 자리: 바닥은 풀(gid 1)이고 장식이 없는 칸 */
const PAINT = { x: 4, y: 5, gid: 5 };

describe.skipIf(skipReason !== null)(`샘플 프로젝트를 네이티브 엔진으로${skipReason ? ` (건너뜀: ${skipReason})` : ""}`, () => {
  for (const script of ["lua", "mruby"] as const) {
    it.skipIf(script === "mruby" && !features.has("mruby"))(`${script}: 맵을 화면 가운데에 그리고, 맵 파일의 한 칸을 바꾸면 화면의 그 칸만 바뀐다`, async () => {
      const img = await runSample(`${script}-base`, script);
      const pxW = baseMap.width * baseMap.tileWidth;
      const pxH = baseMap.height * baseMap.tileHeight;
      const e: Expected = { map: baseMap, tiles, originX: Math.floor((img.width - pxW) / 2), originY: Math.floor((img.height - pxH) / 2) };
      expect(e.originX).toBeGreaterThan(0);
      expect(e.originY).toBeGreaterThan(0);

      // 맵의 모든 칸이 타일셋 그대로다
      let mismatched = 0;
      for (let cy = 0; cy < baseMap.height; cy++) for (let cx = 0; cx < baseMap.width; cx++) mismatched += cellMismatches(img, e, cx, cy);
      expect(mismatched).toBe(0);
      // 맵 밖은 한 색(배경)이고 맵 안의 색이 아니다
      const bg = img.pixel(0, 0);
      for (const [x, y] of [[img.width - 1, 0], [0, img.height - 1], [e.originX - 1, e.originY + 8], [e.originX + pxW, e.originY + 8], [e.originX + 8, e.originY - 1], [e.originX + 8, e.originY + pxH]]) {
        expect(img.pixel(x, y), `${x}, ${y}`).toEqual(bg);
      }
      expect(img.pixel(e.originX + 8, e.originY + 8)).not.toEqual(bg);

      // 칠하기: 바닥 레이어의 한 칸을 모래로
      const at = PAINT.y * baseMap.width + PAINT.x;
      expect(baseMap.layers.map((l) => l.data[at])).toEqual([1, 0]);
      const painted: MapJson = { ...baseMap, layers: baseMap.layers.map((l, i) => (i === 0 ? { ...l, data: l.data.map((g, j) => (j === at ? PAINT.gid : g)) } : l)) };
      const after = await runSample(`${script}-painted`, script, painted);
      const ep: Expected = { ...e, map: painted };
      expect(cellMismatches(after, ep, PAINT.x, PAINT.y)).toBe(0);
      // 그 칸은 전과 다르고, 이웃 칸은 전과 같다
      expect(cellMismatches(after, e, PAINT.x, PAINT.y)).toBeGreaterThan(200);
      for (const [cx, cy] of [[PAINT.x - 1, PAINT.y], [PAINT.x + 1, PAINT.y], [PAINT.x, PAINT.y - 1], [PAINT.x, PAINT.y + 1]]) {
        expect(cellMismatches(after, e, cx, cy), `${cx}, ${cy}`).toBe(0);
      }
    });
  }
});
