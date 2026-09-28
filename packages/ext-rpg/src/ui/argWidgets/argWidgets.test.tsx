// @vitest-environment jsdom
// 인자 위젯: 스키마의 인자 타입마다 (엔진 M2 2.3). 값 하나를 그리고 onChange(값, 세션) 으로 알린다.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bigIntValue } from "@initial-editor/ext-tilemap/model";
import { commandSpec, fieldSpec, type ArgSpec } from "../../model/schema";
import { editorHarness, TEST_FILES } from "../../testing/editorHarness";
import { ArgRow } from "./ArgField";
import type { ArgContext } from "./context";
import { OptionsArg, valueOptionOps, type OptionOps } from "./OptionsArg";

afterEach(cleanup);

const { schema, refs } = editorHarness([
  { id: "npc", x: 1, y: 1, charset: { set: "npc", index: 2 }, commands: [{ code: "setFlag", key: "arrived" }] },
  { id: "sign", x: 2, y: 1, commands: [{ code: "if", cond: { var: "coins" }, thenDo: [] }] },
]);

function argOf(code: string, name: string): ArgSpec {
  const a = commandSpec(schema, code)?.args.find((x) => x.name === name);
  if (!a) throw new Error(`${code}.${name}`);
  return a;
}

type Call = [unknown, string | undefined];

function renderArg(spec: ArgSpec, initial: unknown, extra: Partial<ArgContext> = {}) {
  const calls: Call[] = [];
  const ctx: ArgContext = { schema, refs, files: TEST_FILES, confirm: () => true, ...extra };
  function Host() {
    const [value, setValue] = useState(initial);
    return (
      <ArgRow
        spec={spec}
        value={value}
        onChange={(v, s) => {
          calls.push([v, s]);
          setValue(v);
        }}
        ctx={ctx}
        sessionPrefix="t"
        testId="arg"
      />
    );
  }
  render(<Host />);
  return { calls, values: () => calls.map((c) => c[0]), last: () => calls.at(-1)?.[0] };
}

function typeIn(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } });
}

function focus(el: HTMLElement) {
  act(() => el.focus());
}

function blur(el: HTMLElement) {
  act(() => el.blur());
}

const input = (id = "arg") => screen.getByTestId(id) as HTMLInputElement;
const select = (id: string) => screen.getByTestId(id) as HTMLSelectElement;
const optionTexts = (el: HTMLElement) => [...el.querySelectorAll("option")].map((o) => o.textContent);

/** 값을 밖에서 바꿀 수 있는 Host (되돌리기가 모델의 값을 바꾸는 것과 같다) */
function renderControlled(spec: ArgSpec, initial: unknown) {
  const calls: Call[] = [];
  const ctx: ArgContext = { schema, refs, files: TEST_FILES, confirm: () => true };
  let set: (v: unknown) => void = () => {};
  function Host() {
    const [value, setValue] = useState(initial);
    set = setValue;
    return (
      <ArgRow
        spec={spec}
        value={value}
        onChange={(v, s) => {
          calls.push([v, s]);
          setValue(v);
        }}
        ctx={ctx}
        sessionPrefix="t"
        testId="arg"
      />
    );
  }
  render(<Host />);
  return { calls, setValue: (v: unknown) => act(() => set(v)) };
}

