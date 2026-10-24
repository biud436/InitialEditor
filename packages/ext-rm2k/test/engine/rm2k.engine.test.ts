// 진짜 엔진과의 교차 검사 (docs/plans/rm2k-tilemap.md 6절). yarn test:engine-rm2k 가 돈다.
//
// "에디터가 구운 ChipSet 과 모양을 맞춰 칠한 맵을 엔진이 같게 그리고, 물과 애니메이션 타일이 엔진의 시계로 움직인다"를 본다.
//   1. 임시 폴더에 검사용 ChipSet(testChipset.ts, 조각마다 제 자리를 색으로 든 그림)을 PNG 로 쓰고, 확장과 같은 길(bakeChipsetFile)로 굽는다
//   2. 확장의 모양 맞추기 규칙(applyAutotile + rm2kAutotileRule)으로 땅, 물 A1, A2, 깊은 물, 애니메이션 타일을 칠하고, 상층에
//      상층 타일을 놓아 고정 형식(serializeMap)으로 저장한다. 엔진 저장소에 tools/mapfile.py 가 있으면 그 형식 검사도 지난다
//   3. 엔진을 헤드리스로 띄운다 (SDL_VIDEODRIVER=dummy, SDL_AUDIODRIVER=dummy). 씬은 맵을 읽고 RM2K_CLOCK_MS 만큼 시계를
//      한 번 진행해 그린다. 시계 넷(물 프레임 0, 1, 2, 왕복의 1)에서 화면을 찍는다
//   4. 칸마다 네 조각의 가운데 색을 읽어, 맵의 gid 를 그 시계의 프레임으로 옮긴 아틀라스 칸의 조각과 같은지 본다. 물 칸과
//      애니메이션 타일 칸이 시계마다 다른 프레임인지도 본다
// 엔진 실행 파일이 없거나 타일 애니메이션 전 엔진이면 "SKIP: 이유" 한 줄을 찍고 통과한다.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodePng, encodePng, type RgbaImage } from "@initial-editor/core";
import { applyAutotile, serializeMap, type CellChange, type MapData } from "@initial-editor/ext-tilemap/model";
import { readBmp } from "../../../../tests/e2e/support/bmp";
import {
  ATLAS_COLUMNS,
  atlasAnimations,
  bakeChipsetFile,
  chipAt,
  DEFAULT_WATER_ANIMATION,
  eLocal,
  fLocal,
  rm2kAutotileRule,
  rm2kTileset,
  SAMPLE_LOCALS,
  type TileAnimation,
} from "../../src/model";
import { codedChipset, codedQuarterAt } from "../../src/model/testChipset";

const ENGINE_DIR = path.resolve(process.env.INITIAL2D_DIR ?? path.join(__dirname, "..", "..", "..", "..", "..", "Initial2D"));
const EXE = process.env.INITIAL2D_EXE ?? path.join(ENGINE_DIR, "build", process.platform === "win32" ? "Initial2D.exe" : "Initial2D");
const KEEP = process.env.KEEP_WORKDIR === "1";

function findSkipReason(): string | null {
  if (!fs.existsSync(EXE)) return `엔진 실행 파일 없음: ${EXE} (INITIAL2D_DIR 로 저장소 위치 지정 또는 cmake 로 빌드)`;
  const stub = path.join(ENGINE_DIR, "resources", "api", "initial2d.lua");
  if (!fs.existsSync(stub) || !fs.readFileSync(stub, "utf8").includes("function Tilemap.Update(")) {
    return "엔진이 타일 애니메이션(Tilemap.Update, 타일셋의 animations) 전이다";
  }
  return null;
}

const skipReason = findSkipReason();

const MAP_W = 20;
const MAP_H = 15;
const FIRST = 1;
const CHIPSET = "resources/ChipSet/Coded.png";
const ATLAS = "resources/tiles/Coded.rm2k.png";
const MAP = "resources/maps/rm2k.json";

/** 문자 그림: . 하층 타일 E0, d 땅 D1, e 땅 D2, 0/1/2 물 A1/A2/깊은 물, c 애니메이션 타일 C1 */
const LOWER = [
  "....................",
  ".ddd..00000.11......",
  ".ddd..00000.11..ee..",
  ".ddd..00200c....ee..",
  "......00222.........",
  "......00000.........",
  "....................",
  "..2222..............",
  "..2002..............",
  "..2222..............",
  "....................",
  "....................",
  "....................",
  "....................",
  "....................",
];

