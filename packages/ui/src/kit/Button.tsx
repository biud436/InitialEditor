// 단추 부품. 크기는 sm(24px), md(28px), lg(32px) 셋이고 모양은 기본, 주, 위험, 투명 넷이다.
// 아이콘만 있는 단추는 툴팁이 이름을 대신하므로 label 이 반드시 있다.

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Tooltip } from "./Tooltip";

export type ButtonSize = "sm" | "md" | "lg";
export type ButtonVariant = "default" | "primary" | "danger" | "ghost";

const ICON_PX: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 16 };

function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  size?: ButtonSize;
  variant?: ButtonVariant;
  icon?: LucideIcon;
  /** 단추 끝에 붙는 단축키 표시 */
  shortcut?: string;
  type?: "button" | "submit";
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { size = "md", variant = "default", icon: Icon, shortcut, type = "button", className, children, ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cx("kit-btn", `kit-btn-${size}`, `kit-btn-${variant}`, className)} {...rest}>
      {Icon && <Icon size={ICON_PX[size]} strokeWidth={1.75} aria-hidden />}
      {children !== undefined && <span className="kit-btn-label">{children}</span>}
      {shortcut && <kbd className="kit-btn-key">{shortcut}</kbd>}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children"> {
  icon: LucideIcon;
  /** 툴팁과 접근성 이름 */
  label: string;
  shortcut?: string;
  size?: ButtonSize;
  /** 켜짐 상태가 있는 단추 (보이기, 격자 같은) */
  pressed?: boolean;
  variant?: "ghost" | "default";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, shortcut, size = "md", pressed, variant = "ghost", className, ...rest },
  ref,
) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        className={cx("kit-icon-btn", `kit-icon-btn-${size}`, `kit-icon-btn-${variant}`, pressed && "is-pressed", className)}
        {...rest}
      >
        <Icon size={ICON_PX[size]} strokeWidth={1.75} aria-hidden />
      </button>
    </Tooltip>
  );
});

export interface SegmentedOption<T extends string> {
  value: T;
  label?: string;
  icon?: LucideIcon;
  /** 아이콘만 보일 때 툴팁 */
  title?: string;
  shortcut?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  size?: ButtonSize;
  ariaLabel: string;
}

export function SegmentedControl<T extends string>({ value, options, onChange, size = "md", ariaLabel }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx("kit-segmented", `kit-segmented-${size}`)}>
      {options.map((o) => {
        const Icon = o.icon;
        const button = (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            aria-label={o.label ?? o.title}
            className={cx("kit-segment", o.value === value && "is-selected", !o.label && "is-icon")}
            onClick={() => onChange(o.value)}
          >
            {Icon && <Icon size={ICON_PX[size]} strokeWidth={1.75} aria-hidden />}
            {o.label && <span>{o.label}</span>}
          </button>
        );
        return o.title || o.shortcut ? (
          <Tooltip key={o.value} content={o.title ?? o.label} shortcut={o.shortcut}>
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}
