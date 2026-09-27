// 커맨드 목록 편집기 (e5 문서 4절). 이벤트 하나의 commands 를 트리로 보이고 고친다. 맵 뷰를 모른다.
//
// 줄은 커맨드, 하위 목록의 머리줄(접을 수 있다), 목록 끝의 빈 줄이다 (commandRows.ts). 커맨드 줄을 고르면 그 아래에
// 인자 폼이 펼쳐진다. 모든 편집은 모델의 EventEditor 명령을 apply(맵 문서의 doc.apply)로 넣으므로 한 동작이 되돌리기 한 단계다.
//
// 키 (트리 요소가 받고 전파를 막는다. 전역 edit.* 와 맵 뷰의 이벤트 복사에 닿지 않는다, e5 문서 2.4):
//   위, 아래           줄 옮기기. Shift 와 함께면 같은 목록 안에서 고르기를 넓힌다
//   Ctrl+위, 아래       고른 커맨드 옮기기
//   왼쪽, 오른쪽        머리줄 접기와 펴기, 왼쪽은 바깥 머리줄로
//   Home, End          처음과 끝 줄
//   Enter              커맨드는 폼으로, 머리줄은 접기, 끝 줄은 팔레트
//   Delete, Backspace  고른 커맨드 빼기
//   Insert             팔레트 (고른 줄 위에 넣기)
//   Ctrl+C, Ctrl+V     복사와 붙여넣기 (여러 줄, JSON. 붙이면 고른 줄 아래)
//   Escape             넓힌 고르기 풀기

import type { Command } from "@initial-editor/core";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { EditRefused, type EventEditor } from "../model/commands";
import { field, isArrayPlace, isPlainObject, type JsonObject } from "../model/json";
import type { RefSources } from "../model/refs";
import type { EventSchema } from "../model/schema";
import { commandLocation, copyCommands, getList, parseLocation, type CommandPath, type ListPath } from "../model/tree";
import { validateEvents, type EventProblem } from "../model/validate";
import type { ArgContext, ImageUrl } from "./argWidgets/context";
import { commandClipboard, type CommandClipboard } from "./clipboard";
import {
  buildRows,
  commandKey,
  endKey,
  headerKey,
  headersAbove,
  insertTarget,
  isCommandProblem,
  problemPath,
  problemsByRow,
  sameList,
  selectedRange,
  worstSeverity,
  type InsertWhere,
  type TreeRow,
} from "./commandRows";
import { CommandForm } from "./CommandForm";
import { CommandPalette } from "./CommandPalette";
import "./CommandListEditor.css";

export interface CommandListEditorProps {
  editor: EventEditor;
  /** 섹션 목록의 이벤트 번호 (0부터) */
  eventIndex: number;
  schema: EventSchema;
  /** 명령을 문서에 넣는다 (맵 문서의 doc.apply) */
  apply: (cmd: Command) => void;
  /** 이 맵의 문제 (레이어 상태의 problems). 없으면 스키마만으로 검사한다 */
  problems?: readonly EventProblem[];
  /** ref 칸의 제안 재료. 없으면 스키마와 이 맵의 이벤트 */
  refs?: RefSources;
  /** 프로젝트 파일 목록 (프로젝트 기준, ./ 없이) */
  files?: readonly string[];
  imageUrl?: ImageUrl;
  /** 편집을 막는 이유 (잠긴 레이어) */
  locked?: string | null;
  clipboard?: CommandClipboard;
  /** 되묻기. 없으면 window.confirm */
  confirm?: (message: string) => boolean | Promise<boolean>;
  /** 편집이 거절되었다 (알림 띄우기) */
  onRefused?: (message: string) => void;
  /** 밖에서 그 커맨드로 가기 (문제 목록, 콘솔의 rpg:error). nonce 가 바뀔 때마다 */
  focusRequest?: { location: string; nonce: number } | null;
  /** 고른 커맨드가 바뀌었다 */
  onSelect?: (path: CommandPath | null) => void;
}

