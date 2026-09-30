// 노드 추가 목록. 검색 칸에 쓰면 거르고, 위아래 방향키와 Enter 로 고른다. 항목을 누르면 그 자리에 노드를 더한다.

import { useEffect, useMemo, useRef, useState } from "react";
import { filterPalette, type PaletteEntry } from "../../editor/graph/palette";

export function GraphPalette({
  entries,
  at,
  onPick,
  onClose,
}: {
  entries: readonly PaletteEntry[];
  at: { x: number; y: number };
  onPick: (entry: PaletteEntry) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useMemo(() => filterPalette(entries, query), [entries, query]);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setActive(0), [query]);
  // scrollIntoView 는 브라우저에 따라 Promise 를 돌려준다. 정리 함수로 오인되지 않게 값을 돌려주지 않는다
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [onClose]);

  const groups: [string, PaletteEntry[]][] = [];
  for (const e of list) {
    const last = groups[groups.length - 1];
    if (last && last[0] === e.category) last[1].push(e);
    else groups.push([e.category, [e]]);
  }
  let index = 0;

  return (
    <div ref={rootRef} className="graph-palette" style={{ left: at.x, top: at.y }} data-testid="graph-palette" onPointerDown={(e) => e.stopPropagation()}>
      <input
        className="input"
        autoFocus
        placeholder="노드 검색"
        value={query}
        data-testid="graph-palette-search"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onClose();
          else if (e.key === "ArrowDown") setActive((a) => Math.min(list.length - 1, a + 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
          else if (e.key === "Enter" && list[active]) onPick(list[active]);
          else return;
          e.preventDefault();
        }}
      />
      <div className="graph-palette-list">
        {list.length === 0 && <div className="graph-palette-empty">맞는 노드 없음</div>}
        {groups.map(([category, items]) => (
          <div key={category}>
            <div className="graph-palette-group">{category}</div>
            {items.map((e) => {
              const i = index++;
              return (
                <button
                  key={e.key}
                  ref={i === active ? activeRef : undefined}
                  type="button"
                  className="graph-palette-item"
                  data-active={i === active ? "true" : "false"}
                  data-kind={e.node.kind}
                  data-detail={e.detail ?? ""}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onPick(e)}
                >
                  <span>{e.label}</span>
                  {e.detail && <span className="graph-palette-item-detail">{e.detail}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
