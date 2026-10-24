// 툴팁. 마우스를 잠시 올리거나 키보드로 초점을 옮기면 대상 아래(자리가 없으면 위)에 한 줄 설명을 띄운다.
// 문서 끝에 그려 패널의 overflow 에 잘리지 않는다.

import { cloneElement, useCallback, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SHOW_DELAY = 450;
const GAP = 6;

interface Position {
  left: number;
  top: number;
  above: boolean;
}

function place(anchor: DOMRect, tip: DOMRect): Position {
  const below = anchor.bottom + GAP;
  const above = below + tip.height > window.innerHeight - 4;
  const top = above ? anchor.top - GAP - tip.height : below;
  const center = anchor.left + anchor.width / 2 - tip.width / 2;
  const left = Math.min(Math.max(4, center), window.innerWidth - tip.width - 4);
  return { left, top, above };
}

export interface TooltipProps {
  content: ReactNode;
  /** 단축키 표시 (예: "B", "Ctrl+S") */
  shortcut?: string;
  children: ReactElement;
}

export function Tooltip({ content, shortcut, children }: TooltipProps) {
  const id = useId();
  const anchorRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
    setPos(null);
  }, []);

  const showSoon = useCallback((delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open || !anchorRef.current || !tipRef.current) return;
    setPos(place(anchorRef.current.getBoundingClientRect(), tipRef.current.getBoundingClientRect()));
  }, [open]);

  const child = children as ReactElement<Record<string, unknown>> & { ref?: unknown };
  const props = child.props as Record<string, (e: unknown) => void>;
  const childRef = child.ref;
  const trigger = cloneElement(child, {
    ref: (el: HTMLElement | null) => {
      anchorRef.current = el;
      if (typeof childRef === "function") childRef(el);
      else if (childRef && typeof childRef === "object") (childRef as { current: HTMLElement | null }).current = el;
    },
    "aria-describedby": open ? id : undefined,
    onPointerEnter: (e: unknown) => {
      props.onPointerEnter?.(e);
      showSoon(SHOW_DELAY);
    },
    onPointerLeave: (e: unknown) => {
      props.onPointerLeave?.(e);
      hide();
    },
    onPointerDown: (e: unknown) => {
      props.onPointerDown?.(e);
      hide();
    },
    onFocus: (e: unknown) => {
      props.onFocus?.(e);
      if (anchorRef.current?.matches(":focus-visible")) showSoon(0);
    },
    onBlur: (e: unknown) => {
      props.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            className="kit-tooltip"
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
          >
            <span>{content}</span>
            {shortcut && <kbd className="kit-tooltip-key">{shortcut}</kbd>}
          </div>,
          document.body,
        )}
    </>
  );
}
