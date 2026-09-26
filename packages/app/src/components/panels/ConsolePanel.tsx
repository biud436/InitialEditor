// 콘솔 패널. log.visible 의 줄을 수준별 색으로 보이고, 필터와 수준 선택과 지우기가 있다.
// 맨 아래를 보고 있을 때만 자동으로 따라 내려간다. `파일:줄:` 링크는 E1 이 더한다.

import type { LogLevel } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useLayoutEffect, useRef } from "react";
import { useEditor } from "../../editor/EditorContext";
import "./ConsolePanel.css";

const LEVELS: Array<{ value: LogLevel | "all"; label: string }> = [
  { value: "all", label: "모든 수준" },
  { value: "debug", label: "디버그" },
  { value: "info", label: "정보" },
  { value: "warn", label: "경고" },
  { value: "error", label: "오류" },
];

function timeOf(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export const ConsolePanel = observer(function ConsolePanel() {
  const editor = useEditor();
  const log = editor.log;
  const entries = log.visible;
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
  };

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div className="console" data-testid="console">
      <div className="console-toolbar">
        <input className="input console-filter" placeholder="필터" value={log.filterText} onChange={(e) => log.setFilter(e.target.value)} aria-label="콘솔 필터" />
        <select className="select" value={log.filterLevel} onChange={(e) => log.setFilter(log.filterText, e.target.value as LogLevel | "all")} aria-label="수준">
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => log.clear()}>
          지우기
        </button>
        <span className="muted console-count">{entries.length}줄</span>
      </div>
      <div className="console-list" ref={listRef} onScroll={onScroll} data-testid="console-list">
        {entries.map((e) => (
          <div key={e.id} className={`console-row level-${e.level}`}>
            <span className="console-ts">{timeOf(e.ts)}</span>
            <span className="console-source">{e.source}</span>
            <span className="console-text">{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
