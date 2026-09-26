import { describe, expect, it } from "vitest";
import {
  clampZoom,
  clickSelection,
  dragPositions,
  fitRect,
  gridLines,
  backgroundAt,
  hitTest,
  mergeSelection,
  movedEnough,
  nextZoomStep,
  nudgeDelta,
  prevZoomStep,
  rectFromPoints,
  rectsIntersect,
  rectEncloses,
  rubberBandSelect,
  screenToWorld,
  snapPoint,
  worldToScreen,
  zoomAround,
  ZOOM_MAX,
  ZOOM_MIN,
} from "./geometry";

const t = { zoom: 2, panX: 100, panY: 50 };

describe("화면과 월드 변환", () => {
  it("world = (screen - pan) / zoom 이고 되돌리면 같다", () => {
    expect(screenToWorld(t, { x: 100, y: 50 })).toEqual({ x: 0, y: 0 });
    expect(screenToWorld(t, { x: 300, y: 250 })).toEqual({ x: 100, y: 100 });
    expect(worldToScreen(t, { x: 100, y: 100 })).toEqual({ x: 300, y: 250 });
    const p = { x: 37, y: -12 };
    expect(screenToWorld(t, worldToScreen(t, p))).toEqual(p);
  });

  it("커서 기준 줌은 커서 아래의 월드 점을 그 자리에 둔다", () => {
    const anchor = { x: 240, y: 180 };
    const before = screenToWorld(t, anchor);
    const next = zoomAround(t, 4, anchor);
    expect(next.zoom).toBe(4);
    const after = screenToWorld(next, anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("줌은 0.25 와 8 사이로 잘리고 단계를 오르내린다", () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(100)).toBe(ZOOM_MAX);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(nextZoomStep(1)).toBe(1.5);
    expect(nextZoomStep(8)).toBe(8);
    expect(prevZoomStep(1)).toBe(0.75);
    expect(prevZoomStep(0.25)).toBe(0.25);
    expect(nextZoomStep(1.2)).toBe(1.5);
    expect(prevZoomStep(1.2)).toBe(1);
  });

  it("카메라 맞추기는 사각형을 여백 안에 가운데로 넣는다", () => {
    const fit = fitRect({ width: 800, height: 600 }, { x: 0, y: 0, w: 768, h: 896 }, 24);
    expect(fit.zoom).toBeCloseTo((600 - 48) / 896);
    // 가운데: 사각형의 가운데가 뷰포트의 가운데
    const center = worldToScreen(fit, { x: 384, y: 448 });
    expect(center.x).toBeCloseTo(400);
    expect(center.y).toBeCloseTo(300);
  });
});

describe("스냅과 사각형", () => {
  it("가장 가까운 격자 점으로", () => {
    expect(snapPoint({ x: 13, y: 24 }, 16)).toEqual({ x: 16, y: 32 });
    expect(snapPoint({ x: 7, y: 8 }, 16)).toEqual({ x: 0, y: 16 });
    expect(snapPoint({ x: 7, y: 8 }, 0)).toEqual({ x: 7, y: 8 });
  });

  it("두 점에서 정규화된 사각형", () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 0, y: 5 })).toEqual({ x: 0, y: 5, w: 10, h: 15 });
  });

  it("교차는 넓이가 겹쳐야 하고, 0 크기 상자는 점처럼 본다", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectsIntersect(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsIntersect(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectsIntersect(a, { x: 5, y: 5, w: 0, h: 0 })).toBe(true);
    expect(rectsIntersect(a, { x: 11, y: 5, w: 0, h: 0 })).toBe(false);
  });
});

const targets = [
  { id: "bg", bounds: { x: 0, y: 0, w: 100, h: 100 } },
  { id: "player", bounds: { x: 40, y: 40, w: 20, h: 20 } },
  { id: "label", bounds: { x: 200, y: 200, w: 50, h: 10 } },
];

