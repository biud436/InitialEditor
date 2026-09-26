// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { NewMapSpec } from "../../editor/maps/newMap";
import { defaultTileset, NEW_MAP_NO_TILESET, NewMapForm, type NewMapSource } from "./NewMapDialog";

afterEach(cleanup);

const SIZES: Record<string, { width: number; height: number }> = {
  "resources/images/checker.png": { width: 8, height: 8 },
  "resources/tiles/meadow16.png": { width: 136, height: 64 },
};

function source(images = Object.keys(SIZES), maps = ["resources/maps/meadow.json"]): NewMapSource {
  return {
    listImages: async () => images,
    listMaps: async () => maps,
    imageSize: async (path) => {
      const size = SIZES[path];
      if (!size) throw new Error("읽지 못했다");
      return size;
    },
  };
}

async function setup(src = source()) {
  const submitted: NewMapSpec[] = [];
  let cancelled = 0;
  render(<NewMapForm source={src} onSubmit={(s) => submitted.push(s)} onCancel={() => cancelled++} />);
  const ok = screen.getByTestId("new-map-ok") as HTMLButtonElement;
  return { submitted, ok, cancelled: () => cancelled };
}

const input = (id: string) => screen.getByTestId(id) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });

describe("새 맵 대화상자", () => {
  it("처음 타일셋은 tiles 폴더의 것", () => {
    expect(defaultTileset(["resources/images/a.png", "resources/tiles/b.png"])).toBe("resources/tiles/b.png");
    expect(defaultTileset(["resources/images/a.png"])).toBe("resources/images/a.png");
    expect(defaultTileset([])).toBe("");
  });

  it("목록을 읽고 기본값을 채우며, 이름을 적어야 만들 수 있다", async () => {
    const { ok } = await setup();
    await waitFor(() => expect(screen.getByTestId("new-map-columns")).toBeTruthy());
    expect((screen.getByTestId("new-map-tileset") as HTMLSelectElement).value).toBe("resources/tiles/meadow16.png");
    expect(screen.getByTestId("new-map-columns").getAttribute("data-columns")).toBe("8");
    expect(screen.getByTestId("new-map-columns").textContent).toBe("136x64 px, 8열 4행 (오른쪽 8px는 쓰지 않는다)");
    expect(input("new-map-width").value).toBe("20");
    expect(input("new-map-height").value).toBe("15");
    expect(input("new-map-tile").value).toBe("16");
    expect(input("new-map-layers").value).toBe("ground, deco");
    expect(input("new-map-collision").checked).toBe(true);
    // 이름이 비었으면 막지만 오류로 보이지는 않는다
    expect(ok.disabled).toBe(true);
    expect(screen.queryByTestId("new-map-problem")).toBeNull();
    type("new-map-name", "stage1");
    expect(ok.disabled).toBe(false);
    expect(screen.getByTestId("new-map-path").textContent).toBe("resources/maps/stage1.json으로 만든다");
  });

  it("이미 있는 이름, 잘못된 크기, 겹치는 레이어는 막고 이유를 보인다", async () => {
    const { ok } = await setup();
    await waitFor(() => expect(screen.getByTestId("new-map-columns")).toBeTruthy());
    type("new-map-name", "Meadow");
    expect(screen.getByTestId("new-map-problem").textContent).toBe("이미 있다: resources/maps/Meadow.json");
    expect(ok.disabled).toBe(true);
    type("new-map-name", "stage1");
    type("new-map-width", "0");
    expect(screen.getByTestId("new-map-problem").textContent).toBe("폭은 1 이상 1024 이하다");
    type("new-map-width", "30");
    type("new-map-layers", "a, a");
    expect(screen.getByTestId("new-map-problem").textContent).toBe("레이어 이름이 겹친다: a");
    type("new-map-layers", "a, b");
    type("new-map-tile", "x");
    expect(screen.getByTestId("new-map-problem").textContent).toBe("타일 크기는 정수다");
    expect(ok.disabled).toBe(true);
  });

  it("타일 크기를 바꾸면 열 수가 바뀌고, 그림이 타일보다 작으면 막는다", async () => {
    const { ok } = await setup();
    await waitFor(() => expect(screen.getByTestId("new-map-columns")).toBeTruthy());
    type("new-map-name", "stage1");
    type("new-map-tile", "32");
    expect(screen.getByTestId("new-map-columns").getAttribute("data-columns")).toBe("4");
    fireEvent.change(screen.getByTestId("new-map-tileset"), { target: { value: "resources/images/checker.png" } });
    await waitFor(() => expect(screen.getByTestId("new-map-problem").textContent).toBe("그림(8x8)이 타일 크기보다 작다"));
    expect(ok.disabled).toBe(true);
    type("new-map-tile", "8");
    expect(ok.disabled).toBe(false);
    expect(screen.getByTestId("new-map-columns").getAttribute("data-columns")).toBe("1");
  });

  it("그림을 읽지 못하면 이유를 보이고 막는다", async () => {
    const { ok } = await setup(source(["resources/tiles/broken.png"]));
    type("new-map-name", "stage1");
    await waitFor(() => expect(screen.getByTestId("new-map-problem").textContent).toBe("그림을 읽지 못했다: 읽지 못했다"));
    expect(ok.disabled).toBe(true);
  });

  it("만들기를 누르면 받은 값을 넘긴다", async () => {
    const { ok, submitted } = await setup();
    await waitFor(() => expect(screen.getByTestId("new-map-columns")).toBeTruthy());
    type("new-map-name", " 숲_2 ");
    type("new-map-width", "64");
    type("new-map-height", "28");
    type("new-map-layers", "ground, deco, over");
    fireEvent.click(input("new-map-collision"));
    await act(async () => {
      fireEvent.click(ok);
    });
    expect(submitted).toEqual([
      { name: "숲_2", width: 64, height: 28, tileSize: 16, tileset: { image: "resources/tiles/meadow16.png", columns: 8 }, layers: ["ground", "deco", "over"], collision: false },
    ]);
  });

  it("프로젝트에 PNG가 없으면 만들지 않고 이유를 보인다 (엔진은 타일셋 없는 맵을 읽지 않는다)", async () => {
    const { ok, submitted } = await setup(source([], []));
    await waitFor(() => expect(screen.getByTestId("new-map-no-images").textContent).toBe("resources 아래에 PNG가 없다"));
    // 이름을 적기 전에도 이유가 보인다
    expect(screen.getByTestId("new-map-problem").textContent).toBe(NEW_MAP_NO_TILESET);
    type("new-map-name", "empty");
    expect(screen.getByTestId("new-map-problem").textContent).toBe(NEW_MAP_NO_TILESET);
    expect(ok.disabled).toBe(true);
    fireEvent.click(ok);
    fireEvent.submit(screen.getByTestId("new-map-dialog"));
    expect(submitted).toEqual([]);
  });
});
