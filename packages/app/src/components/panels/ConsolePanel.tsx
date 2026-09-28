// 콘솔 패널. log.visible 의 줄을 수준별 색으로 보이고, 필터와 수준 선택과 "엔진만" 토글과 지우기가 있다.
// 맨 아래를 보고 있을 때만 자동으로 따라 내려간다. 엔진 출력의 `파일:줄:` (core 의 parseErrorLinks) 은 링크이고
// 누르면 그 파일을 열어 그 줄로 간다 (runner/openErrorLink.ts).

import { parseErrorLinks, type ErrorLink, type LogEntry, type LogLevel } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useEditor } from "../../editor/EditorContext";
import { openErrorLink } from "../../editor/runner/openErrorLink";
import "./ConsolePanel.css";

const LEVELS: Array<{ value: LogLevel | "all"; label: string }> = [
  { value: "all", label: "모든 수준" },
  { value: "debug", label: "디버그" },
  { value: "info", label: "정보" },
  { value: "warn", label: "경고" },
  { value: "error", label: "오류" },
];

/** "엔진만" 이 남기는 출처: 엔진 출력과 실행기의 메시지 */
const ENGINE_SOURCES: ReadonlySet<string> = new Set(["engine", "runner"]);

function timeOf(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 줄 본문. 링크 범위는 클릭할 수 있는 span 으로, 나머지는 글자 그대로 */
const ConsoleText = memo(function ConsoleText({ text, onLink }: { text: string; onLink: (link: ErrorLink) => void }) {
  const links = useMemo(() => parseErrorLinks(text), [text]);
  if (links.length === 0) return <span className="console-text">{text}</span>;
  const parts: ReactNode[] = [];
  let last = 0;
  links.forEach((link, i) => {
    if (link.start > last) parts.push(text.slice(last, link.start));
    const where = `${link.path} 줄 ${link.line}${link.column ? `, 열 ${link.column}` : ""}`;
    parts.push(
      <span
        key={i}
        className="console-link"
        role="link"
        tabIndex={0}
        title={`${where} 열기`}
        data-testid="console-link"
        data-path={link.path}
        data-line={link.line}
        onClick={() => onLink(link)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onLink(link);
          }
        }}
      >
        {text.slice(link.start, link.end)}
      </span>,
    );
    last = link.end;
  });
  if (last < text.length) parts.push(text.slice(last));
  return <span className="console-text">{parts}</span>;
});

const ConsoleRow = memo(function ConsoleRow({ entry, onLink }: { entry: LogEntry; onLink: (link: ErrorLink) => void }) {
  return (
    <div className={`console-row level-${entry.level} source-${entry.source}`} data-source={entry.source}>
      <span className="console-ts">{timeOf(entry.ts)}</span>
      <span className="console-source">{entry.source}</span>
      <ConsoleText text={entry.text} onLink={onLink} />
    </div>
  );
});

export const ConsolePanel = observer(function ConsolePanel() {
  const editor = useEditor();
  const log = editor.log;
  const [engineOnly, setEngineOnly] = useState(false);
  const entries = engineOnly ? log.visible.filter((e) => ENGINE_SOURCES.has(e.source)) : log.visible;
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

  // 줄 컴포넌트가 memo 라 핸들러는 고정한다 (append 마다 모든 줄이 다시 그려지지 않게)
  const onLink = useCallback(
    (link: ErrorLink) => {
      void openErrorLink(editor, link).catch((e: Error) => editor.toasts.error(`${link.path} 열기 실패: ${e.message}`));
    },
    [editor],
  );

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
        <label className="console-toggle" title="엔진 출력과 실행기 메시지만 표시">
          <input type="checkbox" checked={engineOnly} onChange={(e) => setEngineOnly(e.target.checked)} data-testid="console-engine-only" />
          엔진만
        </label>
        <button type="button" className="btn" onClick={() => log.clear()}>
          지우기
        </button>
        <span className="muted console-count">{entries.length}줄</span>
      </div>
      <div className="console-list" ref={listRef} onScroll={onScroll} data-testid="console-list">
        {entries.map((e) => (
          <ConsoleRow key={e.id} entry={e} onLink={onLink} />
        ))}
      </div>
    </div>
  );
});
