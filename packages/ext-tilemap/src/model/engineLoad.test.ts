import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkEngineMap, projectPathOf } from "./engineLoad";

const ENGINE = path.resolve(process.env.INITIAL2D_DIR ?? path.join(__dirname, "..", "..", "..", "..", "..", "Initial2D"));
const MAPS = path.join(ENGINE, "resources", "maps");

const BASE = {
  version: 2,
  width: 2,
  height: 1,
  tileWidth: 16,
  tileHeight: 16,
  layers: [{ name: "g", data: [0, 1] }],
  tilesets: [{ image: "./resources/tiles/t.png", firstGid: 1, columns: 4 }],
};

function check(patch: Record<string, unknown>) {
  return checkEngineMap(JSON.stringify({ ...BASE, ...patch }));
}

function reason(patch: Record<string, unknown>): string | null {
  const r = check(patch);
  return r.ok ? null : r.reason;
}

describe("엔진이 맵 파일을 여는 규칙 (Tilemap::load)", () => {
  it("받아들이면 타일셋 그림을 프로젝트 기준 경로로, 맵 크기를 칸으로 돌려준다", () => {
    expect(check({})).toEqual({ ok: true, images: ["resources/tiles/t.png"], width: 2, height: 1 });
    expect(check({ width: 2.9, height: true })).toEqual({ ok: true, images: ["resources/tiles/t.png"], width: 2, height: 1 });
    expect(projectPathOf(".\\resources\\tiles//a.png")).toBe("resources/tiles/a.png");
  });

  it("엔진이 보지 않는 곳은 틀려도 받아들인다 (objects, events, 음수 칸, 모르는 키)", () => {
    expect(reason({ objects: [{ id: "a", type: "start" }] })).toBeNull();
    expect(reason({ events: {} })).toBeNull();
    expect(reason({ layers: [{ name: "g", data: [-1, 0] }] })).toBeNull();
    expect(reason({ extra: { anything: true } })).toBeNull();
    expect(reason({ version: 1 })).toBeNull();
    expect(reason({ layers: [{ data: [0, 0] }] })).toBeNull(); // 이름이 없으면 빈 글
  });

  it("엔진이 거부하는 것", () => {
    expect(checkEngineMap("{ nope")).toMatchObject({ ok: false, reason: expect.stringMatching(/^JSON 이 아니다: /) });
    expect(reason({ version: 3 })).toBe("모르는 맵 버전이다: 3 (지원: 1, 2)");
    expect(reason({ version: "2" })).toBe('모르는 맵 버전이다: "2" (지원: 1, 2)');
    expect(checkEngineMap("{}")).toEqual({ ok: false, reason: "모르는 맵 버전이다: 없음 (지원: 1, 2)" });
    expect(reason({ width: 0 })).toBe("맵 크기나 타일 크기가 0 이하다");
    expect(reason({ tileHeight: -16 })).toBe("맵 크기나 타일 크기가 0 이하다");
    expect(reason({ layers: [] })).toBe("레이어가 없다");
    expect(reason({ layers: {} })).toBe("레이어가 없다");
    expect(reason({ layers: [{ name: "g", data: [0] }] })).toMatch(/^레이어 "g"의 칸 수가/);
    expect(reason({ layers: [{ name: "g", data: [0, 1.5] }] })).toMatch(/^레이어 "g"의 칸 수가/);
    expect(reason({ layers: [{ name: "g", data: [0, "1"] }] })).toMatch(/^레이어 "g"의 칸 수가/);
    expect(reason({ collision: null })).toMatch(/^collision /);
    expect(reason({ collision: [0] })).toMatch(/^collision /);
    expect(reason({ collision: [0, 1] })).toBeNull();
    expect(reason({ tilesets: [] })).toBe("타일셋이 없다");
    expect(reason({ tilesets: [{ image: "", firstGid: 1, columns: 1 }] })).toMatch(/^타일셋 항목이 틀렸다/);
    expect(reason({ tilesets: [{ image: "a.png", firstGid: 0, columns: 1 }] })).toMatch(/^타일셋 항목이 틀렸다/);
    expect(reason({ tilesets: [{ image: "a.png", firstGid: 1, columns: 0 }] })).toMatch(/^타일셋 항목이 틀렸다/);
  });

  const files = existsSync(MAPS) ? readdirSync(MAPS).filter((f) => f.endsWith(".json")) : [];
  it.skipIf(files.length === 0)("엔진 저장소의 맵은 모두 엔진 규칙을 통과하고 타일셋 그림이 있다", () => {
    for (const f of files) {
      const result = checkEngineMap(readFileSync(path.join(MAPS, f), "utf8"));
      expect(result, f).toMatchObject({ ok: true });
      if (!result.ok) continue;
      for (const image of result.images) {
        // RTP 칩셋 판(_rtp.json)은 RTP 변환물이 있는 기계에만 그림이 있다
        if (image.startsWith("resources/rtp/")) continue;
        expect(existsSync(path.join(ENGINE, image)), `${f}: ${image}`).toBe(true);
      }
    }
  });
});
