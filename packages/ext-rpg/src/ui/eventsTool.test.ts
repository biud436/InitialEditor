// 이벤트 도구 (e5 문서 3절): 클릭 고르기, 끌어 옮기기(한 단계, 놓을 수 없으면 제자리), 구역 가장자리, 더블클릭 놓기,
// Delete, Ctrl+C/V/D (확장의 클립보드), 방향키, Enter, Escape, 상자 선택, 잠긴 레이어. 진짜 port_town 픽스처로 본다.
import type { MapLayerPointer, MapLayerToolContext } from "@initial-editor/ext-tilemap";
import { bigIntValue } from "@initial-editor/ext-tilemap/model";
import { describe, expect, it } from "vitest";
import { field } from "../model/json";
import { fixtureSources, layerHarness, PORT_TOWN, stateOf } from "../testing/layerHarness";
import { EventClipboard } from "./eventClipboard";
import { EventsTool } from "./eventsTool";

function setup(opts: { lockPort?: boolean } = {}) {
  const sources = fixtureSources();
  if (opts.lockPort) {
    const game = sources.game!;
    sources.set({ game: { ...game, maps: game.maps.map((m) => (m.name === "port_town" ? { ...m, alt: ["resources/maps/port_town_rtp.json"] } : m)) } });
  }
  const h = layerHarness({ sources });
  const doc = h.open(PORT_TOWN);
  const st = stateOf(doc);
  const notices: string[] = [];
  let changes = 0;
  const ctx: MapLayerToolContext = { document: doc, zoom: () => 1, changed: () => void changes++, notice: (m) => void notices.push(m) };
  const clipboard = new EventClipboard(null);
  const tool = new EventsTool(ctx, clipboard);
  const tw = doc.model.tileWidth;
  const th = doc.model.tileHeight;
  const at = (x: number, y: number, extra: Partial<MapLayerPointer> = {}): MapLayerPointer => ({
    world: { x: x * tw + tw / 2, y: y * th + th / 2 },
    cell: { x, y },
    button: 0,
    shift: false,
    alt: false,
    mod: false,
    ...extra,
  });
  const idx = (id: string) => st.section.indexOfId(id);
  const cellOf = (id: string) => {
    const ev = st.section.list[idx(id)];
    return [field(ev, "x"), field(ev, "y")];
  };
  const key = (k: string, extra: { shift?: boolean; alt?: boolean; mod?: boolean } = {}) => tool.keyDown({ key: k, shift: false, alt: false, mod: false, ...extra });
  const click = (x: number, y: number, extra: Partial<MapLayerPointer> = {}) => {
    tool.pointerDown(at(x, y, extra));
    tool.pointerUp(at(x, y, extra));
  };
  const drag = (from: [number, number], to: [number, number], extra: Partial<MapLayerPointer> = {}) => {
    tool.pointerDown(at(from[0], from[1], extra));
    tool.pointerMove(at(to[0], to[1], extra));
    tool.pointerUp(at(to[0], to[1], extra));
  };
  return { h, doc, st, tool, notices, clipboard, at, idx, cellOf, key, click, drag, changes: () => changes, tw, th };
}

