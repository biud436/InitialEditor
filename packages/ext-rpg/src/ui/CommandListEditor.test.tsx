// @vitest-environment jsdom
// 커맨드 목록 편집기 (e5 문서 4절): 트리, 폼, 팔레트, 넣기와 빼기와 옮기기, 복사와 붙여넣기, 키, 문제 표시.
// 모든 편집은 모델의 EventEditor 명령이고 한 동작이 되돌리기 한 단계다.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneJson, field } from "../model/json";
import { validateEvents } from "../model/validate";
import { editorHarness, TEST_FILES } from "../testing/editorHarness";
import { fixtureMap } from "../testing/fixtures";
import { CommandClipboard, parseCommandsJson } from "./clipboard";
import { buildRows } from "./commandRows";
import { CommandListEditor, type CommandListEditorProps } from "./CommandListEditor";

afterEach(cleanup);

const NESTED = [
  { code: "message", name: "주인", text: "어서 오게." },
  {
    code: "if",
    cond: { item: "warehouse_key" },
    thenDo: [{ code: "message", text: "열쇠가 있군." }],
    elseDo: [],
  },
  { code: "wait", ms: 300 },
];

function setup(commands: unknown[] = NESTED, props: Partial<CommandListEditorProps> = {}, more: Record<string, unknown> = {}) {
  const h = editorHarness([{ id: "keeper", x: 3, y: 3, commands, ...more }, { id: "other", x: 5, y: 5, commands: [{ code: "wait", ms: 1 }] }]);
  const clipboard = new CommandClipboard(null);
  const refused: string[] = [];
  const view = render(
    <CommandListEditor
      editor={h.editor}
      eventIndex={0}
      schema={h.schema}
      apply={h.apply}
      clipboard={clipboard}
      files={TEST_FILES}
      refs={h.refs}
      confirm={() => true}
      onRefused={(m) => refused.push(m)}
      {...props}
    />,
  );
  const before = h.section.list;
  const commandsNow = () => field(h.section.list[0], "commands") as unknown[];
  return { ...h, clipboard, refused, view, before, commandsNow };
}

const tree = () => screen.getByTestId("rpg-cmd-tree");
const rowEls = () => screen.getAllByTestId("rpg-cmd-row");
const rowKeys = () => rowEls().map((el) => el.dataset.rowKey);
const row = (key: string) => rowEls().find((el) => el.dataset.rowKey === key)!;
const cursorKey = () => (tree().querySelector(".is-cursor") as HTMLElement | null)?.dataset.rowKey;
const selectedKeys = () => rowEls().filter((el) => el.getAttribute("aria-selected") === "true").map((el) => el.dataset.rowKey);
const press = (key: string, opts: Record<string, unknown> = {}) => fireEvent.keyDown(tree(), { key, ...opts });
const click = (key: string, opts: Record<string, unknown> = {}) => fireEvent.click(row(key), opts);

