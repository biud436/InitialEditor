// RPG Maker 2000 게임 가져오기와 진짜 엔진의 교차 검사 (docs/plans/rm2k-tilemap.md 9절). yarn test:engine-rm2k 가 돈다.
//
// "RPG Maker 2000 맵의 타일 번호를 가져온 맵을 엔진이 ChipSet 의 맞는 조각으로 그리고, 통행을 그대로 읽는다"를 본다.
//   1. 검사용 LCF(testLcf.ts)로 게임 폴더를 만든다: 데이터베이스(통행과 별), 맵 트리, 20x15 맵 하나(물 A1, A2, 깊은 물의 여러
//      모양과 모서리 비트, 애니메이션 타일, 땅의 모양 0..49, 하층 타일, 상층 타일, 별이 있는 타일), ChipSet 은 검사용 그림(PNG)
//   2. 가져오기(importer.ts)로 임시 프로젝트에 맵과 ChipSet 과 아틀라스를 쓴다. tools/mapfile.py 형식 검사도 지난다
//   3. 엔진을 헤드리스로 띄워(시계 0) 모든 레이어를 그리고, 칸마다 네 조각의 가운데 색이 RPG Maker 2000 의 규칙으로 정한
//      ChipSet 조각(EasyRPG Player 의 BlockA_Subtiles_IDS, BlockD_Subtiles_IDS 를 옮긴 shapes.ts)과 같은지 본다. 보이는 타일은
//      RPG Maker 2000 의 그리는 순서(별 없는 하층, 별 없는 상층, 별 있는 하층, 별 있는 상층)의 맨 위다 (검사용 그림은 불투명하다)
//   4. 엔진의 Tilemap.IsPassable 이 가져온 통행과 같은지 본다
// RM2K_GAME_DIR 에 RPG Maker 2000 게임 폴더를 주면 그 게임의 맵도 모두 가져와 형식 검사와 엔진 읽기를 지나는지 본다 (저장소에
// 넣지 않는 게임으로 손으로 돌리는 검사).
// 엔진 실행 파일이 없거나 타일 애니메이션 전 엔진이면 "SKIP: 이유" 한 줄을 찍고 통과한다.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encodePng, type ProjectBackend, type RgbaImage } from "@initial-editor/core";
import type { ImportSource } from "@initial-editor/ext-tilemap";
import { parseMap } from "@initial-editor/ext-tilemap/model";
import { readBmp } from "../../../../tests/e2e/support/bmp";
import { planImport } from "../../src/importer";
import { animOrigin, bodyOrigin, D_SOURCE, D_VARIANT_SOURCES, dOrigin, eOrigin, fOrigin, PASS, QUARTERS, shoreX, waterQuarters, type WaterKind } from "../../src/model";
import { codedChipset, codedQuarterAt } from "../../src/model/testChipset";
import { writeDatabase, writeMapTree, writeMapUnit } from "../../src/model/testLcf";

const ENGINE_DIR = path.resolve(process.env.INITIAL2D_DIR ?? path.join(__dirname, "..", "..", "..", "..", "..", "Initial2D"));
const EXE = process.env.INITIAL2D_EXE ?? path.join(ENGINE_DIR, "build", process.platform === "win32" ? "Initial2D.exe" : "Initial2D");
const KEEP = process.env.KEEP_WORKDIR === "1";
const GAME_DIR = process.env.RM2K_GAME_DIR ?? "";

function findSkipReason(): string | null {
  if (!fs.existsSync(EXE)) return `엔진 실행 파일 없음: ${EXE} (INITIAL2D_DIR 로 저장소 위치 지정 또는 cmake 로 빌드)`;
  const stub = path.join(ENGINE_DIR, "resources", "api", "initial2d.lua");
  if (!fs.existsSync(stub) || !fs.readFileSync(stub, "utf8").includes("function Tilemap.Update(")) {
    return "엔진이 타일 애니메이션(Tilemap.Update, 타일셋의 animations) 전이다";
  }
  return null;
}

