// 선택 목록. 운영체제의 select 대신 직접 그려 다크와 라이트, macOS 와 Windows 에서 같은 모양이다.
// 위아래 화살표로 옮기고 Enter 로 고르며 Esc 로 닫는다. 글자를 치면 그 글자로 시작하는 항목으로 간다.

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** 항목 아래의 짧은 설명 */
  description?: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface SelectProps<T extends string> {
  value: T | null;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
  size?: "sm" | "md";
  /** 항목 앞에 붙는 것 (썸네일 등) */
  renderOption?: (option: SelectOption<T>) => ReactNode;
}

interface MenuPos {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

export function Select<T extends string>({ value, options, onChange, placeholder = "선택", disabled, ariaLabel, id, size = "md", renderOption }: SelectProps<T>) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const current = options.find((o) => o.value === value) ?? null;

  const openMenu = () => {
    if (disabled) return;
    const i = Math.max(0, options.findIndex((o) => o.value === value));
    setActive(i);
    setOpen(true);
  };

  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const wanted = Math.min(320, options.length * 30 + 8);
    const down = below >= Math.min(wanted, 160) || below >= above;
    const maxHeight = Math.max(120, Math.min(320, down ? below : above));
    setPos({ left: r.left, top: down ? r.bottom + 4 : r.top - 4 - Math.min(wanted, maxHeight), width: r.width, maxHeight });
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  const step = (dir: 1 | -1) => {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setActive(i);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      setOpen(false);
    } else if (e.key.length === 1) {
      const k = e.key.toLowerCase();
      const i = options.findIndex((o, n) => n > active && o.label.toLowerCase().startsWith(k));
      const j = i >= 0 ? i : options.findIndex((o) => o.label.toLowerCase().startsWith(k));
      if (j >= 0) setActive(j);
    }
  };

  const CurrentIcon = current?.icon;
  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`kit-select kit-select-${size}${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        {CurrentIcon && <CurrentIcon size={14} strokeWidth={1.75} aria-hidden />}
        <span className={current ? "kit-select-value" : "kit-select-placeholder"}>{current ? current.label : placeholder}</span>
        <ChevronDown className="kit-select-chevron" size={14} strokeWidth={1.75} aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            className="kit-menu"
            style={pos ? { left: pos.left, top: pos.top, minWidth: pos.width, maxHeight: pos.maxHeight } : { left: -9999, top: -9999 }}
          >
            {options.map((o, i) => {
              const Icon = o.icon;
              return (
                <div
                  key={o.value}
                  role="option"
                  data-index={i}
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled || undefined}
                  className={`kit-menu-item${i === active ? " is-active" : ""}${o.disabled ? " is-disabled" : ""}`}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  <span className="kit-menu-check">{o.value === value && <Check size={14} strokeWidth={2} aria-hidden />}</span>
                  {renderOption ? renderOption(o) : Icon && <Icon size={16} strokeWidth={1.75} aria-hidden />}
                  <span className="kit-menu-text">
                    <span className="kit-menu-label">{o.label}</span>
                    {o.description && <span className="kit-menu-desc">{o.description}</span>}
                  </span>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
