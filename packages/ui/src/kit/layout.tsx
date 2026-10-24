// 패널을 짜는 부품: 패널 머리, 도구 모음, 접히는 구역, 속성 줄, 목록 줄, 탭, 빈 상태, 배지, 단축키.

import { useState, type ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";

function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

/** 패널의 머리. 제목 왼쪽, 패널 동작(IconButton sm) 오른쪽 */
export function PanelHeader({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <div className="kit-panel-header">
      <span className="kit-panel-title">{title}</span>
      {meta !== undefined && <span className="kit-panel-meta">{meta}</span>}
      <span className="kit-panel-actions">{children}</span>
    </div>
  );
}

export function Toolbar({ children, ariaLabel }: { children: ReactNode; ariaLabel: string }) {
  return (
    <div role="toolbar" aria-label={ariaLabel} className="kit-toolbar">
      {children}
    </div>
  );
}

export function ToolbarSeparator() {
  return <span className="kit-toolbar-sep" role="separator" aria-orientation="vertical" />;
}

export function ToolbarSpacer() {
  return <span className="kit-toolbar-spacer" />;
}

/** 접히는 구역 (인스펙터의 변환, 스프라이트, 스크립트 같은) */
export function Section({ title, defaultOpen = true, actions, children }: { title: ReactNode; defaultOpen?: boolean; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cx("kit-section", open && "is-open")}>
      <div className="kit-section-head">
        <button type="button" className="kit-section-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronRight className="kit-section-chevron" size={14} strokeWidth={2} aria-hidden />
          <span className="kit-section-title">{title}</span>
        </button>
        {actions && <span className="kit-section-actions">{actions}</span>}
      </div>
      {open && <div className="kit-section-body">{children}</div>}
    </section>
  );
}

/** 속성 한 줄: 이름과 입력. 이름은 줄여 쓰지 않고 두 줄까지 감싼다 */
export function PropertyRow({ label, htmlFor, children, hint }: { label: ReactNode; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="kit-prop">
      <label className="kit-prop-label" htmlFor={htmlFor} title={hint}>
        {label}
      </label>
      <div className="kit-prop-control">{children}</div>
    </div>
  );
}

export interface ListRowProps {
  label: ReactNode;
  icon?: LucideIcon;
  /** 오른쪽의 흐린 정보 (종류, 개수) */
  meta?: ReactNode;
  /** 마우스를 올리면 보이는 동작 (보이기, 잠그기) */
  actions?: ReactNode;
  /** 늘 보이는 상태 아이콘 (숨김일 때의 눈 등) */
  status?: ReactNode;
  depth?: number;
  /** 자식이 있으면 펼침 단추 */
  expanded?: boolean;
  onToggle?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function ListRow({ label, icon: Icon, meta, actions, status, depth = 0, expanded, onToggle, selected, dimmed, onClick, onDoubleClick }: ListRowProps) {
  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={expanded}
      tabIndex={selected ? 0 : -1}
      className={cx("kit-row", selected && "is-selected", dimmed && "is-dimmed")}
      style={{ paddingLeft: 8 + depth * 16 }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <span className="kit-row-twisty">
        {expanded !== undefined && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={expanded ? "접기" : "펼치기"}
            className={cx("kit-row-expander", expanded && "is-expanded")}
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.();
            }}
          >
            <ChevronRight size={14} strokeWidth={2} aria-hidden />
          </button>
        )}
      </span>
      {Icon && <Icon className="kit-row-icon" size={16} strokeWidth={1.75} aria-hidden />}
      <span className="kit-row-label">{label}</span>
      {meta !== undefined && <span className="kit-row-meta">{meta}</span>}
      {status && <span className="kit-row-status">{status}</span>}
      {actions && <span className="kit-row-actions">{actions}</span>}
    </div>
  );
}

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function Tabs<T extends string>({ value, items, onChange, ariaLabel }: { value: T; items: ReadonlyArray<TabItem<T>>; onChange: (value: T) => void; ariaLabel: string }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="kit-tabs">
      {items.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === value} className={cx("kit-tab", t.value === value && "is-selected")} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span className="kit-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** 빈 상태: 그림, 한 줄 제목, 한 줄 설명, 할 일 하나 */
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="kit-empty">
      <Icon className="kit-empty-icon" size={32} strokeWidth={1.25} aria-hidden />
      <div className="kit-empty-title">{title}</div>
      {description && <div className="kit-empty-desc">{description}</div>}
      {action && <div className="kit-empty-action">{action}</div>}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "danger" | "warning" | "success" }) {
  return <span className={cx("kit-badge", `kit-badge-${tone}`)}>{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kit-kbd">{children}</kbd>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("kit-card", className)}>{children}</div>;
}
