// 이벤트 목록 패널 (e5 문서 2.4, 5.2). 활성 맵의 이벤트를 목록으로 보이고 찾는다. 확장 패널이라 제 도킹 탭이다.
//   머리       맵 이름, 이벤트 수, 오류와 경고 수, 잠금 이유
//   시작 상태  INITIAL2D_RPG_STATE 꼴 한 줄 (arrived,heardWarehouse,item:warehouse_key=1). 맵마다 .initial-editor/rpg-play.json 에 기억한다.
//              제안은 이 프로젝트에서 쓰인 깃발과 변수, 아이템 표의 아이템. Enter 나 초점을 잃으면 저장, Escape 는 되돌리기
//   찾기       id, 트리거, 커맨드 안의 글
//   줄         트리거 표식, id, 칸, 문제 표식. 객체가 아닌 칸은 ! 표식과 엔진 표기(events[n]), 칸 자리에 "객체가 아니다".
//              누르면 고르고 대상을 이벤트 레이어로 (Shift 는 더하기, Ctrl 은 넣고 빼기).
//              두 번 누르면 커맨드 편집기로 초점. 위아래 키, Delete, Enter 는 목록이 받고, 글자 키는 목록이 먹는다
//   우클릭     이 이벤트 앞에서 실행, 이 이벤트 자동 재생 (메뉴 키나 Shift+F10 도). 못 띄우면 항목이 꺼지고 툴팁이 이유다
// 고르기는 레이어 상태에 있어 맵 뷰와 인스펙터가 같은 것을 본다.

import { MapDocument } from "@initial-editor/ext-tilemap/model";
import { observer } from "mobx-react-lite";
import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent, type MouseEvent } from "react";
import { field, isPlainObject } from "../model/json";
import { EVENTS_LAYER_ID, eventsStateOf, type EventsLayerState } from "../model/layer";
import { itemIds } from "../model/game";
import { parseStartState } from "../model/play";
import { EVENT_PLAY_LABELS, type EventPlayMode } from "../model/rpgPlay";
import { startStateSuggestions } from "../model/refs";
import type { EventProblem } from "../model/validate";
import { eventCell, triggerBadge } from "./markers";
import type { RpgPlayActions, RpgUiServices } from "./services";
import "./CommandListEditor.css";
import "./EventsLayer.css";

export interface EventsPanelProps {
  services: RpgUiServices;
  /** 이 맵에 레이어가 없을 때의 한 줄 (레이어의 hint) */
  hint?: (doc: MapDocument) => string | undefined;
}

/** 확장 패널로 등록할 컴포넌트 (props 없이 그린다) */
export function makeEventsPanel(props: EventsPanelProps): ComponentType {
  const Bound = observer(function BoundEventsPanel() {
    return <EventsPanel {...props} />;
  });
  return Bound;
}

export const EventsPanel = observer(function EventsPanel({ services, hint }: EventsPanelProps) {
  const active = services.documents.active;
  const doc = active instanceof MapDocument ? active : null;
  if (!doc) {
    return (
      <div className="rpg-events-panel" data-testid="rpg-events-panel">
        <div className="panel-hint">맵을 열면 이 맵의 이벤트가 보인다</div>
      </div>
    );
  }
  const state = eventsStateOf(doc);
  if (!state) {
    return (
      <div className="rpg-events-panel" data-testid="rpg-events-panel">
        <div className="panel-hint" data-testid="rpg-events-hint">
          {hint?.(doc) ?? "이 맵에는 이벤트 레이어가 없다"}
        </div>
      </div>
    );
  }
  return <EventsList key={doc.path ?? doc.title} doc={doc} state={state} services={services} />;
});

/** 찾기 글 (id, 트리거, 커맨드 JSON) */
function searchText(ev: unknown): string {
  const id = field(ev, "id");
  const trigger = field(ev, "trigger") ?? "action";
  return `${typeof id === "string" ? id : ""} ${String(trigger)} ${JSON.stringify(field(ev, "commands") ?? "")}`.toLowerCase();
}

/** 객체가 아닌 칸의 표식 (엔진이 건너뛰는 이벤트) */
const BROKEN_BADGE = { letter: "!", token: "danger", label: "객체가 아니라 엔진이 건너뛴다" } as const;