describe("고르기", () => {
  it("클릭은 그 칸의 이벤트를 고르고, 빈 곳 클릭은 푼다. Shift 와 Ctrl 은 더하고 뺀다", () => {
    const t = setup();
    t.click(14, 40);
    expect(t.st.selected).toEqual([t.idx("crates")]);
    t.click(19, 34, { shift: true });
    expect(t.st.selected).toEqual([t.idx("crates"), t.idx("bench")].sort((a, b) => a - b));
    t.click(14, 40, { mod: true });
    expect(t.st.selected).toEqual([t.idx("bench")]);
    t.click(2, 2);
    expect(t.st.selected).toEqual([]);
    expect(t.doc.undo.depth).toBe(0);
  });

  it("외형이 있는 이벤트는 머리(윗 칸으로 올라간 프레임)를 눌러도 골라진다", () => {
    const t = setup();
    // keeper 는 18,13 이고 24x32 프레임이 18,12 칸의 아래 절반까지 올라간다
    t.tool.pointerDown({ ...t.at(18, 12), world: { x: 18 * t.tw + 8, y: 12 * t.th + 10 } });
    expect(t.st.selected).toEqual([t.idx("keeper")]);
  });

  it("빈 곳에서 끌면 상자 안의 이벤트를 고른다 (Shift 는 더한다)", () => {
    const t = setup();
    t.drag([12, 33], [19, 37]);
    const ids = t.st.selected.map((i) => field(t.st.section.list[i], "id")).sort();
    expect(ids).toEqual(["bench", "fishmonger", "notice", "well"]);
    t.drag([13, 28], [14, 29], { shift: true });
    expect(t.st.selected.map((i) => field(t.st.section.list[i], "id")).sort()).toEqual(["bench", "fishmonger", "inn_door", "inn_sign", "notice", "well"]);
    expect(t.st.drag).toBeNull();
  });

  it("Ctrl+A 는 모두 고르고, Escape 는 고르기를 푼다 (고른 것이 없으면 넘긴다)", () => {
    const t = setup();
    expect(t.key("a", { mod: true })).toBe(true);
    expect(t.st.selected).toHaveLength(17);
    expect(t.key("Escape")).toBe(true);
    expect(t.st.selected).toEqual([]);
    expect(t.key("Escape")).toBe(false);
  });
});

describe("옮기기", () => {
  it("끌기는 미리보기만 하다가 놓을 때 명령 하나로 옮긴다 (되돌리기 한 단계, 되돌리면 그대로)", () => {
    const t = setup();
    const before = t.doc.text();
    t.tool.pointerDown(t.at(19, 34));
    t.tool.pointerMove(t.at(18, 34));
    t.tool.pointerMove(t.at(18, 35));
    expect(t.st.drag).toEqual({ kind: "move", indices: [t.idx("bench")], dx: -1, dy: 1, ok: true, keepArea: false });
    expect(t.doc.undo.depth).toBe(0);
    expect(t.tool.busy()).toBe(true);
    expect(t.tool.cursor()).toBe("grabbing");
    t.tool.pointerUp(t.at(18, 35));
    expect(t.cellOf("bench")).toEqual([18, 35]);
    expect(t.doc.undo.depth).toBe(1);
    expect(t.st.drag).toBeNull();
    expect(t.tool.busy()).toBe(false);
    t.doc.undo.undo();
    expect(t.doc.text()).toBe(before);
  });

  it("놓을 수 없는 칸(같은 칸의 action)이면 미리보기가 거절 표시이고 놓아도 제자리다", () => {
    const t = setup();
    t.tool.pointerDown(t.at(19, 34));
    t.tool.pointerMove(t.at(18, 36));
    expect(t.st.drag).toMatchObject({ kind: "move", ok: false });
    t.tool.pointerUp(t.at(18, 36));
    expect(t.cellOf("bench")).toEqual([19, 34]);
    expect(t.doc.undo.depth).toBe(0);
    expect(t.notices.at(-1)).toMatch(/^이 타일로 이동할 수 없어 원래 위치를 유지합니다: .*같은 타일\(18,36\)/);
  });

  it("배회하는 이벤트는 구역도 함께 옮기고, Alt 를 누르고 끌면 구역은 둔다", () => {
    const t = setup();
    const area = () => field(field(t.st.section.list[t.idx("kid")], "wander"), "area");
    t.drag([14, 20], [15, 21]);
    expect(area()).toEqual({ x: 14, y: 20, w: 6, h: 6 });
    t.drag([15, 21], [16, 21], { alt: true });
    expect(t.cellOf("kid")).toEqual([16, 21]);
    expect(area()).toEqual({ x: 14, y: 20, w: 6, h: 6 });
    expect(t.doc.undo.depth).toBe(2);
  });

  it("고른 여럿을 함께 끈다", () => {
    const t = setup();
    t.click(19, 34);
    t.click(18, 36, { shift: true });
    t.drag([19, 34], [19, 33]);
    expect(t.cellOf("bench")).toEqual([19, 33]);
    expect(t.cellOf("well")).toEqual([18, 35]);
    expect(t.doc.undo.depth).toBe(1);
  });

  it("방향키는 한 칸씩 옮긴다 (누를 때마다 한 단계). 고른 것이 없으면 넘긴다", () => {
    const t = setup();
    expect(t.key("ArrowLeft")).toBe(false);
    t.click(19, 34);
    expect(t.key("ArrowLeft")).toBe(true);
    expect(t.key("ArrowUp")).toBe(true);
    expect(t.cellOf("bench")).toEqual([18, 33]);
    expect(t.doc.undo.depth).toBe(2);
  });

  it("구역 가장자리 곁이라도 이벤트가 선 칸을 누르면 그 이벤트를 고른다", () => {
    const t = setup();
    t.click(14, 20);
    // laundry(12,21)는 kid 구역의 왼쪽 가장자리(x = 13 칸의 왼쪽 변) 바로 옆 칸이다
    const nearEdge = { ...t.at(12, 21), world: { x: 13 * t.tw - 2, y: 21 * t.th + 8 } };
    t.tool.pointerDown(nearEdge);
    t.tool.pointerMove(t.at(12, 22));
    expect(t.st.selected).toEqual([t.idx("laundry")]);
    expect(t.st.drag).toMatchObject({ kind: "move" });
    t.tool.pointerUp(t.at(12, 21));
    expect(field(field(t.st.section.list[t.idx("kid")], "wander"), "area")).toEqual({ x: 13, y: 19, w: 6, h: 6 });
  });

  it("구역 가장자리를 끌면 배회 구역 크기가 한 단계로 바뀐다", () => {
    const t = setup();
    t.click(14, 20);
    // kid 의 구역은 13,19 에서 6x6: 오른쪽 가장자리는 x = 19 칸의 왼쪽 변
    const edge = { ...t.at(19, 20), world: { x: 19 * t.tw + 1, y: 20 * t.th + 8 } };
    t.tool.pointerMove(edge);
    expect(t.tool.cursor()).toBe("ew-resize");
    t.tool.pointerDown(edge);
    t.tool.pointerMove(t.at(21, 20));
    expect(t.st.drag).toEqual({ kind: "area", index: t.idx("kid"), area: { x: 13, y: 19, w: 9, h: 6 }, ok: true });
    t.tool.pointerUp(t.at(21, 20));
    expect(field(field(t.st.section.list[t.idx("kid")], "wander"), "area")).toEqual({ x: 13, y: 19, w: 9, h: 6 });
    expect(t.doc.undo.depth).toBe(1);
  });
});

