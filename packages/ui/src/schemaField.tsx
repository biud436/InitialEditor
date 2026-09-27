// 스키마 칸의 입력. 스키마 칸 하나를 입력 하나로 그린다 (맵 오브젝트 스키마의 칸 꼴).
//   string: 한 줄 입력, text: 여러 줄 입력, number/integer: 숫자 입력 (integer는 반올림),
//   boolean: 체크 상자, enum: 고르기
// 값이 없으면(undefined) "비어 있음"으로 보이고, 여러 오브젝트의 값이 다르면(null) "여러 값"이다.
// 타이핑은 초점 하나가 한 세션이고 같은 합치기 키로 들어가 되돌리기 한 번에 돌아간다 (fields.tsx와 같은 방식).

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MIXED_LABEL, newSession, TextField } from "./fields";

export type SchemaFieldType = "string" | "text" | "number" | "integer" | "boolean" | "enum";

/** 입력 하나가 보는 칸의 꼴 (타일맵의 FieldSpec 이 이 모양을 채운다) */
export interface SchemaFieldSpec {
  name: string;
  type: SchemaFieldType;
  label: string;
  values?: string[];
  min?: number;
  max?: number;
}

export const EMPTY_LABEL = "비어 있음";

/** 칸의 값: undefined는 비어 있음, null은 여러 값 */
export type FieldValue = unknown;

interface OptionalNumberProps {
  value: number | undefined | null;
  onChange: (value: number, session: string) => void;
  sessionPrefix: string;
  integer?: boolean;
  min?: number;
  max?: number;
  testId?: string;
  ariaLabel?: string;
  className?: string;
}

function numberText(value: number | undefined | null): string {
  return typeof value === "number" ? String(value) : "";
}

/** 비어 있을 수 있는 숫자 칸. 비운 채 두면 값을 바꾸지 않는다 (지우기는 따로) */
export function OptionalNumberField({ value, onChange, sessionPrefix, integer, min, max, testId, ariaLabel, className }: OptionalNumberProps) {
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
      e.preventDefault();
      setText(numberText(value));
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="number"
      className={"input field-number" + (className ? ` ${className}` : "")}
      value={text}
      placeholder={value === null ? MIXED_LABEL : EMPTY_LABEL}
      step={integer ? 1 : "any"}
      min={min}
      max={max}
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

interface SchemaFieldInputProps {
  field: SchemaFieldSpec;
  value: FieldValue;
  /** session은 타이핑 세션의 합치기 키. 고르기와 체크 상자는 undefined (한 번이 한 단계) */
  onChange: (value: unknown, session?: string) => void;
  sessionPrefix: string;
  testId: string;
}

/** 스키마 칸 하나의 입력 */
export function SchemaFieldInput({ field, value, onChange, sessionPrefix, testId }: SchemaFieldInputProps) {
  const checkRef = useRef<HTMLInputElement>(null);
  const mixed = value === null;
  useEffect(() => {
    if (checkRef.current) checkRef.current.indeterminate = mixed;
  }, [mixed]);

  switch (field.type) {
    case "string":
    case "text":
      return (
        <TextField
          value={typeof value === "string" ? value : value === undefined || value === null ? "" : String(value)}
          onChange={(v, s) => onChange(v, s)}
          sessionPrefix={sessionPrefix}
          multiline={field.type === "text"}
          rows={4}
          placeholder={mixed ? MIXED_LABEL : EMPTY_LABEL}
          testId={testId}
          ariaLabel={field.label}
        />
      );
    case "number":
    case "integer":
      return (
        <OptionalNumberField
          value={typeof value === "number" ? value : mixed ? null : undefined}
          onChange={(v, s) => onChange(v, s)}
          sessionPrefix={sessionPrefix}
          integer={field.type === "integer"}
          min={field.min}
          max={field.max}
          testId={testId}
          ariaLabel={field.label}
        />
      );
    case "boolean":
      return (
        <>
          <input ref={checkRef} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} data-testid={testId} aria-label={field.label} />
          {mixed && <span className="muted field-mixed">{MIXED_LABEL}</span>}
          {value === undefined && <span className="muted field-mixed">{EMPTY_LABEL}</span>}
        </>
      );
    case "enum": {
      const values = field.values ?? [];
      const current = typeof value === "string" ? value : "";
      const outside = typeof value === "string" && !values.includes(value);
      return (
        <select className="input field-select" value={current} onChange={(e) => onChange(e.target.value)} data-testid={testId} aria-label={field.label}>
          {(value === undefined || mixed) && (
            <option value="" disabled>
              {mixed ? MIXED_LABEL : EMPTY_LABEL}
            </option>
          )}
          {outside && <option value={current}>{current} (목록에 없음)</option>}
          {values.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      );
    }
  }
}
