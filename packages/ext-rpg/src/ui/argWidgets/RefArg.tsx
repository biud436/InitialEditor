// ref: 콤보 상자 (제안 목록과 자유 입력). 제안은 refs.ts 가 만든다: 맵 이름, 아이템 id, 이 맵의 이벤트 id 와 player,
// 이 프로젝트에서 쓰인 깃발과 변수. 맵, 아이템, 이벤트는 목록에 없으면 경고하고, 깃발과 변수는 새 이름이라고 알린다.

import { useId, useMemo } from "react";
import { isJsonText, jsonValueText } from "../../model/json";
import { refSuggestions } from "../../model/refs";
import { TextField } from "../fields";
import { emptyText, textValue, type ArgWidgetProps } from "./context";

const CLOSED_KINDS = new Set(["map", "item", "character"]);

export function RefArg({ spec, value, onChange, ctx, sessionPrefix, testId }: ArgWidgetProps) {
  const listId = useId();
  const kind = spec.ref;
  const suggestions = useMemo(() => (kind ? refSuggestions(kind, ctx.refs) : []), [kind, ctx.refs]);
  const text = isJsonText(value) ? value : "";
  const found = suggestions.find((s) => s.value === text);
  let note: { text: string; tone: "warning" | "muted" } | null = null;
  if (value !== undefined && !isJsonText(value)) note = { text: `지금 값 ${jsonValueText(value)} 는 글이 아니다`, tone: "warning" };
  else if (text !== "" && !found) note = kind && CLOSED_KINDS.has(kind) ? { text: "목록에 없다", tone: "warning" } : { text: "새 이름", tone: "muted" };
  else if (found?.detail) note = { text: found.detail, tone: "muted" };
  return (
    <>
      <TextField
        value={text}
        onChange={(v, s) => onChange(textValue(spec, v), s)}
        sessionPrefix={sessionPrefix}
        disabled={ctx.disabled}
        placeholder={spec.required ? undefined : emptyText(spec)}
        testId={testId}
        ariaLabel={spec.label}
        list={listId}
      />
      <datalist id={listId} data-testid={`${testId}-suggest`}>
        {suggestions.map((s) => (
          <option key={s.value} value={s.value} label={s.detail} />
        ))}
      </datalist>
      {note && (
        <div className={`rpg-arg-note ${note.tone === "warning" ? "is-warning" : "muted"}`} data-testid={`${testId}-note`}>
          {note.text}
        </div>
      )}
    </>
  );
}
