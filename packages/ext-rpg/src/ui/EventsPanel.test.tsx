// @vitest-environment jsdom
// 이벤트 목록 패널 (e5 문서 2.4, 5.2): 활성 맵의 이벤트 목록, 찾기, 고르기(대상을 이벤트 레이어로), 목록의 키,
// 문제 수와 표식, 우클릭 실행 메뉴, 시작 상태 칸(맵마다 기억, 틀린 항목 알림, 마지막 항목을 채우는 제안), 레이어가 없는 맵의 한 줄.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MapDocument } from "@initial-editor/ext-tilemap/model";
import { afterEach, describe, expect, it } from "vitest";
import { EVENTS_LAYER_ID } from "../model/layer";
import { FakePlay, fixtureSources, layerHarness, mapText, MEADOW, PORT_TOWN, stateOf } from "../testing/layerHarness";
import { EventClipboard } from "./eventClipboard";
import { makeEventsPanel } from "./EventsPanel";
import type { RpgUiServices } from "./services";

afterEach(cleanup);

function setup(opts: { lockPort?: boolean; open?: string; text?: string } = {}) {
  const sources = fixtureSources();
  if (opts.lockPort) {
    const game = sources.game!;
    sources.set({ game: { ...game, maps: game.maps.map((m) => (m.name === "port_town" ? { ...m, alt: ["resources/maps/port_town_rtp.json"] } : m)) } });
  }
  const h = layerHarness({ sources });
  const play = new FakePlay(sources);
  const services: RpgUiServices = { store: sources, play, documents: h.documents, clipboard: new EventClipboard(null) };
  const Panel = makeEventsPanel({ services, hint: (doc) => h.spec.hint?.(doc) });
  const view = render(<Panel />);
  let doc!: MapDocument;
  act(() => {
    doc = h.open(opts.open ?? PORT_TOWN, opts.text);
  });
  return { h, sources, view, doc, play };
}

const rows = () => screen.getAllByTestId("rpg-events-row");
const rowIds = () => rows().map((r) => r.dataset.id);

