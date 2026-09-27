// @vitest-environment jsdom
// 입력 부품의 세션 규칙: 초점 하나 동안의 타이핑은 같은 합치기 키, Enter 나 초점을 잃으면 끝난다. 값 고치기(반올림, 범위).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FieldRow, MIXED_LABEL, newSession, NumberField, TextField } from "./fields";
import { EMPTY_LABEL, OptionalNumberField, SchemaFieldInput, type SchemaFieldSpec } from "./schemaField";

afterEach(cleanup);

type Call = [unknown, string | undefined];

function calls() {
  const list: Call[] = [];
  return { list, on: (v: unknown, s?: string) => void list.push([v, s]) };
}

describe("newSession", () => {
  it("부를 때마다 앞부분을 지킨 새 키다", () => {
    const a = newSession("obj:x");
    const b = newSession("obj:x");
    expect(a).toMatch(/^obj:x#\d+$/);
    expect(b).not.toBe(a);
  });
});

describe("NumberField", () => {
  it("한 초점 동안의 타이핑은 같은 세션이고, Enter 뒤의 타이핑은 새 세션이다. 정수와 범위로 고친다", () => {
    const c = calls();
    render(<NumberField value={3} onChange={c.on} sessionPrefix="p" integer min={0} max={10} testId="n" />);
    const input = screen.getByTestId("n") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "4.6" } });
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "-3" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(c.list.map(([v]) => v)).toEqual([5, 10, 0]);
    expect(c.list[0][1]).toBe(c.list[1][1]);
    expect(c.list[2][1]).not.toBe(c.list[1][1]);
  });

  it("값이 여러 개(null)면 비워 두고 여러 값이라 보인다", () => {
    render(<NumberField value={null} onChange={() => {}} sessionPrefix="p" testId="n" />);
    const input = screen.getByTestId("n") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe(MIXED_LABEL);
  });
});

describe("TextField", () => {
  it("초점을 잃으면 세션이 끝난다", () => {
    const c = calls();
    render(<TextField value="" onChange={c.on} sessionPrefix="t" testId="t" />);
    const input = screen.getByTestId("t");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.blur(input);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "abc" } });
    expect(c.list.map(([v]) => v)).toEqual(["a", "ab", "abc"]);
    expect(c.list[0][1]).toBe(c.list[1][1]);
    expect(c.list[2][1]).not.toBe(c.list[1][1]);
  });

  it("여러 줄이면 textarea 다", () => {
    render(<TextField value={"줄1\n줄2"} onChange={() => {}} sessionPrefix="t" multiline testId="t" />);
    expect(screen.getByTestId("t").tagName).toBe("TEXTAREA");
    expect((screen.getByTestId("t") as HTMLTextAreaElement).value).toBe("줄1\n줄2");
  });
});

describe("초점이 있는 동안 밖에서 바뀐 값 (입력 칸 안의 Ctrl+Z)", () => {
  it("TextField: 글이 되돌린 값을 따라가고, 다음 타이핑은 되돌린 글을 되살리지 않는 새 세션이다", () => {
    const c = calls();
    const view = (value: string) => <TextField value={value} onChange={c.on} sessionPrefix="t" multiline testId="t" />;
    const { rerender } = render(view("잘 왔네."));
    const input = screen.getByTestId("t") as HTMLTextAreaElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "잘 왔네. XYZ" } });
    rerender(view("잘 왔네. XYZ"));
    expect(input.value).toBe("잘 왔네. XYZ");
    rerender(view("잘 왔네."));
    expect(input.value).toBe("잘 왔네.");
    fireEvent.change(input, { target: { value: "잘 왔네.Q" } });
    expect(c.list.map(([v]) => v)).toEqual(["잘 왔네. XYZ", "잘 왔네.Q"]);
    expect(c.list[1][1]).not.toBe(c.list[0][1]);
  });

  it("NumberField: 칸이 보낸 값이 돌아오면 글을 두고(4.6 은 5 로 보냈다), 다른 값이면 따라간다", () => {
    const c = calls();
    const view = (value: number) => <NumberField value={value} onChange={c.on} sessionPrefix="n" integer testId="n" />;
    const { rerender } = render(view(3));
    const input = screen.getByTestId("n") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "4.6" } });
    rerender(view(5));
    expect(input.value).toBe("4.6");
    rerender(view(3));
    expect(input.value).toBe("3");
    fireEvent.change(input, { target: { value: "8" } });
    expect(c.list.map(([v]) => v)).toEqual([5, 8]);
    expect(c.list[1][1]).not.toBe(c.list[0][1]);
  });

  it("OptionalNumberField 도 같다", () => {
    const c = calls();
    const view = (value: number | undefined) => <OptionalNumberField value={value} onChange={c.on} sessionPrefix="o" testId="o" />;
    const { rerender } = render(view(1));
    const input = screen.getByTestId("o") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "2" } });
    rerender(view(2));
    rerender(view(1));
    expect(input.value).toBe("1");
  });
});

