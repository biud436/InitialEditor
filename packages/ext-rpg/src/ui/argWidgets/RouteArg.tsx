// route: 걸음 목록. 걸음은 이동(스키마 route.moves), 돌기(turnPrefix + 방향), 기다리기(waitPrefix + ms) 셋이고,
// 모르는 걸음은 글 그대로 둔다 (실행이 건너뛴다). 걸음 하나를 더하고 빼고 옮기는 일이 되돌리기 한 단계다.

import { asList, isJsonText, jsonValueText, stringifyJsonLossless } from "../../model/json";
import type { EventSchema } from "../../model/schema";
import { NumberInput, TextField } from "../fields";
import type { ArgWidgetProps } from "./context";

export type RouteStep = { kind: "move" | "turn"; dir: string } | { kind: "wait"; ms: number } | { kind: "raw"; text: string };

const ARROWS: Record<string, string> = { up: "↑", down: "↓", left: "←", right: "→" };
const DEFAULT_WAIT = 500;

export function parseStep(schema: EventSchema, step: string): RouteStep {
  const { moves, turnPrefix, waitPrefix } = schema.route;
  if (moves.includes(step)) return { kind: "move", dir: step };
  if (step.startsWith(turnPrefix) && moves.includes(step.slice(turnPrefix.length))) return { kind: "turn", dir: step.slice(turnPrefix.length) };
  if (step.startsWith(waitPrefix) && /^\d+$/.test(step.slice(waitPrefix.length))) return { kind: "wait", ms: Number(step.slice(waitPrefix.length)) };
  return { kind: "raw", text: step };
}

export function stepText(schema: EventSchema, step: RouteStep): string {
  const { turnPrefix, waitPrefix } = schema.route;
  switch (step.kind) {
    case "move":
      return step.dir;
    case "turn":
      return `${turnPrefix}${step.dir}`;
    case "wait":
      return `${waitPrefix}${step.ms}`;
    case "raw":
      return step.text;
  }
}

function convert(schema: EventSchema, step: RouteStep, kind: RouteStep["kind"]): RouteStep {
  const dir = step.kind === "move" || step.kind === "turn" ? step.dir : schema.route.moves[0];
  if (kind === "move" || kind === "turn") return { kind, dir };
  if (kind === "wait") return { kind, ms: step.kind === "wait" ? step.ms : DEFAULT_WAIT };
  return { kind: "raw", text: stepText(schema, step) };
}

