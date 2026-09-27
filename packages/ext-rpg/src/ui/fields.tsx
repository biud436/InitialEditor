// ext-rpg 의 입력 칸. packages/ui 의 부품과 세션 규칙(newSession)을 쓰고, 거기에 아직 없는 둘만 여기서 채운다:
//   TextField 의 list    제안 목록(datalist)이 붙는 한 줄 입력 (ref 칸, suggest 가 있는 칸)
//   NumberInput          비어 있을 수 있는 숫자 칸. 비었을 때의 안내 글(기본값)과 끄기가 있다
// 둘 다 packages/ui 의 같은 부품과 세션 규칙이 같다: 초점 한 번이 한 세션, Enter 나 초점을 잃으면 끝난다.

import { newSession, TextField as UiTextField } from "@initial-editor/ui";
import { useEffect, useRef, useState, type ComponentProps, type KeyboardEvent } from "react";

export { FieldRow, newSession } from "@initial-editor/ui";

type UiTextFieldProps = ComponentProps<typeof UiTextField>;

/** packages/ui 의 TextField. list 가 있으면 제안 목록이 붙는 한 줄 입력이다 */
export function TextField({ list, ...props }: UiTextFieldProps & { list?: string }) {
  if (!list || props.multiline) return <UiTextField {...props} />;
  return <SuggestInput list={list} {...props} />;
}

function SuggestInput({ value, onChange, sessionPrefix, disabled, testId, ariaLabel, placeholder, list }: UiTextFieldProps & { list: string }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const session = useRef("");

  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);

  return (
    <input
      type="text"
      className="input field-text"
      list={list}
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-testid={testId}
      onFocus={() => {
        setFocused(true);
        session.current = newSession(sessionPrefix);
      }}
      onBlur={() => {
        setFocused(false);
        session.current = "";
      }}
      onChange={(e) => {
        setText(e.target.value);
        if (!session.current) session.current = newSession(sessionPrefix);
        onChange(e.target.value, session.current);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          session.current = "";
          e.currentTarget.blur();
        }
      }}
    />
  );
}

interface NumberInputProps {
  /** undefined 는 비어 있음 (선택 인자) */
  value: number | undefined;
  onChange: (value: number, session: string) => void;
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

function numberText(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "";
}

/** 숫자 칸. 비운 채 두면 값을 바꾸지 않는다 (지우기는 따로). integer 는 반올림, min 과 max 로 자른다. Escape 는 고치던 글을 버린다 */
export function NumberInput({ value, onChange, sessionPrefix, integer, min, max, disabled, placeholder, testId, ariaLabel }: NumberInputProps) {
  const [text, setText] = useState(numberText(value));
  const [focused, setFocused] = useState(false);
  const session = useRef("");

  useEffect(() => {
    if (!focused) setText(numberText(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    setText(raw);
    if (raw.trim() === "") return;
    let n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (integer) n = Math.round(n);
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (!session.current) session.current = newSession(sessionPrefix);
    onChange(n, session.current);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      session.current = "";
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setText(numberText(value));
    }
  };

  return (
    <input
      type="number"
      className="input field-number"
      value={text}
      placeholder={placeholder}
      step={integer ? 1 : "any"}
      min={min}
      max={max}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
      onFocus={() => {
        setFocused(true);
        session.current = newSession(sessionPrefix);
      }}
      onBlur={() => {
        setFocused(false);
        session.current = "";
      }}
      onChange={(e) => commit(e.target.value)}
      onKeyDown={onKey}
    />
  );
}
