// @vitest-environment jsdom
// 이벤트 인스펙터 (e5 문서 3절): 고른 것이 없으면 요약과 문제, 하나면 스키마 칸과 커맨드 목록 편집기, 여럿이면 함께 지우기.
// 타이핑은 초점 한 번이 되돌리기 한 단계, id 를 바꾸면 참조도 함께, 거절은 알림 줄, 잠긴 레이어는 칸이 꺼진다, 초점 요청,
// 이 이벤트 앞에서 실행과 자동 재생 단추.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { runInAction } from "mobx";
import { afterEach, describe, expect, it } from "vitest";
import { field } from "../model/json";
import { FakeMapViews, FakePlay, fixtureSources, INN, layerHarness, PORT_TOWN, stateOf } from "../testing/layerHarness";
import { CommandClipboard } from "./clipboard";
import { EventClipboard } from "./eventClipboard";
import { makeEventInspector } from "./EventInspector";
import { LocationPicker, PICK_PROMPT } from "./locationPick";
import type { RpgUiServices } from "./services";

afterEach(cleanup);

function setup(opts: { lockPort?: boolean; text?: string; slot?: boolean } = {}) {
  const sources = fixtureSources();
  if (opts.lockPort) {
    const game = sources.game!;
    sources.set({ game: { ...game, maps: game.maps.map((m) => (m.name === "port_town" ? { ...m, alt: ["resources/maps/port_town_rtp.json"] } : m)) } });
  }
  const h = layerHarness({ sources });
  const doc = h.open(PORT_TOWN, opts.text);
  const st = stateOf(doc);
  const notified: string[] = [];
  const play = new FakePlay(sources);
  const views = new FakeMapViews();
  const services: RpgUiServices = {
    store: sources,
    play,
    documents: h.documents,
    clipboard: new EventClipboard(null),
    commandClipboard: new CommandClipboard(null),
    notify: (m) => void notified.push(m),
    confirm: () => true,
    location: new LocationPicker({ views, documents: h.documents, sources, notify: (m) => void notified.push(m) }),
  };
  const Inspector = makeEventInspector(services);
  // slot: 앱의 인스펙터 자리처럼 세로 스크롤하는 틀 안에 그린다
  const view = render(
    opts.slot ? (
      <div data-testid="slot" style={{ overflowY: "auto" }}>
        <Inspector document={doc} state={st} />
      </div>
    ) : (
      <Inspector document={doc} state={st} />
    ),
  );
  const idx = (id: string) => st.section.indexOfId(id);
  return { h, doc, st, view, idx, notified, sources, play, views };
}

const input = (testId: string) => screen.getByTestId(testId) as HTMLInputElement;

describe("고른 것 없음", () => {
  it("맵 이름, 이벤트 수, 안내가 보인다", () => {
    setup();
    expect(screen.getByTestId("rpg-inspector").dataset.mode).toBe("summary");
    expect(screen.getByTestId("rpg-inspector-count").textContent).toBe("이벤트 17개");
    expect(screen.queryByTestId("rpg-inspector-locked")).toBeNull();
  });

  it("문제 목록을 누르면 그 이벤트를 고른다", () => {
    const data = JSON.parse(layerHarnessText()) as { events: Array<Record<string, unknown>> };
    data.events[2] = { ...data.events[2], x: 99 };
    const t = setup({ text: JSON.stringify(data) });
    const items = screen.getAllByTestId("rpg-inspector-problems-item");
    const bad = items.find((el) => el.textContent?.startsWith("events[3].x"))!;
    fireEvent.click(bad);
    expect(t.st.selected).toEqual([2]);
    expect(screen.getByTestId("rpg-inspector").dataset.mode).toBe("event");
  });
});

function layerHarnessText(): string {
  const h = layerHarness();
  return h.open(PORT_TOWN).text();
}