describe("초점이 있는 칸과 되돌리기 (입력 칸 안의 Ctrl+Z 는 모델을 되돌린다)", () => {
  const cases: Array<{ label: string; spec: () => ArgSpec; start: unknown; typed: string; sent: unknown; shown: string; retyped: string; resent: unknown }> = [
    { label: "여러 줄 대사", spec: () => argOf("message", "text"), start: "잘 왔네.", typed: "잘 왔네. XYZ", sent: "잘 왔네. XYZ", shown: "잘 왔네.", retyped: "잘 왔네.Q", resent: "잘 왔네.Q" },
    { label: "한 줄 글", spec: () => argOf("message", "name"), start: "선장", typed: "선장님", sent: "선장님", shown: "선장", retyped: "선장Q", resent: "선장Q" },
    { label: "제안 목록이 붙는 글", spec: () => argOf("scene", "name"), start: "title", typed: "titles", sent: "titles", shown: "title", retyped: "titleQ", resent: "titleQ" },
    { label: "숫자", spec: () => argOf("wait", "ms"), start: 300, typed: "450", sent: 450, shown: "300", retyped: "301", resent: 301 },
    { label: "JSON", spec: () => argOf("script", "args"), start: { a: 1 }, typed: '{"a": 2}', sent: { a: 2 }, shown: '{\n  "a": 1\n}', retyped: '{"a": 3}', resent: { a: 3 } },
  ];
  for (const c of cases) {
    it(`${c.label}: 되돌린 값을 칸이 따라가고, 다음 타이핑은 되돌린 글을 되살리지 않는 새 세션이다`, () => {
      const r = renderControlled(c.spec(), c.start);
      const box = input();
      focus(box);
      typeIn(box, c.typed);
      r.setValue(c.start);
      expect(box.value).toBe(c.shown);
      expect(document.activeElement).toBe(box);
      typeIn(box, c.retyped);
      expect(r.calls.map((x) => x[0])).toEqual([c.sent, c.resent]);
      expect(r.calls[1][1]).not.toBe(r.calls[0][1]);
    });
  }
});

describe("한 줄 칸의 Enter", () => {
  for (const [label, spec, typed] of [
    ["글", () => argOf("message", "name"), "선장"],
    ["제안 목록이 붙는 글", () => argOf("scene", "name"), "title"],
    ["숫자", () => argOf("wait", "ms"), "12"],
  ] as const) {
    it(`${label}: 넣고 초점을 폼에 둔다. 다음 타이핑은 새 세션이다`, () => {
      const r = renderControlled(spec(), undefined);
      const box = input();
      focus(box);
      typeIn(box, typed);
      fireEvent.keyDown(box, { key: "Enter" });
      expect(document.activeElement).toBe(box);
      typeIn(box, `${typed}3`);
      expect(r.calls).toHaveLength(2);
      expect(r.calls[1][1]).not.toBe(r.calls[0][1]);
    });
  }
});

describe("string, text", () => {
  it("선택 글 칸은 비우면 인자를 지운다. suggest 는 제안 목록이다", () => {
    const r = renderArg(argOf("message", "name"), undefined);
    expect(input().placeholder).toBe("지정 안 함");
    focus(input());
    typeIn(input(), "선장");
    typeIn(input(), "");
    expect(r.values()).toEqual(["선장", undefined]);
    cleanup();
    renderArg(argOf("scene", "name"), "title");
    expect([...screen.getByTestId("arg-suggest").querySelectorAll("option")].map((o) => o.getAttribute("value"))).toEqual(["title"]);
    expect(input().getAttribute("list")).toBe(screen.getByTestId("arg-suggest").id);
  });

  it("여러 줄 대사: 줄바꿈과 따옴표를 그대로, 초점 한 번의 타이핑은 한 세션", () => {
    const r = renderArg(argOf("message", "text"), "안녕");
    const box = input();
    expect(box.tagName).toBe("TEXTAREA");
    focus(box);
    typeIn(box, "첫 줄\n");
    typeIn(box, '첫 줄\n"둘째" 줄');
    blur(box);
    focus(box);
    typeIn(box, "셋");
    expect(r.values()).toEqual(["첫 줄\n", '첫 줄\n"둘째" 줄', "셋"]);
    expect(r.calls[0][1]).toBe(r.calls[1][1]);
    expect(r.calls[2][1]).not.toBe(r.calls[1][1]);
    // 필수 칸은 비워도 빈 글이다 (지우지 않는다)
    typeIn(box, "");
    expect(r.last()).toBe("");
  });
});

