// 브라우저 모드의 HTML 메뉴 바. menus.tree() 를 그리고 라벨과 단축키와 활성 상태는 커맨드 레지스트리에서 읽는다.
// 보이지 않는 커맨드(visible 거짓, 이 프로젝트에 해당하지 않는 확장의 항목)는 빼고 그린다 (visibleMenu).
// Tauri 모드는 네이티브 메뉴(editor/nativeMenu.ts)를 쓰므로 이 바를 숨긴다.

import { visibleMenu, type MenuNode } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEditor } from "../editor/EditorContext";
import "./MenuBar.css";

export const MenuBar = observer(function MenuBar() {
  const editor = useEditor();
  const tree = visibleMenu(editor.menus.tree(), (id) => editor.commands.isVisible(id));
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpenIndex(null), []);

  useEffect(() => {
    if (openIndex === null) return;
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openIndex, close]);

  const onBarKey = (e: ReactKeyboardEvent) => {
    if (openIndex === null) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setOpenIndex((openIndex + 1) % tree.length);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setOpenIndex((openIndex - 1 + tree.length) % tree.length);
    }
  };

  const run = (commandId: string) => {
    close();
    void editor.commands.execute(commandId);
  };

  return (
    <div className="menubar" role="menubar" ref={barRef} onKeyDown={onBarKey} data-testid="menubar">
      {tree.map((branch, i) => (
        <div key={branch.label} className={"menubar-branch" + (openIndex === i ? " is-open" : "")}>
          <button
            type="button"
            className="menubar-button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openIndex === i}
            onMouseDown={(e) => {
              e.preventDefault();
              setOpenIndex(openIndex === i ? null : i);
            }}
            onMouseEnter={() => {
              if (openIndex !== null && openIndex !== i) setOpenIndex(i);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpenIndex(i);
              }
            }}
          >
            {branch.label}
          </button>
          {openIndex === i && <MenuList nodes={branch.children} onRun={run} autoFocus />}
        </div>
      ))}
    </div>
  );
});

const MenuList = observer(function MenuList({ nodes, onRun, autoFocus }: { nodes: MenuNode[]; onRun: (id: string) => void; autoFocus?: boolean }) {
  const editor = useEditor();
  const listRef = useRef<HTMLUListElement>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);

  useEffect(() => {
    if (autoFocus) {
      const first = listRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      first?.focus();
    }
  }, [autoFocus]);

  const move = (e: ReactKeyboardEvent, delta: number) => {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>(":scope > li > button:not(:disabled)") ?? []);
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(index + delta + buttons.length) % buttons.length];
    e.preventDefault();
    e.stopPropagation();
    next.focus();
  };

  return (
    <ul
      className="menu"
      role="menu"
      ref={listRef}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") move(e, 1);
        else if (e.key === "ArrowUp") move(e, -1);
      }}
    >
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const id = node.commandId;
        const enabled = hasChildren ? true : id ? editor.commands.isEnabled(id) : false;
        const label = id ? editor.commandLabel(id) : node.label;
        const shortcut = id ? editor.commands.formatShortcut(id) : "";
        const hint = id ? (enabled ? editor.commandNote(id) : editor.commandHint(id)) : undefined;
        const checked = id ? editor.commandChecked(id) : false;
        return (
          <li key={node.label} className={"menu-item-wrap" + (hasChildren && openSub === node.label ? " is-open" : "")} onMouseEnter={() => setOpenSub(hasChildren ? node.label : null)}>
            {node.separatorBefore && <div className="menu-separator" role="separator" />}
            <button
              type="button"
              role={hasChildren ? "menuitem" : checked ? "menuitemcheckbox" : "menuitem"}
              aria-checked={checked || undefined}
              aria-haspopup={hasChildren ? "menu" : undefined}
              className="menu-item"
              disabled={!enabled}
              title={hint}
              onClick={() => {
                if (hasChildren) setOpenSub(openSub === node.label ? null : node.label);
                else if (id) onRun(id);
              }}
              onKeyDown={(e) => {
                if (hasChildren && e.key === "ArrowRight") {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenSub(node.label);
                }
              }}
            >
              <span className="menu-check">{checked ? "✓" : ""}</span>
              <span className="menu-label">{label}</span>
              {shortcut && <span className="menu-shortcut">{shortcut}</span>}
              {hasChildren && <span className="menu-arrow">›</span>}
            </button>
            {hasChildren && openSub === node.label && <MenuList nodes={node.children} onRun={onRun} />}
          </li>
        );
      })}
    </ul>
  );
});
