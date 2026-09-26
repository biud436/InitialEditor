// 채우기: 한도는 맵의 칸 수이고, 한도에 닿으면 truncated로 알린다. 가장 큰 새 맵(1024x1024)도 다 채운다.
import { describe, expect, it } from "vitest";
import { floodFill, floodFillArea, singleBrush, type Brush } from "./tiles";

describe("채우기 한도", () => {
  it("1024x1024 빈 맵에 칠한 칸 몇 개를 두고 채우면 나머지 빈 칸을 모두 채운다", () => {
    const map = { width: 1024, height: 1024 };
    const cells = map.width * map.height;
    const data = new Array<number>(cells).fill(0);
    // 펜으로 그은 한 줄(19칸)
    for (let x = 100; x < 119; x++) data[500 * map.width + x] = 1;
    const fill = floodFillArea(map, data, singleBrush(1), 0, 0);
    expect(fill.limit).toBe(cells);
    expect(fill.truncated).toBe(false);
    expect(fill.changes.length).toBe(cells - 19);
    const after = data.slice();
    for (const c of fill.changes) after[c.index] = c.value;
    expect(after.every((v) => v === 1)).toBe(true);
    // 한 칸도 두 번 나오지 않는다
    expect(new Set(fill.changes.map((c) => c.index)).size).toBe(fill.changes.length);
  });

  it("1024x1024 맵 전체도 한도에 닿지 않는다 (칸 수만큼 채우고 끝난다)", () => {
    const map = { width: 1024, height: 1024 };
    const data = new Array<number>(map.width * map.height).fill(0);
    const fill = floodFillArea(map, data, singleBrush(7), 1023, 1023);
    expect(fill.truncated).toBe(false);
    expect(fill.changes.length).toBe(1024 * 1024);
  });

  it("한도를 작게 주면 그만큼만 채우고 truncated다. 정확히 영역만큼이면 truncated가 아니다", () => {
    const map = { width: 5, height: 4 };
    const data = new Array<number>(20).fill(0);
    // 가운데 세로 벽: 왼쪽 영역은 2칸 폭 x 4줄 = 8칸
    for (let y = 0; y < 4; y++) data[y * 5 + 2] = 3;
    const cut = floodFillArea(map, data, singleBrush(1), 0, 0, 5);
    expect(cut).toMatchObject({ truncated: true, limit: 5 });
    expect(cut.changes).toHaveLength(5);
    const exact = floodFillArea(map, data, singleBrush(1), 0, 0, 8);
    expect(exact).toMatchObject({ truncated: false, limit: 8 });
    expect(exact.changes.map((c) => c.index).sort((a, b) => a - b)).toEqual([0, 1, 5, 6, 10, 11, 15, 16]);
    expect(floodFillArea(map, data, singleBrush(1), 0, 0).changes).toHaveLength(8);
  });

  it("무늬 붓은 시작 칸 기준 격자로 되풀이하고, floodFill은 바뀌는 칸만 돌려준다", () => {
    const map = { width: 4, height: 2 };
    const data = new Array<number>(8).fill(0);
    const brush: Brush = { width: 2, height: 1, gids: [[5, 6]] };
    const changes = floodFill(map, data, brush, 1, 0);
    const after = data.slice();
    for (const c of changes) after[c.index] = c.value;
    expect(after).toEqual([6, 5, 6, 5, 6, 5, 6, 5]);
    expect(floodFill(map, data, singleBrush(0), 0, 0)).toEqual([]);
    expect(floodFillArea(map, data, singleBrush(1), 9, 9)).toEqual({ changes: [], truncated: false, limit: 8 });
  });
});