describe("integer, number", () => {
  it("정수는 반올림하고 min, max 로 자른다. 범위를 보인다", () => {
    const r = renderArg(argOf("playBgm", "volume"), 64);
    expect(screen.getByText("0~128")).toBeTruthy();
    focus(input());
    typeIn(input(), "12.6");
    typeIn(input(), "300");
    typeIn(input(), "-4");
    typeIn(input(), "");
    expect(r.values()).toEqual([13, 128, 0]);
  });

  it("수는 소수를 둔다. 선택 칸은 기본값을 안내하고 지우기로 비운다", () => {
    const r = renderArg(argOf("showLocation", "seconds"), undefined);
    focus(input());
    typeIn(input(), "1.5");
    expect(r.last()).toBe(1.5);
    cleanup();
    const c = renderArg(argOf("giveItem", "count"), 3);
    expect(input().placeholder).toBe("지정 안 함 (기본값 1)");
    fireEvent.click(screen.getByTestId("arg-clear"));
    expect(c.last()).toBeUndefined();
    expect(screen.queryByTestId("arg-clear")).toBeNull();
  });

  it("파일의 값이 수가 아니면 알린다", () => {
    renderArg(argOf("wait", "ms"), "300");
    expect(screen.getByText(/타입 불일치/)).toBeTruthy();
  });

  it("2^53을 넘는 정수는 수다: 숫자 그대로 보이고, 적은 큰 정수는 그대로 간다 (범위 밖이면 자른다)", () => {
    const r = renderArg(argOf("setVar", "value"), bigIntValue("12345678901234567890"));
    expect(input().value).toBe("12345678901234567890");
    expect(screen.queryByText(/타입 불일치/)).toBeNull();
    expect(document.body.textContent).not.toContain("INT:");
    focus(input());
    typeIn(input(), "98765432109876543210");
    typeIn(input(), "-98765432109876543210");
    typeIn(input(), "0012");
    expect(r.values()).toEqual([bigIntValue("98765432109876543210"), bigIntValue("-98765432109876543210"), 12]);
    cleanup();
    const ms = renderArg(argOf("wait", "ms"), 10);
    focus(input());
    typeIn(input(), "-12345678901234567890");
    typeIn(input(), "12345678901234567890");
    expect(ms.values()).toEqual([0, bigIntValue("12345678901234567890")]);
  });
});

describe("boolean, enum, scalar", () => {
  it("선택 참거짓은 세 상태 (비움은 기본값을 보인다), 필수는 체크 상자", () => {
    const r = renderArg(argOf("moveRoute", "wait"), undefined);
    expect(optionTexts(select("arg"))).toEqual(["지정 안 함 (기본값 참)", "참", "거짓"]);
    fireEvent.change(select("arg"), { target: { value: "false" } });
    fireEvent.change(select("arg"), { target: { value: "" } });
    expect(r.values()).toEqual([false, undefined]);
    cleanup();
    const req = renderArg({ name: "x", type: "boolean", label: "x", required: true }, false);
    fireEvent.click(input());
    expect(req.last()).toBe(true);
  });

  it("고르기: 목록에 없는 파일의 값을 덧붙여 보이고, 선택 칸은 비울 수 있다", () => {
    const r = renderArg(argOf("turn", "dir"), "sideways");
    expect(optionTexts(select("arg"))).toEqual(["sideways (목록에 없음)", "down", "left", "right", "up"]);
    fireEvent.change(select("arg"), { target: { value: "left" } });
    expect(r.last()).toBe("left");
    expect(optionTexts(select("arg"))).toEqual(["down", "left", "right", "up"]);
    cleanup();
    const t = renderArg(argOf("transfer", "dir"), "up");
    fireEvent.change(select("arg"), { target: { value: "" } });
    expect(t.last()).toBeUndefined();
  });

  it("스칼라: 종류를 고르면 값을 바꿔 들고, 비우면 지운다", () => {
    const r = renderArg(argOf("setFlag", "value"), undefined);
    fireEvent.change(select("arg-kind"), { target: { value: "number" } });
    focus(input());
    typeIn(input(), "5");
    blur(input());
    fireEvent.change(select("arg-kind"), { target: { value: "string" } });
    fireEvent.change(select("arg-kind"), { target: { value: "boolean" } });
    fireEvent.change(select("arg"), { target: { value: "false" } });
    fireEvent.change(select("arg-kind"), { target: { value: "" } });
    expect(r.values()).toEqual([0, 5, "5", true, false, undefined]);
  });

  it("스칼라의 큰 정수는 수 종류로 숫자 그대로 보이고, 글로 바꾸면 그 숫자 글이다", () => {
    const r = renderArg(argOf("setFlag", "value"), bigIntValue("12345678901234567890"));
    expect(select("arg-kind").value).toBe("number");
    expect(input().value).toBe("12345678901234567890");
    fireEvent.change(select("arg-kind"), { target: { value: "string" } });
    fireEvent.change(select("arg-kind"), { target: { value: "number" } });
    expect(r.values()).toEqual(["12345678901234567890", bigIntValue("12345678901234567890")]);
  });

  it("글과 고르기 칸의 큰 정수는 타입이 틀린 값이고 숫자로 알린다", () => {
    renderArg(argOf("message", "name"), bigIntValue("12345678901234567890"));
    expect(input().value).toBe("");
    expect(screen.getByText(/타입 불일치/).textContent).toBe("타입 불일치 (현재: 12345678901234567890)");
    cleanup();
    renderArg(argOf("turn", "dir"), bigIntValue("12345678901234567890"));
    expect(optionTexts(select("arg"))[0]).toBe("12345678901234567890 (목록에 없음)");
    expect(select("arg").title).toBe("12345678901234567890 (목록에 없음)");
  });
});

