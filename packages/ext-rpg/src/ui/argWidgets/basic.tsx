// 글, 여러 줄 글, 정수와 수, 참거짓, 고르기, 스칼라, JSON 위젯 (엔진 M2 2.3).
// 2^53을 넘는 정수(표식 글, model/json.ts)는 수다: 숫자 칸에 숫자 그대로 보이고, 글 칸에서는 타입이 틀린 값이다.

import { useFieldText } from "@initial-editor/ui";
import { useEffect, useId, useState } from "react";
import { bigIntText, isJsonNumber, isJsonText, jsonValueText, numberFromText, parseJsonLossless, stableKey, stringifyJsonLossless } from "../../model/json";
import { NumberInput, TextField } from "../fields";
import { emptyText, textValue, type ArgWidgetProps } from "./context";

/** 파일의 값이 이 위젯의 타입이 아닐 때의 알림 */
function WrongValue({ value }: { value: unknown }) {
  return <div className="rpg-arg-note is-warning">지금 값 {jsonValueText(value)} 는 이 칸의 타입이 아니다</div>;
}

/** string: 한 줄 입력. suggest 가 있으면 제안 목록 */
export function StringArg({ spec, value, onChange, ctx, sessionPrefix, testId }: ArgWidgetProps) {
  const listId = useId();
  const wrong = value !== undefined && !isJsonText(value);
  return (
    <>
      <TextField
        value={isJsonText(value) ? value : ""}
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
  const wrong = value !== undefined && !isJsonText(value);
  return (
    <>
      <TextField
        value={isJsonText(value) ? value : ""}
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

/** integer, number: 숫자 입력. min과 max로 자르고 integer는 반올림한다. 큰 정수는 숫자 그대로 보이고 적은 그대로 들어간다 */
export function NumberArg({ spec, value, onChange, ctx, sessionPrefix, testId }: ArgWidgetProps) {
  const number = isJsonNumber(value);
  const wrong = value !== undefined && !number;
  const range = spec.min !== undefined || spec.max !== undefined ? `${spec.min ?? ""}~${spec.max ?? ""}` : "";
  return (
    <>
      <NumberInput
        value={number ? (value as number | string) : undefined}
        exact
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

/** enum: 고르기. 파일의 값이 목록에 없으면 그 값을 덧붙여 보인다. 선택 인자는 비울 수 있다. 고른 값의 글은 title 로도 보인다 */
export function EnumArg({ spec, value, onChange, ctx, testId }: ArgWidgetProps) {
  const values = spec.values ?? [];
  const current = value === undefined ? "" : jsonValueText(value);
  const outside = value !== undefined && (!isJsonText(value) || !values.includes(value));
  const shown = outside ? `${current} (목록에 없음)` : current;
  return (
    <select
      className="input field-select"
      value={current}
      disabled={ctx.disabled}
      data-testid={testId}
      aria-label={spec.label}
      title={shown || undefined}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    >
      {(!spec.required || value === undefined) && (
        <option value="" disabled={spec.required}>
          {spec.required ? "고르기" : emptyText(spec)}
        </option>
      )}
      {outside && <option value={current}>{shown}</option>}
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
  if (isJsonNumber(v)) return "number";
  if (typeof v === "string") return "string";
  return "";
}

function convertScalar(v: unknown, kind: ScalarKind): unknown {
  if (kind === "boolean") return typeof v === "boolean" ? v : true;
  if (kind === "number") {
    if (isJsonNumber(v)) return v;
    return typeof v === "string" ? (numberFromText(v) ?? 0) : 0;
  }
  return v === undefined ? "" : jsonValueText(v);
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
        <NumberInput value={value as number | string} exact onChange={(v, s) => onChange(v, s)} sessionPrefix={sessionPrefix} disabled={ctx.disabled} testId={testId} ariaLabel={spec.label} />
      )}
      {kind === "string" && <TextField value={value as string} onChange={(v, s) => onChange(v, s)} sessionPrefix={sessionPrefix} disabled={ctx.disabled} testId={testId} ariaLabel={spec.label} />}
      {wrong && <WrongValue value={value} />}
    </span>
  );
}

function jsonText(v: unknown): string {
  return v === undefined ? "" : stringifyJsonLossless(v, 2);
}

/** 같은 뜻의 JSON 인가 (모델이 키 순서를 고쳐 돌려준다) */
function sameJson(a: unknown, b: unknown): boolean {
  return stableKey(a) === stableKey(b);
}

/** 해석 결과 한 줄 */
export function jsonKind(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `배열 (${v.length}칸)`;
  if (typeof v === "object") return `객체 (키 ${Object.keys(v as object).length}개)`;
  if (bigIntText(v) !== null || typeof v === "number") return "수";
  if (typeof v === "string") return "글";
  if (typeof v === "boolean") return "참거짓";
  return typeof v;
}

/**
 * json: 글 상자와 해석 결과. 해석되지 않는 동안은 값을 바꾸지 않는다. 비우면(선택 인자) 인자를 지운다.
 * 2^53 을 넘는 정수는 숫자 그대로 보이고 그대로 돌아간다 (타일맵의 parseJsonLossless)
 */
export function JsonArg({ spec, value, onChange, ctx, sessionPrefix, testId }: ArgWidgetProps) {
  const field = useFieldText(value, jsonText, sessionPrefix, sameJson);
  const [error, setError] = useState<string | null>(null);
  const text = field.text;

  // 글이 값을 따라갈 때(초점 밖, 밖에서 바뀜) 옛 해석 오류를 지운다
  const shownValue = jsonText(value);
  useEffect(() => {
    if (text === shownValue) setError(null);
  }, [text, shownValue]);

  const commit = (raw: string) => {
    field.setText(raw);
    if (raw.trim() === "") {
      setError(spec.required ? "값이 필요하다" : null);
      if (!spec.required) onChange(undefined, field.send(undefined));
      return;
    }
    let parsed: unknown;
    try {
      parsed = parseJsonLossless(raw);
    } catch (e) {
      setError(`JSON 이 아니다: ${(e as Error).message}`);
      return;
    }
    setError(null);
    const next = parsed === null && !spec.required ? undefined : parsed;
    onChange(next, field.send(next));
  };

  let result: string | null = null;
  if (!error && text.trim() !== "") {
    try {
      result = jsonKind(parseJsonLossless(text));
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
        onFocus={field.focus}
        onBlur={field.blur}
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