describe("이벤트 하나", () => {
  it("스키마 칸마다 입력이 있고 값이 보인다. 아래에 커맨드 목록 편집기", () => {
    const t = setup();
    act(() => t.st.select([t.idx("captain")]));
    expect(screen.getByTestId("rpg-inspector-id").textContent).toBe("captain");
    expect(input("rpg-field-id").value).toBe("captain");
    expect(input("rpg-field-x").value).toBe("16");
    expect(input("rpg-field-y").value).toBe("44");
    expect(screen.getByTestId("rpg-field-trigger-row")).toBeTruthy();
    expect(screen.getByTestId("rpg-field-charset-row")).toBeTruthy();
    expect(screen.queryByTestId("rpg-field-commands-row")).toBeNull();
    expect(screen.getByTestId("rpg-cmd-editor")).toBeTruthy();
    expect(within(screen.getByTestId("rpg-cmd-tree")).getAllByTestId("rpg-cmd-row").length).toBeGreaterThan(3);
  });

  it("id 를 타이핑하면 초점 한 번이 되돌리기 한 단계이고, 이 맵의 참조도 함께 바뀐다", () => {
    const text = JSON.parse(layerHarnessText()) as { events: Array<Record<string, unknown>> };
    // 선장을 가리키는 turn 을 bench 에 더해 둔다
    const bench = text.events.findIndex((e) => e.id === "bench");
    text.events[bench] = { ...text.events[bench], commands: [{ code: "turn", target: "captain", dir: "down" }] };
    const t = setup({ text: JSON.stringify(text) });
    act(() => t.st.select([t.idx("captain")]));
    const el = input("rpg-field-id");
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: "captain2" } });
    fireEvent.change(el, { target: { value: "boss" } });
    fireEvent.blur(el);
    expect(t.idx("boss")).toBeGreaterThanOrEqual(0);
    expect(field((field(t.st.section.list[bench], "commands") as unknown[])[0], "target")).toBe("boss");
    expect(t.doc.undo.depth).toBe(1);
    t.doc.undo.undo();
    expect(t.idx("captain")).toBeGreaterThanOrEqual(0);
    expect(field((field(t.st.section.list[bench], "commands") as unknown[])[0], "target")).toBe("captain");
  });

  it("앞의 이벤트를 지우고 되돌려도 인스펙터는 같은 이벤트를 보인다 (번호가 바뀌어도 커맨드 트리를 새로 열지 않는다)", () => {
    const t = setup();
    act(() => void t.st.run((ed) => ed.removeEvents([t.idx("notice")])));
    act(() => t.st.select([t.idx("kid")]));
    const tree = screen.getByTestId("rpg-cmd-tree");
    fireEvent.click(within(tree).getAllByTestId("rpg-cmd-row")[0]);
    const cursor = () => (tree.querySelector(".is-cursor") as HTMLElement | null)?.dataset.rowKey;
    const before = cursor();
    expect(before).toBe("c.commands[1]");
    act(() => void t.doc.undo.undo());
    expect(t.idx("notice")).toBeGreaterThanOrEqual(0);
    expect(screen.getByTestId("rpg-inspector-id").textContent).toBe("kid");
    expect(Number(screen.getByTestId("rpg-inspector").dataset.index)).toBe(t.idx("kid"));
    expect(screen.getByTestId("rpg-cmd-tree")).toBe(tree);
    expect(cursor()).toBe(before);
  });

  it("대사를 타이핑하다 되돌리면(입력 칸 안의 Ctrl+Z) 칸이 되돌린 글을 보이고, 다음 타이핑이 되돌린 글을 되살리지 않는다", () => {
    const t = setup();
    act(() => t.st.select([t.idx("crates")]));
    const tree = screen.getByTestId("rpg-cmd-tree");
    fireEvent.click(within(tree).getAllByTestId("rpg-cmd-row")[0]);
    const box = screen.getByTestId("rpg-arg-text") as HTMLTextAreaElement;
    const original = box.value;
    act(() => box.focus());
    fireEvent.change(box, { target: { value: `${original} XYZ` } });
    const depth = t.doc.undo.depth;
    act(() => void t.doc.undo.undo());
    expect(t.doc.undo.depth).toBe(depth - 1);
    expect(box.value).toBe(original);
    expect(document.activeElement).toBe(box);
    fireEvent.change(box, { target: { value: `${original}Q` } });
    const crates = t.st.section.list[t.idx("crates")];
    expect(field((field(crates, "commands") as unknown[])[0], "text")).toBe(`${original}Q`);
    expect(t.doc.undo.depth).toBe(depth);
  });

  it("거절된 편집(겹치는 id)은 문서를 바꾸지 않고 알림 줄에 이유를 보인다", () => {
    const t = setup();
    act(() => t.st.select([t.idx("captain")]));
    const el = input("rpg-field-id");
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: "ship" } });
    expect(screen.getByTestId("rpg-inspector-notice").textContent).toMatch(/겹친다|같은 id|중복/);
    expect(t.doc.undo.depth).toBe(0);
  });

  it("이미 고른 외형과 얼굴 칸을 다시 누르거나 같은 값을 적으면 되돌리기 단계도 수정됨도 없다", () => {
    const t = setup();
    act(() => t.st.select([t.idx("captain")]));
    const before = t.doc.text();
    const cell = (i: number) => screen.getByTestId(`rpg-field-charset-grid-${i}`);
    expect(cell(6).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(cell(6));
    fireEvent.click(cell(6));
    expect([t.doc.undo.depth, t.doc.dirty]).toEqual([0, false]);
    const x = input("rpg-field-x");
    act(() => x.focus());
    fireEvent.change(x, { target: { value: "16.0" } });
    act(() => x.blur());
    expect([t.doc.undo.depth, t.doc.dirty]).toEqual([0, false]);
    // 얼굴 (대사 커맨드의 face)
    const tree = screen.getByTestId("rpg-cmd-tree");
    fireEvent.click(within(tree).getAllByTestId("rpg-cmd-row").find((r) => r.textContent?.includes("선장"))!);
    const face = screen.getByTestId("rpg-arg-face-grid-6");
    expect(face.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(face);
    expect([t.doc.undo.depth, t.doc.dirty, t.doc.text()]).toEqual([0, false, before]);
    // 다른 칸은 한 단계이고, 그 칸을 다시 눌러도 늘지 않는다
    fireEvent.click(cell(5));
    fireEvent.click(cell(5));
    expect([t.doc.undo.depth, t.doc.dirty]).toEqual([1, true]);
    expect(field(t.st.section.list[t.idx("captain")], "charset")).toEqual({ set: "npc", index: 5 });
  });

  it("트리거를 고르면 한 단계이고 머리의 표식이 바뀐다", () => {
    const t = setup();
    act(() => t.st.select([t.idx("bench")]));
    const row = screen.getByTestId("rpg-field-trigger-row");
    const select = row.querySelector("select")!;
    fireEvent.change(select, { target: { value: "touch" } });
    expect(field(t.st.section.list[t.idx("bench")], "trigger")).toBe("touch");
    expect(t.doc.undo.depth).toBe(1);
    expect(screen.getByTestId("rpg-inspector").querySelector(".rpg-badge")?.textContent).toBe("밟");
  });

  it("머리의 위치는 타일 좌표이고, 2^53을 넘는 정수(표식 글)는 숫자 그대로, 없으면 ? 다", () => {
    const data = JSON.parse(layerHarnessText()) as { events: Array<Record<string, unknown>> };
    delete data.events[1].y;
    const text = JSON.stringify(data).replace(/"x":14,"y":40/, '"x":12345678901234567890,"y":40');
    const t = setup({ text });
    act(() => t.st.select([0]));
    expect(screen.getByTestId("rpg-inspector-where").textContent).toBe("events[1], 타일 12345678901234567890,40");
    act(() => t.st.select([1]));
    expect(screen.getByTestId("rpg-inspector-where").textContent).toBe("events[2], 타일 16,?");
    act(() => t.st.select([t.idx("captain")]));
    expect(screen.getByTestId("rpg-inspector-where").textContent).toBe(`events[${t.idx("captain") + 1}], 타일 16,44`);
  });

  it("칸의 문제는 그 칸 아래에 보인다", () => {
    const data = JSON.parse(layerHarnessText()) as { events: Array<Record<string, unknown>> };
    data.events[0] = { ...data.events[0], x: 99 };
    const t = setup({ text: JSON.stringify(data) });
    act(() => t.st.select([0]));
    const problems = within(screen.getByTestId("rpg-field-x-row")).getAllByTestId("rpg-field-x-problem");
    expect(problems[0].textContent).toMatch(/맵 밖/);
  });

  it("지우기 버튼은 이벤트를 지우고 요약으로 돌아간다 (한 단계)", () => {
    const t = setup();
    act(() => t.st.select([t.idx("bench")]));
    fireEvent.click(screen.getByTestId("rpg-inspector-remove"));
    expect(t.idx("bench")).toBe(-1);
    expect(screen.getByTestId("rpg-inspector").dataset.mode).toBe("summary");
    expect(t.doc.undo.depth).toBe(1);
  });

  it("id 칸 초점 요청은 한 번만 따른다", () => {
    const t = setup();
    act(() => {
      t.st.select([t.idx("bench")]);
      t.st.requestFocus("id");
    });
    expect(document.activeElement).toBe(input("rpg-field-id"));
    (document.activeElement as HTMLElement).blur();
    // 다른 이벤트를 골랐다가 돌아와 칸이 새로 그려져도 옛 요청은 따르지 않는다
    act(() => t.st.select([t.idx("well")]));
    act(() => t.st.select([t.idx("bench")]));
    expect(document.activeElement).not.toBe(input("rpg-field-id"));
  });

  it("커맨드 초점 요청은 트리의 첫 줄로 간다", () => {
    const t = setup();
    act(() => {
      t.st.select([t.idx("captain")]);
      t.st.requestFocus("commands");
    });
    const tree = screen.getByTestId("rpg-cmd-tree");
    expect(document.activeElement).toBe(tree);
    expect((tree.querySelector(".is-cursor") as HTMLElement).dataset.rowKey).toBe("c.commands[1]");
  });

  it("이벤트를 고르거나 다른 이벤트로 바꾸면 스크롤하는 틀이 맨 위로 돌아간다. 같은 이벤트의 편집과 커서 옮기기는 그대로 둔다", () => {
    const t = setup({ slot: true });
    const slot = screen.getByTestId("slot");
    slot.scrollTop = 300;
    act(() => t.st.select([t.idx("kid")]));
    expect(slot.scrollTop).toBe(0);
    slot.scrollTop = 300;
    act(() => t.st.select([t.idx("notice")]));
    expect(screen.getByTestId("rpg-inspector-id").textContent).toBe("notice");
    expect(slot.scrollTop).toBe(0);
    slot.scrollTop = 300;
    const tree = screen.getByTestId("rpg-cmd-tree");
    fireEvent.keyDown(tree, { key: "Home" });
    fireEvent.change(input("rpg-field-x"), { target: { value: "12" } });
    expect(field(t.st.section.list[t.idx("notice")], "x")).toBe(12);
    expect(slot.scrollTop).toBe(300);
    // 여럿을 거쳐 다시 하나
    act(() => t.st.select([t.idx("kid"), t.idx("notice")]));
    act(() => t.st.select([t.idx("notice")]));
    expect(slot.scrollTop).toBe(0);
  });

  it("커맨드를 넣으면 같은 문서의 되돌리기 스택에 들어간다", () => {
    const t = setup();
    act(() => t.st.select([t.idx("bench")]));
    const before = field(t.st.section.list[t.idx("bench")], "commands") as unknown[];
    const tree = screen.getByTestId("rpg-cmd-tree");
    tree.focus();
    fireEvent.keyDown(tree, { key: "Home" });
    fireEvent.keyDown(tree, { key: "c", ctrlKey: true });
    fireEvent.keyDown(tree, { key: "v", ctrlKey: true });
    expect((field(t.st.section.list[t.idx("bench")], "commands") as unknown[]).length).toBe(before.length + 1);
    expect(t.doc.undo.depth).toBe(1);
    t.doc.undo.undo();
    expect(field(t.st.section.list[t.idx("bench")], "commands")).toBe(before);
  });
});