describe("놓기와 키", () => {
  it("빈 칸을 더블클릭하면 새 이벤트를 놓고 고르며 id 칸에 초점을 청한다 (한 단계)", () => {
    const t = setup();
    t.tool.doubleClick(t.at(2, 44));
    const i = t.idx("event_1");
    expect(i).toBe(17);
    expect(t.cellOf("event_1")).toEqual([2, 44]);
    expect(t.st.selected).toEqual([17]);
    expect(t.st.focusRequest?.target).toBe("id");
    expect(t.doc.undo.depth).toBe(1);
    t.doc.undo.undo();
    expect(t.st.section.list).toHaveLength(17);
  });

  it("이벤트를 더블클릭하면 고르고 커맨드 편집기로 초점을 청한다. Enter 도 같다", () => {
    const t = setup();
    t.tool.doubleClick(t.at(16, 44));
    expect(t.st.selected).toEqual([t.idx("captain")]);
    expect(t.st.focusRequest?.target).toBe("commands");
    const nonce = t.st.focusRequest!.nonce;
    expect(t.key("Enter")).toBe(true);
    expect(t.st.focusRequest?.nonce).toBe(nonce + 1);
    expect(t.doc.undo.depth).toBe(0);
  });

  it("맵 밖을 더블클릭하면 놓지 않고 이유를 알린다", () => {
    const t = setup();
    t.tool.doubleClick(t.at(40, 2));
    expect(t.doc.undo.depth).toBe(0);
    expect(t.notices.at(-1)).toMatch(/^이 타일에 이벤트를 추가할 수 없습니다: .*맵 범위 밖/);
  });

  it("Delete 는 고른 이벤트를 지우고 고르기를 푼다. 되돌리면 그대로", () => {
    const t = setup();
    const before = t.doc.text();
    t.click(19, 34);
    expect(t.key("Delete")).toBe(true);
    expect(t.idx("bench")).toBe(-1);
    expect(t.st.selected).toEqual([]);
    t.doc.undo.undo();
    expect(t.doc.text()).toBe(before);
    expect(t.key("Delete")).toBe(false);
  });

  it("Ctrl+C 와 Ctrl+V: 확장의 클립보드에 두고 커서 칸에 겹치지 않는 id 로 붙인다", () => {
    const t = setup();
    t.click(16, 44);
    expect(t.key("c", { mod: true })).toBe(true);
    expect(JSON.parse(t.clipboard.json!)[0]).toMatchObject({ id: "captain", x: 16, y: 44 });
    // 2^53을 넘는 정수는 사본 글에서 JSON의 수다
    const big = new EventClipboard(null);
    const ev = { id: "well", x: 1, y: 2, data: { seed: bigIntValue("12345678901234567890") } };
    expect(big.write([ev])).toContain('"seed": 12345678901234567890');
    expect(big.read()).toEqual([ev]);
    expect(t.notices.at(-1)).toBe("이벤트 1개 복사됨");
    t.tool.pointerMove(t.at(3, 44));
    expect(t.key("v", { mod: true })).toBe(true);
    const i = t.idx("captain_2");
    expect(t.cellOf("captain_2")).toEqual([3, 44]);
    expect(t.st.selected).toEqual([i]);
    expect(field(t.st.section.list[i], "commands")).toEqual(field(t.st.section.list[t.idx("captain")], "commands"));
    expect(t.doc.undo.depth).toBe(1);
  });

  it("클립보드가 비었거나 그 칸에 놓을 수 없으면 붙이지 않고 알린다 (키는 받는다)", () => {
    const t = setup();
    t.tool.pointerMove(t.at(3, 44));
    expect(t.key("v", { mod: true })).toBe(true);
    expect(t.notices.at(-1)).toBe("붙여넣을 이벤트가 없습니다 (먼저 복사해야 합니다)");
    t.click(16, 44);
    t.key("c", { mod: true });
    t.tool.pointerMove(t.at(18, 44));
    t.key("v", { mod: true });
    expect(t.notices.at(-1)).toMatch(/^이 타일에 붙여넣을 수 없습니다: .*같은 타일\(18,44\)/);
    expect(t.doc.undo.depth).toBe(0);
    expect(t.key("c", { mod: true })).toBe(true);
  });

  it("Ctrl+D 는 곁의 빈 칸에 복제한다 (한 단계)", () => {
    const t = setup();
    t.click(19, 34);
    expect(t.key("d", { mod: true })).toBe(true);
    expect(t.cellOf("bench_2")).toEqual([20, 34]);
    expect(t.st.selected).toEqual([t.idx("bench_2")]);
    expect(t.doc.undo.depth).toBe(1);
  });

  it("다른 Ctrl 조합(Ctrl+Z 등)과 모르는 키는 넘긴다 (앱의 되돌리기가 받는다)", () => {
    const t = setup();
    t.click(19, 34);
    expect(t.key("z", { mod: true })).toBe(false);
    expect(t.key("b")).toBe(false);
  });
});

