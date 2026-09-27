// file: 프로젝트 파일 고르기 (accept 확장자, dir 아래가 먼저). 값은 "./resources/..." 꼴로 쓴다 (M2 2.6).

import { useMemo } from "react";
import { bareProjectPath } from "../../model/game";
import { fileArgValue } from "../../model/events";
import { emptyText, pickableFiles, type ArgWidgetProps } from "./context";

export function FileArg({ spec, value, onChange, ctx, testId }: ArgWidgetProps) {
  const files = useMemo(() => pickableFiles(ctx.files, spec.accept, spec.dir), [ctx.files, spec.accept, spec.dir]);
  const current = typeof value === "string" && value !== "" ? bareProjectPath(value) : "";
  const missing = current !== "" && !ctx.files.includes(current);
  const wrong = value !== undefined && typeof value !== "string";
  return (
    <>
      <select
        className="input field-select"
        value={current}
        disabled={ctx.disabled}
        data-testid={testId}
        aria-label={spec.label}
        onChange={(e) => onChange(e.target.value === "" ? undefined : fileArgValue(e.target.value))}
      >
        {(!spec.required || current === "") && (
          <option value="" disabled={spec.required}>
            {spec.required ? "파일 고르기" : emptyText(spec)}
          </option>
        )}
        {missing && <option value={current}>{current} (프로젝트에 없음)</option>}
        {files.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      {files.length === 0 && (
        <div className="rpg-arg-note is-warning" data-testid={`${testId}-none`}>
          고를 파일이 없다{spec.accept ? ` (${spec.accept.join(", ")})` : ""}
        </div>
      )}
      {wrong && <div className="rpg-arg-note is-warning">지금 값 {JSON.stringify(value)} 는 경로 글이 아니다</div>}
    </>
  );
}