describe("실행 단추", () => {
  const button = (mode: string) => screen.getByTestId(`rpg-inspector-${mode}`) as HTMLButtonElement;

  it("이 이벤트 앞에서 실행과 자동 재생이 고른 이벤트로 돈다", () => {
    const t = setup();
    act(() => t.st.select([t.idx("kid")]));
    expect(button("play").textContent).toBe("앞에서 실행");
    expect(button("play").title).toBe("이 이벤트 앞에서 실행");
    expect(button("probe").title).toBe("이 이벤트 자동 재생");
    fireEvent.click(button("play"));
    fireEvent.click(button("probe"));
    expect(t.play.runs).toEqual([
      { id: "kid", index: t.idx("kid"), mode: "play" },
      { id: "kid", index: t.idx("kid"), mode: "probe" },
    ]);
    expect(screen.queryByTestId("rpg-inspector-run-note")).toBeNull();
  });

  it("parallel 은 자동 재생만 끄고 이유를 한 줄로, 러너가 못 띄우면 둘 다 끄고 그 이유", () => {
    const t = setup();
    const i = t.idx("bench");
    act(() => t.st.select([i]));
    act(() => void t.st.run((ed) => ed.setField(i, "trigger", "parallel")));
    expect(button("play").disabled).toBe(false);
    expect(button("probe").disabled).toBe(true);
    expect(button("probe").title).toBe("parallel 은 끝나지 않는다 (자동 재생을 할 수 없다)");
    expect(screen.getAllByTestId("rpg-inspector-run-note").map((n) => n.textContent)).toEqual(["parallel 은 끝나지 않는다 (자동 재생을 할 수 없다)"]);
    act(() => runInAction(() => void (t.play.runnerReason = "엔진을 찾지 못했다")));
    expect(button("play").disabled).toBe(true);
    expect(screen.getAllByTestId("rpg-inspector-run-note").map((n) => n.textContent)).toEqual(["엔진을 찾지 못했다"]);
    expect(t.play.runs).toEqual([]);
  });

  it("실행이 없는 서비스면 단추가 없다", () => {
    const sources = fixtureSources();
    const h = layerHarness({ sources });
    const doc = h.open(PORT_TOWN);
    const st = stateOf(doc);
    st.select([st.section.indexOfId("kid")]);
    const Inspector = makeEventInspector({ store: sources, documents: h.documents, clipboard: new EventClipboard(null) });
    render(<Inspector document={doc} state={st} />);
    expect(screen.getByTestId("rpg-inspector").dataset.mode).toBe("event");
    expect(screen.queryByTestId("rpg-inspector-run")).toBeNull();
  });
});