/** 줄에 보일 짧은 JSON (40자에서 자른다) */
function shortJson(v: unknown): string {
  const text = JSON.stringify(v) ?? String(v);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function worst(problems: readonly EventProblem[]): "error" | "warning" | null {
  if (problems.some((p) => p.severity === "error")) return "error";
  if (problems.some((p) => p.severity === "warning")) return "warning";
  return null;
}

const EventsList = observer(function EventsList({ doc, state, services }: { doc: MapDocument; state: EventsLayerState; services: RpgUiServices }) {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState<RowMenuAt | null>(null);
  const anchor = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const list = state.section.list;
  const q = query.trim().toLowerCase();
  const rows = list.map((ev, index) => ({ ev, index })).filter(({ ev }) => q === "" || searchText(ev).includes(q));
  const selected = new Set(state.selected);
  const problems = state.eventProblems;
  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.filter((p) => p.severity === "warning").length;

  const target = () => {
    const t = doc.target;
    if (t.kind !== "ext" || t.id !== EVENTS_LAYER_ID) doc.setTarget({ kind: "ext", id: EVENTS_LAYER_ID });
  };
  const focusRow = (index: number) => listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.focus();
  const pick = (e: MouseEvent | KeyboardEvent, index: number) => {
    if (e.metaKey || e.ctrlKey) state.toggle(index);
    else if (e.shiftKey) state.select([index], true);
    else state.select([index]);
    anchor.current = index;
    target();
  };
  /** 줄의 실행 메뉴를 패널 안 자리(client 좌표)에 연다. 그 줄을 고르고 대상을 이벤트 레이어로 */
  const openMenu = (index: number, clientX: number, clientY: number) => {
    if (!services.play) return;
    if (!selected.has(index) || selected.size > 1) state.select([index]);
    anchor.current = index;
    target();
    const box = rootRef.current?.getBoundingClientRect();
    setMenu({ index, x: clientX - (box?.left ?? 0), y: clientY - (box?.top ?? 0) });
  };
  const onKey = (e: KeyboardEvent) => {
    const order = rows.map((r) => r.index);
    if ((e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) && state.primary !== null) {
      e.preventDefault();
      e.stopPropagation();
      const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${state.primary}"]`)?.getBoundingClientRect();
      openMenu(state.primary, row?.left ?? 0, row?.bottom ?? 0);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (order.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const at = anchor.current !== null ? order.indexOf(anchor.current) : -1;
      const next = order[e.key === "ArrowDown" ? Math.min(order.length - 1, at + 1) : Math.max(0, at < 0 ? 0 : at - 1)];
      if (e.shiftKey) state.select([next], true);
      else state.select([next]);
      anchor.current = next;
      target();
      focusRow(next);
    } else if ((e.key === "Delete" || e.key === "Backspace") && state.selected.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      const r = state.run((ed) => ed.removeEvents(state.selected));
      if (r.ok) state.clearSelection();
      setNotice(r.ok ? null : r.reason);
    } else if (e.key === "Enter" && state.primary !== null) {
      e.preventDefault();
      e.stopPropagation();
      target();
      state.requestFocus("commands");
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // 글자 키는 목록이 먹는다: 맵 도구의 한 글자 단축키가 대상을 바꾸지 않게
      e.stopPropagation();
    }
  };

  return (
    <div className="rpg-events-panel" data-testid="rpg-events-panel" data-map={doc.title} ref={rootRef}>
      <div className="rpg-events-head">
        <span className="rpg-events-title" title={doc.path ?? undefined}>
          {doc.title}
        </span>
        <span className="muted" data-testid="rpg-events-count">
          {list.length}개
        </span>
        <span className="rpg-toolbar-gap" />
        {errors > 0 && (
          <span className="rpg-problem-count is-error" data-testid="rpg-events-errors">
            오류 {errors}
          </span>
        )}
        {warnings > 0 && (
          <span className="rpg-problem-count is-warning" data-testid="rpg-events-warnings">
            경고 {warnings}
          </span>
        )}
      </div>
      {state.locked && (
        <div className="rpg-arg-note is-warning rpg-lock" data-testid="rpg-events-locked" role="note">
          읽기 전용: {state.locked}
        </div>
      )}
      <StartStateField doc={doc} state={state} services={services} />
      <input
        type="search"
        className="input field-text rpg-events-search"
        placeholder="찾기 (id, 트리거, 대사)"
        aria-label="이벤트 찾기"
        value={query}
        data-testid="rpg-events-search"
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="rpg-events-list" role="listbox" aria-multiselectable="true" aria-label="이벤트" data-testid="rpg-events-list" ref={listRef} onKeyDown={onKey}>
        {rows.length === 0 && <div className="panel-hint">{list.length === 0 ? "이벤트가 없다. 맵 빈 칸을 두 번 누르면 놓는다" : "찾는 이벤트가 없다"}</div>}
        {rows.map(({ ev, index }) => {
          const broken = !isPlainObject(ev);
          const badge = broken ? BROKEN_BADGE : triggerBadge(field(ev, "trigger"));
          const id = field(ev, "id");
          const sev = worst(state.problemsOf(index));
          const cell = eventCell(ev);
          const where = broken ? `객체가 아니다 (${shortJson(ev)})` : cell ? `${cell.x},${cell.y}` : "칸이 틀렸다";
          return (
            <div
              key={index}
              role="option"
              tabIndex={0}
              aria-selected={selected.has(index)}
              className={"rpg-events-row" + (selected.has(index) ? " is-selected" : "") + (broken ? " is-broken" : "")}
              data-testid="rpg-events-row"
              data-index={index}
              data-broken={broken ? "true" : undefined}
              data-id={typeof id === "string" ? id : ""}
              onClick={(e) => pick(e, index)}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(index, e.clientX, e.clientY);
              }}
              onDoubleClick={() => {
                state.select([index]);
                anchor.current = index;
                target();
                state.requestFocus("commands");
              }}
            >
              <span className={`rpg-badge is-${badge.token}`} title={badge.label}>
                {badge.letter}
              </span>
              <span className="rpg-events-id">{typeof id === "string" && id !== "" ? id : `events[${index + 1}]`}</span>
              <span className="muted rpg-events-cell" data-testid="rpg-events-cell">
                {where}
              </span>
              {sev && <span className={`rpg-marker is-${sev}`} data-testid="rpg-events-marker" aria-label={sev === "error" ? "오류" : "경고"} />}
            </div>
          );
        })}
      </div>
      {notice && (
        <div className="rpg-arg-note is-error" role="alert" data-testid="rpg-events-notice">
          {notice}
        </div>
      )}
      {menu && services.play && (
        <RowMenu
          at={menu}
          doc={doc}
          play={services.play}
          onClose={() => {
            setMenu(null);
            listRef.current?.querySelector<HTMLElement>(`[data-index="${menu.index}"]`)?.focus();
          }}
        />
      )}
    </div>
  );
});

