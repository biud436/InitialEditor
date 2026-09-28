// condition: 조건의 꼴(스키마 conditions: item, flag, var)을 고르고 그 꼴의 칸을 적는다.
// 꼴을 바꾸면 다른 꼴의 칸은 지우고 스키마에 없는 칸은 둔다. 꼴이 둘 이상인 파일은 엔진처럼 앞의 것을 보인다.

import { field, isObjectPlace, isPlainObject, setOwn, stringifyJsonLossless, type JsonObject } from "../../model/json";
import { judgedCondition } from "../../model/schema";
import { ArgRow } from "./ArgField";
import type { ArgWidgetProps } from "./context";

export function ConditionArg({ spec, value, onChange, ctx, sessionPrefix, testId }: ArgWidgetProps) {
  const { schema } = ctx;
  if (value !== undefined && !isObjectPlace(value)) {
    return (
      <div className="rpg-arg-note is-warning" data-testid={`${testId}-broken`}>
        조건은 객체여야 합니다 (현재: {stringifyJsonLossless(value)}){" "}
        <button type="button" className="btn rpg-mini" disabled={ctx.disabled} onClick={() => onChange(schema.conditions[0] ? { [schema.conditions[0].kind]: "" } : {})}>
          새 조건
        </button>
      </div>
    );
  }
  const cond: JsonObject = isPlainObject(value) ? value : {};
  const kind = judgedCondition(schema, cond);
  const present = schema.conditions.filter((c) => field(cond, c.kind) !== undefined);
  const known = new Set(schema.conditions.flatMap((c) => c.args.map((a) => a.name)));

  const setKind = (k: string) => {
    const next: JsonObject = {};
    if (k !== "") next[k] = "";
    for (const [key, v] of Object.entries(cond)) if (!known.has(key)) setOwn(next, key, v);
    onChange(next);
  };
  const setField = (name: string, v: unknown, session?: string) => {
    const next: JsonObject = { ...cond };
    if (v === undefined) delete next[name];
    else next[name] = v;
    onChange(next, session);
  };

  return (
    <div className="rpg-condition" data-testid={testId}>
      <select
        className="input field-select"
        value={kind?.kind ?? ""}
        disabled={ctx.disabled}
        aria-label={`${spec.label} 종류`}
        title={kind?.label ?? "빈 조건 (항상 참)"}
        data-testid={`${testId}-kind`}
        onChange={(e) => setKind(e.target.value)}
      >
        {!kind && <option value="">빈 조건 (항상 참)</option>}
        {schema.conditions.map((c) => (
          <option key={c.kind} value={c.kind}>
            {c.label}
          </option>
        ))}
      </select>
      {!kind && (
        <div className="rpg-arg-note is-warning" data-testid={`${testId}-empty`}>
          빈 조건은 항상 참이므로 '아니면' 분기가 실행되지 않습니다
        </div>
      )}
      {present.length > 1 && (
        <div className="rpg-arg-note is-warning" data-testid={`${testId}-many`}>
          조건 종류가 2개 이상입니다 ({present.map((c) => c.kind).join(", ")}). 엔진은 첫 번째 {present[0].kind} 조건만 사용합니다. 종류를 다시 선택하면 1개만 유지됩니다.
        </div>
      )}
      {kind &&
        kind.args.map((a) => (
          <ArgRow
            key={`${kind.kind}:${a.name}`}
            spec={a}
            value={field(cond, a.name)}
            onChange={(v, s) => setField(a.name, v, s)}
            ctx={ctx}
            sessionPrefix={`${sessionPrefix}.${a.name}`}
            testId={`${testId}-${a.name}`}
          />
        ))}
    </div>
  );
}
