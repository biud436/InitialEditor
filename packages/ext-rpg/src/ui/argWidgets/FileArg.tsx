// file: 프로젝트 파일 고르기 (accept 확장자, dir 아래가 먼저). 값은 "./resources/..." 꼴로 쓴다 (M2 2.6).
// 상자보다 긴 경로는 상자 안에서 잘리고 온전한 글은 title 로 보인다.

import { useMemo } from "react";
import { bareProjectPath } from "../../model/game";
import { fileArgValue } from "../../model/events";
import { isJsonText, jsonValueText } from "../../model/json";
import { emptyText, pickableFiles, type ArgWidgetProps } from "./context";

export function FileArg({ spec, value, onChange, ctx, testId }: ArgWidgetProps) {
  const files = useMemo(() => pickableFiles(ctx.files, spec.accept, spec.dir), [ctx.files, spec.accept, spec.dir]);
  const current = isJsonText(value) && value !== "" ? bareProjectPath(value) : "";
  const missing = current !== "" && !ctx.files.includes(current);
  const wrong = value !== undefined && !isJsonText(value);
  const shown = missing ? `${current} (프로젝트에 없음)` : current;
  return (
    <>
      <select
        className="input field-select"
        value={current}
        disabled={ctx.disabled}
        data-testid={testId}
        aria-label={spec.label}
        title={shown || undefined}
        onChange={(e) => onChange(e.target.value === "" ? undefined : fileArgValue(e.target.value))}
      >
        {(!spec.required || current === "") && (
          <option value="" disabled={spec.required}>
            {spec.required ? "파일 선택" : emptyText(spec)}
          </option>
        )}
        {missing && <option value={current}>{shown}</option>}
        {files.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      {files.length === 0 && (
        <div className="rpg-arg-note is-warning" data-testid={`${testId}-none`}>
          선택할 파일 없음{spec.accept ? ` (${spec.accept.join(", ")})` : ""}
        </div>
      )}
      {wrong && <div className="rpg-arg-note is-warning">경로 문자열이어야 함 (현재: {jsonValueText(value)})</div>}
    </>
  );
}