interface RowMenuAt {
  index: number;
  /** 패널 안의 자리 (px) */
  x: number;
  y: number;
}

const ROW_MENU: readonly EventPlayMode[] = ["play", "probe"];

/**
 * 줄의 실행 메뉴. 패널 안에 절대 자리로 그린다 (도킹 영역은 contain 이라 fixed 가 창 기준이 아니다).
 * 바깥을 누르거나 Escape 면 닫힌다
 */
const RowMenu = observer(function RowMenu({ at, doc, play, onClose }: { at: RowMenuAt; doc: MapDocument; play: RpgPlayActions; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, []);
  useEffect(() => {
    const onDown = (e: globalThis.MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  return (
    <div className="rpg-row-menu" role="menu" ref={ref} style={{ left: at.x, top: at.y }} data-testid="rpg-events-menu" onContextMenu={(e) => e.preventDefault()}>
      {ROW_MENU.map((mode) => {
        const blocked = play.blocked(doc, at.index, mode);
        return (
          <button
            key={mode}
            type="button"
            role="menuitem"
            className="rpg-row-menu-item"
            disabled={blocked !== undefined}
            title={blocked}
            data-testid={`rpg-events-menu-${mode}`}
            onClick={() => {
              onClose();
              void play.run(doc, at.index, mode);
            }}
          >
            {EVENT_PLAY_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
});

const StartStateField = observer(function StartStateField({ doc, state, services }: { doc: MapDocument; state: EventsLayerState; services: RpgUiServices }) {
  const store = services.store;
  const path = doc.path ?? "";
  const saved = store.startState(path);
  const [text, setText] = useState(saved);
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  const listId = useId();

  useEffect(() => {
    if (!editing) setText(saved);
  }, [saved, editing]);

  const schema = state.schema;
  const parsed = parseStartState(text, { items: store.items ? itemIds(store.items) : null, reserved: schema?.stateReserved });
  const suggestions = schema ? startStateSuggestions({ schema, game: store.game, items: store.items, events: state.section.list, projectEvents: store.projectEvents(path, state.section.list) }) : [];
  // 제안은 마지막 항목을 채운다 (앞의 항목은 그대로 둔다)
  const head = text.includes(",") ? text.slice(0, text.lastIndexOf(",") + 1) : "";
  const commit = () => {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    void store.setStartState(path, text);
  };

  return (
    <div className="rpg-start-state" data-testid="rpg-start-state">
      <label className="rpg-start-state-label" htmlFor={`${listId}-input`}>
        시작 상태
      </label>
      <input
        id={`${listId}-input`}
        type="text"
        className="input field-text"
        list={listId}
        value={text}
        placeholder="비우면 새 게임 그대로 (예: arrived,item:shell=1)"
        data-testid="rpg-start-state-input"
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            cancelled.current = true;
            setText(saved);
            e.currentTarget.blur();
          }
        }}
      />
      <datalist id={listId} data-testid="rpg-start-state-suggest">
        {suggestions.map((s) => (
          <option key={s.value} value={head + s.value}>
            {s.detail}
          </option>
        ))}
      </datalist>
      {parsed.errors.map((err, i) => (
        <div key={i} className="rpg-arg-problem is-warning" data-testid="rpg-start-state-error">
          {err.entry}: {err.message}
        </div>
      ))}
    </div>
  );
});