describe("ref", () => {
  const suggested = () => [...screen.getByTestId("arg-suggest").querySelectorAll("option")].map((o) => [o.getAttribute("value"), o.getAttribute("label")]);

  it("맵: rpg-game.json 의 이름, 없는 이름은 경고", () => {
    renderArg(argOf("transfer", "map"), "nowhere");
    expect(suggested().map((s) => s[0])).toEqual(["port_town", "inn", "village", "room"]);
    expect(screen.getByTestId("arg-note").textContent).toBe("목록에 없음");
    expect(screen.getByTestId("arg-note").className).toContain("is-warning");
    focus(input());
    typeIn(input(), "inn");
    expect(screen.getByTestId("arg-note").textContent).toBe("resources/maps/inn.json");
  });

  it("아이템: 표의 id 와 이름", () => {
    renderArg(argOf("giveItem", "item"), "shell");
    expect(suggested()).toContainEqual(["warehouse_key", "창고 열쇠"]);
    expect(screen.getByTestId("arg-note").textContent).toBe("조개 목걸이");
  });

  it("대상: 이 맵의 이벤트와 player, 외형 없는 이벤트는 그렇다고", () => {
    renderArg(argOf("turn", "target"), "sign");
    expect(suggested()).toEqual([
      ["npc", null],
      ["sign", "외형 없음"],
      ["player", "플레이어"],
    ]);
  });

  it("깃발과 변수: 쓰인 이름을 제안하고, 새 이름은 경고가 아니다", () => {
    const r = renderArg(argOf("setFlag", "key"), "arrived");
    expect(suggested().map((s) => s[0])).toEqual(["arrived"]);
    focus(input());
    typeIn(input(), "newFlag");
    expect(screen.getByTestId("arg-note").textContent).toBe("새 이름");
    expect(screen.getByTestId("arg-note").className).not.toContain("is-warning");
    expect(r.last()).toBe("newFlag");
    cleanup();
    renderArg(argOf("setVar", "key"), "");
    expect(suggested().map((s) => s[0])).toEqual(["coins"]);
  });

  it("깃발과 변수: 2^53을 넘는 정수 키(표식 글)는 제안에 나오지 않는다", () => {
    const big = editorHarness([
      { id: "a", x: 1, y: 1, commands: [{ code: "setFlag", key: bigIntValue("12345678901234567890") }, { code: "setFlag", key: "met" }] },
      { id: "b", x: 2, y: 1, commands: [{ code: "setVar", key: bigIntValue("98765432109876543210"), value: 1 }, { code: "if", cond: { var: "coins" }, thenDo: [] }] },
    ]);
    renderArg(argOf("setFlag", "key"), "", { refs: big.refs });
    expect(suggested().map((s) => s[0])).toEqual(["met"]);
    cleanup();
    renderArg(argOf("setVar", "key"), "", { refs: big.refs });
    expect(suggested().map((s) => s[0])).toEqual(["coins"]);
    expect(screen.getByTestId("arg-suggest").innerHTML).not.toContain("INT:");
  });
});

