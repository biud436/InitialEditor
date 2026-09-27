// 인스펙터의 입력 칸. 값은 문서(명령)에서 오고, 타이핑은 초점이 있는 동안 한 세션으로 합쳐져 되돌리기 한 번에
// 돌아간다 (docs/plans/e2-scene.md 마일스톤 3: 연속 변경은 하나로). 초점을 잃거나 Enter 를 누르면 세션이 끝난다.
// 초점이 있는 동안 칸이 보내지 않은 값이 오면(입력 칸 안에서 누른 Ctrl+Z 의 되돌리기) 글이 그 값을 따라가고 세션도 끝난다
// (useFieldText). 그래서 되돌린 뒤의 타이핑이 되돌린 글을 되살리지 않고 새 되돌리기 단계가 된다.
// 여러 오브젝트를 골라 값이 다르면 value 가 null 이고 "여러 값" 으로 보인다.
// 모양(field-row, field-number 등의 클래스)은 앱의 테마가 준다.

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";

let sessionCounter = 0;

/** 합치기 키. 같은 칸의 한 초점 세션 안에서만 같다 */
export function newSession(prefix: string): string {
  return `${prefix}#${++sessionCounter}`;
}

export const MIXED_LABEL = "여러 값";

/** 한 줄 칸의 Enter: blur 는 초점을 놓는다, stay 는 초점을 두고 세션만 끝낸다 (다음 타이핑은 새 되돌리기 단계) */
export type EnterAction = "blur" | "stay";

export interface FieldText<V> {
  /** 칸에 보일 글 */
  readonly text: string;
  setText(text: string): void;
  /** 초점을 얻었다 (새 세션) */
  focus(): void;
  /** 초점을 잃었다 (세션 끝) */
  blur(): void;
  /** 값을 보낸다. 이 초점의 합치기 키를 돌려준다 */
  send(value: V): string;
  /** 세션을 끝낸다 (Enter) */
  endSession(): void;
  /** 글을 지금 값으로 되돌린다 (Escape) */
  revert(): void;
}

/**
 * 값에서 온 입력 칸의 글과 세션. 초점이 없으면 글이 값을 따라간다. 초점이 있는 동안에는 이 칸이 보낸 값이 돌아오면 글을 두고,
 * 다른 값(입력 칸 안에서 누른 Ctrl+Z 의 되돌리기, 다시 실행)이 오면 글을 그 값으로 바꾸고 세션을 끝낸다.
 * same 은 보낸 값과 받은 값이 같은가 (기본 Object.is). 모델이 값을 고쳐 돌려주는 칸(JSON 의 키 순서)은 같은 뜻을 같다고 본다
 */
export function useFieldText<V>(value: V, format: (value: V) => string, sessionPrefix: string, same: (a: V, b: V) => boolean = Object.is): FieldText<V> {
  const [text, setText] = useState(() => format(value));
  const [focused, setFocused] = useState(false);
  const session = useRef("");
  const sent = useRef<{ value: V } | null>(null);
  const latest = useRef({ value, format, same });
  latest.current = { value, format, same };

  useEffect(() => {
    const { format: fmt, same: eq } = latest.current;
    if (!focused) {
      setText(fmt(value));
      sent.current = null;
      return;
    }
    if (sent.current && eq(sent.current.value, value)) return;
    // 이 칸이 보내지 않은 값이다: 글이 따라가고 다음 타이핑은 새 세션이다
    setText(fmt(value));
    sent.current = { value };
    session.current = "";
  }, [value, focused]);

  return {
    text,
    setText,
    focus: () => {
      setFocused(true);
      session.current = newSession(sessionPrefix);
      sent.current = { value: latest.current.value };
    },
    blur: () => {
      setFocused(false);
      session.current = "";
    },
    send: (v: V) => {
      sent.current = { value: v };
      if (!session.current) session.current = newSession(sessionPrefix);
      return session.current;
    },
    endSession: () => {
      session.current = "";
    },
    revert: () => setText(latest.current.format(latest.current.value)),
  };
}

function numberOrMixed(value: number | null): string {
  return value === null ? "" : String(value);
}