describe("트리", () => {
  it("한 줄이 커맨드 하나이고 요약, 하위 목록은 들여 쓴 머리줄, 목록 끝마다 빈 줄", () => {
    setup();
    expect(rowKeys()).toEqual(["c.commands[1]", "c.commands[2]", "h.commands[2].thenDo", "c.commands[2].thenDo[1]", "e.commands[2].thenDo", "h.commands[2].elseDo", "e.commands[2].elseDo", "c.commands[3]", "e.commands"]);
    expect(row("c.commands[1]").textContent).toBe("대화주인: 어서 오게.");
    expect(row("c.commands[2]").textContent).toBe("조건 분기아이템 warehouse_key");
    expect(row("h.commands[2].thenDo").textContent).toContain("참이면");
    expect(row("c.commands[2].thenDo[1]").getAttribute("aria-level")).toBe("3");
    expect(tree().getAttribute("role")).toBe("tree");
  });

  it("머리줄을 접고 편다 (누르기, 왼쪽과 오른쪽 키). 접힌 머리줄은 커맨드 수를 보인다", () => {
    setup();
    fireEvent.click(within(row("h.commands[2].thenDo")).getByTestId("rpg-cmd-fold"));
    expect(rowKeys()).not.toContain("c.commands[2].thenDo[1]");
    expect(row("h.commands[2].thenDo").getAttribute("aria-expanded")).toBe("false");
    expect(row("h.commands[2].thenDo").textContent).toContain("(1)");
    expect(cursorKey()).toBe("h.commands[2].thenDo");
    press("ArrowRight");
    expect(rowKeys()).toContain("c.commands[2].thenDo[1]");
    press("ArrowLeft");
    expect(rowKeys()).not.toContain("c.commands[2].thenDo[1]");
    // 접힌 머리줄에서 왼쪽은 그 목록을 품은 커맨드로
    press("ArrowLeft");
    expect(cursorKey()).toBe("c.commands[2]");
    // 두 번 누르기와 Enter 도 접기
    fireEvent.doubleClick(row("h.commands[2].thenDo"));
    expect(rowKeys()).toContain("c.commands[2].thenDo[1]");
  });

  it("실제 여관 이벤트 (if 안의 choice 안의 if) 를 모두 편다", () => {
    const { map } = fixtureMap("inn");
    const events = map.events ?? [];
    const deepest = events.reduce<{ ev: unknown; n: number }>((best, ev) => {
      const n = buildRows(field(ev, "commands"), editorHarness([]).schema, new Set()).length;
      return n > best.n ? { ev, n } : best;
    }, { ev: null, n: 0 });
    expect(deepest.n).toBeGreaterThan(20);
    setup(field(deepest.ev, "commands") as unknown[]);
    expect(rowEls()).toHaveLength(deepest.n);
    // 오류와 경고는 없고, 여관 주인의 handKey() 를 두 벌로 펼친 같은 묶음을 정보로 알린다
    expect(screen.getByTestId("rpg-cmd-problems").textContent).toBe("문제 1 (오류 0, 경고 0, 정보 1)");
    expect(within(row("c.commands[1].thenDo[2]")).getByTestId("rpg-cmd-marker").title).toMatch(/같은 커맨드 묶음/);
  });
});

