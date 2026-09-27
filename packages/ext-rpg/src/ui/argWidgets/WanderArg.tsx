// wander (이벤트 칸): 켜기와 기다리는 프레임 수 둘, 구역의 칸 넷. 구역은 맵 위 사각형으로도 고친다 (이벤트 레이어).

import { field, isObjectPlace, isPlainObject, type JsonObject } from "../../model/json";
import { NumberInput } from "../fields";
import type { ArgWidgetProps } from "./context";

// 엔진 character.lua 의 setWander 기본값 (validate.ts 와 같다)
const WAIT_DEFAULTS: Record<string, number> = { minWait: 30, maxWait: 120 };
const AREA_LABELS: Record<string, string> = { x: "x", y: "y", w: "너비", h: "높이" };

export function WanderArg({ spec, value, onChange, ctx, sessionPrefix, testId }: ArgWidgetProps) {
  const on = value !== undefined;
  if (on && !isObjectPlace(value)) {
    return (
      <div className="rpg-arg-note is-warning" data-testid={`${testId}-broken`}>
        배회가 객체가 아니다 ({JSON.stringify(value)})
      </div>
    );
  }
  const w: JsonObject = isPlainObject(value) ? value : {};
  const area = field(w, "area");
  const put = (key: string, v: unknown, session?: string) => {
    const next: JsonObject = { ...w };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange(next, session);
  };
  const putArea = (key: string, v: number, session: string) => put("area", { ...(isPlainObject(area) ? area : {}), [key]: v }, session);
  return (
    <div className="rpg-wander" data-testid={testId}>
      <label className="rpg-arg-inline">
        <input type="checkbox" checked={on} disabled={ctx.disabled} data-testid={`${testId}-on`} onChange={(e) => onChange(e.target.checked ? {} : undefined)} aria-label={spec.label} />
        배회한다
      </label>
      {on &&
        Object.keys(WAIT_DEFAULTS).map((k) => (
          <label className="rpg-arg-inline" key={k}>
            <span className="muted">{k}</span>
            <NumberInput
              value={typeof field(w, k) === "number" ? (field(w, k) as number) : undefined}
              integer
              min={0}
              placeholder={`기본 ${WAIT_DEFAULTS[k]}`}
              onChange={(v, s) => put(k, v, s)}
              sessionPrefix={`${sessionPrefix}.${k}`}
              disabled={ctx.disabled}
              testId={`${testId}-${k}`}
              ariaLabel={k}
            />
          </label>
        ))}
      {on && isPlainObject(area) && (
        <div className="rpg-arg-inline" data-testid={`${testId}-area`}>
          <span className="muted">구역</span>
          {(["x", "y", "w", "h"] as const).map((k) => (
            <NumberInput
              key={k}
              value={typeof area[k] === "number" ? (area[k] as number) : undefined}
              integer
              min={k === "w" || k === "h" ? 1 : 0}
              onChange={(v, s) => putArea(k, v, s)}
              sessionPrefix={`${sessionPrefix}.area.${k}`}
              disabled={ctx.disabled}
              testId={`${testId}-area-${k}`}
              ariaLabel={`구역 ${AREA_LABELS[k]}`}
            />
          ))}
          <button type="button" className="btn btn-ghost rpg-mini" disabled={ctx.disabled} data-testid={`${testId}-area-clear`} onClick={() => put("area", undefined)}>
            구역 지우기
          </button>
        </div>
      )}
    </div>
  );
}