const SCENE = `-- 검사 씬 (rm2k.engine.test.ts 가 쓴다)
local map
function Initialize()
	local err
	map, err = Tilemap.Load("./${MAP}")
	print("rm2k:load=" .. tostring(map ~= nil) .. " " .. tostring(err))
	Tilemap.Update(map, tonumber(os.getenv("RM2K_CLOCK_MS") or "0"))
	SetRenderScale(1)
end
function Update(elapsed) end
function Render()
	Tilemap.Draw(map, 1, 2, 0, 0)
end
function Destroy()
	Tilemap.Dispose(map)
end
`;

function sample(ch: string): number {
  if (ch === ".") return FIRST + eLocal(0);
  if (ch === "d") return FIRST + SAMPLE_LOCALS.d(0);
  if (ch === "e") return FIRST + SAMPLE_LOCALS.d(1);
  if (ch === "c") return FIRST + SAMPLE_LOCALS.anim(0);
  return FIRST + SAMPLE_LOCALS.water(Number(ch) as 0 | 1 | 2);
}

/** 에디터처럼 칠한다: 붓 그대로의 바뀜을 모양 맞추기 규칙에 넣는다 */
function paintLower(): number[] {
  const data = new Array<number>(MAP_W * MAP_H).fill(0);
  const changes: CellChange[] = [];
  LOWER.forEach((row, y) => [...row].forEach((ch, x) => changes.push({ index: y * MAP_W + x, value: sample(ch) })));
  for (const c of applyAutotile({ width: MAP_W, height: MAP_H }, data, changes, [rm2kAutotileRule(FIRST)])) data[c.index] = c.value;
  return data;
}

/** 엔진과 같은 규칙으로, 시계 ms 의 그릴 번호 (범위 count 의 i 번째는 frames[k] + i) */
function animatedLocal(local: number, animations: readonly TileAnimation[], ms: number): number {
  for (const a of animations) {
    const count = a.count ?? 1;
    if (local >= a.tile && local < a.tile + count) return a.frames[Math.floor(ms / a.duration) % a.frames.length] + (local - a.tile);
  }
  return local;
}

function quartersOfTile(image: RgbaImage, x0: number, y0: number): string {
  return [
    [4, 4],
    [12, 4],
    [4, 12],
    [12, 12],
  ]
    .map(([dx, dy]) => {
      const q = codedQuarterAt(image, x0 + dx, y0 + dy);
      return q ? `${q.qx},${q.qy}` : "-";
    })
    .join(" ");
}