const skipReason = findSkipReason();
const W = 20;
const H = 15;
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** 하층: 물(종류, 모서리 비트, 모양), 애니메이션 타일, 땅의 모양 0..49 (D1..D12 를 돌며), 하층 타일. 상층: F 와 별 */
function lcfLayers(): { lower: number[]; upper: number[] } {
  const lower: number[] = [];
  const upper: number[] = [];
  for (let i = 0; i < W * H; i++) {
    const y = Math.floor(i / W);
    let lo: number;
    if (y < 5) {
      // 물: 종류는 줄마다, 모양과 모서리 비트는 칸마다
      const kind = y % 3;
      const a = (i * 7) % 47;
      const b = (i * 5) % 16;
      lo = kind * 1000 + b * 50 + a;
    } else if (y === 5) lo = 3000 + (i % 3) * 50;
    else if (y < 9) lo = 4000 + (i % 12) * 50 + ((i * 3) % 50);
    else lo = 5000 + ((i * 11) % 144);
    lower.push(lo);
    // 상층: 열둘째 칸마다 별이 있는 F7, 넷째 칸마다(2 부터) 별이 없는 F 하나. 별이 있는 D3(i % 12 === 2) 위에도 F 가 온다
    upper.push(i % 12 === 0 ? 10007 : i % 4 === 2 ? 10001 + ((i * 13) % 143) : 10000);
  }
  return { lower, upper };
}

const STAR_LOWER = (id: number) => id === 5005 || (id >= 4100 && id < 4150);
const STAR_UPPER = (id: number) => id === 10007;

/** RPG Maker 2000 의 그리는 순서로 맨 위에 보이는 타일 */
function visibleId(lower: number, upper: number): number {
  const order = [STAR_LOWER(lower) ? 0 : lower, upper !== 10000 && !STAR_UPPER(upper) ? upper : 0, STAR_LOWER(lower) ? lower : 0, STAR_UPPER(upper) ? upper : 0];
  return order.filter((id) => id !== 0).pop() ?? lower;
}

/** 하층 E5 와 D3 에는 별, 상층 F7 에는 별, E9 는 막힘, 물 A1 은 막힘 */
function database(): Uint8Array {
  const lower = new Uint8Array(162).fill(15);
  lower[0] = 0;
  lower[18 + 5] = PASS.above | 15;
  lower[6 + 2] = PASS.above | 15;
  lower[18 + 9] = 0;
  const upper = new Uint8Array(144).fill(15);
  upper[0] = 31;
  upper[7] = PASS.above | 15;
  return writeDatabase([{ id: 1, name: ascii("Coded"), file: ascii("Coded"), lower, upper }]);
}

/** RPG Maker 2000 의 규칙으로 칸의 네 조각이 온 ChipSet 의 픽셀 (조각의 왼쪽 위) */
function expectedQuarters(id: number): Array<{ x: number; y: number }> {
  const q8 = (o: { x: number; y: number }) => QUARTERS.map(({ qx, qy }) => ({ x: o.x + qx * 8, y: o.y + qy * 8 }));
  if (id >= 10000) return q8(fOrigin(id - 10000));
  if (id >= 5000) return q8(eOrigin(id - 5000));
  if (id >= 4000) {
    const n = Math.floor((id - 4000) / 50);
    const v = (id - 4000) % 50;
    const symbols = v < 47 ? D_VARIANT_SOURCES[v] : v === 49 ? "SSSS" : "CCCC";
    const o = dOrigin(n);
    return QUARTERS.map(({ qx, qy }, q) => ({ x: o.x + D_SOURCE[symbols[q]].tx * 16 + qx * 8, y: o.y + D_SOURCE[symbols[q]].ty * 16 + qy * 8 }));
  }
  if (id >= 3000) return q8(animOrigin((id - 3000) / 50, 0));
  const kind = Math.floor(id / 1000) as WaterKind;
  const b = Math.floor((id % 1000) / 50);
  const a = id % 50;
  return waterQuarters(a, b).map((piece, q) => {
    const { qx, qy } = QUARTERS[q];
    if ("shore" in piece) return { x: shoreX(kind, 0) + qx * 8, y: piece.shore * 16 + qy * 8 };
    const shallow = kind !== 2;
    const row = shallow ? (piece.body ? 1 : 0) : piece.body ? 2 : 3;
    const o = bodyOrigin(row, 0);
    return { x: o.x + qx * 8, y: o.y + qy * 8 };
  });
}

