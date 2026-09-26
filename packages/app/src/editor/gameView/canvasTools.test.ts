import { describe, expect, it } from "vitest";
import { fitScale, gridDifference, pixelStats, STATS_GRID } from "./canvasTools";

describe("fitScale", () => {
  const game = { width: 320, height: 240 };

  it("들어가면 정수 배율로 키운다", () => {
    expect(fitScale({ width: 320, height: 240 }, game)).toBe(1);
    expect(fitScale({ width: 700, height: 500 }, game)).toBe(2);
    expect(fitScale({ width: 1000, height: 2000 }, game)).toBe(3);
  });

  it("패널이 작으면 비율을 지켜 줄인다", () => {
    expect(fitScale({ width: 160, height: 480 }, game)).toBe(0.5);
    expect(fitScale({ width: 300, height: 1000 }, { width: 768, height: 896 })).toBe(0.39);
  });

  it("아직 재지 못했으면 1", () => {
    expect(fitScale({ width: 0, height: 0 }, game)).toBe(1);
    expect(fitScale({ width: -16, height: -16 }, game)).toBe(1);
  });
});

describe("pixelStats", () => {
  it("가장 많은 색을 배경으로 보고 나머지를 센다", () => {
    // 2x2: 검정 셋, 주황 하나
    const data = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 240, 176, 64, 255, 0, 0, 0, 255]);
    const stats = pixelStats(data, 2, 2);
    expect(stats).toMatchObject({ width: 2, height: 2, dominantShare: 0.75, nonBackground: 1, distinctColors: 2 });
    expect(stats.grid).toHaveLength(STATS_GRID * STATS_GRID);
  });

  it("칸별 밝기로 두 화면의 차이를 잰다", () => {
    const size = 32;
    const black = new Uint8ClampedArray(size * size * 4);
    const white = new Uint8ClampedArray(size * size * 4).fill(255);
    const a = pixelStats(black, size, size);
    const b = pixelStats(white, size, size);
    expect(gridDifference(a, a)).toBe(0);
    expect(gridDifference(a, b)).toBe(255);
    // 왼쪽 절반만 흰색이면 차이는 절반
    const half = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size / 2; x++) half.fill(255, (y * size + x) * 4, (y * size + x) * 4 + 4);
    expect(gridDifference(a, pixelStats(half, size, size))).toBe(127.5);
  });
});
