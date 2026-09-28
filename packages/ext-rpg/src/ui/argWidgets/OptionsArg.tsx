// options: 항목 목록. 항목을 더하고 빼고 옮기면 가지(branches)와 취소 번호(cancel)가 함께 따라간다.
// 그 맞추기는 모델의 항목 명령(addOption, removeOption, moveOption, setOption)이 하고, 위젯은 ops 로 부른다.
// 가지에 커맨드가 있는 항목을 빼면 먼저 묻는다. 좁은 인스펙터에서는 글 칸이 한 줄을 차지하고 고르기와 단추가 다음 줄로 내려간다.

import { asList, engineLength, isInteger, jsonValueText, stringifyJsonLossless } from "../../model/json";
import type { ArgSpec } from "../../model/schema";
import { TextField } from "../fields";
import type { ArgContext } from "./context";

export interface OptionOps {
  add(at: number, text: string): void;
  remove(k: number): void;
  move(from: number, to: number): void;
  set(k: number, text: string, session?: string): void;
  /** 취소키가 고르는 항목 (1부터). undefined 는 취소 없음 */
  setCancel?(n: number | undefined): void;
}

interface OptionsArgProps {
  spec: ArgSpec;
  value: unknown;
  /** 취소 번호 (1부터). setCancel 이 없으면 보이지 않는다 */
  cancel?: unknown;
  /** 항목마다 가지의 커맨드 수 */
  branchSizes?: readonly number[];
  ops: OptionOps;
  ctx: ArgContext;
  sessionPrefix: string;
  testId: string;
}

export function OptionsArg({ spec, value, cancel, branchSizes = [], ops, ctx, sessionPrefix, testId }: OptionsArgProps) {
  const list = asList(value);
  if (!list) {
    return (
      <div className="rpg-arg-note is-warning" data-testid={`${testId}-broken`}>
        항목 목록 편집 불가 (배열이 아님): {stringifyJsonLossless(value)}
      </div>
    );
  }
  const n = engineLength(list);
  const cancelNo = isInteger(cancel) ? cancel : undefined;
  const hasCancel = ops.setCancel !== undefined;
  const remove = async (k: number) => {
    const size = branchSizes[k] ?? 0;
    if (size > 0 && !(await ctx.confirm(`${k + 1}번 항목의 분기에 커맨드 ${size}개 있음. 분기와 함께 삭제할까요?`))) return;
    ops.remove(k);
  };
  const name = `${testId}-cancel`;
  return (
    <div className="rpg-options" data-testid={testId}>
      {list.map((opt, k) => (
        <div className="rpg-option" key={k} data-testid={`${testId}-${k}`}>
          <span className="rpg-option-no muted">{k + 1}.</span>
          <TextField
            value={jsonValueText(opt)}
            onChange={(v, s) => ops.set(k, v, s)}
            sessionPrefix={`${sessionPrefix}:${k}`}
            disabled={ctx.disabled}
            testId={`${testId}-${k}-text`}
            ariaLabel={`${k + 1}번 항목`}
          />
          <span className="rpg-option-tools">
            {hasCancel && (
              <label className="rpg-option-cancel" title="취소 키를 누르면 선택되는 항목">
                <input type="radio" name={name} checked={cancelNo === k + 1} disabled={ctx.disabled} onChange={() => ops.setCancel?.(k + 1)} data-testid={`${testId}-${k}-cancel`} />
                취소
              </label>
            )}
            <button type="button" className="btn btn-ghost rpg-mini" disabled={ctx.disabled || k === 0} aria-label={`${k + 1}번 항목 위로`} data-testid={`${testId}-${k}-up`} onClick={() => ops.move(k, k - 1)}>
              ↑
            </button>
            <button type="button" className="btn btn-ghost rpg-mini" disabled={ctx.disabled || k >= list.length - 1} aria-label={`${k + 1}번 항목 아래로`} data-testid={`${testId}-${k}-down`} onClick={() => ops.move(k, k + 1)}>
              ↓
            </button>
            <button type="button" className="btn btn-ghost rpg-mini" disabled={ctx.disabled || list.length <= (spec.min ?? 1)} aria-label={`${k + 1}번 항목 삭제`} data-testid={`${testId}-${k}-remove`} onClick={() => void remove(k)}>
              ✕
            </button>
          </span>
        </div>
      ))}
      <div className="rpg-options-foot">
        <button type="button" className="btn" disabled={ctx.disabled} data-testid={`${testId}-add`} onClick={() => ops.add(list.length, `항목 ${list.length + 1}`)}>
          항목 추가
        </button>
        {hasCancel && (
          <label className="rpg-option-cancel">
            <input type="radio" name={name} checked={cancelNo === undefined} disabled={ctx.disabled} onChange={() => ops.setCancel?.(undefined)} data-testid={`${testId}-cancel-none`} />
            취소 없음
          </label>
        )}
      </div>
      {cancelNo !== undefined && (cancelNo < 1 || cancelNo > n) && (
        <div className="rpg-arg-note is-warning" data-testid={`${testId}-cancel-outside`}>
          취소 번호 {cancelNo}: 항목 범위 밖
        </div>
      )}
    </div>
  );
}

/** 값만 고치는 ops (가지와 취소가 없는 자리: 팔레트의 미리 적기) */
export function valueOptionOps(value: unknown, onChange: (value: unknown, session?: string) => void): OptionOps {
  const list = () => [...(asList(value) ?? [])];
  return {
    add(at, text) {
      const l = list();
      l.splice(at, 0, text);
      onChange(l);
    },
    remove(k) {
      const l = list();
      l.splice(k, 1);
      onChange(l);
    },
    move(from, to) {
      const l = list();
      const [x] = l.splice(from, 1);
      l.splice(to, 0, x);
      onChange(l);
    },
    set(k, text, session) {
      const l = list();
      l[k] = text;
      onChange(l, session);
    },
  };
}
