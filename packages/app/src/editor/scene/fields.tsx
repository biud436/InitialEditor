// 인스펙터의 입력 칸. 값은 문서(명령)에서 오고, 타이핑은 초점이 있는 동안 한 세션으로 합쳐져 되돌리기 한 번에
// 돌아간다 (docs/plans/e2-scene.md 마일스톤 3: 연속 변경은 하나로). 초점을 잃거나 Enter 를 누르면 세션이 끝난다.
// 여러 오브젝트를 골라 값이 다르면 value 가 null 이고 "여러 값" 으로 보인다.

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

let sessionCounter = 0;

/** 합치기 키. 같은 칸의 한 초점 세션 안에서만 같다 */
export function newSession(prefix: string): string {
  return `${prefix}#${++sessionCounter}`;
}

export const MIXED_LABEL = "여러 값";

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
}

export function NumberField({ value, onChange, sessionPrefix, step, min, max, integer, disabled, testId, ariaLabel, className }: NumberFieldProps) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [focused, setFocused] = useState(false);
  const session = useRef("");

  useEffect(() => {
    if (!focused) setText(value === null ? "" : String(value));
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
      e.preventDefault();
      setText(value === null ? "" : String(value));
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="number"
      className={"input field-number" + (className ? ` ${className}` : "")}
      value={text}
      placeholder={value === null ? MIXED_LABEL : undefined}
      step={step}
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
}

export function TextField({ value, onChange, sessionPrefix, multiline, disabled, testId, ariaLabel, placeholder, rows = 3 }: TextFieldProps) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const session = useRef("");

  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);

  const commit = (raw: string) => {
    setText(raw);
    if (!session.current) session.current = newSession(sessionPrefix);
    onChange(raw, session.current);
  };
  const common = {
    className: "input field-text",
    value: text,
    disabled,
    placeholder,
    "aria-label": ariaLabel,
    "data-testid": testId,
    onFocus: () => {
      setFocused(true);
      session.current = newSession(sessionPrefix);
    },
    onBlur: () => {
      setFocused(false);
      session.current = "";
    },
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
          session.current = "";
          e.currentTarget.blur();
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

export function FieldRow({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="field-row" title={hint}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="field-control">{children}</div>
    </div>
  );
}