describe("고르기와 폼", () => {
  it("줄을 고르면 그 아래에 인자 폼, Enter 로 첫 입력, Escape 로 트리로", () => {
    setup();
    click("c.commands[1]");
    expect(document.activeElement).toBe(tree());
    const form = screen.getByTestId("rpg-cmd-form");
    expect(screen.getByTestId("rpg-cmd-form-path").textContent).toBe("events[1].commands[1]");
    expect(row("c.commands[1]").nextElementSibling?.contains(form)).toBe(true);
    press("Enter");
    expect(document.activeElement).toBe(screen.getByTestId("rpg-arg-text"));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(tree());
    // 하위 목록의 커맨드도
    click("c.commands[2].thenDo[1]");
    expect(screen.getByTestId("rpg-cmd-form-path").textContent).toBe("events[1].commands[2].thenDo[1]");
  });

  it("타이핑은 초점 한 번이 되돌리기 한 단계, 되돌리면 그대로 (손대지 않은 이벤트는 같은 객체)", () => {
    const { stack, section, before, commandsNow } = setup();
    click("c.commands[1]");
    const text = screen.getByTestId("rpg-arg-text") as HTMLTextAreaElement;
    act(() => text.focus());
    fireEvent.change(text, { target: { value: "어서" } });
    fireEvent.change(text, { target: { value: "어서 오시게.\n\"묵겠나?\"" } });
    act(() => text.blur());
    expect(stack.depth).toBe(1);
    expect(commandsNow()[0]).toEqual({ code: "message", text: "어서 오시게.\n\"묵겠나?\"", name: "주인" });
    expect(Object.keys(commandsNow()[0] as object)).toEqual(["code", "text", "name"]);
    expect(row("c.commands[1]").textContent).toContain("어서 오시게. …");
    act(() => void stack.undo());
    expect(section.list).toEqual(before);
    expect(section.list[1]).toBe(before[1]);
    expect(commandsNow()[1]).toBe((field(before[0], "commands") as unknown[])[1]);
  });

  it("얼굴 격자 누르기, 걸음 더하기, 조건 꼴 바꾸기가 각각 한 단계", () => {
    const { stack, commandsNow } = setup([
      { code: "message", text: "a" },
      { code: "moveRoute", target: "player", route: [] },
      { code: "if", cond: { flag: "a" } },
    ]);
    click("c.commands[1]");
    fireEvent.change(screen.getByTestId("rpg-arg-face-mode"), { target: { value: "set" } });
    fireEvent.click(screen.getByTestId("rpg-arg-face-grid-3"));
    expect(stack.depth).toBe(2);
    expect(commandsNow()[0]).toEqual({ code: "message", text: "a", face: { set: "npc", index: 3 } });
    click("c.commands[2]");
    fireEvent.click(screen.getByTestId("rpg-arg-route-add-left"));
    fireEvent.click(screen.getByTestId("rpg-arg-route-add-wait"));
    expect(stack.depth).toBe(4);
    expect(field(commandsNow()[1], "route")).toEqual(["left", "wait:500"]);
    click("c.commands[3]");
    fireEvent.change(screen.getByTestId("rpg-arg-cond-kind"), { target: { value: "var" } });
    expect(stack.depth).toBe(5);
    expect(field(commandsNow()[2], "cond")).toEqual({ var: "" });
  });

  it("선택지 항목: 더하면 빈 가지가 생기고, 옮기면 가지와 취소가 따라가고, 가지에 커맨드가 있으면 묻는다", async () => {
    const confirm = vi.fn(() => false);
    const { stack, commandsNow } = setup([{ code: "choice", options: ["묵는다", "나간다"], cancel: 2, branches: [[{ code: "setFlag", key: "slept" }], []] }], { confirm });
    click("c.commands[1]");
    fireEvent.click(screen.getByTestId("rpg-arg-options-add"));
    expect(commandsNow()[0]).toEqual({ code: "choice", options: ["묵는다", "나간다", "항목 3"], cancel: 2, branches: [[{ code: "setFlag", key: "slept" }], [], []] });
    expect(rowKeys()).toContain("h.commands[1].branches[3]");
    fireEvent.click(screen.getByTestId("rpg-arg-options-0-down"));
    expect(commandsNow()[0]).toMatchObject({ options: ["나간다", "묵는다", "항목 3"], cancel: 1, branches: [[], [{ code: "setFlag", key: "slept" }], []] });
    expect(row("h.commands[1].branches[2]").textContent).toContain("2. 묵는다");
    fireEvent.click(screen.getByTestId("rpg-arg-options-2-cancel"));
    expect(field(commandsNow()[0], "cancel")).toBe(3);
    expect(stack.depth).toBe(3);
    fireEvent.click(screen.getByTestId("rpg-arg-options-1-remove"));
    await flush();
    expect(confirm).toHaveBeenCalledWith("2번 항목의 가지에 커맨드가 1개 있다. 가지와 함께 뺄까?");
    expect(stack.depth).toBe(3);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId("rpg-arg-options-1-remove"));
    await flush();
    expect(commandsNow()[0]).toEqual({ code: "choice", options: ["나간다", "항목 3"], cancel: 2, branches: [[], []] });
    expect(stack.depth).toBe(4);
  });
});

/** 되묻기가 동기여도 빼기 처리는 async 라 한 번 넘긴다 */
function flush() {
  return act(async () => undefined);
}