describe("file", () => {
  it("확장자에 맞는 파일만, 시작 폴더가 먼저. 값은 ./ 꼴", () => {
    const r = renderArg(argOf("playSe", "file"), undefined);
    expect(optionTexts(select("arg"))).toEqual(["파일 선택", "resources/audio/bell.ogg", "resources/audio/door.wav", "resources/bgm/harbor.ogg"]);
    expect(select("arg").hasAttribute("title")).toBe(false);
    fireEvent.change(select("arg"), { target: { value: "resources/audio/door.wav" } });
    expect(r.last()).toBe("./resources/audio/door.wav");
    expect(select("arg").value).toBe("resources/audio/door.wav");
    // 상자보다 긴 경로도 읽을 수 있게 고른 값의 글을 title 로 둔다
    expect(select("arg").title).toBe("resources/audio/door.wav");
  });

  it("프로젝트에 없는 파일은 그렇다고 보이고, 고를 파일이 없으면 알린다", () => {
    renderArg(argOf("playSe", "file"), "./resources/audio/gone.wav");
    expect(optionTexts(select("arg"))[0]).toBe("resources/audio/gone.wav (프로젝트에 없음)");
    expect(select("arg").title).toBe("resources/audio/gone.wav (프로젝트에 없음)");
    cleanup();
    renderArg(argOf("playSe", "file"), undefined, { files: ["resources/images/a.png"] });
    expect(screen.getByTestId("arg-none").textContent).toContain("wav, ogg");
  });
});