describe("목록", () => {
  it("맵이 없으면 안내, 레이어가 없는 맵은 레이어의 한 줄", () => {
    const h = layerHarness();
    const Panel = makeEventsPanel({ services: { store: h.sources, documents: h.documents, clipboard: new EventClipboard(null) }, hint: (doc) => h.spec.hint?.(doc) });
    render(<Panel />);
    expect(screen.getByTestId("rpg-events-panel").textContent).toBe("활성 맵 탭 없음");
    act(() => void h.open(MEADOW));
    expect(screen.getByTestId("rpg-events-hint").textContent).toBe("이벤트 레이어 없음 (rpg-game.json 에 등록된 맵에만 있음)");
  });

  it("port_town 의 이벤트 17개가 파일 순서로 보인다 (트리거 표식과 칸)", () => {
    setup();
    expect(screen.getByTestId("rpg-events-count").textContent).toBe("17개");
    expect(rows()).toHaveLength(17);
    expect(rowIds().slice(0, 3)).toEqual(["crates", "arrival", "captain"]);
    const door = rows().find((r) => r.dataset.id === "inn_door")!;
    expect(door.textContent).toContain("접");
    expect(door.textContent).toContain("13,29");
  });

  it("객체가 아닌 칸은 엔진 표기와 함께 틀린 줄로 보인다 (undefined 가 아니다). 칸이 틀린 이벤트도 그렇다고", () => {
    const data = JSON.parse(mapText(PORT_TOWN)) as { events: unknown[] };
    data.events.push(null, "oops", { id: "odd", x: "3", y: 1 });
    setup({ text: JSON.stringify(data) });
    const all = rows();
    expect(all).toHaveLength(20);
    const [nul, str, odd] = all.slice(17);
    expect(nul.dataset.broken).toBe("true");
    expect(nul.textContent).toBe("!events[18]객체가 아님 (null)");
    expect(str.textContent).toBe('!events[19]객체가 아님 ("oops")');
    expect(odd.dataset.broken).toBeUndefined();
    expect(odd.textContent).toContain("잘못된 좌표");
    for (const r of all) expect(r.textContent).not.toContain("undefined");
  });

  it("글자 키는 목록이 먹는다 (맵 도구의 한 글자 단축키에 닿지 않는다)", () => {
    setup();
    const seen: string[] = [];
    const on = (e: KeyboardEvent) => void seen.push(e.key);
    window.addEventListener("keydown", on);
    try {
      fireEvent.keyDown(rows()[0], { key: "b" });
      fireEvent.keyDown(rows()[0], { key: "z", ctrlKey: true });
    } finally {
      window.removeEventListener("keydown", on);
    }
    expect(seen).toEqual(["z"]);
  });

  it("찾기는 id, 트리거, 커맨드 안의 글로 거른다", () => {
    setup();
    const search = screen.getByTestId("rpg-events-search");
    fireEvent.change(search, { target: { value: "touch" } });
    expect(rowIds()).toEqual(["inn_door"]);
    fireEvent.change(search, { target: { value: "등대" } });
    expect(rowIds()).toEqual(expect.arrayContaining(["kid", "keeper"]));
    fireEvent.change(search, { target: { value: "없는말" } });
    expect(screen.queryAllByTestId("rpg-events-row")).toHaveLength(0);
    expect(screen.getByTestId("rpg-events-list").textContent).toBe("검색 결과 없음");
  });

  it("줄을 누르면 고르고 대상을 이벤트 레이어로 바꾼다. Shift 는 더하고 Ctrl 은 넣고 뺀다", () => {
    const t = setup();
    const st = stateOf(t.doc);
    fireEvent.click(rows()[2]);
    expect(st.selected).toEqual([2]);
    expect(t.doc.target).toEqual({ kind: "ext", id: EVENTS_LAYER_ID });
    fireEvent.click(rows()[4], { shiftKey: true });
    expect(st.selected).toEqual([2, 4]);
    fireEvent.click(rows()[2], { ctrlKey: true });
    expect(st.selected).toEqual([4]);
    expect(rows()[4].getAttribute("aria-selected")).toBe("true");
  });

  it("목록의 키: 위아래로 고르기, Delete 는 지우기(한 단계), Enter 는 커맨드 편집기로 초점", () => {
    const t = setup();
    const st = stateOf(t.doc);
    const list = screen.getByTestId("rpg-events-list");
    fireEvent.click(rows()[0]);
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(st.selected).toEqual([1]);
    fireEvent.keyDown(list, { key: "Enter" });
    expect(st.focusRequest?.target).toBe("commands");
    fireEvent.keyDown(list, { key: "Delete" });
    expect(st.section.indexOfId("arrival")).toBe(-1);
    expect(st.selected).toEqual([]);
    expect(t.doc.undo.depth).toBe(1);
    expect(rows()).toHaveLength(16);
  });

  it("더블클릭은 고르고 커맨드 편집기로 초점을 청한다", () => {
    const t = setup();
    const st = stateOf(t.doc);
    fireEvent.doubleClick(rows()[3]);
    expect(st.selected).toEqual([3]);
    expect(st.focusRequest?.target).toBe("commands");
  });

  it("오류가 있으면 머리에 수와 줄에 표식", () => {
    const t = setup();
    const st = stateOf(t.doc);
    expect(screen.queryByTestId("rpg-events-errors")).toBeNull();
    act(() => st.section.replace(st.section.list.map((ev, i) => (i === 5 ? { ...(ev as object), x: 99 } : ev))));
    expect(screen.getByTestId("rpg-events-errors").textContent).toBe("오류 1");
    expect(rows()[5].querySelector('[data-testid="rpg-events-marker"]')?.className).toContain("is-error");
  });

  it("잠긴 레이어는 이유를 보이고 Delete 가 거절된다", () => {
    const t = setup({ lockPort: true });
    const st = stateOf(t.doc);
    expect(screen.getByTestId("rpg-events-locked").textContent).toMatch(/두 파일/);
    fireEvent.click(rows()[0]);
    fireEvent.keyDown(screen.getByTestId("rpg-events-list"), { key: "Delete" });
    expect(st.section.list).toHaveLength(17);
    expect(screen.getByTestId("rpg-events-notice").textContent).toMatch(/두 파일/);
  });
});

describe("우클릭 실행 메뉴", () => {
  const row = (id: string) => rows().find((r) => r.dataset.id === id)!;
  const item = (mode: string) => screen.getByTestId(`rpg-events-menu-${mode}`) as HTMLButtonElement;

  it("줄을 우클릭하면 그 줄을 고르고(대상은 이벤트 레이어) 두 항목이 뜬다. 누르면 그 이벤트로 돌고 메뉴가 닫힌다", () => {
    const t = setup();
    const st = stateOf(t.doc);
    fireEvent.contextMenu(row("kid"), { clientX: 30, clientY: 40 });
    expect(st.selected).toEqual([st.section.indexOfId("kid")]);
    expect(t.doc.target).toEqual({ kind: "ext", id: EVENTS_LAYER_ID });
    expect(screen.getByTestId("rpg-events-menu").textContent).toBe("이 이벤트 앞에서 실행이 이벤트 자동 재생");
    expect(document.activeElement).toBe(item("play"));
    fireEvent.click(item("probe"));
    expect(t.play.runs).toEqual([{ id: "kid", index: st.section.indexOfId("kid"), mode: "probe" }]);
    expect(screen.queryByTestId("rpg-events-menu")).toBeNull();
    fireEvent.contextMenu(row("captain"));
    fireEvent.click(item("play"));
    expect(t.play.runs.map((r) => [r.id, r.mode])).toEqual([
      ["kid", "probe"],
      ["captain", "play"],
    ]);
  });

  it("못 띄우는 항목은 꺼지고 툴팁이 이유다. Escape 와 바깥 누르기는 닫는다", () => {
    const t = setup();
    const st = stateOf(t.doc);
    const i = st.section.indexOfId("bench");
    act(() => void st.run((ed) => ed.setField(i, "trigger", "parallel")));
    fireEvent.contextMenu(row("bench"));
    expect(item("play").disabled).toBe(false);
    expect(item("probe").disabled).toBe(true);
    expect(item("probe").title).toBe("parallel 이벤트는 종료되지 않음 (자동 재생 불가)");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("rpg-events-menu")).toBeNull();
    fireEvent.contextMenu(row("bench"));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("rpg-events-menu")).toBeNull();
    expect(t.play.runs).toEqual([]);
  });

  it("여럿을 고른 채 우클릭하면 그 줄 하나만 고른다. 메뉴 키(Shift+F10)는 고른 줄의 메뉴를 연다", () => {
    const t = setup();
    const st = stateOf(t.doc);
    act(() => st.select([0, 1, 2]));
    fireEvent.contextMenu(row("well"));
    expect(st.selected).toEqual([st.section.indexOfId("well")]);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(screen.getByTestId("rpg-events-list"), { key: "F10", shiftKey: true });
    fireEvent.click(item("play"));
    expect(t.play.runs.map((r) => [r.id, r.mode])).toEqual([["well", "play"]]);
  });

  it("실행이 없는 서비스면 우클릭 메뉴가 없다", () => {
    const h = layerHarness();
    const Panel = makeEventsPanel({ services: { store: h.sources, documents: h.documents, clipboard: new EventClipboard(null) } });
    render(<Panel />);
    act(() => void h.open(PORT_TOWN));
    fireEvent.contextMenu(rows()[0]);
    expect(screen.queryByTestId("rpg-events-menu")).toBeNull();
  });
});