export function RouteArg({ spec, value, onChange, ctx, sessionPrefix, testId }: ArgWidgetProps) {
  const { schema } = ctx;
  const list = value === undefined ? [] : asList(value);
  if (!list) {
    return (
      <div className="rpg-arg-note is-warning" data-testid={`${testId}-broken`}>
        루트 단계 목록은 배열이어야 함 (현재: {stringifyJsonLossless(value)}){" "}
        <button type="button" className="btn rpg-mini" disabled={ctx.disabled} onClick={() => onChange([])}>
          빈 배열로 교체
        </button>
      </div>
    );
  }
  const put = (next: unknown[], session?: string) => onChange(next, session);
  const replaceAt = (k: number, step: unknown, session?: string) => {
    const next = [...list];
    next[k] = step;
    put(next, session);
  };
  const move = (from: number, to: number) => {
    const next = [...list];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    put(next);
  };
  const remove = (k: number) => put(list.filter((_, i) => i !== k));
  const add = (step: string) => put([...list, step]);

  return (
    <div className="rpg-route" data-testid={testId} aria-label={spec.label}>
      {list.map((raw, k) => {
        const step = isJsonText(raw) ? parseStep(schema, raw) : null;
        return (
          <div className="rpg-route-step" key={k} data-testid={`${testId}-${k}`}>
            <span className="rpg-option-no muted">{k + 1}.</span>
            {step ? (
              <>
                <select
                  className="input field-select rpg-arg-kind"
                  value={step.kind}
                  disabled={ctx.disabled}
                  aria-label={`${k + 1}번 루트 단계 종류`}
                  data-testid={`${testId}-${k}-kind`}
                  onChange={(e) => replaceAt(k, stepText(schema, convert(schema, step, e.target.value as RouteStep["kind"])))}
                >
                  <option value="move">이동</option>
                  <option value="turn">방향 전환</option>
                  <option value="wait">기다리기</option>
                  <option value="raw">직접 입력</option>
                </select>
                {(step.kind === "move" || step.kind === "turn") && (
                  <select
                    className="input field-select"
                    value={step.dir}
                    disabled={ctx.disabled}
                    aria-label={`${k + 1}번 루트 단계 방향`}
                    data-testid={`${testId}-${k}-dir`}
                    onChange={(e) => replaceAt(k, stepText(schema, { kind: step.kind, dir: e.target.value }))}
                  >
                    {schema.route.moves.map((m) => (
                      <option key={m} value={m}>
                        {ARROWS[m] ? `${ARROWS[m]} ${m}` : m}
                      </option>
                    ))}
                  </select>
                )}
                {step.kind === "wait" && (
                  <NumberInput
                    value={step.ms}
                    integer
                    min={0}
                    onChange={(v, s) => replaceAt(k, stepText(schema, { kind: "wait", ms: v }), s)}
                    sessionPrefix={`${sessionPrefix}:${k}`}
                    disabled={ctx.disabled}
                    testId={`${testId}-${k}-ms`}
                    ariaLabel={`${k + 1}번 루트 단계 ms`}
                  />
                )}
                {step.kind === "raw" && (
                  <TextField
                    value={step.text}
                    onChange={(v, s) => replaceAt(k, v, s)}
                    sessionPrefix={`${sessionPrefix}:${k}`}
                    disabled={ctx.disabled}
                    testId={`${testId}-${k}-text`}
                    ariaLabel={`${k + 1}번 루트 단계`}
                  />
                )}
              </>
            ) : (
              <span className="rpg-arg-note is-warning">{jsonValueText(raw)} (문자열이어야 함)</span>
            )}
            <span className="rpg-option-tools">
              <button type="button" className="btn btn-ghost rpg-mini" disabled={ctx.disabled || k === 0} aria-label={`${k + 1}번 루트 단계 위로`} data-testid={`${testId}-${k}-up`} onClick={() => move(k, k - 1)}>
                ↑
              </button>
              <button type="button" className="btn btn-ghost rpg-mini" disabled={ctx.disabled || k >= list.length - 1} aria-label={`${k + 1}번 루트 단계 아래로`} data-testid={`${testId}-${k}-down`} onClick={() => move(k, k + 1)}>
                ↓
              </button>
              <button type="button" className="btn btn-ghost rpg-mini" disabled={ctx.disabled} aria-label={`${k + 1}번 루트 단계 삭제`} data-testid={`${testId}-${k}-remove`} onClick={() => remove(k)}>
                ✕
              </button>
            </span>
          </div>
        );
      })}
      <div className="rpg-route-add">
        {schema.route.moves.map((m) => (
          <button key={m} type="button" className="btn rpg-mini" disabled={ctx.disabled} aria-label={`${m} 이동 추가`} data-testid={`${testId}-add-${m}`} onClick={() => add(m)}>
            {ARROWS[m] ?? m}
          </button>
        ))}
        <button type="button" className="btn rpg-mini" disabled={ctx.disabled} data-testid={`${testId}-add-turn`} onClick={() => add(`${schema.route.turnPrefix}${schema.route.moves[0]}`)}>
          방향 전환
        </button>
        <button type="button" className="btn rpg-mini" disabled={ctx.disabled} data-testid={`${testId}-add-wait`} onClick={() => add(`${schema.route.waitPrefix}${DEFAULT_WAIT}`)}>
          기다리기
        </button>
      </div>
    </div>
  );
}