function fsBackend(root: string): ProjectBackend {
  const abs = (rel: string) => path.join(root, rel);
  return {
    exists: async (rel: string) => fs.existsSync(abs(rel)),
    readBinary: async (rel: string) => new Uint8Array(fs.readFileSync(abs(rel))),
    readText: async (rel: string) => fs.readFileSync(abs(rel), "utf8"),
    writeBinary: async (rel: string, data: Uint8Array) => {
      fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
      fs.writeFileSync(abs(rel), data);
    },
    writeText: async (rel: string, text: string) => {
      fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
      fs.writeFileSync(abs(rel), text);
    },
  } as unknown as ProjectBackend;
}

function scene(map: string, layers: number): string {
  return `-- 검사 씬 (rm2k-import.engine.test.ts 가 쓴다)
local map
function Initialize()
	local err
	map, err = Tilemap.Load("./${map}")
	print("rm2k:load=" .. tostring(map ~= nil) .. " " .. tostring(err))
	if map then
		local w, h = Tilemap.GetSize(map)
		local cells = {}
		for y = 0, h - 1 do
			for x = 0, w - 1 do
				cells[#cells + 1] = Tilemap.IsPassable(map, x, y) and "0" or "1"
			end
		end
		print("rm2k:collision=" .. table.concat(cells))
	end
	SetRenderScale(1)
end
function Update(elapsed) end
function Render()
	if map then Tilemap.Draw(map, 1, ${layers}, 0, 0) end
end
function Destroy()
	if map then Tilemap.Dispose(map) end
end
`;
}

function runEngine(work: string, env: Record<string, string> = {}): { log: string; shot: string } {
  const run = spawnSync(EXE, [], {
    cwd: work,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, SDL_VIDEODRIVER: "dummy", SDL_AUDIODRIVER: "dummy", INITIAL2D_EXIT_AFTER: "12", INITIAL2D_SCREENSHOT: path.join(work, "shot_%04ld.bmp"), INITIAL2D_SCREENSHOT_FRAME: "10", ...env },
  });
  return { log: `${run.stdout ?? ""}${run.stderr ?? ""}`, shot: path.join(work, "shot_0010.bmp") };
}

function mapfileCheck(file: string): void {
  const mapfile = path.join(ENGINE_DIR, "tools", "mapfile.py");
  if (!fs.existsSync(mapfile)) return;
  const r = spawnSync("python3", [mapfile, "check", file], { encoding: "utf8" });
  expect(r.status, `tools/mapfile.py check ${file}: ${r.stdout}${r.stderr}`).toBe(0);
}

function folderSource(name: string, files: Record<string, Uint8Array>): ImportSource {
  return { name, paths: Object.keys(files), read: async (p) => files[p] };
}

