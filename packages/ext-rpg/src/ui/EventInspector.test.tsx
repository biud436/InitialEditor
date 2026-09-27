// @vitest-environment jsdom
// 이벤트 인스펙터 (e5 문서 3절): 고른 것이 없으면 요약과 문제, 하나면 스키마 칸과 커맨드 목록 편집기, 여럿이면 함께 지우기.
// 타이핑은 초점 한 번이 되돌리기 한 단계, id 를 바꾸면 참조도 함께, 거절은 알림 줄, 잠긴 레이어는 칸이 꺼진다, 초점 요청,
// 이 이벤트 앞에서 실행과 자동 재생 단추.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { runInAction } from "mobx";
import { afterEach, describe, expect, it } from "vitest";
import { field } from "../model/json";
import { FakePlay, fixtureSources, layerHarness, PORT_TOWN, stateOf } from "../testing/layerHarness";
import { CommandClipboard } from "./clipboard";
import { EventClipboard } from "./eventClipboard";
import { makeEventInspector } from "./EventInspector";
import type { RpgUiServices } from "./services";

afterEach(cleanup);

function setup(opts: { lockPort?: boolean; text?: string } = {}) {
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
  const services: RpgUiServices = {
    store: sources,
    play,
    documents: h.documents,
    clipboard: new EventClipboard(null),
    commandClipboard: new CommandClipboard(null),
    notify: (m) => void notified.push(m),
    confirm: () => true,
  };
  const Inspector = makeEventInspector(services);
  const view = render(<Inspector document={doc} state={st} />);
  const idx = (id: string) => st.section.indexOfId(id);
  return { h, doc, st, view, idx, notified, sources, play };
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

  it("거절된 편집(겹치는 id)은 문서를 바꾸지 않고 알림 줄에 이유를 보인다", () => {
    const t = setup();
    act(() => t.st.select([t.idx("captain")]));
    const el = input("rpg-field-id");
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: "ship" } });
    expect(screen.getByTestId("rpg-inspector-notice").textContent).toMatch(/겹친다|같은 id|중복/);
    expect(t.doc.undo.depth).toBe(0);
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