describe.skipIf(skipReason !== null)("RPG Maker 2000 타일맵과 진짜 엔진", () => {
  it("구운 ChipSet 과 모양을 맞춘 맵을 엔진이 시계마다 같은 프레임으로 그린다", async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "initial2d-rm2k-"));
    const abs = (rel: string) => path.join(work, rel);
    const backend = {
      readBinary: async (rel: string) => new Uint8Array(fs.readFileSync(abs(rel))),
      writeBinary: async (rel: string, data: Uint8Array) => {
        fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
        fs.writeFileSync(abs(rel), data);
      },
    };
    try {
      await backend.writeBinary(CHIPSET, await encodePng(codedChipset()));
      await bakeChipsetFile(backend, CHIPSET, ATLAS);
      const atlas = await decodePng(fs.readFileSync(abs(ATLAS)));

      const lower = paintLower();
      const upper = new Array<number>(MAP_W * MAP_H).fill(0);
      upper[1 * MAP_W + 15] = FIRST + fLocal(5);
      const tileset = { ...rm2kTileset(CHIPSET, ATLAS), firstGid: FIRST };
      const map: MapData = {
        version: 2,
        name: "rm2k",
        id: 1,
        width: MAP_W,
        height: MAP_H,
        tileWidth: 16,
        tileHeight: 16,
        layers: [
          { name: "lower", data: lower, extra: {} },
          { name: "upper", data: upper, extra: {} },
        ],
        collision: null,
        tilesets: [tileset],
        events: null,
        objects: [],
        extra: {},
      };
      fs.mkdirSync(path.dirname(abs(MAP)), { recursive: true });
      fs.writeFileSync(abs(MAP), serializeMap(map));
      fs.mkdirSync(abs("scripts/lua"), { recursive: true });
      fs.writeFileSync(abs("scripts/lua/main.lua"), SCENE);

      const mapfile = path.join(ENGINE_DIR, "tools", "mapfile.py");
      if (fs.existsSync(mapfile)) {
        const r = spawnSync("python3", [mapfile, "check", abs(MAP)], { encoding: "utf8" });
        expect(r.status, `tools/mapfile.py check: ${r.stdout}${r.stderr}`).toBe(0);
      }

      const animations = atlasAnimations(DEFAULT_WATER_ANIMATION);
      // 물(400ms 왕복 0, 1, 2, 1)과 애니메이션 타일(100ms 0..3)의 프레임이 겹치지 않게 고른 시계
      const clocks = [0, 610, 1020, 1330];
      const seen = new Map<number, Set<string>>();
      for (const ms of clocks) {
        const run = spawnSync(EXE, [], {
          cwd: work,
          encoding: "utf8",
          timeout: 120_000,
          env: {
            ...process.env,
            SDL_VIDEODRIVER: "dummy",
            SDL_AUDIODRIVER: "dummy",
            INITIAL2D_EXIT_AFTER: "12",
            INITIAL2D_SCREENSHOT: abs(`shot_${ms}_%04ld.bmp`),
            INITIAL2D_SCREENSHOT_FRAME: "10",
            RM2K_CLOCK_MS: String(ms),
          },
        });
        const log = `${run.stdout ?? ""}${run.stderr ?? ""}`;
        expect(log, log.slice(-400)).toContain("rm2k:load=true");
        const shotPath = abs(`shot_${ms}_0010.bmp`);
        expect(fs.existsSync(shotPath), `스크린샷 없음 (${ms}ms): ${log.slice(-400)}`).toBe(true);
        const bmp = readBmp(fs.readFileSync(shotPath));
        expect(bmp.width >= MAP_W * 16 && bmp.height >= MAP_H * 16, `화면 ${bmp.width}x${bmp.height} 가 맵보다 작다`).toBe(true);
        // 맵이 그려진 자리만 RGBA 로 (화면의 알파는 보지 않는다)
        const screen: RgbaImage = { width: MAP_W * 16, height: MAP_H * 16, data: new Uint8Array(MAP_W * 16 * MAP_H * 16 * 4) };
        for (let y = 0; y < screen.height; y++) {
          for (let x = 0; x < screen.width; x++) {
            const p = bmp.pixel(x, y);
            screen.data.set([p.r, p.g, p.b, 255], (y * screen.width + x) * 4);
          }
        }

        const wrong: string[] = [];
        for (let y = 0; y < MAP_H; y++) {
          for (let x = 0; x < MAP_W; x++) {
            const i = y * MAP_W + x;
            const gid = upper[i] || lower[i];
            const local = animatedLocal(gid - FIRST, animations, ms);
            const want = quartersOfTile(atlas, (local % ATLAS_COLUMNS) * 16, Math.floor(local / ATLAS_COLUMNS) * 16);
            const got = quartersOfTile(screen, x * 16, y * 16);
            if (got !== want) wrong.push(`(${x}, ${y}) gid ${gid} 기대 ${want} 화면 ${got}`);
            const kind = chipAt(lower[i] - FIRST)?.kind;
            if (!upper[i] && (kind === "water" || kind === "anim")) {
              if (!seen.has(i)) seen.set(i, new Set());
              seen.get(i)!.add(got);
            }
          }
        }
        expect(wrong, `${ms}ms 에 아틀라스와 다른 칸 ${wrong.length}개`).toEqual([]);
      }
      // 물 칸과 애니메이션 타일 칸은 시계 넷에서 프레임이 바뀐다 (물은 프레임 셋, 애니메이션 타일은 셋 이상)
      const moving = [...seen.values()].filter((s) => s.size >= 3).length;
      expect(moving).toBe(seen.size);
      expect(seen.size).toBeGreaterThan(30);
    } finally {
      if (KEEP) console.log(`작업 폴더: ${work}`);
      else fs.rmSync(work, { recursive: true, force: true });
    }
  });
});

describe.skipIf(skipReason === null)("RPG Maker 2000 타일맵과 진짜 엔진 (건너뜀)", () => {
  it("SKIP", () => {
    console.log(`SKIP: ${skipReason}`);
  });
});