describe("맞히기와 선택", () => {
  it("겹치면 그리기 순서의 마지막이 이긴다", () => {
    expect(hitTest(targets, { x: 50, y: 50 })).toBe("player");
    expect(hitTest(targets, { x: 10, y: 10 })).toBe("bg");
    expect(hitTest(targets, { x: 150, y: 150 })).toBeNull();
    // 오른쪽 아래 모서리는 밖이다
    expect(hitTest(targets, { x: 100, y: 100 })).toBeNull();
  });

  it("상자 선택은 겹치는 것 전부", () => {
    expect(rubberBandSelect(targets, { x: 30, y: 30, w: 30, h: 30 })).toEqual(["bg", "player"]);
    expect(rubberBandSelect(targets, { x: 190, y: 190, w: 100, h: 100 })).toEqual(["label"]);
    expect(rubberBandSelect(targets, { x: 120, y: 120, w: 10, h: 10 })).toEqual([]);
  });

  it("배경 대상(타일맵)은 다른 것 뒤에 맞고, 고른 것만 누른 대상이 된다", () => {
    const withMap = [
      { id: "sprite", bounds: { x: 10, y: 10, w: 10, h: 10 } },
      { id: "map", bounds: { x: 0, y: 0, w: 320, h: 192 }, background: true },
      { id: "top", bounds: { x: 300, y: 0, w: 10, h: 10 } },
    ];
    // 배경이 그리기 순서로 위에 있어도 다른 것이 먼저
    expect(hitTest(withMap, { x: 15, y: 15 })).toBe("sprite");
    expect(hitTest(withMap, { x: 305, y: 5 })).toBe("top");
    // 고르지 않은 배경은 누른 대상이 아니다 (상자 선택이 시작된다). 따로 찾을 수 있다
    expect(hitTest(withMap, { x: 100, y: 100 })).toBeNull();
    expect(backgroundAt(withMap, { x: 100, y: 100 })).toBe("map");
    expect(backgroundAt(withMap, { x: 400, y: 100 })).toBeNull();
    // 고른 배경은 누르면 끌 수 있다. 그 위의 다른 것은 여전히 먼저
    expect(hitTest(withMap, { x: 100, y: 100 }, new Set(["map"]))).toBe("map");
    expect(hitTest(withMap, { x: 15, y: 15 }, new Set(["map"]))).toBe("sprite");
  });

  it("상자 선택은 배경 대상을 상자 안에 다 들어올 때만 넣는다", () => {
    const withMap = [
      { id: "map", bounds: { x: 0, y: 0, w: 100, h: 100 }, background: true },
      { id: "sprite", bounds: { x: 40, y: 40, w: 10, h: 10 } },
    ];
    expect(rubberBandSelect(withMap, { x: 30, y: 30, w: 30, h: 30 })).toEqual(["sprite"]);
    expect(rubberBandSelect(withMap, { x: -1, y: -1, w: 102, h: 102 })).toEqual(["map", "sprite"]);
    expect(rubberBandSelect(withMap, { x: 0, y: 0, w: 100, h: 100 })).toEqual(["map", "sprite"]);
    expect(rectEncloses({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 11 })).toBe(false);
  });

  it("상자 선택 합치기: Shift 는 더하고 아니면 바꾼다", () => {
    expect(mergeSelection(["label"], ["bg"], false)).toEqual(["bg"]);
    expect(mergeSelection(["label"], ["bg", "label"], true).sort()).toEqual(["bg", "label"]);
  });

  it("클릭 선택: 빈 곳은 비우고, Shift 는 토글, 선택된 것을 다시 누르면 그대로", () => {
    expect(clickSelection(["bg"], null, false)).toEqual([]);
    expect(clickSelection(["bg"], null, true)).toEqual(["bg"]);
    expect(clickSelection(["bg"], "player", false)).toEqual(["player"]);
    expect(clickSelection(["bg", "player"], "player", false).sort()).toEqual(["bg", "player"]);
    expect(clickSelection(["bg"], "player", true).sort()).toEqual(["bg", "player"]);
    expect(clickSelection(["bg", "player"], "player", true)).toEqual(["bg"]);
  });
});

describe("끌기와 방향키", () => {
  const starts = [
    { id: "a", x: 10, y: 10 },
    { id: "b", x: 25, y: 40 },
  ];

  it("스냅이 꺼져 있으면 변위를 그대로 더한다", () => {
    expect(dragPositions(starts, { x: 3, y: -2 }, "a", false, 16)).toEqual([
      { id: "a", x: 13, y: 8 },
      { id: "b", x: 28, y: 38 },
    ]);
  });

  it("스냅은 기준 오브젝트의 위치에 걸고 나머지는 같은 변위를 따른다", () => {
    const moved = dragPositions(starts, { x: 3, y: 3 }, "a", true, 16);
    expect(moved[0]).toEqual({ id: "a", x: 16, y: 16 });
    // b 는 a 와 같은 변위 (+6, +6) 라 상대 위치가 유지된다
    expect(moved[1]).toEqual({ id: "b", x: 31, y: 46 });
  });

  it("기준이 없으면 첫 오브젝트가 기준이다", () => {
    const moved = dragPositions(starts, { x: 0, y: 0 }, null, true, 16);
    expect(moved[0]).toEqual({ id: "a", x: 16, y: 16 });
  });

  it("끌기 문턱", () => {
    expect(movedEnough({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
    expect(movedEnough({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(true);
  });

  it("방향키는 1px, Shift 로 10px", () => {
    expect(nudgeDelta("ArrowLeft", false)).toEqual({ x: -1, y: 0 });
    expect(nudgeDelta("ArrowDown", true)).toEqual({ x: 0, y: 10 });
    expect(nudgeDelta("Enter", false)).toBeNull();
  });
});

describe("격자 선", () => {
  it("보이는 영역만 긋고 10칸마다 굵은 선", () => {
    const lines = gridLines({ zoom: 1, panX: 0, panY: 0 }, { width: 100, height: 50 }, 10);
    expect(lines.major.xs).toEqual([0, 100]);
    expect(lines.minor.xs).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(lines.major.ys).toEqual([0]);
    expect(lines.minor.ys).toEqual([10, 20, 30, 40, 50]);
  });

  it("팬이 음수면 그 앞의 선부터", () => {
    const lines = gridLines({ zoom: 1, panX: -25, panY: 0 }, { width: 50, height: 10 }, 10);
    expect(lines.minor.xs).toEqual([20, 30, 40, 50, 60, 70]);
  });

  it("너무 촘촘하면 굵은 선만, 그것도 촘촘하면 아무것도", () => {
    const sparse = gridLines({ zoom: 0.25, panX: 0, panY: 0 }, { width: 100, height: 10 }, 16);
    expect(sparse.minor.xs).toEqual([]);
    expect(sparse.major.xs).toEqual([0, 160, 320]);
    const none = gridLines({ zoom: 0.25, panX: 0, panY: 0 }, { width: 100, height: 10 }, 1);
    expect(none.major.xs).toEqual([]);
  });
});
