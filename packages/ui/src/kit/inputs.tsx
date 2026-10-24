// 입력 부품. 값은 문서에서 오고, 초점이 있는 동안의 변경은 한 세션이라 되돌리기 한 번에 돌아간다 (useFieldText).
// 숫자 칸은 이름표나 축 글자를 좌우로 끌면 값이 바뀐다. Shift 는 10배, Alt 는 0.1배다.
// 끄는 동안의 변경도 한 세션이다.

import { useId, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { MIXED_LABEL, newSession, useFieldText } from "../fields";

function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

export interface TextInputProps {
  value: string | null;
  onChange: (value: string, session: string) => void;
  sessionPrefix: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
  id?: string;
  /** 고정폭 글꼴 (코드나 경로) */
  mono?: boolean;
}

export function TextInput({ value, onChange, sessionPrefix, placeholder, disabled, invalid, ariaLabel, id, mono }: TextInputProps) {
  const field = useFieldText(value, (v) => v ?? "", sessionPrefix);
  return (
    <input
      id={id}
      className={cx("kit-input", invalid && "is-invalid", mono && "is-mono")}
      value={field.text}
      placeholder={value === null ? MIXED_LABEL : placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      spellCheck={false}
      onFocus={field.focus}
      onBlur={field.blur}
      onChange={(e) => {
        field.setText(e.target.value);
        onChange(e.target.value, field.send(e.target.value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          field.revert();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function roundTo(n: number, step: number): number {
  const digits = Math.max(0, Math.ceil(-Math.log10(step)));
  return Number(n.toFixed(Math.min(digits, 6)));
}

export interface NumberInputProps {
  value: number | null;
  onChange: (value: number, session: string) => void;
  sessionPrefix: string;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  /** 칸 오른쪽의 단위 (px, ms, °) */
  unit?: string;
  /** 칸 왼쪽의 짧은 이름 (X, Y). 끌면 값이 바뀐다 */
  axis?: string;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
  id?: string;
}

export function NumberInput({ value, onChange, sessionPrefix, step = 1, min, max, integer, unit, axis, disabled, invalid, ariaLabel, id }: NumberInputProps) {
  const field = useFieldText(value, (v) => (v === null ? "" : String(v)), sessionPrefix);
  const drag = useRef<{ startX: number; start: number; session: string; moved: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const clamp = (n: number) => {
    let v = integer ? Math.round(n) : roundTo(n, step);
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  const commitText = (raw: string) => {
    field.setText(raw);
    if (raw.trim() === "") return;
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const v = clamp(n);
    onChange(v, field.send(v));
  };

  const nudge = (e: KeyboardEvent<HTMLInputElement>, dir: 1 | -1) => {
    e.preventDefault();
    const factor = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const v = clamp((value ?? 0) + dir * step * factor);
    field.setText(String(v));
    onChange(v, field.send(v));
  };

  const onScrubDown = (e: PointerEvent<HTMLElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, start: value ?? 0, session: newSession(sessionPrefix), moved: false };
  };
  const onScrubMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < 2) return;
    d.moved = true;
    const factor = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const v = clamp(d.start + Math.round(dx / 2) * step * factor);
    field.setText(String(v));
    onChange(v, d.session);
  };
  const onScrubUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (d && !d.moved) inputRef.current?.focus();
  };

  return (
    <div className={cx("kit-number", invalid && "is-invalid", disabled && "is-disabled")}>
      {axis && (
        <span className="kit-number-axis" onPointerDown={onScrubDown} onPointerMove={onScrubMove} onPointerUp={onScrubUp} aria-hidden>
          {axis}
        </span>
      )}
      <input
        ref={inputRef}
        id={id}
        className="kit-number-input"
        inputMode="decimal"
        value={field.text}
        placeholder={value === null ? MIXED_LABEL : undefined}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        spellCheck={false}
        onFocus={(e) => {
          field.focus();
          e.target.select();
        }}
        onBlur={field.blur}
        onChange={(e) => commitText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") nudge(e, 1);
          else if (e.key === "ArrowDown") nudge(e, -1);
          else if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") {
            field.revert();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {unit && <span className="kit-number-unit">{unit}</span>}
    </div>
  );
}

export interface Vector2InputProps {
  x: number | null;
  y: number | null;
  onChange: (axis: "x" | "y", value: number, session: string) => void;
  sessionPrefix: string;
  step?: number;
  integer?: boolean;
  unit?: string;
  ariaLabel: string;
  labels?: [string, string];
}

export function Vector2Input({ x, y, onChange, sessionPrefix, step, integer, unit, ariaLabel, labels = ["X", "Y"] }: Vector2InputProps) {
  return (
    <div className="kit-vector2" role="group" aria-label={ariaLabel}>
      <NumberInput value={x} axis={labels[0]} unit={unit} step={step} integer={integer} sessionPrefix={`${sessionPrefix}.x`} ariaLabel={`${ariaLabel} ${labels[0]}`} onChange={(v, s) => onChange("x", v, s)} />
      <NumberInput value={y} axis={labels[1]} unit={unit} step={step} integer={integer} sessionPrefix={`${sessionPrefix}.y`} ariaLabel={`${ariaLabel} ${labels[1]}`} onChange={(v, s) => onChange("y", v, s)} />
    </div>
  );
}

export interface CheckboxProps {
  checked: boolean | null;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
}

export function Checkbox({ checked, onChange, label, disabled, ariaLabel }: CheckboxProps) {
  const id = useId();
  const mixed = checked === null;
  return (
    <label className={cx("kit-check", disabled && "is-disabled")} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="kit-check-input"
        checked={checked === true}
        aria-checked={mixed ? "mixed" : checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={cx("kit-check-box", mixed && "is-mixed")} aria-hidden>
        {checked === true && <Check size={12} strokeWidth={3} />}
        {mixed && <span className="kit-check-dash" />}
      </span>
      {label && <span className="kit-check-label">{label}</span>}
    </label>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
}

export function Switch({ checked, onChange, label, disabled, ariaLabel }: SwitchProps) {
  return (
    <label className={cx("kit-switch", disabled && "is-disabled")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cx("kit-switch-track", checked && "is-on")}
        onClick={() => onChange(!checked)}
      >
        <span className="kit-switch-thumb" />
      </button>
      {label && <span className="kit-switch-label">{label}</span>}
    </label>
  );
}