describe("여럿과 잠금", () => {
  it("여럿을 고르면 수와 id, 함께 지우기 (한 단계)", () => {
    const t = setup();
    act(() => t.st.select([t.idx("bench"), t.idx("well")]));
    expect(screen.getByTestId("rpg-inspector").dataset.mode).toBe("many");
    fireEvent.click(screen.getByTestId("rpg-inspector-remove"));
    expect(t.idx("bench")).toBe(-1);
    expect(t.idx("well")).toBe(-1);
    expect(t.doc.undo.depth).toBe(1);
  });

  it("잠긴 레이어는 이유를 보이고 칸과 지우기가 꺼진다", () => {
    const t = setup({ lockPort: true });
    expect(screen.getByTestId("rpg-inspector-locked").textContent).toMatch(/읽기 전용: .*두 벌/);
    act(() => t.st.select([t.idx("bench")]));
    expect(input("rpg-field-id").disabled).toBe(true);
    expect((screen.getByTestId("rpg-inspector-remove") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("rpg-cmd-locked")).toBeTruthy();
    expect(t.doc.undo.depth).toBe(0);
  });

  it("스키마 없이 붙은 레이어는 보기만 한다", () => {
    const sources = fixtureSources({ schema: null, schemaProblem: "모르는 버전" });
    const h = layerHarness({ sources });
    const doc = h.open(PORT_TOWN);
    const Inspector = makeEventInspector({ store: sources, documents: h.documents, clipboard: new EventClipboard(null) });
    render(<Inspector document={doc} state={stateOf(doc)} />);
    expect(screen.getByTestId("rpg-inspector-locked").textContent).toBe("읽기 전용: 모르는 버전");
    expect(screen.queryByTestId("rpg-field-id")).toBeNull();
  });
});

describe("맵 이동의 대상 (맵에서 고르기, 대상 보기)", () => {
  const button = (id: string) => screen.getByTestId(id) as HTMLButtonElement;
  const notes = () => screen.queryAllByTestId("rpg-location-note").map((n) => n.textContent);

  /** inn_door 를 고르고 transfer 줄을 누른다 */
  function openTransfer(t: ReturnType<typeof setup>): void {
    act(() => t.st.select([t.idx("inn_door")]));
    const tree = screen.getByTestId("rpg-cmd-tree");
    fireEvent.click(tree.querySelector('[data-row-key="c.commands[2]"]')!);
  }

  it("transfer 폼에만 두 단추가 있고, 누르면 대상 맵에서 고르고 고른 x, y 가 폼에 보인다 (한 단계)", async () => {
    const t = setup();
    act(() => t.st.select([t.idx("inn_door")]));
    const tree = screen.getByTestId("rpg-cmd-tree");
    fireEvent.click(tree.querySelector('[data-row-key="c.commands[1]"]')!);
    expect(screen.queryByTestId("rpg-location")).toBeNull();
    fireEvent.click(tree.querySelector('[data-row-key="c.commands[2]"]')!);
    expect(button("rpg-location-pick").textContent).toBe("맵에서 고르기");
    expect(button("rpg-location-reveal").textContent).toBe("대상 보기");
    expect(button("rpg-location-pick").disabled).toBe(false);
    expect(button("rpg-location-reveal").disabled).toBe(false);
    expect(notes()).toEqual([]);
    fireEvent.click(button("rpg-location-pick"));
    expect(t.views.picks).toEqual([{ path: INN, prompt: PICK_PROMPT, returnTo: t.doc }]);
    await act(async () => t.views.end({ x: 4, y: 6 }));
    expect(input("rpg-arg-x").value).toBe("4");
    expect(input("rpg-arg-y").value).toBe("6");
    expect(t.doc.undo.depth).toBe(1);
    fireEvent.click(button("rpg-location-reveal"));
    await act(async () => undefined);
    expect(t.views.reveals).toEqual([[INN, { x: 4, y: 6 }]]);
  });

  it("쓸 수 없으면 끄고 이유를 보인다: 같은 이유는 한 줄, 한쪽만 막히면 단추 이름과 함께", () => {
    const t = setup();
    openTransfer(t);
    const i = t.idx("inn_door");
    const P = { list: [], index: 1 };
    act(() => void t.st.run((ed) => ed.setArgs(i, P, { map: "village" })));
    expect(button("rpg-location-pick").disabled).toBe(true);
    expect(button("rpg-location-reveal").disabled).toBe(true);
    expect(button("rpg-location-pick").title).toBe("맵 파일 없음: resources/maps/village.json");
    expect(notes()).toEqual(["맵 파일 없음: resources/maps/village.json"]);
    act(() => void t.st.run((ed) => ed.setArgs(i, P, { map: "inn", x: undefined })));
    expect(button("rpg-location-pick").disabled).toBe(false);
    expect(button("rpg-location-reveal").disabled).toBe(true);
    expect(notes()).toEqual(["대상 보기: x, y 미지정"]);
    act(() => void t.st.run((ed) => ed.setArgs(i, P, { map: "" })));
    expect(notes()).toEqual(["맵 미지정"]);
    act(() => void t.st.run((ed) => ed.setArgs(i, P, { map: "forest", x: 1 })));
    expect(notes()).toEqual(["rpg-game.json 에 등록되지 않은 맵: forest"]);
    // 맵 파일의 판정이 바뀌면 따라간다
    act(() => void t.st.run((ed) => ed.setArgs(i, P, { map: "inn" })));
    expect(notes()).toEqual([]);
    act(() => t.sources.mapChecks.set(INN, { kind: "invalid", reason: "레이어가 없다" }));
    expect(notes()).toEqual(["엔진이 열 수 없는 맵: 레이어가 없다"]);
    act(() => runInAction(() => (t.views.blocked = "맵 뷰 없음")));
    expect(notes()).toEqual(["맵 뷰 없음"]);
  });

  it("잠긴 레이어는 고르기만 끄고 대상 보기는 된다", () => {
    const t = setup({ lockPort: true });
    openTransfer(t);
    expect(button("rpg-location-pick").disabled).toBe(true);
    expect(button("rpg-location-reveal").disabled).toBe(false);
    expect(notes()[0]).toMatch(/^맵에서 고르기: 읽기 전용: RTP 판과 기본 판/);
  });

  it("다른 맵에서 고르고 돌아와 인스펙터를 새로 그리면 그 커맨드의 폼이 열려 있고 트리에 초점이 있다 (초점 요청)", async () => {
    const t = setup();
    openTransfer(t);
    fireEvent.click(button("rpg-location-pick"));
    // 대상 맵의 탭으로 가면 이 인스펙터는 내려간다
    t.view.unmount();
    await act(async () => t.views.end({ x: 7, y: 8 }));
    const Inspector = makeEventInspector({ store: t.sources, documents: t.h.documents, clipboard: new EventClipboard(null), location: new LocationPicker({ views: t.views, documents: t.h.documents, sources: t.sources }) });
    render(<Inspector document={t.doc} state={t.st} />);
    const tree = screen.getByTestId("rpg-cmd-tree");
    expect(document.activeElement).toBe(tree);
    expect((tree.querySelector(".is-cursor") as HTMLElement).dataset.rowKey).toBe("c.commands[2]");
    expect(input("rpg-arg-x").value).toBe("7");
    expect(input("rpg-arg-y").value).toBe("8");
    expect(screen.getByTestId("rpg-location")).toBeTruthy();
    expect(t.doc.undo.depth).toBe(1);
  });
});