describe("Enter", () => {
  it("기본은 초점을 놓고, stay 는 초점을 두고 세션만 끝낸다", () => {
    const c = calls();
    render(
      <>
        <TextField value="" onChange={c.on} sessionPrefix="a" testId="blur" />
        <TextField value="" onChange={c.on} sessionPrefix="b" enter="stay" testId="stay" />
        <NumberField value={1} onChange={c.on} sessionPrefix="c" enter="stay" testId="num" />
      </>,
    );
    const blur = screen.getByTestId("blur") as HTMLInputElement;
    blur.focus();
    fireEvent.keyDown(blur, { key: "Enter" });
    expect(document.activeElement).not.toBe(blur);
    const stay = screen.getByTestId("stay") as HTMLInputElement;
    stay.focus();
    fireEvent.change(stay, { target: { value: "a" } });
    fireEvent.keyDown(stay, { key: "Enter" });
    expect(document.activeElement).toBe(stay);
    fireEvent.change(stay, { target: { value: "ab" } });
    expect(c.list[1][1]).not.toBe(c.list[0][1]);
    const num = screen.getByTestId("num") as HTMLInputElement;
    num.focus();
    fireEvent.keyDown(num, { key: "Enter" });
    expect(document.activeElement).toBe(num);
  });
});

describe("OptionalNumberField", () => {
  it("비어 있으면 비어 있음이라 보이고, 비운 채 두면 값을 바꾸지 않는다", () => {
    const c = calls();
    render(<OptionalNumberField value={undefined} onChange={c.on} sessionPrefix="o" testId="o" />);
    const input = screen.getByTestId("o") as HTMLInputElement;
    expect(input.placeholder).toBe(EMPTY_LABEL);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "7" } });
    expect(c.list.map(([v]) => v)).toEqual([7]);
  });
});

describe("SchemaFieldInput", () => {
  const field = (f: Partial<SchemaFieldSpec> & Pick<SchemaFieldSpec, "type">): SchemaFieldSpec => ({ name: "f", label: "칸", ...f });

  it("enum 은 고르기이고 목록 밖의 값은 목록에 없음으로 남는다. 고르면 세션 없이 한 번이다", () => {
    const c = calls();
    render(<SchemaFieldInput field={field({ type: "enum", values: ["a", "b"] })} value="zz" onChange={c.on} sessionPrefix="s" testId="s" />);
    const select = screen.getByTestId("s") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["zz (목록에 없음)", "a", "b"]);
    fireEvent.change(select, { target: { value: "b" } });
    expect(c.list).toEqual([["b", undefined]]);
  });

  it("boolean 은 체크 상자이고, 여러 값이면 indeterminate 와 여러 값 글이다", () => {
    const c = calls();
    render(<SchemaFieldInput field={field({ type: "boolean" })} value={null} onChange={c.on} sessionPrefix="s" testId="s" />);
    const box = screen.getByTestId("s") as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    expect(screen.getByText(MIXED_LABEL)).toBeTruthy();
    fireEvent.click(box);
    expect(c.list).toEqual([[true, undefined]]);
  });

  it("integer 는 반올림하고 min, max 로 자른다. text 는 여러 줄이다", () => {
    const c = calls();
    const { unmount } = render(<SchemaFieldInput field={field({ type: "integer", min: 1, max: 5 })} value={2} onChange={c.on} sessionPrefix="s" testId="s" />);
    const input = screen.getByTestId("s");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "3.4" } });
    fireEvent.change(input, { target: { value: "9" } });
    expect(c.list.map(([v]) => v)).toEqual([3, 5]);
    expect(c.list[0][1]).toBe(c.list[1][1]);
    unmount();
    render(<SchemaFieldInput field={field({ type: "text" })} value={undefined} onChange={() => {}} sessionPrefix="s" testId="s" />);
    expect(screen.getByTestId("s").tagName).toBe("TEXTAREA");
    expect((screen.getByTestId("s") as HTMLTextAreaElement).placeholder).toBe(EMPTY_LABEL);
  });
});

describe("FieldRow", () => {
  it("라벨과 칸과 힌트", () => {
    render(
      <FieldRow label="x" hint="픽셀">
        <span>값</span>
      </FieldRow>,
    );
    expect(screen.getByText("x").className).toBe("field-label");
    expect(screen.getByText("값").parentElement?.className).toBe("field-control");
    expect(screen.getByText("x").parentElement?.getAttribute("title")).toBe("픽셀");
  });
});