const NO_FILES: readonly string[] = [];

function defaultConfirm(message: string): boolean {
  return typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(message) : true;
}

export const CommandListEditor = observer(function CommandListEditor(props: CommandListEditorProps) {
  const { editor, eventIndex, schema, apply, locked = null, onRefused, focusRequest, onSelect } = props;
  const events = editor.section.list;
  const ev = events[eventIndex];
  const commands = isPlainObject(ev) ? field(ev, "commands") : undefined;
  const commandsOk = commands === undefined || isArrayPlace(commands);
  const clipboard = props.clipboard ?? commandClipboard;
  const baseId = useId();

  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const [cursorKey, setCursorKey] = useState<string>(() => endKey([]));
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  const [palette, setPalette] = useState<{ where: InsertWhere; target: { list: ListPath; index: number } } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [formFocus, setFormFocus] = useState(0);
  const treeRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const lastIndex = useRef(0);

  // 다른 이벤트로 바뀌면 고르기와 접기를 처음부터
  useEffect(() => {
    setFolded(new Set());
    setCursorKey(endKey([]));
    setAnchorKey(null);
    setPalette(null);
    setNotice(null);
    setStatus(null);
  }, [eventIndex]);

  const rows = useMemo(() => (commandsOk ? buildRows(commands, schema, folded) : []), [commands, commandsOk, schema, folded]);
  let cursorIndex = rows.findIndex((r) => r.key === cursorKey);
  if (cursorIndex < 0) cursorIndex = Math.min(lastIndex.current, rows.length - 1);
  const cursor: TreeRow | undefined = rows[cursorIndex];
  const anchor = anchorKey === null ? undefined : rows.find((r) => r.key === anchorKey);
  const range = selectedRange(cursor, anchor);
  const selectedKeys = new Set<string>();
  if (range) for (let i = 0; i < range.count; i++) selectedKeys.add(commandKey({ list: range.list, index: range.start + i }));

  const fallbackProblems = useMemo(() => (props.problems ? null : validateEvents(events, { schema })), [props.problems, events, schema]);
  const allProblems = props.problems ?? fallbackProblems ?? [];
  const mine = useMemo(() => allProblems.filter((p) => isCommandProblem(p, eventIndex)), [allProblems, eventIndex]);
  const byRow = useMemo(() => problemsByRow(mine, rows, schema), [mine, rows, schema]);

  const refs = useMemo<RefSources>(() => props.refs ?? { schema, events }, [props.refs, schema, events]);
  const confirm = props.confirm ?? defaultConfirm;
  const argCtx: ArgContext = useMemo(
    () => ({ schema, refs, files: props.files ?? NO_FILES, imageUrl: props.imageUrl, disabled: locked !== null, confirm }),
    [schema, refs, props.files, props.imageUrl, locked, confirm],
  );

  useEffect(() => {
    lastIndex.current = Math.max(0, cursorIndex);
  }, [cursorIndex]);

  // 경로 객체는 줄을 펼 때마다 새로 만들어지므로 키가 바뀔 때만 알린다
  const cursorPath = cursor?.kind === "command" ? cursor.path : null;
  const cursorPathKey = cursor?.kind === "command" ? cursor.key : null;
  const selectRef = useRef({ onSelect, cursorPath });
  selectRef.current = { onSelect, cursorPath };
  useEffect(() => {
    selectRef.current.onSelect?.(selectRef.current.cursorPath);
  }, [cursorPathKey]);

  useEffect(() => {
    const el = treeRef.current?.querySelector<HTMLElement>(`[data-row-index="${cursorIndex}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [cursorIndex]);

  useEffect(() => {
    if (formFocus === 0) return;
    formRef.current?.querySelector<HTMLElement>("input, textarea, select")?.focus();
  }, [formFocus]);

  const focusTree = () => treeRef.current?.focus();

  const focusPath = useCallback((path: CommandPath) => {
    const open = headersAbove(path);
    setFolded((f) => (open.some((k) => f.has(k)) ? new Set([...f].filter((k) => !open.includes(k))) : f));
    setCursorKey(commandKey(path));
    setAnchorKey(null);
    treeRef.current?.focus();
  }, []);

  // 같은 요청(nonce)은 한 번만 따른다
  const requestRef = useRef({ focusRequest, schema, eventIndex });
  requestRef.current = { focusRequest, schema, eventIndex };
  const requestNonce = focusRequest?.nonce;
  useEffect(() => {
    const { focusRequest: req, schema: s, eventIndex: i } = requestRef.current;
    if (!req) return;
    const parsed = parseLocation(req.location, s);
    if (parsed && parsed.eventIndex === i && parsed.command) focusPath(parsed.command);
  }, [requestNonce, focusPath]);

  // ---- 편집 ----

  const run = (make: () => Command): boolean => {
    if (locked) {
      setNotice(locked);
      return false;
    }
    try {
      apply(make());
      setNotice(null);
      return true;
    } catch (e) {
      if (e instanceof EditRefused) {
        setNotice(e.message);
        onRefused?.(e.message);
        return false;
      }
      throw e;
    }
  };

  const listLength = (list: ListPath): number => getList(commands, list, schema)?.length ?? 0;

  const selectInserted = (list: ListPath, index: number, count: number) => {
    const open = headerKey(list);
    setFolded((f) => (f.has(open) ? new Set([...f].filter((k) => k !== open)) : f));
    setCursorKey(commandKey({ list, index: index + count - 1 }));
    setAnchorKey(count > 1 ? commandKey({ list, index }) : null);
  };

  const insert = (added: readonly unknown[], target: { list: ListPath; index: number }): boolean => {
    const ok = run(() => editor.insertCommands(eventIndex, target.list, target.index, added));
    if (ok) selectInserted(target.list, target.index, added.length);
    return ok;
  };

  const remove = () => {
    if (!range) return;
    const length = listLength(range.list);
    if (!run(() => editor.removeCommands(eventIndex, range.list, range.start, range.count))) return;
    const left = length - range.count;
    setCursorKey(range.start < left ? commandKey({ list: range.list, index: range.start }) : endKey(range.list));
    setAnchorKey(null);
    setStatus(`커맨드 ${range.count}개를 뺐다`);
  };

  const move = (delta: -1 | 1) => {
    if (!range) return;
    const length = listLength(range.list);
    if (delta < 0 && range.start === 0) return;
    if (delta > 0 && range.start + range.count >= length) return;
    const from = { list: range.list, index: range.start };
    const to = { list: range.list, index: delta < 0 ? range.start - 1 : range.start + range.count + 1 };
    if (!run(() => editor.moveCommands(eventIndex, from, range.count, to))) return;
    if (cursor?.kind === "command") setCursorKey(commandKey({ list: range.list, index: cursor.path.index + delta }));
    if (anchor?.kind === "command" && sameList(anchor.path.list, range.list)) setAnchorKey(commandKey({ list: range.list, index: anchor.path.index + delta }));
  };

  const copy = () => {
    if (!range) return;
    const copied = copyCommands(commands, range.list, range.start, range.count, schema);
    clipboard.write(copied);
    setStatus(`커맨드 ${copied.length}개를 복사했다`);
  };

  const paste = () => {
    const pasted = clipboard.read();
    if (!pasted) {
      setNotice("붙일 커맨드가 없다 (클립보드가 커맨드 JSON 이 아니다)");
      return;
    }
    if (insert(pasted, insertTarget(cursor, range, "below"))) setStatus(`커맨드 ${pasted.length}개를 붙였다`);
  };

  const openPalette = (where: InsertWhere) => {
    if (locked) {
      setNotice(locked);
      return;
    }
    setPalette({ where, target: insertTarget(cursor, range, where) });
  };

  const toggleFold = (key: string) => setFolded((f) => (f.has(key) ? new Set([...f].filter((k) => k !== key)) : new Set([...f, key])));

  const step = (delta: number) => {
    const next = rows[Math.max(0, Math.min(rows.length - 1, cursorIndex + delta))];
    if (next) setCursorKey(next.key);
    setAnchorKey(null);
  };

  const extend = (delta: -1 | 1) => {
    if (cursor?.kind !== "command") return step(delta);
    const index = cursor.path.index + delta;
    if (index < 0 || index >= listLength(cursor.path.list)) return;
    if (anchorKey === null || anchor?.kind !== "command") setAnchorKey(cursor.key);
    setCursorKey(commandKey({ list: cursor.path.list, index }));
  };

  /** 바깥으로: 하위 목록의 줄은 그 머리줄로, 머리줄은 그 목록을 품은 커맨드로 */
  const outward = () => {
    if (!cursor) return;
    const list = cursor.kind === "command" ? cursor.path.list : cursor.list;
    if (cursor.kind === "header") {
      const owner = { list: list.slice(0, -1), index: list[list.length - 1].at };
      setCursorKey(commandKey(owner));
    } else if (list.length > 0) {
      setCursorKey(headerKey(list));
    }
    setAnchorKey(null);
  };

  const onTreeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.nativeEvent.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let handled = true;
    if ((key === "ArrowUp" || key === "ArrowDown") && !e.altKey) {
      const delta = key === "ArrowUp" ? -1 : 1;
      if (mod) move(delta);
      else if (e.shiftKey) extend(delta);
      else step(delta);
    } else if (key === "Home") step(-rows.length);
    else if (key === "End") step(rows.length);
    else if (key === "ArrowLeft") {
      if (cursor?.kind === "header" && !cursor.folded && !cursor.broken) toggleFold(cursor.key);
      else outward();
    } else if (key === "ArrowRight") {
      if (cursor?.kind === "header" && cursor.folded) toggleFold(cursor.key);
      else if (cursor?.kind !== "end") step(1);
    } else if (key === "Enter") {
      if (cursor?.kind === "command") setFormFocus((n) => n + 1);
      else if (cursor?.kind === "header") {
        if (!cursor.broken) toggleFold(cursor.key);
      } else openPalette("above");
    } else if (key === "Delete" || key === "Backspace") remove();
    else if (key === "Insert") openPalette("above");
    else if (key === "Escape" && anchorKey !== null) setAnchorKey(null);
    else if (mod && !e.altKey && key === "c") copy();
    else if (mod && !e.altKey && key === "v") paste();
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const onRowClick = (row: TreeRow, e: MouseEvent) => {
    if (e.shiftKey && row.kind === "command" && cursor?.kind === "command" && sameList(row.path.list, cursor.path.list)) {
      if (anchorKey === null || anchor?.kind !== "command") setAnchorKey(cursor.key);
    } else {
      setAnchorKey(null);
    }
    setCursorKey(row.key);
    focusTree();
  };

  const onRowDoubleClick = (row: TreeRow) => {
    if (row.kind === "header" && !row.broken) toggleFold(row.key);
    else if (row.kind === "end") {
      setCursorKey(row.key);
      setPalette(locked ? null : { where: "above", target: { list: row.list, index: row.index } });
      if (locked) setNotice(locked);
    } else if (row.kind === "command") setFormFocus((n) => n + 1);
  };

  const onFormKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      focusTree();
    }
  };

  const toolbar = (label: string, testId: string, enabled: boolean, action: () => void) => (
    <button
      type="button"
      className="btn rpg-mini"
      disabled={!enabled}
      data-testid={testId}
      onClick={() => {
        action();
        if (!palette) focusTree();
      }}
    >
      {label}
    </button>
  );

  // ---- 그리기 ----

  const editable = locked === null && commandsOk && isPlainObject(ev);
  const canMoveUp = !!range && range.start > 0;
  const canMoveDown = !!range && range.start + range.count < listLength(range.list);
  const errorCount = mine.filter((p) => p.severity === "error").length;
  const warningCount = mine.filter((p) => p.severity === "warning").length;
  const infoCount = mine.length - errorCount - warningCount;
  const formCmd = range && range.count === 1 && cursor?.kind === "command" && isPlainObject(cursor.cmd) && cursor.spec ? (cursor.cmd as JsonObject) : null;

  if (!isPlainObject(ev)) {
    return (
      <div className="rpg-cmd-editor" data-testid="rpg-cmd-editor">
        <div className="rpg-arg-note is-warning">이벤트가 없거나 객체가 아니다 (events[{eventIndex + 1}])</div>
      </div>
    );
  }

  return (
    <div className="rpg-cmd-editor" data-testid="rpg-cmd-editor">
      <div className="rpg-cmd-toolbar" role="toolbar" aria-label="커맨드 편집">
        {toolbar("위에 넣기", "rpg-cmd-insert-above", editable && !!cursor, () => openPalette("above"))}
        {toolbar("아래에 넣기", "rpg-cmd-insert-below", editable && !!cursor, () => openPalette("below"))}
        {toolbar("빼기", "rpg-cmd-remove", editable && !!range, remove)}
        {toolbar("위로", "rpg-cmd-up", editable && canMoveUp, () => move(-1))}
        {toolbar("아래로", "rpg-cmd-down", editable && canMoveDown, () => move(1))}
        {toolbar("복사", "rpg-cmd-copy", !!range, copy)}
        {toolbar("붙여넣기", "rpg-cmd-paste", editable, paste)}
        <span className="rpg-cmd-toolbar-gap" />
        <button
          type="button"
          className={"btn rpg-mini rpg-problem-count" + (errorCount ? " is-error" : warningCount ? " is-warning" : "")}
          disabled={mine.length === 0}
          aria-expanded={showProblems}
          data-testid="rpg-cmd-problems"
          onClick={() => setShowProblems((v) => !v)}
        >
          {mine.length === 0 ? "문제 없음" : `문제 ${mine.length}`}
          {mine.length > 0 && <span className="muted"> (오류 {errorCount}, 경고 {warningCount}, 정보 {infoCount})</span>}
        </button>
      </div>
      {locked && (
        <div className="rpg-arg-note is-warning" data-testid="rpg-cmd-locked">
          읽기 전용: {locked}
        </div>
      )}
      {showProblems && mine.length > 0 && (
        <ul className="rpg-problem-list" data-testid="rpg-cmd-problem-list">
          {mine.map((p, i) => {
            const path = problemPath(p, schema);
            return (
              <li key={i}>
                <button type="button" className={`rpg-problem is-${p.severity}`} data-testid="rpg-cmd-problem" disabled={!path} onClick={() => path && focusPath(path)}>
                  <span className="rpg-path">{p.location}</span>
                  <span>{p.message}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {palette && (
        <CommandPalette
          schema={schema}
          where={palette.where}
          place={commandLocation(eventIndex, palette.target)}
          ctx={argCtx}
          onInsert={(cmd) => {
            const ok = insert([cmd], palette.target);
            if (ok && Object.keys(cmd).length > 1) setFormFocus((n) => n + 1);
            return ok;
          }}
          onClose={() => {
            setPalette(null);
            focusTree();
          }}
        />
      )}
      {!commandsOk ? (
        <div className="rpg-arg-note is-warning" data-testid="rpg-cmd-broken">
          events[{eventIndex + 1}].commands 가 배열이 아니라 고칠 수 없다 ({JSON.stringify(commands)})
        </div>
      ) : (
        <div
          ref={treeRef}
          className="rpg-cmd-tree"
          role="tree"
          tabIndex={0}
          aria-label="커맨드 목록"
          aria-multiselectable
          aria-activedescendant={cursor ? `${baseId}-r${cursorIndex}` : undefined}
          data-testid="rpg-cmd-tree"
          onKeyDown={onTreeKey}
        >
          {rows.map((row, i) => {
            const problems = byRow.get(row.key) ?? [];
            const worst = worstSeverity(problems);
            const isCursor = i === cursorIndex;
            const selected = row.kind === "command" ? selectedKeys.has(row.key) : isCursor;
            const rowEl = (
              <div
                key={row.key}
                id={`${baseId}-r${i}`}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-selected={selected}
                aria-expanded={row.kind === "header" && !row.broken ? !row.folded : undefined}
                className={`rpg-row is-${row.kind}` + (selected ? " is-selected" : "") + (isCursor ? " is-cursor" : "")}
                style={{ paddingLeft: `calc(${row.depth} * var(--space-3) + var(--space-1))` }}
                data-row-index={i}
                data-row-key={row.key}
                data-testid="rpg-cmd-row"
                onClick={(e) => onRowClick(row, e)}
                onDoubleClick={() => onRowDoubleClick(row)}
              >
                {row.kind === "header" && (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="rpg-fold"
                    aria-label={row.folded ? "펴기" : "접기"}
                    disabled={row.broken}
                    data-testid="rpg-cmd-fold"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCursorKey(row.key);
                      toggleFold(row.key);
                      focusTree();
                    }}
                  >
                    {row.folded ? "▸" : "▾"}
                  </button>
                )}
                {row.kind === "command" && (
                  <>
                    <span className={"rpg-row-label" + (row.spec ? "" : " is-unknown")}>{row.label}</span>
                    <span className="rpg-row-summary">{row.summary}</span>
                  </>
                )}
                {row.kind === "header" && (
                  <>
                    <span className="rpg-row-head">{row.label}</span>
                    {row.broken ? <span className="rpg-arg-note is-warning">배열이 아니라 고칠 수 없다</span> : row.folded && <span className="muted">({row.count})</span>}
                  </>
                )}
                {row.kind === "end" && (
                  <span className="rpg-row-end muted" title="두 번 누르거나 Enter 로 여기에 넣는다">
                    ◇
                  </span>
                )}
                {worst && (
                  <span className={`rpg-marker is-${worst}`} title={problems.map((p) => `${p.location}: ${p.message}`).join("\n")} aria-label={`문제 ${problems.length}개`} data-testid="rpg-cmd-marker">
                    {worst === "error" ? "!" : worst === "warning" ? "?" : "i"}
                  </span>
                )}
              </div>
            );
            if (!isCursor || !formCmd || row.kind !== "command" || !row.spec) return rowEl;
            const location = commandLocation(eventIndex, row.path);
            return [
              rowEl,
              <div key={`${row.key}:form`} ref={formRef} role="group" aria-label={`${row.label} 인자`} className="rpg-cmd-form-wrap" style={{ marginLeft: `calc(${row.depth} * var(--space-3))` }} onKeyDown={onFormKey}>
                <CommandForm
                  editor={editor}
                  eventIndex={eventIndex}
                  path={row.path}
                  cmd={formCmd}
                  spec={row.spec}
                  ctx={argCtx}
                  run={run}
                  problems={mine.filter((p) => p.location === location || p.location.startsWith(`${location}.`))}
                  location={location}
                />
              </div>,
            ];
          })}
        </div>
      )}
      {cursor?.kind === "command" && !cursor.spec && range?.count === 1 && (
        <div className="rpg-arg-note is-warning" data-testid="rpg-cmd-unknown-command">
          {isPlainObject(cursor.cmd) ? "스키마에 없는 커맨드라 고칠 수 없다. 빼거나 옮길 수만 있다" : "커맨드가 객체가 아니다. 뺄 수만 있다"}: <code>{JSON.stringify(cursor.cmd)}</code>
        </div>
      )}
      {notice && (
        <div className="rpg-arg-note is-error" role="alert" data-testid="rpg-cmd-notice">
          {notice}
        </div>
      )}
      {status && !notice && (
        <div className="rpg-arg-note muted" role="status" data-testid="rpg-cmd-status">
          {status}
        </div>
      )}
    </div>
  );
});