describe("face, charset", () => {
  it("얼굴: 논리 이름을 고르고 4x4 격자를 눌러 번호를 고른다. 그림은 후보 중 있는 파일", () => {
    const imageUrl = vi.fn((p: string) => `blob:${p}`);
    const r = renderArg(argOf("message", "face"), undefined, { imageUrl });
    expect(screen.queryByTestId("arg-grid")).toBeNull();
    fireEvent.change(select("arg-mode"), { target: { value: "set" } });
    expect(r.last()).toEqual({ set: "npc", index: 0 });
    const cells = within(screen.getByTestId("arg-grid")).getAllByRole("button");
    expect(cells).toHaveLength(16);
    fireEvent.click(screen.getByTestId("arg-grid-5"));
    expect(r.last()).toEqual({ set: "npc", index: 5 });
    expect(screen.getByTestId("arg-grid-5").getAttribute("aria-pressed")).toBe("true");
    const frame = screen.getByTestId("arg-grid-5").querySelector(".rpg-sheet-image") as HTMLElement;
    expect(frame.style.backgroundPosition).toBe("-48px -48px");
    expect(frame.style.backgroundImage).toContain("blob:resources/faces/placeholder.png");
    expect(imageUrl).toHaveBeenCalledWith("resources/faces/placeholder.png");
    // 파일로 바꾸면 푼 파일과 번호를 지킨다. 없음은 지운다
    fireEvent.change(select("arg-mode"), { target: { value: "file" } });
    expect(r.last()).toEqual({ file: "./resources/faces/placeholder.png", index: 5 });
    expect(optionTexts(select("arg-file"))).toEqual(["resources/charsets/placeholder.png", "resources/faces/placeholder.png", "resources/images/port16.png"]);
    fireEvent.change(select("arg-mode"), { target: { value: "" } });
    expect(r.last()).toBeUndefined();
  });

  it("외형(이벤트 칸): 8명 격자와 서 있는 정면 프레임, 모르는 이름은 그렇다고", () => {
    const r = renderArg(fieldSpec(schema, "charset")!, { set: "ghost", index: 1 });
    expect(optionTexts(select("arg-set"))[0]).toBe("ghost (스키마에 없는 이름)");
    expect(within(screen.getByTestId("arg-grid")).getAllByRole("button")).toHaveLength(8);
    const frame = screen.getByTestId("arg-grid-6").firstElementChild as HTMLElement;
    expect((frame.querySelector(".rpg-sheet-image") as HTMLElement).style.backgroundPosition).toBe("-168px -192px");
    expect(frame.textContent).toBe("6");
    fireEvent.change(select("arg-set"), { target: { value: "player" } });
    fireEvent.click(screen.getByTestId("arg-grid-6"));
    expect(r.values()).toEqual([
      { set: "player", index: 1 },
      { set: "player", index: 6 },
    ]);
  });

  it("격자의 폭이 모자라면 칸의 그림을 같은 배율로 줄여 폭 안에 든다 (넉넉하면 원래 크기)", () => {
    // jsdom 에는 배치가 없어 격자의 폭과 ResizeObserver 를 흉내 낸다
    let width = 150;
    const observers: Array<() => void> = [];
    const saved = { ro: globalThis.ResizeObserver, cw: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth") };
    globalThis.ResizeObserver = class {
      constructor(private readonly cb: () => void) {}
      observe() {
        observers.push(this.cb);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width });
    try {
      renderArg(argOf("message", "face"), { set: "npc", index: 5 }, { imageUrl: (p) => `blob:${p}` });
      const grid = screen.getByTestId("arg-grid");
      const frame = (i: number) => screen.getByTestId(`arg-grid-${i}`).firstElementChild as HTMLElement;
      const image = (i: number) => frame(i).querySelector(".rpg-sheet-image") as HTMLElement;
      // 150px: 칸 테두리 4px 씩과 칸 사이 2px 셋을 빼면 칸마다 32px, 48px 얼굴의 2/3
      expect(grid.dataset.scale).toBe("0.667");
      expect([frame(5).style.width, frame(5).style.height]).toEqual(["32px", "32px"]);
      expect(image(5).style.transform).toBe("scale(0.6666666666666666)");
      expect([image(5).style.width, image(5).style.backgroundPosition]).toEqual(["48px", "-48px -48px"]);
      // 넓어지면 원래 크기
      width = 400;
      act(() => observers.forEach((cb) => cb()));
      expect(grid.dataset.scale).toBe("1.000");
      expect(frame(5).style.width).toBe("48px");
      expect(image(5).style.transform).toBe("");
    } finally {
      globalThis.ResizeObserver = saved.ro;
      if (saved.cw) Object.defineProperty(HTMLElement.prototype, "clientWidth", saved.cw);
      else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }
  });

  it("그림 파일이 프로젝트에 없으면 알린다", () => {
    renderArg(argOf("message", "face"), { file: "./resources/faces/gone.png", index: 0 });
    expect(screen.getByTestId("arg-missing").textContent).toContain("resources/faces/gone.png");
  });
});

describe("options", () => {
  function renderOptions(value: unknown[], opts: { cancel?: number; branchSizes?: number[]; confirm?: () => boolean } = {}) {
    const ops: Required<OptionOps> = { add: vi.fn(), remove: vi.fn(), move: vi.fn(), set: vi.fn(), setCancel: vi.fn() };
    const ctx: ArgContext = { schema, refs, files: TEST_FILES, confirm: opts.confirm ?? (() => true) };
    render(<OptionsArg spec={argOf("choice", "options")} value={value} cancel={opts.cancel} branchSizes={opts.branchSizes} ops={ops} ctx={ctx} sessionPrefix="o" testId="opt" />);
    return ops;
  }

  it("더하기, 고치기, 옮기기, 취소 번호 고르기가 항목 명령을 부른다", () => {
    const ops = renderOptions(["떠난다", "더 둘러본다"], { cancel: 2 });
    fireEvent.click(screen.getByTestId("opt-add"));
    expect(ops.add).toHaveBeenCalledWith(2, "항목 3");
    focus(input("opt-0-text"));
    typeIn(input("opt-0-text"), "간다");
    expect(ops.set).toHaveBeenCalledWith(0, "간다", expect.stringMatching(/^o:0#/));
    fireEvent.click(screen.getByTestId("opt-0-down"));
    expect(ops.move).toHaveBeenCalledWith(0, 1);
    expect((screen.getByTestId("opt-1-cancel") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId("opt-0-cancel"));
    expect(ops.setCancel).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByTestId("opt-cancel-none"));
    expect(ops.setCancel).toHaveBeenLastCalledWith(undefined);
    expect((screen.getByTestId("opt-0-up") as HTMLButtonElement).disabled).toBe(true);
  });

  it("가지에 커맨드가 있는 항목을 빼면 묻는다. 아니오면 그대로", async () => {
    const confirm = vi.fn(() => false);
    const ops = renderOptions(["a", "b"], { branchSizes: [0, 2], confirm });
    await act(async () => fireEvent.click(screen.getByTestId("opt-1-remove")));
    expect(confirm).toHaveBeenCalledWith("2번 항목의 분기에 커맨드가 2개 있습니다. 분기와 함께 삭제할까요?");
    expect(ops.remove).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByTestId("opt-0-remove")));
    expect(ops.remove).toHaveBeenCalledWith(0);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("항목이 min 개면 뺄 수 없고, 항목 밖의 취소 번호는 경고한다", () => {
    renderOptions(["a"], { cancel: 3 });
    expect((screen.getByTestId("opt-0-remove") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("opt-cancel-outside").textContent).toContain("3");
  });

  it("값만 고치는 ops (가지 없는 자리)", () => {
    const seen: unknown[] = [];
    const ops = valueOptionOps(["a", "b"], (v) => seen.push(v));
    ops.add(1, "x");
    ops.move(0, 1);
    ops.set(1, "c");
    ops.remove(0);
    expect(seen).toEqual([["a", "x", "b"], ["b", "a"], ["a", "c"], ["b"]]);
  });
});

describe("route", () => {
  it("걸음마다 종류와 방향, 기다리기 ms, 모르는 걸음은 글 그대로", () => {
    const r = renderArg(argOf("moveRoute", "route"), ["up", "turn:left", "wait:300", "jump"]);
    expect([0, 1, 2, 3].map((k) => select(`arg-${k}-kind`).value)).toEqual(["move", "turn", "wait", "raw"]);
    fireEvent.change(select("arg-1-dir"), { target: { value: "right" } });
    expect(r.last()).toEqual(["up", "turn:right", "wait:300", "jump"]);
    focus(input("arg-2-ms"));
    typeIn(input("arg-2-ms"), "45");
    typeIn(input("arg-2-ms"), "450");
    expect(r.last()).toEqual(["up", "turn:right", "wait:450", "jump"]);
    expect(r.calls.at(-1)?.[1]).toBe(r.calls.at(-2)?.[1]);
    blur(input("arg-2-ms"));
    fireEvent.change(select("arg-0-kind"), { target: { value: "wait" } });
    expect(r.last()).toEqual(["wait:500", "turn:right", "wait:450", "jump"]);
    expect(input("arg-3-text").value).toBe("jump");
  });

  it("더하기, 옮기기, 빼기가 한 번에 한 값", () => {
    const r = renderArg(argOf("moveRoute", "route"), []);
    fireEvent.click(screen.getByTestId("arg-add-down"));
    fireEvent.click(screen.getByTestId("arg-add-turn"));
    fireEvent.click(screen.getByTestId("arg-add-wait"));
    fireEvent.click(screen.getByTestId("arg-2-up"));
    fireEvent.click(screen.getByTestId("arg-0-remove"));
    expect(r.values()).toEqual([["down"], ["down", "turn:up"], ["down", "turn:up", "wait:500"], ["down", "wait:500", "turn:up"], ["wait:500", "turn:up"]]);
    expect(r.calls.every((c) => c[1] === undefined)).toBe(true);
  });

  it("배열이 아니면 알리고 비우고 새로 시작할 수 있다", () => {
    const r = renderArg(argOf("moveRoute", "route"), "up");
    expect(screen.getByTestId("arg-broken")).toBeTruthy();
    fireEvent.click(screen.getByText("빈 배열로 교체"));
    expect(r.last()).toEqual([]);
  });
});

describe("condition", () => {
  it("꼴을 바꾸면 다른 꼴의 칸을 지우고 스키마에 없는 칸은 둔다. 그 꼴의 칸을 적는다", () => {
    const r = renderArg(argOf("if", "cond"), { flag: "arrived", equals: false, note: "keep" });
    expect(select("arg-kind").value).toBe("flag");
    expect(screen.getByTestId("arg-equals-kind")).toBeTruthy();
    fireEvent.change(select("arg-kind"), { target: { value: "item" } });
    expect(r.last()).toEqual({ item: "", note: "keep" });
    focus(input("arg-item"));
    typeIn(input("arg-item"), "shell");
    fireEvent.change(select("arg-op"), { target: { value: ">=" } });
    blur(input("arg-item"));
    focus(input("arg-value"));
    typeIn(input("arg-value"), "2");
    expect(r.last()).toEqual({ item: "shell", note: "keep", op: ">=", value: 2 });
  });

  it("빈 조건과 꼴이 둘인 조건은 경고한다 (엔진은 앞의 꼴만 본다)", () => {
    renderArg(argOf("if", "cond"), {});
    expect(screen.getByTestId("arg-empty")).toBeTruthy();
    expect(optionTexts(select("arg-kind"))[0]).toBe("빈 조건 (항상 참)");
    cleanup();
    renderArg(argOf("if", "cond"), { flag: "a", item: "b" });
    expect(select("arg-kind").value).toBe("item");
    expect(screen.getByTestId("arg-many").textContent).toContain("조건 종류가 2개 이상입니다 (item, flag). 엔진은 첫 번째 item 조건만 사용합니다. 종류를 다시 선택하면 1개만 유지됩니다.");
  });
});

describe("json", () => {
  it("해석되면 값으로, 안 되면 오류만 보이고 값을 바꾸지 않는다. 비우면(선택) 지운다", () => {
    const r = renderArg(argOf("script", "args"), { a: 1 });
    expect(input().value).toBe('{\n  "a": 1\n}');
    expect(screen.getByTestId("arg-result").textContent).toBe("객체 (키 1개)");
    focus(input());
    typeIn(input(), "[1, 2");
    expect(screen.getByTestId("arg-error").textContent).toMatch(/JSON 구문 오류/);
    typeIn(input(), "[1, 2]");
    expect(screen.getByTestId("arg-result").textContent).toBe("배열 (요소 2개)");
    typeIn(input(), "null");
    typeIn(input(), "");
    expect(r.values()).toEqual([[1, 2], undefined, undefined]);
  });

  it("2^53 을 넘는 정수는 숫자 그대로 보이고, 고친 글에서도 그대로 간다", () => {
    const r = renderArg(argOf("script", "args"), { seed: bigIntValue("12345678901234567890") });
    expect(input().value).toBe('{\n  "seed": 12345678901234567890\n}');
    focus(input());
    typeIn(input(), '{"seed": 98765432109876543210, "n": 1}');
    expect(r.last()).toEqual({ seed: bigIntValue("98765432109876543210"), n: 1 });
    typeIn(input(), "12345678901234567890");
    expect(screen.getByTestId("arg-result").textContent).toBe("숫자");
  });
});

describe("wander", () => {
  it("켜기와 끄기, 기다리는 프레임 수, 구역의 칸", () => {
    const r = renderArg(fieldSpec(schema, "wander")!, undefined);
    fireEvent.click(input("arg-on"));
    expect(r.last()).toEqual({});
    focus(input("arg-minWait"));
    typeIn(input("arg-minWait"), "10");
    expect(r.last()).toEqual({ minWait: 10 });
    expect(input("arg-maxWait").placeholder).toBe("기본값 120");
    cleanup();
    const a = renderArg(fieldSpec(schema, "wander")!, { area: { x: 1, y: 2, w: 3, h: 4 } });
    focus(input("arg-area-w"));
    typeIn(input("arg-area-w"), "0");
    expect(a.last()).toEqual({ area: { x: 1, y: 2, w: 1, h: 4 } });
    blur(input("arg-area-w"));
    fireEvent.click(screen.getByTestId("arg-area-clear"));
    expect(a.last()).toEqual({});
    fireEvent.click(input("arg-on"));
    expect(a.last()).toBeUndefined();
  });
});

describe("ArgRow", () => {
  it("필수 표시, 선택 인자의 지우기, 그 자리의 문제", () => {
    render(
      <ArgRow
        spec={argOf("wait", "ms")}
        value={-1}
        onChange={() => undefined}
        ctx={{ schema, refs, files: TEST_FILES, confirm: () => true }}
        sessionPrefix="p"
        testId="arg"
        problems={[{ severity: "error", message: "0 이상이어야 합니다 (현재: -1)", location: "events[1].commands[1].ms", source: "engine" }]}
      />,
    );
    expect(screen.getByTitle("필수")).toBeTruthy();
    expect(screen.queryByTestId("arg-clear")).toBeNull();
    expect(screen.getByTestId("arg-problem").className).toContain("is-error");
  });

  it("잠기면 위젯이 꺼진다", () => {
    renderArg(argOf("message", "text"), "a", { disabled: true });
    expect(input().disabled).toBe(true);
  });
});