describe("잠긴 레이어", () => {
  it("고르기와 복사는 되고, 옮기기와 지우기와 붙여넣기와 놓기는 이유를 알리며 거절한다", () => {
    const t = setup({ lockPort: true });
    const reason = t.st.locked!;
    expect(reason).toMatch(/두 파일/);
    t.click(19, 34);
    expect(t.st.selected).toEqual([t.idx("bench")]);
    t.tool.pointerDown(t.at(19, 34));
    t.tool.pointerMove(t.at(18, 35));
    t.tool.pointerMove(t.at(17, 35));
    expect(t.st.drag).toBeNull();
    t.tool.pointerUp(t.at(17, 35));
    expect(t.notices.filter((n) => n === reason)).toHaveLength(1);
    expect(t.key("Delete")).toBe(true);
    expect(t.key("ArrowLeft")).toBe(true);
    expect(t.key("c", { mod: true })).toBe(true);
    expect(t.clipboard.json).not.toBeNull();
    t.tool.pointerMove(t.at(3, 44));
    t.key("v", { mod: true });
    t.key("d", { mod: true });
    t.tool.doubleClick(t.at(2, 44));
    expect(t.doc.undo.depth).toBe(0);
    expect(t.cellOf("bench")).toEqual([19, 34]);
    expect(t.notices.filter((n) => n.includes(reason)).length).toBeGreaterThanOrEqual(5);
  });
});
