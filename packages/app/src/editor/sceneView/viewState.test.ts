import { describe, expect, it } from "vitest";
import { DEFAULT_VIEW_SETTINGS, SCENE_VIEW_KEY, SceneViewState } from "./viewState";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("씬 뷰 보기 설정", () => {
  it("저장소가 비어 있으면 기본값이다", () => {
    const s = new SceneViewState(memoryStorage());
    expect(s.toJSON()).toEqual(DEFAULT_VIEW_SETTINGS);
  });

  it("바꾸면 localStorage 한 키에 남고 다시 만들면 읽는다", () => {
    const storage = memoryStorage();
    const s = new SceneViewState(storage);
    s.toggleGrid();
    s.toggleSnap();
    s.setGridSize(32);
    s.setZoom(2);
    expect(JSON.parse(storage.map.get(SCENE_VIEW_KEY)!)).toEqual({ grid: false, gridSize: 32, snap: true, zoom: 2 });
    s.dispose();
    const again = new SceneViewState(storage);
    expect(again.toJSON()).toEqual({ grid: false, gridSize: 32, snap: true, zoom: 2 });
  });

  it("깨진 값과 이상한 값은 기본값으로 돌아간다", () => {
    expect(new SceneViewState(memoryStorage({ [SCENE_VIEW_KEY]: "{not json" })).toJSON()).toEqual(DEFAULT_VIEW_SETTINGS);
    const odd = new SceneViewState(memoryStorage({ [SCENE_VIEW_KEY]: JSON.stringify({ grid: "yes", gridSize: -3, snap: 1, zoom: 100 }) }));
    expect(odd.grid).toBe(true);
    expect(odd.gridSize).toBe(DEFAULT_VIEW_SETTINGS.gridSize);
    expect(odd.snap).toBe(false);
    expect(odd.zoom).toBe(8);
  });

  it("줌은 0.25 와 8 사이로 잘리고 단계로 오르내리며 초기화는 1", () => {
    const s = new SceneViewState(memoryStorage());
    s.setZoom(0.001);
    expect(s.zoom).toBe(0.25);
    s.setZoom(50);
    expect(s.zoom).toBe(8);
    s.zoomIn();
    expect(s.zoom).toBe(8);
    s.resetZoom();
    expect(s.zoom).toBe(1);
    s.zoomIn();
    expect(s.zoom).toBe(1.5);
    s.zoomOut();
    s.zoomOut();
    expect(s.zoom).toBe(0.75);
    s.setZoom(0.25);
    s.zoomOut();
    expect(s.zoom).toBe(0.25);
  });

  it("격자 크기는 1 이상의 정수만", () => {
    const s = new SceneViewState(memoryStorage());
    s.setGridSize(0);
    expect(s.gridSize).toBe(DEFAULT_VIEW_SETTINGS.gridSize);
    s.setGridSize(24.4);
    expect(s.gridSize).toBe(24);
  });

  it("저장소 없이도 동작한다", () => {
    const s = new SceneViewState(null);
    s.toggleGrid();
    expect(s.grid).toBe(false);
  });
});
