// @vitest-environment jsdom
// 맵 가져오기 대화상자: 폴더 고르기, 맞지 않는 폴더, 항목과 처음 고른 항목, 선택지를 바꾸면 다시 읽기, 가져오기와 진행.
import type { ImportSource, MapImporterSpec, MapImportItem, MapImportPlan, MapImportResult } from "@initial-editor/ext-tilemap";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sourceFromFiles } from "../../editor/maps/importMaps";
import { defaultSelection, ImportMapForm, type ImportMapSource } from "./ImportMapDialog";

afterEach(cleanup);

const item = (id: string, extra: Partial<MapImportItem> = {}): MapImportItem => ({ id, label: `MAP000${id}`, detail: "20x15", target: `resources/maps/map000${id}.json`, exists: false, problems: [], notes: [], ...extra });

function setup() {
  const plans: Array<Record<string, string>> = [];
  const runs: string[][] = [];
  let finish: ((r: MapImportResult) => void) | null = null;
  let progress: ((done: number, total: number) => void) | null = null;
  const importer: MapImporterSpec = {
    id: "game",
    label: "게임",
    description: "게임 폴더를 고릅니다.",
    options: [{ id: "encoding", label: "텍스트 인코딩", choices: [{ value: "auto", label: "자동" }, { value: "x", label: "X" }], default: "auto" }],
    accepts: (s) => s.paths.some((p) => p.endsWith("game.dat")),
    plan: async () => {
      throw new Error("쓰지 않는다");
    },
  };
  const source: ImportMapSource = {
    importers: () => [importer],
    plan: async (_i, _s, options) => {
      plans.push({ ...options });
      const plan: MapImportPlan = {
        title: options.encoding === "x" ? "게임 X" : "게임",
        notes: [`인코딩 ${options.encoding}`],
        items: [item("1", { notes: ["이벤트 3개"] }), item("2", { exists: true }), item("3", { problems: ["ChipSet 없음"] })],
        run: async () => ({ maps: [], files: [], notes: [] }),
      };
      return plan;
    },
    run: (_plan, ids, p) => {
      runs.push([...ids]);
      progress = p;
      return new Promise((resolve) => (finish = resolve));
    },
  };
  const done: MapImportResult[] = [];
  render(<ImportMapForm source={source} onDone={(r) => done.push(r)} onCancel={() => {}} />);
  return { plans, runs, done, finish: (r: MapImportResult) => finish!(r), progress: (d: number, t: number) => progress!(d, t) };
}

// jsdom 의 File 에는 arrayBuffer 가 없어 붙인다 (브라우저에는 있다)
const file = (path: string) => {
  const f = new File([new Uint8Array([1])], path.slice(path.lastIndexOf("/") + 1));
  Object.defineProperty(f, "webkitRelativePath", { value: path });
  Object.defineProperty(f, "arrayBuffer", { value: async () => new Uint8Array([1]).buffer });
  return f;
};

function pick(paths: string[]) {
  fireEvent.change(screen.getByTestId("import-map-folder-input"), { target: { files: paths.map(file) } });
}

describe("맵 가져오기 대화상자", () => {
  it("고른 폴더의 파일은 폴더 기준 경로다", async () => {
    const source = sourceFromFiles([file("Game/game.dat"), file("Game/Maps/a.map")]) as ImportSource;
    expect(source.name).toBe("Game");
    expect(source.paths).toEqual(["Game/game.dat", "Game/Maps/a.map"]);
    expect(await source.read("Game/Maps/a.map")).toEqual(new Uint8Array([1]));
    await expect(source.read("Game/none")).rejects.toThrow(/선택한 폴더에 없는 파일/);
    expect(sourceFromFiles([])).toBeNull();
  });

  it("처음 고르는 항목은 가져올 수 있고 아직 없는 것이다", () => {
    const plan = { title: "", notes: [], items: [item("1"), item("2", { exists: true }), item("3", { problems: ["x"] })], run: async () => ({ maps: [], files: [], notes: [] }) };
    expect([...defaultSelection(plan)]).toEqual(["1"]);
  });

  it("맞지 않는 폴더는 형식의 설명과 함께 알린다", async () => {
    setup();
    expect(screen.getByTestId("import-map-folder-name").textContent).toBe("선택한 폴더 없음");
    pick(["Other/readme.txt"]);
    expect(screen.getByTestId("import-map-error").textContent).toBe("게임 폴더가 아닙니다. 게임 폴더를 고릅니다.");
    expect((screen.getByTestId("import-map-ok") as HTMLButtonElement).disabled).toBe(true);
  });

  it("항목을 보이고, 선택지를 바꾸면 다시 읽되 고른 항목은 그대로다. 가져오는 동안 진행을 보인다", async () => {
    const t = setup();
    pick(["Game/game.dat", "Game/a.map"]);
    await waitFor(() => expect(screen.getByTestId("import-map-title").textContent).toBe("게임"));
    expect(screen.getByTestId("import-map-folder-name").textContent).toBe("Game (파일 2개)");
    expect(screen.getByTestId("import-map-count").textContent).toBe("맵 3개 가운데 1개 선택");
    const rows = screen.getAllByTestId("import-map-item");
    expect(rows.map((r) => (r.querySelector("input") as HTMLInputElement).checked)).toEqual([true, false, false]);
    expect((rows[2].querySelector("input") as HTMLInputElement).disabled).toBe(true);
    expect(rows[2].textContent).toContain("ChipSet 없음");
    expect(rows[1].textContent).toContain("이미 있는 파일");
    // 이미 있는 맵을 고르면 덮어쓴다고 보인다
    fireEvent.click(rows[1].querySelector("input")!);
    expect(rows[1].textContent).toContain("이미 있는 파일을 덮어씁니다");
    expect(screen.getByTestId("import-map-ok").textContent).toBe("맵 2개 가져오기");

    fireEvent.change(screen.getByTestId("import-map-option-encoding"), { target: { value: "x" } });
    await waitFor(() => expect(screen.getByTestId("import-map-title").textContent).toBe("게임 X"));
    expect(t.plans).toEqual([{ encoding: "auto" }, { encoding: "x" }]);
    expect(screen.getByTestId("import-map-count").textContent).toBe("맵 3개 가운데 2개 선택");

    fireEvent.click(screen.getByTestId("import-map-ok"));
    expect(t.runs).toEqual([["1", "2"]]);
    expect(screen.getByTestId("import-map-progress").textContent).toBe("가져오는 중 (0/2)");
    expect((screen.getByTestId("import-map-ok") as HTMLButtonElement).disabled).toBe(true);
    act(() => t.progress(1, 2));
    expect(screen.getByTestId("import-map-progress").textContent).toBe("가져오는 중 (1/2)");
    const result = { maps: ["resources/maps/map0001.json"], files: [], notes: [] };
    await act(async () => t.finish(result));
    expect(t.done).toEqual([result]);
  });

  it("전체 선택은 가져올 수 있는 항목만 고르고 다시 누르면 모두 푼다", async () => {
    setup();
    pick(["Game/game.dat"]);
    await waitFor(() => expect(screen.getByTestId("import-map-items")).toBeTruthy());
    fireEvent.click(screen.getByTestId("import-map-all"));
    expect(screen.getByTestId("import-map-count").textContent).toBe("맵 3개 가운데 2개 선택");
    fireEvent.click(screen.getByTestId("import-map-all"));
    expect(screen.getByTestId("import-map-count").textContent).toBe("맵 3개 가운데 0개 선택");
    expect(screen.getByTestId("import-map-ok").textContent).toBe("가져오기");
  });
});
