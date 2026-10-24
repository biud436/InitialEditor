// @vitest-environment jsdom
// 화면 부품: 숫자 칸의 화살표와 끌기(한 번 끄는 동안이 한 세션), 선택 목록의 키보드, 여럿 중 하나, 체크 상자의 여러 값, 툴팁.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Grid3x3, Pencil } from "lucide-react";
import { Checkbox, IconButton, NumberInput, SegmentedControl, Select, Vector2Input } from "./index";

// jsdom 에는 PointerEvent 가 없어 button 과 clientX 가 실리지 않는다. MouseEvent 에 pointerId 를 더한 것으로 채운다
if (typeof window.PointerEvent === "undefined") {
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: typeof TestPointerEvent }).PointerEvent = TestPointerEvent;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function recorder() {
  const list: Array<[number, string]> = [];
  return { list, on: (v: number, s: string) => void list.push([v, s]) };
}

describe("NumberInput", () => {
  it("위아래 화살표는 step 만큼, Shift 는 10배로 바꾸고 범위로 자른다", () => {
    const r = recorder();
    render(<NumberInput value={5} step={1} min={0} max={20} onChange={r.on} sessionPrefix="n" ariaLabel="값" />);
    const input = screen.getByLabelText("값");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp", shiftKey: true });
    expect(r.list.map(([v]) => v)).toEqual([6, 15]);
  });

  it("축 글자를 끄는 동안의 변경은 같은 세션이고, 다음에 끌면 새 세션이다", () => {
    const r = recorder();
    const { container } = render(<NumberInput value={10} axis="X" onChange={r.on} sessionPrefix="pos" ariaLabel="x" />);
    const axis = container.querySelector(".kit-number-axis") as HTMLElement;
    axis.setPointerCapture = () => undefined;
    axis.releasePointerCapture = () => undefined;
    fireEvent.pointerDown(axis, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(axis, { clientX: 110, pointerId: 1 });
    fireEvent.pointerMove(axis, { clientX: 120, pointerId: 1 });
    fireEvent.pointerUp(axis, { pointerId: 1 });
    fireEvent.pointerDown(axis, { button: 0, clientX: 100, pointerId: 2 });
    fireEvent.pointerMove(axis, { clientX: 90, pointerId: 2 });
    fireEvent.pointerUp(axis, { pointerId: 2 });
    expect(r.list.map(([v]) => v)).toEqual([15, 20, 5]);
    expect(r.list[0][1]).toBe(r.list[1][1]);
    expect(r.list[2][1]).not.toBe(r.list[1][1]);
  });

  it("값이 null 이면 여러 값으로 보인다", () => {
    render(<NumberInput value={null} onChange={() => undefined} sessionPrefix="m" ariaLabel="m" />);
    expect((screen.getByLabelText("m") as HTMLInputElement).placeholder).toBe("여러 값");
  });

  it("Vector2Input 은 축마다 따로 보낸다", () => {
    const got: string[] = [];
    render(<Vector2Input x={1} y={2} ariaLabel="위치" sessionPrefix="v" onChange={(a, v) => got.push(`${a}=${v}`)} />);
    const y = screen.getByLabelText("위치 Y");
    fireEvent.focus(y);
    fireEvent.change(y, { target: { value: "7" } });
    expect(got).toEqual(["y=7"]);
  });
});

describe("Select", () => {
  const options = [
    { value: "fly", label: "날갯짓" },
    { value: "fall", label: "떨어지기", disabled: true },
    { value: "dead", label: "부딪힘" },
  ] as const;

  it("화살표로 옮길 때 쓸 수 없는 항목을 건너뛰고 Enter 로 고른다", () => {
    const onChange = vi.fn();
    render(<Select value="fly" options={options} onChange={onChange} ariaLabel="애니메이션" />);
    const trigger = screen.getByLabelText("애니메이션");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("dead");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Esc 는 고르지 않고 닫는다", () => {
    const onChange = vi.fn();
    render(<Select value="fly" options={options} onChange={onChange} ariaLabel="a" />);
    const trigger = screen.getByLabelText("a");
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("값이 없으면 자리 글을 보여 준다", () => {
    render(<Select value={null} options={options} onChange={() => undefined} ariaLabel="b" placeholder="고르기" />);
    expect(screen.getByLabelText("b").textContent).toContain("고르기");
  });
});

describe("SegmentedControl", () => {
  it("고른 항목은 aria-checked 이고 누르면 바뀐다", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        ariaLabel="도구"
        value="pen"
        onChange={onChange}
        options={[
          { value: "pen", icon: Pencil, title: "펜" },
          { value: "grid", icon: Grid3x3, title: "격자" },
        ]}
      />,
    );
    expect(screen.getByRole("radio", { name: "펜" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "격자" }));
    expect(onChange).toHaveBeenCalledWith("grid");
  });
});

describe("Checkbox", () => {
  it("null 은 여러 값(mixed)이다", () => {
    render(<Checkbox checked={null} onChange={() => undefined} label="반복" />);
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("mixed");
  });
});

describe("IconButton", () => {
  it("이름은 접근성 이름이고, 마우스를 올리면 잠시 뒤 툴팁에 이름과 단축키가 보인다", () => {
    vi.useFakeTimers();
    render(<IconButton icon={Pencil} label="펜" shortcut="B" />);
    const button = screen.getByRole("button", { name: "펜" });
    fireEvent.pointerEnter(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toBe("펜B");
    fireEvent.pointerLeave(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
