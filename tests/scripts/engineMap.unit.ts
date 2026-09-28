// scripts/lib/mapChecks.mjs 와 frameChecks.mjs 의 paintedCellsCheck, cropImage: 맵 편집의 엔진 교차 검사(yarn test:engine-map)의 판정.
// 가짜 엔진 출력과 가짜 화면으로, 맞는 답은 통과하고 틀린 답(다른 칸, 고치기 전 맵, 빠진 레이어와 칸)은 떨어지는지 본다.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const load = async <T>(rel: string) => (await import(pathToFileURL(path.join(REPO, rel)).href)) as T;

type Check = { name: string; ok: boolean; detail: string };
interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
}
interface Img {
  width: number;
  height: number;
  pixel(x: number, y: number): Pixel;
}
interface RgbaImg extends Img {
  rgba: Uint8Array;
}
type Rect = { x: number; y: number; width: number; height: number };
interface TestMap {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tilesets: Array<{ image: string; firstGid: number; columns: number }>;
  layers: Array<{ name: string; data: number[] }>;
}

const checks = await load<{
  parseCollisionProbe(log: string): { width: number | null; height: number | null; rows: Map<number, string>; done: boolean };
  probeCells(probe: unknown, width: number, height: number): number[] | null;
  collisionChecks(o: { log: string; width: number; height: number; saved: number[] | null; model: number[] | null; original: number[] | null }): Check[];
  jsonDiff(a: unknown, b: unknown, limit?: number): string[];
  lineDiff(a: string, b: string): number[];
  runnerSummary(out: string): { passed: string[]; failed: string[]; total: { pass: number; fail: number } | null; golden: string[] };
  frameDiff(a: Img, b: Img): { sizeMismatch: boolean; count: number | null; box: { x0: number; y0: number; x1: number; y1: number } | null };
}>("scripts/lib/mapChecks.mjs");

const frame = await load<{
  rgbaImage(width: number, height: number, rgba: Uint8Array): RgbaImg;
  renderMapRect(map: TestMap, images: Map<string, { width: number; height: number; rgba: Uint8Array }>, rect: Rect, opts?: { skipLayer?: number }): RgbaImg;
  paintedCellsCheck(o: { map: TestMap; images: Map<string, { width: number; height: number; rgba: Uint8Array }>; rect: Rect; frame: Img; cells: Array<{ layer: number; x: number; y: number; before: number }> }): Check;
  referenceChecks(o: { map: TestMap; images: Map<string, { width: number; height: number; rgba: Uint8Array }>; rect: Rect; frame: Img }): Check[];
  cropImage(img: Img, x: number, y: number, width: number, height: number): Img;
}>("scripts/lib/frameChecks.mjs");

// ---- 통행 ----

