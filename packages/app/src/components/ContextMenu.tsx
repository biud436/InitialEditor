// 오른쪽 클릭 메뉴. 프로젝트, 계층, 맵 오브젝트 패널이 쓴다. 바깥 클릭이나 Escape 로 닫힌다.
// document.body 에 그린다: 도킹 영역(dockview 의 grid view)은 contain: layout 이라 그 안의 position: fixed 가
// 창이 아니라 도킹 영역 기준이 되어, 메뉴가 도킹 영역의 위치만큼 밀려 뜬다.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ContextMenu.css";

export interface ContextMenuItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: state.x, y: state.y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(state.x, window.innerWidth - rect.width - 4);
    const y = Math.min(state.y, window.innerHeight - rect.height - 4);
    setPos({ x: Math.max(0, x), y: Math.max(0, y) });
  }, [state]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div className="context-menu" role="menu" ref={ref} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {state.items.map((item, i) => (
        <div key={i}>
          {item.separatorBefore && <div className="context-menu-separator" />}
          <button
            type="button"
            role="menuitem"
            className={"context-menu-item" + (item.danger ? " is-danger" : "")}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onClick?.();
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