describe("키", () => {
  it("위아래로 줄 옮기기, Home 과 End, 처리한 키는 전파를 막고 기본 동작을 막는다", () => {
    setup();
    const seen = vi.fn();
    window.addEventListener("keydown", seen);
    try {
      click("c.commands[1]");
      press("ArrowDown");
      expect(cursorKey()).toBe("c.commands[2]");
      press("ArrowDown");
      expect(cursorKey()).toBe("h.commands[2].thenDo");
      press("End");
      expect(cursorKey()).toBe("e.commands");
      press("Home");
      expect(cursorKey()).toBe("c.commands[1]");
      const ev = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
      tree().dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      for (const k of [{ key: "c", ctrlKey: true }, { key: "v", metaKey: true }, { key: "Delete" }, { key: "Insert" }]) press(k.key, k);
      expect(seen).not.toHaveBeenCalled();
      // 처리하지 않는 키는 흘려보낸다 (전역 되돌리기, 저장)
      press("z", { ctrlKey: true });
      press("s", { ctrlKey: true });
      expect(seen).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener("keydown", seen);
    }
  });

  it("폼의 입력 칸에서 누른 키는 트리가 받지 않는다", () => {
    const { stack } = setup();
    click("c.commands[1]");
    press("Enter");
    const text = screen.getByTestId("rpg-arg-text");
    fireEvent.keyDown(text, { key: "Delete" });
    fireEvent.keyDown(text, { key: "ArrowDown" });
    expect(stack.depth).toBe(0);
    expect(cursorKey()).toBe("c.commands[1]");
  });

  it("Shift+위아래는 같은 목록 안에서만 고르기를 넓히고 Escape 가 푼다", () => {
    setup();
    click("c.commands[1]");
    press("ArrowDown", { shiftKey: true });
    press("ArrowDown", { shiftKey: true });
    expect(selectedKeys()).toEqual(["c.commands[1]", "c.commands[2]", "c.commands[3]"]);
    press("ArrowDown", { shiftKey: true });
    expect(cursorKey()).toBe("c.commands[3]");
    expect(screen.queryByTestId("rpg-cmd-form")).toBeNull();
    press("Escape");
    expect(selectedKeys()).toEqual(["c.commands[3]"]);
    // Shift 누르기도 같은 목록이면 넓힌다
    fireEvent.click(row("c.commands[1]"), { shiftKey: true });
    expect(selectedKeys()).toEqual(["c.commands[1]", "c.commands[2]", "c.commands[3]"]);
    fireEvent.click(row("c.commands[2].thenDo[1]"), { shiftKey: true });
    expect(selectedKeys()).toEqual(["c.commands[2].thenDo[1]"]);
  });
});