interface NumberFieldProps {
  value: number | null;
  /** 값이 바뀔 때마다. session 은 이 초점 세션의 합치기 키 */
  onChange: (value: number, session: string) => void;
  /** 합치기 키의 앞부분 (오브젝트와 칸 이름) */
  sessionPrefix: string;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  disabled?: boolean;
  testId?: string;
  ariaLabel?: string;
  className?: string;
  /** Enter 의 뒤 (기본 blur) */
  enter?: EnterAction;
}

export function NumberField({ value, onChange, sessionPrefix, step, min, max, integer, disabled, testId, ariaLabel, className, enter = "blur" }: NumberFieldProps) {
  const field = useFieldText(value, numberOrMixed, sessionPrefix);

  const commit = (raw: string) => {
    field.setText(raw);
    if (raw.trim() === "") return;
    let n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (integer) n = Math.round(n);
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    onChange(n, field.send(n));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      field.endSession();
      if (enter === "blur") e.currentTarget.blur();
      else field.revert();
    } else if (e.key === "Escape") {
      e.preventDefault();
      field.revert();
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="number"
      className={"input field-number" + (className ? ` ${className}` : "")}
      value={field.text}
      placeholder={value === null ? MIXED_LABEL : undefined}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
      onFocus={field.focus}
      onBlur={field.blur}
      onChange={(e: ChangeEvent<HTMLInputElement>) => commit(e.target.value)}
      onKeyDown={onKey}
    />
  );
}

interface TextFieldProps {
  value: string;
  onChange: (value: string, session: string) => void;
  sessionPrefix: string;
  multiline?: boolean;
  disabled?: boolean;
  testId?: string;
  ariaLabel?: string;
  placeholder?: string;
  rows?: number;
  /** 한 줄 칸의 Enter 뒤 (기본 blur) */
  enter?: EnterAction;
}

function asText(value: string): string {
  return value;
}

export function TextField({ value, onChange, sessionPrefix, multiline, disabled, testId, ariaLabel, placeholder, rows = 3, enter = "blur" }: TextFieldProps) {
  const field = useFieldText(value, asText, sessionPrefix);

  const commit = (raw: string) => {
    field.setText(raw);
    onChange(raw, field.send(raw));
  };
  const common = {
    className: "input field-text",
    value: field.text,
    disabled,
    placeholder,
    "aria-label": ariaLabel,
    "data-testid": testId,
    onFocus: field.focus,
    onBlur: field.blur,
  };
  if (multiline) {
    return <textarea {...common} rows={rows} onChange={(e) => commit(e.target.value)} />;
  }
  return (
    <input
      {...common}
      type="text"
      onChange={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          field.endSession();
          if (enter === "blur") e.currentTarget.blur();
        }
      }}
    />
  );
}

interface RangeFieldProps {
  value: number | null;
  onChange: (value: number, session: string) => void;
  sessionPrefix: string;
  min: number;
  max: number;
  step?: number;
  testId?: string;
  ariaLabel?: string;
}

/** 슬라이더와 숫자 칸 한 쌍 (투명도). 드래그는 한 세션이다 */
export function RangeField({ value, onChange, sessionPrefix, min, max, step = 1, testId, ariaLabel }: RangeFieldProps) {
  const session = useRef("");
  return (
    <span className="field-range">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? min}
        aria-label={ariaLabel}
        data-testid={testId ? `${testId}-slider` : undefined}
        onPointerDown={() => (session.current = newSession(sessionPrefix))}
        onPointerUp={() => (session.current = "")}
        onChange={(e) => {
          if (!session.current) session.current = newSession(sessionPrefix);
          onChange(Number(e.target.value), session.current);
        }}
      />
      <NumberField value={value} onChange={onChange} sessionPrefix={sessionPrefix} min={min} max={max} step={step} integer={Number.isInteger(step)} testId={testId} ariaLabel={ariaLabel} className="field-range-number" />
    </span>
  );
}

export function FieldRow({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field-row" title={hint}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="field-control">{children}</div>
    </div>
  );
}