describe("시작 상태", () => {
  it("Enter 나 초점을 잃으면 맵마다 기억하고, Escape 는 되돌린다", () => {
    const t = setup();
    const field = screen.getByTestId("rpg-start-state-input") as HTMLInputElement;
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "arrived,item:shell=1" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.blur(field);
    expect(t.sources.startState(PORT_TOWN)).toBe("arrived,item:shell=1");
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "heardWarehouse" } });
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);
    expect(t.sources.startState(PORT_TOWN)).toBe("arrived,item:shell=1");
    expect(field.value).toBe("arrived,item:shell=1");
    expect(t.sources.writes.map(([p, v]) => [p, v])).toEqual([[PORT_TOWN, "arrived,item:shell=1"]]);
  });

  it("틀린 항목(아이템 표에 없는 id, 예약 이름)을 알린다", () => {
    setup();
    const field = screen.getByTestId("rpg-start-state-input");
    fireEvent.change(field, { target: { value: "item:lamp_oill=1,items=2" } });
    const errors = screen.getAllByTestId("rpg-start-state-error").map((e) => e.textContent);
    expect(errors).toEqual(["item:lamp_oill=1: 아이템 표에 없는 id: lamp_oill", "items=2: items: 예약된 상태 키(소지품)라 사용 불가"]);
  });

  it("제안은 쓰인 깃발과 아이템이고, 앞의 항목을 두고 마지막 항목을 채운다", () => {
    setup();
    const field = screen.getByTestId("rpg-start-state-input");
    const values = () => [...screen.getByTestId("rpg-start-state-suggest").querySelectorAll("option")].map((o) => o.getAttribute("value"));
    expect(values()).toEqual(expect.arrayContaining(["arrived", "item:shell=1", "item:warehouse_key=1"]));
    fireEvent.change(field, { target: { value: "arrived,it" } });
    expect(values()).toEqual(expect.arrayContaining(["arrived,item:shell=1"]));
  });

  it("제안에는 2^53을 넘는 정수 키(표식 글)가 나오지 않는다", () => {
    const data = JSON.parse(mapText(PORT_TOWN)) as { events: unknown[] };
    data.events.push({ id: "bigkeys", x: 1, y: 1, commands: [{ code: "setFlag", key: "BIG_FLAG" }, { code: "setVar", key: "BIG_VAR", value: 1 }] });
    const text = JSON.stringify(data).replace('"BIG_FLAG"', "12345678901234567890").replace('"BIG_VAR"', "98765432109876543210");
    setup({ text });
    const values = [...screen.getByTestId("rpg-start-state-suggest").querySelectorAll("option")].map((o) => o.getAttribute("value") ?? "");
    expect(values).toEqual(expect.arrayContaining(["arrived", "item:shell=1"]));
    expect(values.filter((v) => v.includes("INT:") || v.includes("\u0000") || /\d{20}/.test(v))).toEqual([]);
  });

  it("기억한 값은 맵을 다시 열어도 보인다", () => {
    const sources = fixtureSources();
    void sources.setStartState(PORT_TOWN, "arrived");
    const h = layerHarness({ sources });
    const Panel = makeEventsPanel({ services: { store: sources, documents: h.documents, clipboard: new EventClipboard(null) } });
    render(<Panel />);
    act(() => void h.open(PORT_TOWN));
    expect((screen.getByTestId("rpg-start-state-input") as HTMLInputElement).value).toBe("arrived");
  });
});