describe.skipIf(skipReason !== null)("RPG Maker 2000 게임 가져오기와 진짜 엔진", () => {
  it("가져온 맵의 칸마다 RPG Maker 2000 의 규칙으로 정한 ChipSet 조각을 엔진이 그리고, 통행이 같다", async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "initial2d-rm2k-import-"));
    try {
      const { lower, upper } = lcfLayers();
      const source = folderSource("Coded", {
        "Coded/RPG_RT.ldb": database(),
        "Coded/RPG_RT.lmt": writeMapTree([{ id: 1, name: ascii("Field") }]),
        "Coded/Map0001.lmu": writeMapUnit({ width: W, height: H, lower, upper }),
        "Coded/ChipSet/Coded.png": await encodePng(codedChipset()),
      });
      const backend = fsBackend(work);
      const plan = await planImport(source, {}, backend);
      expect(plan.items.map((i) => i.problems)).toEqual([[]]);
      const result = await plan.run(["1"], { backend, firstMapId: 1 });
      const mapPath = result.maps[0];
      mapfileCheck(path.join(work, mapPath));
      const map = parseMap(fs.readFileSync(path.join(work, mapPath), "utf8"));
      expect(map.layers.map((l) => l.name)).toEqual(["lower", "upper", "lower_over", "upper_over"]);
      // 별이 있는 하층이 별이 없는 상층 위에 보이는 칸이 있다 (D3 위의 F)
      expect(lower.some((id, i) => STAR_LOWER(id) && upper[i] !== 10000 && !STAR_UPPER(upper[i]))).toBe(true);

      fs.mkdirSync(path.join(work, "scripts/lua"), { recursive: true });
      fs.writeFileSync(path.join(work, "scripts/lua/main.lua"), scene(mapPath, map.layers.length));
      const { log, shot } = runEngine(work);
      expect(log, log.slice(-400)).toContain("rm2k:load=true");
      expect(log).toContain(`rm2k:collision=${map.collision!.join("")}`);
      expect(map.collision!.filter((c) => c === 1).length).toBeGreaterThan(10);

      const bmp = readBmp(fs.readFileSync(shot));
      const screen: RgbaImage = { width: W * 16, height: H * 16, data: new Uint8Array(W * 16 * H * 16 * 4) };
      for (let y = 0; y < screen.height; y++) for (let x = 0; x < screen.width; x++) {
        const p = bmp.pixel(x, y);
        screen.data.set([p.r, p.g, p.b, 255], (y * screen.width + x) * 4);
      }
      const wrong: string[] = [];
      for (let i = 0; i < W * H; i++) {
        const x = i % W;
        const y = Math.floor(i / W);
        const id = visibleId(lower[i], upper[i]);
        const want = expectedQuarters(id).map((p) => `${p.x / 8},${p.y / 8}`).join(" ");
        const got = QUARTERS.map(({ qx, qy }) => {
          const q = codedQuarterAt(screen, x * 16 + qx * 8 + 4, y * 16 + qy * 8 + 4);
          return q ? `${q.qx},${q.qy}` : "-";
        }).join(" ");
        if (got !== want) wrong.push(`(${x}, ${y}) 번호 ${id} 기대 ${want} 화면 ${got}`);
      }
      expect(wrong, `RPG Maker 2000 규칙과 다른 칸 ${wrong.length}개`).toEqual([]);
    } finally {
      if (KEEP) console.log(`작업 폴더: ${work}`);
      else fs.rmSync(work, { recursive: true, force: true });
    }
  });

  it.skipIf(!GAME_DIR)("RM2K_GAME_DIR 의 게임: 모든 맵을 가져와 형식 검사와 엔진 읽기를 지난다", async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "initial2d-rm2k-game-"));
    try {
      const files: Record<string, Uint8Array> = {};
      const walk = (dir: string, rel: string) => {
        for (const name of fs.readdirSync(dir)) {
          const full = path.join(dir, name);
          if (fs.statSync(full).isDirectory()) walk(full, `${rel}/${name}`);
          else if (/\.(ldb|lmt|lmu|ini|png|bmp|xyz)$/i.test(name)) files[`${rel}/${name}`] = new Uint8Array(fs.readFileSync(full));
        }
      };
      walk(GAME_DIR, "Game");
      const backend = fsBackend(work);
      const plan = await planImport(folderSource("Game", files), {}, backend);
      const ok = plan.items.filter((i) => i.problems.length === 0);
      console.log(`${plan.title}: 맵 ${plan.items.length}개, 가져올 수 있는 맵 ${ok.length}개. ${plan.notes.join(", ")}`);
      for (const i of plan.items.filter((i) => i.problems.length > 0)) console.log(`  ${i.label}: ${i.problems.join(", ")}`);
      const result = await plan.run(ok.map((i) => i.id), { backend, firstMapId: 1 });
      expect(result.maps.length).toBe(ok.length);
      fs.mkdirSync(path.join(work, "scripts/lua"), { recursive: true });
      for (const mapPath of result.maps) {
        mapfileCheck(path.join(work, mapPath));
        const layers = parseMap(fs.readFileSync(path.join(work, mapPath), "utf8")).layers.length;
        fs.writeFileSync(path.join(work, "scripts/lua/main.lua"), scene(mapPath, layers));
        const { log } = runEngine(work, { INITIAL2D_SCREENSHOT: "" });
        expect(log, `${mapPath}: ${log.slice(-300)}`).toContain("rm2k:load=true");
      }
    } finally {
      if (KEEP) console.log(`작업 폴더: ${work}`);
      else fs.rmSync(work, { recursive: true, force: true });
    }
  });
});

describe.skipIf(skipReason === null)("RPG Maker 2000 게임 가져오기와 진짜 엔진 (건너뜀)", () => {
  it("SKIP", () => {
    console.log(`SKIP: ${skipReason}`);
  });
});
