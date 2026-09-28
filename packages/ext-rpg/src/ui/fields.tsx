// ext-rpg 의 입력 칸. packages/ui 의 부품과 세션 규칙(newSession, useFieldText)을 쓰고, 거기에 아직 없는 둘만 여기서 채운다:
//   TextField 의 list    제안 목록(datalist)이 붙는 한 줄 입력 (ref 칸, suggest 가 있는 칸)
//   NumberInput          비어 있을 수 있는 숫자 칸. 비었을 때의 안내 글(기본값)과 끄기가 있다. 2^53을 넘는 정수(표식 글)는 숫자
//                        그대로 보이고, exact면 그런 정수를 적은 그대로 표식 글로 보낸다 (아니면 가까운 수)
// 둘 다 packages/ui 의 같은 부품과 세션 규칙이 같다: 초점 한 번이 한 세션이고 초점을 잃으면 끝난다. 초점이 있는 동안 밖에서
// 값이 바뀌면(입력 칸 안의 Ctrl+Z) 글이 따라간다.
// 한 줄 칸의 Enter 는 초점을 두고 세션만 끝낸다 (고친 값을 넣고 폼에 남는다. 다음 타이핑은 새 되돌리기 단계다).

import { TextField as UiTextField, useFieldText } from "@initial-editor/ui";
import { type ComponentProps, type KeyboardEvent } from "react";
import { bigIntText, jsonNumber, numberFromText } from "../model/json";

export { FieldRow, newSession } from "@initial-editor/ui";

type UiTextFieldProps = ComponentProps<typeof UiTextField>;

/** packages/ui 의 TextField (Enter 는 초점을 둔다). list 가 있으면 제안 목록이 붙는 한 줄 입력이다 */
export function TextField({ list, enter = "stay", ...props }: UiTextFieldProps & { list?: string }) {
  if (!list || props.multiline) return <UiTextField {...props} enter={enter} />;
  return <SuggestInput list={list} enter={enter} {...props} />;
}

function asText(value: string): string {
  return value;
}

function SuggestInput({ value, onChange, sessionPrefix, disabled, testId, ariaLabel, placeholder, list, enter }: UiTextFieldProps & { list: string }) {
  const field = useFieldText(value, asText, sessionPrefix);
  return (
    <input
      type="text"
      className="input field-text"
      list={list}
      value={field.text}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-testid={testId}
      onFocus={field.focus}
      onBlur={field.blur}
      onChange={(e) => {
        field.setText(e.target.value);
        onChange(e.target.value, field.send(e.target.value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          field.endSession();
          if (enter === "blur") e.currentTarget.blur();
        }
      }}
    />
  );
}

interface NumberInputProps<Exact extends boolean> {
  /** undefined는 비어 있음 (선택 인자). 글은 큰 정수의 표식 글만 숫자로 보인다 */
  value: number | string | undefined;
  /** 참이면 수로 바꾸면 자릿수를 잃는 정수를 표식 글로 보낸다 (파일에 적은 그대로 쓰인다) */
  exact?: Exact;
  onChange: (value: Exact extends true ? number | string : number, session: string) => void;
  sessionPrefix: string;
  integer?: boolean;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** 비었을 때 보일 글 */
  placeholder?: string;
  testId?: string;
  ariaLabel?: string;
}

function numberText(value: number | string | undefined): string {
  return typeof value === "number" ? String(value) : (bigIntText(value) ?? "");
}

/**
 * 숫자 칸. 비운 채 두면 값을 바꾸지 않는다 (지우기는 따로). integer 는 반올림, min 과 max 로 자른다.
 * Enter 는 넣은 값으로 글을 맞추고 초점을 둔다. Escape 는 고치던 글을 버린다
 */
export function NumberInput<Exact extends boolean = false>({ value, exact, onChange, sessionPrefix, integer, min, max, disabled, placeholder, testId, ariaLabel }: NumberInputProps<Exact>) {
  const field = useFieldText(value, numberText, sessionPrefix);
  const send = onChange as (value: number | string, session: string) => void;

  const commit = (raw: string) => {
    field.setText(raw);
    const read = numberFromText(raw);
    if (read === null) return;
    const approx = jsonNumber(read)!;
    // 큰 정수는 범위 안이면 적은 그대로 (exact), 아니면 가까운 수로 자른다
    if (exact && typeof read === "string" && (min === undefined || approx >= min) && (max === undefined || approx <= max)) {
      send(read, field.send(read));
      return;
    }
    let n = approx;
    if (integer) n = Math.round(n);
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    send(n, field.send(n));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      field.endSession();
      field.revert();
    } else if (e.key === "Escape") {
      field.revert();
    }
  };

  return (
    <input
      type="number"
      className="input field-number"
      value={field.text}
      placeholder={placeholder}
      step={integer ? 1 : "any"}
      min={min}
      max={max}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
      onFocus={field.focus}
      onBlur={field.blur}
      onChange={(e) => commit(e.target.value)}
      onKeyDown={onKey}
    />
  );
}