describe("통행 탐침 (collisionChecks)", () => {
  const W = 6;
  const H = 4;
  /** 둘레가 막힘인 원본 */
  const original: number[] = Array.from({ length: W * H }, (_, i) => (i % W === 0 || i % W === W - 1 || i < W || i >= W * (H - 1) ? 1 : 0));
  /** 고친 것: (2, 1) 과 (3, 2) 를 막고 (0, 1) 을 푼다. 막힘 값은 0 이 아니면 무엇이든 (엔진의 IsPassable 과 같다) */
  const saved = original.slice();
  saved[1 * W + 2] = 1;
  saved[2 * W + 3] = 2;
  saved[1 * W + 0] = 0;

  /** 엔진이 cells 로 답한 탐침 출력 (다른 줄이 섞여 있다) */
  function probeLog(cells: number[], opts: { dropRow?: number; noDone?: boolean; size?: [number, number] } = {}) {
    const [w, h] = opts.size ?? [W, H];
    const out = ["Initial2D: 시작", `collisionProbe:size ${w} ${h}`];
    for (let y = 0; y < H; y++) {
      if (y === opts.dropRow) continue;
      out.push(`collisionProbe:row ${y} ${cells.slice(y * W, (y + 1) * W).map((v) => (v ? "1" : "0")).join("")}`);
    }
    if (!opts.noDone) out.push("collisionProbe:done");
    out.push("엔진 끝");
    return out.join("\n");
  }

  const judge = (log: string, over: Partial<{ saved: number[] | null; model: number[] | null; original: number[] | null }> = {}) =>
    checks.collisionChecks({ log, width: W, height: H, saved, model: saved.slice(), original, ...over });
  const failed = (list: Check[]) => list.filter((c) => !c.ok).map((c) => c.name.replace(/ \(.*$/, ""));

  it("읽기: size, 줄, done 을 읽고 칸 배열로 편다. 모자라면 null", () => {
    const probe = checks.parseCollisionProbe(probeLog(saved));
    expect(probe.width).toBe(W);
    expect(probe.rows.get(1)).toBe("001001");
    expect(checks.probeCells(probe, W, H)).toEqual(saved.map((v) => (v ? 1 : 0)));
    expect(checks.probeCells(checks.parseCollisionProbe(probeLog(saved, { dropRow: 2 })), W, H)).toBeNull();
    expect(checks.probeCells(checks.parseCollisionProbe(probeLog(saved, { noDone: true })), W, H)).toBeNull();
    expect(checks.probeCells(checks.parseCollisionProbe(probeLog(saved, { size: [W, H + 1] })), W, H)).toBeNull();
  });

  it("통과: 엔진이 저장한 통행대로 답하면 칸마다 같고 고친 칸 셋이 원본과 반대다", () => {
    const list = judge(probeLog(saved));
    expect(failed(list)).toEqual([]);
    expect(list.find((c) => c.name.startsWith("고친 칸"))!.detail).toBe("막음 2, 풂 1, 원본대로 답한 칸 0");
  });

  it("실패: 엔진이 고치기 전 맵을 읽었으면 칸마다 견주기와 고친 칸에서 떨어진다", () => {
    const list = judge(probeLog(original));
    expect(failed(list)).toEqual(["엔진의 막힘이 저장한 파일의 통행과 칸마다 같다", "엔진의 막힘이 에디터 모델의 통행과 칸마다 같다", "고친 칸(막은 칸과 푼 칸)을 엔진이 원본과 반대로 답한다"]);
    expect(list.find((c) => c.name.startsWith("엔진의 막힘이 저장한"))!.detail).toBe("3 칸 다름: 0,1 2,1 3,2");
  });

  it("실패: 한 칸만 다르게 답해도 그 칸을 짚는다. 모델이 파일과 다르면 모델 견주기에서 떨어진다", () => {
    const engine = saved.slice();
    engine[2 * W + 1] = 1;
    expect(judge(probeLog(engine)).find((c) => c.name.startsWith("엔진의 막힘이 저장한"))!.detail).toBe("1 칸 다름: 1,2");
    const model = saved.slice();
    model[1 * W + 2] = 0;
    expect(failed(judge(probeLog(saved), { model }))).toEqual(["엔진의 막힘이 에디터 모델의 통행과 칸마다 같다"]);
  });

  it("실패: 탐침 줄이 모자라거나 통행이 없으면 견주지 않고 떨어진다", () => {
    expect(failed(judge(probeLog(saved, { dropRow: 3 })))).toEqual(["엔진이 맵 전체 6x4 칸의 통행을 답했다"]);
    expect(failed(judge(probeLog(saved, { noDone: true })))).toEqual(["엔진이 맵 전체 6x4 칸의 통행을 답했다"]);
    expect(failed(judge(probeLog(saved), { saved: null }))).toEqual(["저장한 파일과 모델과 원본에 통행이 있고 칸 수가 맞다"]);
  });

  it("실패: 막기만 했거나 고친 칸이 없으면 증명이 모자라다", () => {
    const onlyBlocked = original.slice();
    onlyBlocked[1 * W + 2] = 1;
    expect(failed(judge(probeLog(onlyBlocked), { saved: onlyBlocked, model: onlyBlocked }))).toEqual(["고친 칸(막은 칸과 푼 칸)을 엔진이 원본과 반대로 답한다"]);
    expect(failed(judge(probeLog(original), { saved: original, model: original }))).toEqual(["고친 칸(막은 칸과 푼 칸)을 엔진이 원본과 반대로 답한다"]);
  });
});

// ---- 항구 마을 ----

describe("항구 마을 (jsonDiff, lineDiff, runnerSummary, frameDiff)", () => {
  const map = { version: 2, layers: [{ name: "ground", data: [1, 2, 3, 4] }], collision: [0, 0, 1, 0], events: [{ id: "crates", x: 1, commands: [{ code: "message", text: "짐" }] }] };
  const clone = () => JSON.parse(JSON.stringify(map)) as typeof map;

  it("jsonDiff: 칠한 칸 하나면 그 자리 하나. 키 순서는 보지 않는다", () => {
    const b = clone();
    b.layers[0].data[2] = 9;
    expect(checks.jsonDiff(map, b)).toEqual(["$.layers[0].data[2]"]);
    const reordered = { events: map.events, collision: map.collision, layers: map.layers, version: 2 };
    expect(checks.jsonDiff(map, reordered)).toEqual([]);
  });

  it("jsonDiff: 이벤트의 글, 빠진 키, 배열 길이, 값의 종류가 바뀌면 그 자리", () => {
    const b = clone();
    b.events[0].commands[0].text = "상자";
    b.collision.push(0);
    delete (b as Partial<typeof map>).version;
    (b.layers[0] as { name: unknown }).name = 1;
    expect(checks.jsonDiff(map, b).sort()).toEqual(["$.collision.length", "$.events[0].commands[0].text", "$.layers[0].name", "$.version"]);
    expect(checks.jsonDiff({ a: 1 }, { a: 1, b: 2 })).toEqual(["$.b"]);
    expect(checks.jsonDiff([1, 2, 3], [4, 5, 6], 2)).toEqual(["$[0]", "$[1]"]);
  });

  it("lineDiff: 다른 줄 번호 (1부터), 줄 수가 다르면 남은 줄", () => {
    expect(checks.lineDiff("a\nb\nc\n", "a\nB\nc\n")).toEqual([2]);
    expect(checks.lineDiff("a\nb", "a\nb\nc")).toEqual([3]);
    expect(checks.lineDiff("x", "x")).toEqual([]);
  });

  it("runnerSummary: PASS 와 FAIL 이름, 결과 줄, 골든을 쓴 줄", () => {
    const out = [
      "",
      "[8] rpgdemo_scene",
      "  PASS  맵 파일에 실린 이벤트가 그대로 실행된다",
      "  FAIL  골든 일치: rpgdemo_town  차이 픽셀 3.10% (허용 2%)",
      "  GOLDEN 생성: tests/golden/rpgdemo_bag.png",
      "  PASS  골든 일치: rpgdemo_title",
      "",
      "결과: 2 PASS / 1 FAIL",
      "  - 골든 일치: rpgdemo_town",
    ].join("\n");
    const s = checks.runnerSummary(out);
    expect(s.passed).toEqual(["맵 파일에 실린 이벤트가 그대로 실행된다", "골든 일치: rpgdemo_title"]);
    expect(s.failed).toEqual(["골든 일치: rpgdemo_town"]);
    expect(s.total).toEqual({ pass: 2, fail: 1 });
    expect(s.golden).toEqual(["GOLDEN 생성: tests/golden/rpgdemo_bag.png"]);
    expect(checks.runnerSummary("엔진이 죽었다").total).toBeNull();
  });

  it("frameDiff: 같으면 0, 다른 픽셀의 수와 둘레 사각형, 크기가 다르면 알린다", () => {
    const a = frame.rgbaImage(4, 3, new Uint8Array(4 * 3 * 4).fill(200));
    const bRgba = new Uint8Array(a.rgba);
    bRgba.set([0, 0, 0, 255], (1 * 4 + 2) * 4);
    bRgba.set([200, 200, 201, 200], (2 * 4 + 3) * 4);
    const b = frame.rgbaImage(4, 3, bRgba);
    expect(checks.frameDiff(a, a)).toEqual({ sizeMismatch: false, count: 0, box: null });
    expect(checks.frameDiff(a, b)).toEqual({ sizeMismatch: false, count: 2, box: { x0: 2, y0: 1, x1: 3, y1: 2 } });
    expect(checks.frameDiff(a, frame.rgbaImage(3, 3, new Uint8Array(36))).sizeMismatch).toBe(true);
  });
});

// ---- 새 맵 골든 ----

describe("새 맵 골든 (paintedCellsCheck, cropImage)", () => {
  const TILESET = "t.png";
  /**
   * 64x32 타일셋 (4x2 타일, 16x16 픽셀). gid 마다 다른 색이다. gid 5 는 왼쪽 절반, gid 6 은 위쪽 절반이 투명하고,
   * gid 7 은 왼쪽 위 4x4 만 불투명하다 (칠해도 16 픽셀만 보인다)
   */
  function tileset() {
    const w = 64;
    const h = 32;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = Math.floor(y / 16) * 4 + Math.floor(x / 16);
        const tx = x % 16;
        const ty = y % 16;
        const clear = (t === 4 && tx < 8) || (t === 5 && ty < 8) || (t === 6 && (tx >= 4 || ty >= 4));
        rgba.set([(t * 53 + 20) & 255, (t * 97 + 40) & 255, (t * 29 + 90) & 255, clear ? 0 : 255], (y * w + x) * 4);
      }
    }
    return { width: w, height: h, rgba };
  }
  const images = new Map([[TILESET, tileset()]]);

  /** 4x3 칸 맵: 바닥은 gid 1..4 무늬, deco 는 (1, 1) 에 gid 5, (2, 2) 에 gid 6 (둘 다 반만 불투명해 바닥이 보인다) */
  function painted(): TestMap {
    const ground = Array.from({ length: 12 }, (_, i) => 1 + ((i + Math.floor(i / 4)) % 4));
    const deco = new Array(12).fill(0);
    deco[1 * 4 + 1] = 5;
    deco[2 * 4 + 2] = 6;
    return { width: 4, height: 3, tileWidth: 16, tileHeight: 16, tilesets: [{ image: TILESET, firstGid: 1, columns: 4 }], layers: [{ name: "ground", data: ground }, { name: "deco", data: deco }] };
  }
  const blank = (): TestMap => ({ ...painted(), layers: painted().layers.map((l) => ({ ...l, data: new Array(12).fill(0) })) });
  const RECT = { x: 0, y: 0, width: 64, height: 48 };
  const cellsOf = (map: TestMap) => {
    const out: Array<{ layer: number; x: number; y: number; before: number }> = [];
    map.layers.forEach((l, li) => l.data.forEach((v, i) => v && out.push({ layer: li, x: i % 4, y: Math.floor(i / 4), before: 0 })));
    return out;
  };

  /** 게임 화면 흉내: 맵을 배율 scale 로, 비치는 곳은 검정, 오른쪽과 아래에 맵 밖 여백 margin */
  function game(map: TestMap, scale = 1, margin = 0): Img {
    const tiles = frame.renderMapRect(map, images, RECT);
    const w = (RECT.width + margin) * scale;
    const h = (RECT.height + margin) * scale;
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = Math.floor(x / scale);
        const sy = Math.floor(y / scale);
        const p = sx < RECT.width && sy < RECT.height ? tiles.pixel(sx, sy) : { r: 0, g: 0, b: 0, a: 0 };
        out.set(p.a === 255 ? [p.r, p.g, p.b, 255] : [0, 0, 0, 255], (y * w + x) * 4);
      }
    }
    return frame.rgbaImage(w, h, out);
  }

  const judge = (img: Img, map = painted(), list = cellsOf(painted())) => frame.paintedCellsCheck({ map, images, rect: RECT, frame: img, cells: list });

  it("통과: 저장한 맵대로 그린 화면은 칠한 칸이 하나하나 있다 (배율 2 도)", () => {
    const r = judge(game(painted()));
    expect(r.ok).toBe(true);
    // 바닥 12 칸 가운데 deco 아래 두 칸은 절반(128)만 보인다: 256 x 10 + 128 x 2 + deco 128 x 2
    expect(r.detail).toBe("14 칸, 픽셀 3072/3072 (100.00%), 가장 낮은 칸 100.00%, 어긋난 칸 0");
    expect(judge(game(painted(), 2)).ok).toBe(true);
  });

  it("실패: 칠하기 전 맵을 그린 화면은 칸마다 떨어진다", () => {
    const r = judge(game(blank()));
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/^14 칸, 픽셀 0\/3072 \(0\.00%\), 가장 낮은 칸 0\.00%, 어긋난 칸 14: /);
  });

  it("실패: deco 한 칸을 빼고 그린 화면은 그 칸만 짚는다", () => {
    const missing = painted();
    missing.layers[1].data[2 * 4 + 2] = 0;
    const r = judge(game(missing));
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/어긋난 칸 1: 1:2,2 0\/128$/);
  });

  it("실패: 칠한 칸이 64 픽셀보다 적게 보이면 증명이 되지 않는다. 화면 밖 칸, 정수배가 아닌 화면, 빈 목록도", () => {
    const tiny = painted();
    tiny.layers[1].data[1 * 4 + 1] = 7;
    expect(judge(game(tiny), tiny, [{ layer: 1, x: 1, y: 1, before: 0 }]).detail).toContain("어긋난 칸 1: 1:1,1 16/16");
    expect(judge(game(painted()), painted(), [{ layer: 0, x: 4, y: 0, before: 0 }]).detail).toContain("0:4,0 화면 밖");
    expect(judge(frame.rgbaImage(65, 48, new Uint8Array(65 * 48 * 4))).detail).toMatch(/정수배가 아니다/);
    expect(judge(game(painted()), painted(), []).ok).toBe(false);
  });

  it("referenceChecks: 칸마다 보는 셈을 칸 안으로 좁혀도 결과가 같다 (빠진 칸 셋은 떨어진다)", () => {
    const three = painted();
    for (const i of [0, 1, 2]) three.layers[0].data[i] = 0;
    const cellCheck = (img: Img) => frame.referenceChecks({ map: painted(), images, rect: RECT, frame: img }).find((c) => c.name.startsWith("칸마다"))!;
    expect(cellCheck(game(painted()))).toMatchObject({ ok: true, detail: "12 칸 가운데 0 칸 어긋남" });
    expect(cellCheck(game(three))).toMatchObject({ ok: false, detail: "12 칸 가운데 3 칸 어긋남: 0,0 1,0 2,0" });
  });

  it("cropImage: 자리만 옮긴 사각형이고, 화면 밖이면 오류", () => {
    const img = game(painted(), 2, 8);
    const crop = frame.cropImage(img, 0, 0, 128, 96);
    expect(crop.width).toBe(128);
    expect(crop.pixel(10, 20)).toEqual(img.pixel(10, 20));
    expect(frame.cropImage(img, 2, 3, 4, 4).pixel(1, 1)).toEqual(img.pixel(3, 4));
    expect(judge(crop).ok).toBe(true);
    expect(() => frame.cropImage(img, 130, 0, 20, 10)).toThrow(/밖이다/);
  });
});
