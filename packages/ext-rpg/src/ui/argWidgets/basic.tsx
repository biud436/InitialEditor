// 글, 여러 줄 글, 정수와 수, 참거짓, 고르기, 스칼라, JSON 위젯 (엔진 M2 2.3).

import { useEffect, useId, useRef, useState } from "react";
import { newSession, NumberInput, TextField } from "../fields";
import { emptyText, textValue, type ArgWidgetProps } from "./context";

function shown(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** 파일의 값이 이 위젯의 타입이 아닐 때의 알림 */
function WrongValue({ value }: { value: unknown }) {
  return <div className="rpg-arg-note is-warning">지금 값 {shown(value)} 는 이 칸의 타입이 아니다</div>;
}

/** string: 한 줄 입력. suggest 가 있으면 제안 목록 */
export function StringArg({ spec, value, onChange, ctx, sessionPrefix, testId }: ArgWidgetProps) {
  const listId = useId();
  const wrong = value !== undefined && typeof value !== "string";
  return (
    <>
      <TextField
        value={typeof value === "string" ? value : ""}
        onChange={(v, s) => onChange(textValue(spec, v), s)}
        sessionPrefix={sessionPrefix}
        disabled={ctx.disabled}
        placeholder={spec.required ? undefined : emptyText(spec)}
        testId={testId}
        ariaLabel={spec.label}
        list={spec.suggest ? listId : undefined}
      />
      {spec.suggest && (
        <datalist id={listId} data-testid={`${testId}-suggest`}>
          {spec.suggest.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {wrong && <WrongValue value={value} />}
    </>
  );
}

/** text: 여러 줄 입력. 줄바꿈은 JSON 의 \n 그대로다 */
export function TextArg({ spec, value, onChange, ctx, sessionPrefix, testId }: ArgWidgetProps) {
  const wrong = value !== undefined && typeof value !== "string";
  return (
    <>
      <TextField
        value={typeof value === "string" ? value : ""}
        onChange={(v, s) => onChange(textValue(spec, v), s)}
        sessionPrefix={sessionPrefix}
        multiline
        rows={3}
        disabled={ctx.disabled}
        placeholder={spec.required ? undefined : emptyText(spec)}
        testId={testId}
        ariaLabel={spec.label}
      />
      {wrong && <WrongValue value={value} />}
    </>
  );
}

/** integer, number: 숫자 입력. min 과 max 로 자르고 integer 는 반올림한다 */
export function NumberArg({ spec, value, onChange, ctx, sessionPrefix, testId }: ArgWidgetProps) {
  const wrong = value !== undefined && typeof value !== "number";
  const range = spec.min !== undefined || spec.max !== undefined ? `${spec.min ?? ""}~${spec.max ?? ""}` : "";
  return (
    <>
      <NumberInput
        value={typeof value === "number" ? value : undefined}
        onChange={(v, s) => onChange(v, s)}
        sessionPrefix={sessionPrefix}
        integer={spec.type === "integer"}
        min={spec.min}
        max={spec.max}
        disabled={ctx.disabled}
        placeholder={emptyText(spec)}
        testId={testId}
        ariaLabel={spec.label}
      />
      {range && <span className="rpg-arg-range muted">{range}</span>}
      {wrong && <WrongValue value={value} />}
    </>
  );
}

/** boolean: 필수면 체크 상자, 아니면 세 상태 (비움, 참, 거짓) */
export function BooleanArg({ spec, value, onChange, ctx, testId }: ArgWidgetProps) {
  const wrong = value !== undefined && typeof value !== "boolean";
  if (spec.required) {
    return (
      <>
        <input type="checkbox" checked={value === true} disabled={ctx.disabled} onChange={(e) => onChange(e.target.checked)} data-testid={testId} aria-label={spec.label} />
        {wrong && <WrongValue value={value} />}
      </>
    );
  }
  const current = value === true ? "true" : value === false ? "false" : "";
  return (
    <>
      <select
        className="input field-select"
        value={current}
        disabled={ctx.disabled}
        data-testid={testId}
        aria-label={spec.label}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "true")}
      >
        <option value="">{emptyText(spec)}</option>
        <option value="true">참</option>
        <option value="false">거짓</option>
      </select>
      {wrong && <WrongValue value={value} />}
    </>
  );
}

/** enum: 고르기. 파일의 값이 목록에 없으면 그 값을 덧붙여 보인다. 선택 인자는 비울 수 있다 */
export function EnumArg({ spec, value, onChange, ctx, testId }: ArgWidgetProps) {
  const values = spec.values ?? [];
  const current = value === undefined ? "" : shown(value);
  const outside = value !== undefined && (typeof value !== "string" || !values.includes(value));
  return (
    <select
      className="input field-select"
      value={current}
      disabled={ctx.disabled}
      data-testid={testId}
      aria-label={spec.label}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    >
      {(!spec.required || value === undefined) && (
        <option value="" disabled={spec.required}>
          {spec.required ? "고르기" : emptyText(spec)}
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

type ScalarKind = "boolean" | "number" | "string";

function scalarKind(v: unknown): ScalarKind | "" {
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "string";
  return "";
}

function convertScalar(v: unknown, kind: ScalarKind): unknown {
  if (kind === "boolean") return typeof v === "boolean" ? v : true;
  if (kind === "number") {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && v !== "" && typeof v !== "boolean" ? n : 0;
  }
  return v === undefined ? "" : String(v);
}

/** scalar: 종류(참거짓, 수, 글)를 고르고 값을 적는다 */
export function ScalarArg({ spec, value, onChange, ctx, sessionPrefix, testId }: ArgWidgetProps) {
  const kind = scalarKind(value);
  const wrong = value !== undefined && kind === "";
  return (
    <span className="rpg-arg-inline">
      <select
        className="input field-select rpg-arg-kind"
        value={kind}
        disabled={ctx.disabled}
        data-testid={`${testId}-kind`}
        aria-label={`${spec.label} 종류`}
        onChange={(e) => onChange(e.target.value === "" ? undefined : convertScalar(value, e.target.value as ScalarKind))}
      >
        {(!spec.required || kind === "") && (
          <option value="" disabled={spec.required}>
            {spec.required ? "고르기" : emptyText(spec)}
          </option>
        )}
        <option value="boolean">참거짓</option>
        <option value="number">수</option>
        <option value="string">글</option>
      </select>
      {kind === "boolean" && (
        <select className="input field-select" value={String(value)} disabled={ctx.disabled} data-testid={testId} aria-label={spec.label} onChange={(e) => onChange(e.target.value === "true")}>
          <option value="true">참</option>
          <option value="false">거짓</option>
        </select>
      )}
      {kind === "number" && (
        <NumberInput value={value as number} onChange={(v, s) => onChange(v, s)} sessionPrefix={sessionPrefix} disabled={ctx.disabled} testId={testId} ariaLabel={spec.label} />
      )}
      {kind === "string" && <TextField value={value as string} onChange={(v, s) => onChange(v, s)} sessionPrefix={sessionPrefix} disabled={ctx.disabled} testId={testId} ariaLabel={spec.label} />}
      {wrong && <WrongValue value={value} />}
    </span>
  );
}

function jsonText(v: unknown): string {
  return v === undefined ? "" : JSON.stringify(v, null, 2);
}

/** 해석 결과 한 줄 */
export function jsonKind(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `배열 (${v.length}칸)`;
  if (typeof v === "object") return `객체 (키 ${Object.keys(v as object).length}개)`;
  if (typeof v === "string") return "글";
  if (typeof v === "number") return "수";
  if (typeof v === "boolean") return "참거짓";
  return typeof v;
}

/** json: 글 상자와 해석 결과. 해석되지 않는 동안은 값을 바꾸지 않는다. 비우면(선택 인자) 인자를 지운다 */
export function JsonArg({ spec, value, onChange, ctx, sessionPrefix, testId }: ArgWidgetProps) {
  const [text, setText] = useState(jsonText(value));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef("");

  useEffect(() => {
    if (!focused) {
      setText(jsonText(value));
      setError(null);
    }
  }, [value, focused]);

  const commit = (raw: string) => {
    setText(raw);
    if (!session.current) session.current = newSession(sessionPrefix);
    if (raw.trim() === "") {
      setError(spec.required ? "값이 필요하다" : null);
      if (!spec.required) onChange(undefined, session.current);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      setError(`JSON 이 아니다: ${(e as Error).message}`);
      return;
    }
    setError(null);
    onChange(parsed === null && !spec.required ? undefined : parsed, session.current);
  };

  let result: string | null = null;
  if (!error && text.trim() !== "") {
    try {
      result = jsonKind(JSON.parse(text));
    } catch {
      result = null;
    }
  }

  return (
    <>
      <textarea
        className="input field-text rpg-arg-json"
        rows={3}
        value={text}
        disabled={ctx.disabled}
        placeholder={spec.required ? undefined : emptyText(spec)}
        aria-label={spec.label}
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
      />
      {error ? (
        <div className="rpg-arg-note is-error" data-testid={`${testId}-error`}>
          {error}
        </div>
      ) : (
        result && (
          <div className="rpg-arg-note muted" data-testid={`${testId}-result`}>
            {result}
          </div>
        )
      )}
    </>
  );
}