describe("넣기", () => {
  it("Insert 로 팔레트: group 으로 묶고, 찾기로 거르고, Enter 로 고른 줄 위에 넣고 폼으로. 되돌리면 그대로", () => {
    const { stack, section, before, commandsNow } = setup();
    click("c.commands[3]");
    press("Insert");
    const palette = screen.getByTestId("rpg-cmd-palette");
    expect(within(palette).getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["대화", "흐름", "이동", "상태", "소리", "화면"]);
    expect(document.activeElement).toBe(screen.getByTestId("rpg-cmd-palette-search"));
    fireEvent.change(screen.getByTestId("rpg-cmd-palette-search"), { target: { value: "장소" } });
    expect(within(palette).getAllByRole("option").map((o) => o.dataset.testid)).toEqual(["rpg-palette-item-showLocation"]);
    fireEvent.change(screen.getByTestId("rpg-cmd-palette-search"), { target: { value: "" } });
    fireEvent.keyDown(screen.getByTestId("rpg-cmd-palette-search"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("rpg-cmd-palette-search"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("rpg-cmd-palette-search"), { key: "Enter" });
    expect(screen.queryByTestId("rpg-cmd-palette")).toBeNull();
    expect(commandsNow().map((c) => field(c, "code"))).toEqual(["message", "if", "wait", "wait"]);
    expect(commandsNow()[2]).toEqual({ code: "wait", ms: 0 });
    expect(cursorKey()).toBe("c.commands[3]");
    expect(document.activeElement).toBe(screen.getByTestId("rpg-arg-ms"));
    expect(stack.depth).toBe(1);
    act(() => void stack.undo());
    expect(section.list).toEqual(before);
  });

  it("아래에 넣기 버튼, 빈 하위 목록의 끝 줄 (없던 목록도 만든다), 머리줄은 그 목록의 처음", () => {
    const { commandsNow } = setup([{ code: "message", text: "a" }, { code: "if", cond: { flag: "x" } }]);
    click("c.commands[1]");
    fireEvent.click(screen.getByTestId("rpg-cmd-insert-below"));
    fireEvent.click(screen.getByTestId("rpg-palette-item-comment"));
    expect(commandsNow().map((c) => field(c, "code"))).toEqual(["message", "comment", "if"]);
    fireEvent.doubleClick(row("e.commands[3].elseDo"));
    expect(screen.getByTestId("rpg-cmd-palette").textContent).toContain("events[1].commands[3].elseDo[1]");
    fireEvent.click(screen.getByTestId("rpg-palette-item-wait"));
    expect(commandsNow()[2]).toEqual({ code: "if", cond: { flag: "x" }, elseDo: [{ code: "wait", ms: 0 }] });
    click("h.commands[3].thenDo");
    press("Insert");
    fireEvent.click(screen.getByTestId("rpg-palette-item-comment"));
    expect(field(commandsNow()[2], "thenDo")).toEqual([{ code: "comment" }]);
    expect(Object.keys(commandsNow()[2] as object)).toEqual(["code", "cond", "thenDo", "elseDo"]);
  });

  it("효과음은 파일을, 스크립트는 이름을 먼저 묻는다 (없으면 엔진이 건너뛸 커맨드라)", () => {
    const { commandsNow, stack } = setup([]);
    press("Insert");
    fireEvent.click(screen.getByTestId("rpg-palette-item-playSe"));
    expect(screen.getByTestId("rpg-cmd-palette-draft")).toBeTruthy();
    expect((screen.getByTestId("rpg-cmd-palette-insert") as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByTestId("rpg-palette-arg-file"));
    expect(screen.queryByTestId("rpg-palette-arg-id")).toBeNull();
    fireEvent.change(screen.getByTestId("rpg-palette-arg-file"), { target: { value: "resources/audio/door.wav" } });
    fireEvent.click(screen.getByTestId("rpg-cmd-palette-insert"));
    expect(commandsNow()).toEqual([{ code: "playSe", file: "./resources/audio/door.wav" }]);
    press("Insert");
    fireEvent.click(screen.getByTestId("rpg-palette-item-script"));
    fireEvent.change(screen.getByTestId("rpg-palette-arg-name"), { target: { value: "openGate" } });
    fireEvent.click(screen.getByTestId("rpg-cmd-palette-insert"));
    expect(commandsNow()[0]).toEqual({ code: "script", name: "openGate" });
    expect(stack.depth).toBe(2);
    // 뒤로와 Escape
    press("Insert");
    fireEvent.click(screen.getByTestId("rpg-palette-item-playBgm"));
    fireEvent.click(screen.getByTestId("rpg-cmd-palette-back"));
    expect(screen.getByTestId("rpg-cmd-palette-search")).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId("rpg-cmd-palette-search"), { key: "Escape" });
    expect(screen.queryByTestId("rpg-cmd-palette")).toBeNull();
    expect(document.activeElement).toBe(tree());
    expect(stack.depth).toBe(2);
  });
});

describe("빼기와 옮기기", () => {
  it("넓힌 고르기를 한 번에 빼고 커서는 다음 줄로, 되돌리면 같은 객체로 돌아온다", () => {
    const { stack, section, before, commandsNow } = setup();
    click("c.commands[1]");
    press("ArrowDown", { shiftKey: true });
    press("Delete");
    expect(commandsNow()).toEqual([{ code: "wait", ms: 300 }]);
    expect(cursorKey()).toBe("c.commands[1]");
    expect(stack.depth).toBe(1);
    press("Backspace");
    expect(commandsNow()).toEqual([]);
    expect(cursorKey()).toBe("e.commands");
    act(() => void stack.undo());
    act(() => void stack.undo());
    expect(section.list).toEqual(before);
    expect(commandsNow()[1]).toBe((field(before[0], "commands") as unknown[])[1]);
  });

  it("Ctrl+위아래로 옮기고 고르기가 따라간다. 목록 끝에서는 아무것도 안 한다", () => {
    const { stack, commandsNow } = setup();
    click("c.commands[1]");
    expect((screen.getByTestId("rpg-cmd-up") as HTMLButtonElement).disabled).toBe(true);
    press("ArrowDown", { ctrlKey: true });
    expect(commandsNow().map((c) => field(c, "code"))).toEqual(["if", "message", "wait"]);
    expect(cursorKey()).toBe("c.commands[2]");
    press("ArrowDown", { shiftKey: true });
    press("ArrowUp", { metaKey: true });
    expect(commandsNow().map((c) => field(c, "code"))).toEqual(["message", "wait", "if"]);
    expect(selectedKeys()).toEqual(["c.commands[1]", "c.commands[2]"]);
    press("ArrowUp", { ctrlKey: true });
    expect(stack.depth).toBe(2);
    fireEvent.click(screen.getByTestId("rpg-cmd-down"));
    expect(commandsNow().map((c) => field(c, "code"))).toEqual(["if", "message", "wait"]);
    expect(stack.depth).toBe(3);
    expect(document.activeElement).toBe(tree());
  });

  it("하위 목록 안에서도 옮긴다", () => {
    const { commandsNow } = setup([{ code: "if", cond: { flag: "a" }, thenDo: [{ code: "wait", ms: 1 }, { code: "wait", ms: 2 }] }]);
    click("c.commands[1].thenDo[2]");
    press("ArrowUp", { ctrlKey: true });
    expect(field(commandsNow()[0], "thenDo")).toEqual([{ code: "wait", ms: 2 }, { code: "wait", ms: 1 }]);
    expect(cursorKey()).toBe("c.commands[1].thenDo[1]");
  });
});

describe("복사와 붙여넣기", () => {
  it("여러 줄을 JSON 으로 복사하고 고른 줄 아래에 붙인다 (한 단계). 하위 목록 끝에도", () => {
    const { clipboard, stack, commandsNow } = setup();
    click("c.commands[1]");
    press("ArrowDown", { shiftKey: true });
    press("c", { ctrlKey: true });
    expect(parseCommandsJson(clipboard.json)).toEqual(NESTED.slice(0, 2));
    expect(screen.getByTestId("rpg-cmd-status").textContent).toBe("커맨드 2개를 복사했다");
    click("c.commands[3]");
    press("v", { metaKey: true });
    expect(commandsNow().map((c) => field(c, "code"))).toEqual(["message", "if", "wait", "message", "if"]);
    expect(selectedKeys()).toEqual(["c.commands[4]", "c.commands[5]"]);
    expect(stack.depth).toBe(1);
    click("e.commands[2].elseDo");
    press("V", { ctrlKey: true, shiftKey: true });
    expect(field(commandsNow()[1], "elseDo")).toEqual(NESTED.slice(0, 2));
    expect(stack.depth).toBe(2);
    // 붙인 것은 사본이다
    expect(commandsNow()[3]).not.toBe(commandsNow()[0]);
  });

  it("비었거나 커맨드가 아닌 클립보드, 엔진이 건너뛸 커맨드는 붙이지 않고 알린다", () => {
    const { clipboard, stack, refused } = setup();
    click("c.commands[1]");
    press("v", { ctrlKey: true });
    expect(screen.getByTestId("rpg-cmd-notice").textContent).toContain("붙일 커맨드가 없다");
    clipboard.write([{ code: "wait", ms: -5 }]);
    press("v", { ctrlKey: true });
    expect(screen.getByTestId("rpg-cmd-notice").getAttribute("role")).toBe("alert");
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatch(/ms/);
    expect(stack.depth).toBe(0);
    expect(parseCommandsJson('{"code":"wait","ms":1}')).toEqual([{ code: "wait", ms: 1 }]);
    expect(parseCommandsJson("[1]")).toBeNull();
    expect(parseCommandsJson("[]")).toBeNull();
    expect(parseCommandsJson("nope")).toBeNull();
  });

  it("시스템 클립보드에도 같은 글을 적는다 (실패해도 된다)", () => {
    const writeText = vi.fn(() => Promise.reject(new Error("denied")));
    const cb = new CommandClipboard({ writeText });
    const text = cb.write([{ code: "wait", ms: 1 }]);
    expect(writeText).toHaveBeenCalledWith(text);
    expect(cb.read()).toEqual([{ code: "wait", ms: 1 }]);
  });
});

describe("잠김과 틀린 모양", () => {
  it("잠긴 레이어: 편집 버튼이 꺼지고 키와 위젯이 고치지 않는다. 복사와 고르기는 된다", () => {
    const { stack, clipboard } = setup(NESTED, { locked: "RTP 판과 기본 판 두 파일이다" });
    expect(screen.getByTestId("rpg-cmd-locked").textContent).toBe("읽기 전용: RTP 판과 기본 판 두 파일이다");
    click("c.commands[1]");
    for (const id of ["rpg-cmd-insert-above", "rpg-cmd-insert-below", "rpg-cmd-remove", "rpg-cmd-down", "rpg-cmd-paste"]) {
      expect((screen.getByTestId(id) as HTMLButtonElement).disabled, id).toBe(true);
    }
    press("Delete");
    press("Insert");
    press("ArrowDown", { ctrlKey: true });
    expect(screen.queryByTestId("rpg-cmd-palette")).toBeNull();
    expect(stack.depth).toBe(0);
    expect(screen.getByTestId("rpg-cmd-notice").textContent).toContain("RTP");
    expect((screen.getByTestId("rpg-arg-text") as HTMLTextAreaElement).disabled).toBe(true);
    press("c", { ctrlKey: true });
    expect(clipboard.read()).toEqual([NESTED[0]]);
  });

  it("모르는 커맨드는 폼 대신 알림이고 뺄 수 있다", () => {
    const { commandsNow } = setup([{ code: "dance", speed: 2 }, 7]);
    click("c.commands[1]");
    expect(screen.queryByTestId("rpg-cmd-form")).toBeNull();
    expect(screen.getByTestId("rpg-cmd-unknown-command").textContent).toContain('{"code":"dance","speed":2}');
    press("Delete");
    expect(commandsNow()).toEqual([7]);
    expect(screen.getByTestId("rpg-cmd-unknown-command").textContent).toContain("객체가 아니다");
  });

  it("commands 가 배열이 아니면 트리 대신 알림", () => {
    setup(undefined as unknown as unknown[], {}, { commands: "oops" });
    expect(screen.getByTestId("rpg-cmd-broken").textContent).toContain("events[1].commands 가 배열이 아니라");
    expect(screen.queryByTestId("rpg-cmd-tree")).toBeNull();
  });

  it("스키마에 없는 인자는 폼에 그대로 보인다 (지우지 않는다)", () => {
    const { commandsNow } = setup([{ code: "wait", ms: 5, legacy: true }]);
    click("c.commands[1]");
    expect(screen.getByTestId("rpg-cmd-unknown").textContent).toContain("legacy");
    const ms = screen.getByTestId("rpg-arg-ms") as HTMLInputElement;
    act(() => ms.focus());
    fireEvent.change(ms, { target: { value: "9" } });
    expect(commandsNow()[0]).toEqual({ code: "wait", ms: 9, legacy: true });
  });
});

describe("문제 표시", () => {
  const BAD = [
    { code: "message" },
    { code: "if", cond: {}, thenDo: [{ code: "wait", ms: -1 }] },
    { code: "transfer", map: "inn" },
    { code: "wait", ms: 1 },
  ];

  it("줄 옆 표식, 머리의 수, 목록의 엔진 표기, 누르면 그 줄로 (접힌 머리줄을 편다)", () => {
    const { schema, section } = setup(BAD);
    const problems = validateEvents(section.list, { schema });
    cleanup();
    setup(BAD, { problems });
    expect(screen.getByTestId("rpg-cmd-problems").textContent).toBe("문제 4 (오류 2, 경고 2, 정보 0)");
    const markers = () => Object.fromEntries(rowEls().filter((el) => within(el).queryByTestId("rpg-cmd-marker")).map((el) => [el.dataset.rowKey, within(el).getByTestId("rpg-cmd-marker").className.replace("rpg-marker ", "")]));
    expect(markers()).toEqual({ "c.commands[1]": "is-error", "c.commands[2]": "is-warning", "c.commands[2].thenDo[1]": "is-error", "c.commands[4]": "is-warning" });
    fireEvent.click(within(row("h.commands[2].thenDo")).getByTestId("rpg-cmd-fold"));
    expect(markers()["h.commands[2].thenDo"]).toBe("is-error");
    fireEvent.click(screen.getByTestId("rpg-cmd-problems"));
    const items = screen.getAllByTestId("rpg-cmd-problem");
    expect(items.map((b) => b.querySelector(".rpg-path")?.textContent)).toEqual([
      "events[1].commands[1].text",
      "events[1].commands[2].thenDo[1].ms",
      "events[1].commands[2].cond",
      "events[1].commands[4]",
    ]);
    expect(items[3].textContent).toContain("맵 이동 뒤의 커맨드는 실행되지 않는다");
    fireEvent.click(items[1]);
    expect(cursorKey()).toBe("c.commands[2].thenDo[1]");
    expect(document.activeElement).toBe(tree());
    expect(screen.getAllByTestId("rpg-arg-ms-problem")[0].textContent).toContain("0 이상이 아니다");
  });

  it("problems 를 주지 않으면 스키마로 검사하고, 다른 이벤트의 문제는 보이지 않는다", () => {
    setup([{ code: "message" }]);
    expect(screen.getByTestId("rpg-cmd-problems").textContent).toMatch(/^문제 1 /);
  });

  it("focusRequest 로 밖에서 그 커맨드로 간다 (다른 이벤트의 경로는 무시한다)", () => {
    const h = setup();
    const props = (location: string, nonce: number) => ({ editor: h.editor, eventIndex: 0, schema: h.schema, apply: h.apply, focusRequest: { location, nonce } });
    fireEvent.click(within(row("h.commands[2].thenDo")).getByTestId("rpg-cmd-fold"));
    h.view.rerender(<CommandListEditor {...props("events[1].commands[2].thenDo[1].text", 1)} />);
    expect(cursorKey()).toBe("c.commands[2].thenDo[1]");
    h.view.rerender(<CommandListEditor {...props("events[2].commands[1]", 2)} />);
    expect(cursorKey()).toBe("c.commands[2].thenDo[1]");
    h.view.rerender(<CommandListEditor {...props("events[1].commands[3]", 3)} />);
    expect(cursorKey()).toBe("c.commands[3]");
  });

  it("onSelect 는 고른 커맨드가 바뀔 때 경로를 알린다", () => {
    const onSelect = vi.fn();
    setup(NESTED, { onSelect });
    click("c.commands[2].thenDo[1]");
    click("e.commands");
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual([null, { list: [{ at: 1, list: "thenDo" }], index: 0 }, null]);
  });
});

describe("다른 이벤트로 바뀌면", () => {
  it("고르기와 접기를 처음부터", () => {
    const h = setup();
    click("c.commands[2]");
    fireEvent.click(within(row("h.commands[2].thenDo")).getByTestId("rpg-cmd-fold"));
    h.view.rerender(<CommandListEditor editor={h.editor} eventIndex={1} schema={h.schema} apply={h.apply} />);
    expect(rowKeys()).toEqual(["c.commands[1]", "e.commands"]);
    expect(cursorKey()).toBe("e.commands");
    h.view.rerender(<CommandListEditor editor={h.editor} eventIndex={0} schema={h.schema} apply={h.apply} />);
    expect(rowKeys()).toContain("c.commands[2].thenDo[1]");
    expect(cloneJson(field(h.section.list[0], "commands"))).toEqual(NESTED);
  });
});
