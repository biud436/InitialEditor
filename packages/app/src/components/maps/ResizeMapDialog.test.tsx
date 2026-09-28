// @vitest-environment jsdom
import { MemoryBackend } from "@initial-editor/core/testing";
import { MapDocument } from "@initial-editor/ext-tilemap/model";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { previewResize, type ResizeRequest } from "../../editor/maps/resize";
import { ResizeMapForm } from "./ResizeMapDialog";

afterEach(cleanup);

const MAP_PATH = "resources/maps/sample.json";
const MAP = JSON.stringify({
  version: 2,
  name: "sample",
  width: 20,
  height: 12,
  tileWidth: 16,
  tileHeight: 16,
  layers: [{ name: "ground", data: new Array(240).fill(1) }],
  tilesets: [],
  objects: [
    { id: "start", type: "start", x: 24, y: 160 },
    { id: "slime_1", type: "spawn", x: 280, y: 160 },
    { id: "sign_1", type: "landmark", x: 150, y: 0, width: 32 },
  ],
});

async function setup() {
  const be = new MemoryBackend({ [MAP_PATH]: MAP });
  await be.open("/p");
  const doc = await MapDocument.open(be, MAP_PATH);
  const submitted: ResizeRequest[] = [];
  let cancelled = 0;
  render(
    <ResizeMapForm
      width={20}
      height={12}
      tileWidth={16}
      tileHeight={16}
      preview={(req) => previewResize(doc, req)}
      onSubmit={(r) => submitted.push(r)}
      onCancel={() => cancelled++}
    />,
  );
  return { doc, submitted, ok: screen.getByTestId("resize-ok") as HTMLButtonElement, cancelled: () => cancelled };
}

const type = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } });
const cell = (anchor: string) => document.querySelector(`[data-testid="resize-anchor-cell"][data-anchor="${anchor}"]`) as HTMLButtonElement;

describe("크기 바꾸기 대화상자", () => {
  it("지금 크기를 보이고, 같은 크기면 막는다", async () => {
    const { ok } = await setup();
    expect(screen.getByTestId("resize-current").textContent).toBe("20x12 타일 (320x192 px)");
    expect((screen.getByTestId("resize-width") as HTMLInputElement).value).toBe("20");
    expect(ok.disabled).toBe(true);
    expect(screen.queryByTestId("resize-summary")).toBeNull();
  });

  it("기준점 아홉 칸 중 하나만 고르고, 처음은 왼쪽 위", async () => {
    await setup();
    const cells = screen.getAllByTestId("resize-anchor-cell");
    expect(cells.map((c) => c.getAttribute("data-anchor"))).toEqual(["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"]);
    expect(cells.filter((c) => c.getAttribute("aria-checked") === "true").map((c) => c.getAttribute("aria-label"))).toEqual(["왼쪽 위"]);
    fireEvent.click(cell("bottom-right"));
    expect(cell("bottom-right").getAttribute("aria-checked")).toBe("true");
    expect(cell("top-left").getAttribute("aria-checked")).toBe("false");
  });

  it("미리 보기: 옮김, 잘림, 맵 밖으로 나가는 오브젝트", async () => {
    await setup();
    type("resize-width", "24");
    type("resize-height", "16");
    fireEvent.click(cell("center"));
    const summary = screen.getByTestId("resize-summary");
    expect(summary.getAttribute("data-dx")).toBe("2");
    expect(summary.getAttribute("data-dy")).toBe("2");
    expect(summary.textContent).toBe("내용 이동 x +2, y +2 (타일)");
    type("resize-width", "10");
    fireEvent.click(cell("top-left"));
    expect(screen.getByTestId("resize-summary").textContent).toContain("줄어드는 쪽의 타일이 잘립니다");
    expect(screen.getByTestId("resize-outside").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("resize-outside").textContent).toContain("slime_1");
    // 띠 sign_1은 x 150이라 안이고 끝 182가 새 폭 160을 넘는다
    expect(screen.getByTestId("resize-partly").getAttribute("data-count")).toBe("1");
    expect(screen.getByTestId("resize-partly").textContent).toBe("영역이나 범위가 맵 밖으로 일부 나가는 오브젝트 1개: sign_1");
    type("resize-width", "12");
    expect(screen.queryByTestId("resize-partly")).toBeNull();
  });

  it("잘못된 크기는 막고 이유를 보인다", async () => {
    const { ok } = await setup();
    type("resize-width", "2000");
    expect(screen.getByTestId("resize-problem").textContent).toBe("너비: 1 이상 1024 이하여야 합니다");
    expect(ok.disabled).toBe(true);
    type("resize-width", "20");
    type("resize-height", "abc");
    expect(screen.getByTestId("resize-problem").textContent).toBe("높이: 정수여야 합니다");
  });

  it("바꾸기를 누르면 새 크기와 기준점을 넘긴다", async () => {
    const { ok, submitted, doc } = await setup();
    type("resize-width", "30");
    fireEvent.click(cell("right"));
    fireEvent.click(ok);
    expect(submitted).toEqual([{ width: 30, height: 12, anchor: "right" }]);
    // 대화상자는 모델을 고치지 않는다
    expect(doc.model.width).toBe(20);
  });
});
