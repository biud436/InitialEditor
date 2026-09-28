// 이벤트 인스펙터 (e5 문서 3절). 대상이 이벤트 레이어일 때 앱의 인스펙터 자리에 그린다 (props: document, state).
//   고른 것 없음   이 맵의 이벤트 수, 잠금 이유, 문제 목록 (누르면 그 이벤트를 고른다)
//   여럿           고른 수와 id, 함께 지우기
//   하나           이 이벤트 앞에서 실행과 자동 재생 단추, 스키마 event.fields 로 만든 칸 (인자 위젯), 칸마다의 문제,
//                  아래 절반은 커맨드 목록 편집기 (맵 이동의 대상 고르기와 대상 보기는 services.location 으로 잇는다)
// 모든 편집은 레이어 상태의 run 으로 모델 명령을 doc.apply 에 넣는다 (한 동작이 되돌리기 한 단계, 타이핑은 초점 한 번이 한 단계).
// id 를 바꾸면 이 맵의 moveRoute.target, turn.target 도 함께 바뀐다 (모델의 이름 바꾸기).

import type { MapLayerInspectorProps } from "@initial-editor/ext-tilemap";
import type { MapDocument } from "@initial-editor/ext-tilemap/model";
import { observer } from "mobx-react-lite";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { field, isJsonText, isPlainObject, jsonValueText, stringifyJsonLossless } from "../model/json";
import { EventsLayerState } from "../model/layer";
import type { RefSources } from "../model/refs";
import { EVENT_PLAY_LABELS, type EventPlayMode } from "../model/rpgPlay";
import type { ArgSpec } from "../model/schema";
import { commandLocation } from "../model/tree";
import type { EventProblem } from "../model/validate";
import { ArgRow } from "./argWidgets/ArgField";
import type { ArgContext } from "./argWidgets/context";
import { CommandListEditor } from "./CommandListEditor";
import type { CommandLocationActions } from "./LocationTools";
import { triggerBadge } from "./markers";
import type { RpgPlayActions, RpgUiServices } from "./services";
import "./EventsLayer.css";

interface Props extends MapLayerInspectorProps {
  services: RpgUiServices;
}

/** 앱의 인스펙터 자리에 넣을 컴포넌트 (services 를 묶는다) */
export function makeEventInspector(services: RpgUiServices): ComponentType<MapLayerInspectorProps> {
  const Bound = observer(function BoundEventInspector(props: MapLayerInspectorProps) {
    return <EventInspector {...props} services={services} />;
  });
  return Bound;
}

function defaultConfirm(message: string): boolean {
  return typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(message) : true;
}

/** 인스펙터가 따른 초점 요청 (상태마다 마지막 nonce). 다시 그려도 같은 요청을 두 번 따르지 않는다 */
const handledFocus = new WeakMap<EventsLayerState, number>();

export const EventInspector = observer(function EventInspector({ document, state, services }: Props) {
  if (!(state instanceof EventsLayerState)) return null;
  const selected = state.selected;
  if (!state.schema) {
    return (
      <div className="rpg-inspector" data-testid="rpg-inspector">
        <LockBanner reason={state.locked} />
        <div className="panel-hint">스키마를 쓸 수 없어 이벤트를 보기만 한다 ({state.section.list.length}개)</div>
      </div>
    );
  }
  if (selected.length === 0) return <EventsSummary doc={document} state={state} />;
  if (selected.length > 1) return <ManySelected state={state} indices={selected} services={services} />;
  // 같은 이벤트면 번호가 바뀌어도(앞의 이벤트를 지우거나 되돌렸다) 같은 인스펙터다
  return <SingleEvent key={state.section.keyAt(selected[0]) ?? selected[0]} doc={document} state={state} index={selected[0]} services={services} />;
});

function LockBanner({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <div className="rpg-arg-note is-warning rpg-lock" data-testid="rpg-inspector-locked" role="note">
      읽기 전용: {reason}
    </div>
  );
}

function eventLabel(ev: unknown, index: number): string {
  const id = field(ev, "id");
  return isJsonText(id) && id !== "" ? id : `events[${index + 1}]`;
}

const EventsSummary = observer(function EventsSummary({ doc, state }: { doc: MapDocument; state: EventsLayerState }) {
  const problems = state.eventProblems.filter((p) => p.severity !== "info");
  return (
    <div className="rpg-inspector" data-testid="rpg-inspector" data-mode="summary">
      <div className="rpg-inspector-head">
        <strong>{doc.title}</strong>
        <span className="muted" data-testid="rpg-inspector-count">
          이벤트 {state.section.list.length}개
        </span>
      </div>
      <LockBanner reason={state.locked} />
      <div className="panel-hint">맵의 이벤트를 누르면 칸과 커맨드가 보인다. 빈 칸을 두 번 누르면 새 이벤트를 놓는다</div>
      <ProblemList problems={problems} onPick={(p) => p.eventIndex !== undefined && state.select([p.eventIndex])} testId="rpg-inspector-problems" />
    </div>
  );
});

function ProblemList({ problems, onPick, testId }: { problems: readonly EventProblem[]; onPick?: (p: EventProblem) => void; testId: string }) {
  if (problems.length === 0) return null;
  return (
    <ul className="rpg-problem-list" data-testid={testId}>
      {problems.map((p, i) => (
        <li key={i}>
          <button type="button" className={`rpg-problem is-${p.severity}`} data-testid={`${testId}-item`} disabled={!onPick} onClick={() => onPick?.(p)}>
            <span className="rpg-path">{p.location}</span>
            <span>{p.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const ManySelected = observer(function ManySelected({ state, indices, services }: { state: EventsLayerState; indices: number[]; services: RpgUiServices }) {
  const [notice, setNotice] = useState<string | null>(null);
  const remove = () => {
    const r = state.run((ed) => ed.removeEvents(indices));
    if (r.ok) state.clearSelection();
    else {
      setNotice(r.reason);
      services.notify?.(r.reason);
    }
  };
  return (
    <div className="rpg-inspector" data-testid="rpg-inspector" data-mode="many">
      <div className="rpg-inspector-head">
        <strong>이벤트 {indices.length}개</strong>
      </div>
      <LockBanner reason={state.locked} />
      <div className="rpg-inspector-ids muted">{indices.map((i) => eventLabel(state.section.list[i], i)).join(", ")}</div>
      <div className="rpg-inspector-actions">
        <button type="button" className="btn" disabled={state.locked !== null} data-testid="rpg-inspector-remove" onClick={remove}>
          {indices.length}개 지우기
        </button>
      </div>
      {notice && (
        <div className="rpg-arg-note is-error" role="alert" data-testid="rpg-inspector-notice">
          {notice}
        </div>
      )}
    </div>
  );
});

const PLAY_BUTTONS: ReadonlyArray<{ mode: EventPlayMode; text: string }> = [
  { mode: "play", text: "앞에서 실행" },
  { mode: "probe", text: "자동 재생" },
];

/** 이 이벤트 앞에서 실행과 자동 재생. 못 띄우면 끄고 이유를 툴팁과 한 줄로 */
const PlayButtons = observer(function PlayButtons({ doc, index, play }: { doc: MapDocument; index: number; play: RpgPlayActions }) {
  const blocked = PLAY_BUTTONS.map((b) => play.blocked(doc, index, b.mode));
  // 둘 다 같은 이유면 한 줄, 자동 재생만 막히면(parallel) 그 이유
  const reasons = [...new Set(blocked.filter((r): r is string => r !== undefined))];
  return (
    <div className="rpg-inspector-run" data-testid="rpg-inspector-run">
      {PLAY_BUTTONS.map((b, i) => (
        <button
          key={b.mode}
          type="button"
          className="btn rpg-mini"
          disabled={blocked[i] !== undefined}
          title={blocked[i] ?? EVENT_PLAY_LABELS[b.mode]}
          data-testid={`rpg-inspector-${b.mode}`}
          onClick={() => void play.run(doc, index, b.mode)}
        >
          {b.text}
        </button>
      ))}
      {reasons.map((r) => (
        <span key={r} className="muted rpg-inspector-run-note" data-testid="rpg-inspector-run-note">
          {r}
        </span>
      ))}
    </div>
  );
});

/** 머리에 보일 좌표 하나 (큰 정수는 숫자 그대로, 없으면 ?) */
function cellText(v: unknown): string {
  return v === undefined ? "?" : jsonValueText(v);
}

/** 가장 가까운 세로 스크롤 조상 (overflow-y 가 auto 나 scroll). 없으면 null */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let a = el?.parentElement ?? null; a; a = a.parentElement) {
    const o = getComputedStyle(a).overflowY;
    if (o === "auto" || o === "scroll") return a;
  }
  return null;
}

/** 이 칸 자리의 문제 (events[n].name, 그 아래) */
function fieldProblems(problems: readonly EventProblem[], index: number, name: string): EventProblem[] {
  const at = `events[${index + 1}].${name}`;
  return problems.filter((p) => p.location === at || p.location.startsWith(`${at}.`) || p.location.startsWith(`${at}[`));
}

const SingleEvent = observer(function SingleEvent({ doc, state, index, services }: { doc: MapDocument; state: EventsLayerState; index: number; services: RpgUiServices }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [cmdFocus, setCmdFocus] = useState<{ location: string; nonce: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const schema = state.schema;
  const list = state.section.list;
  const ev = list[index];
  const request = state.focusRequest;
  const commands = field(ev, "commands");
  const hasCommands = Array.isArray(commands) && commands.length > 0;

  // 이벤트를 고르거나 다른 이벤트로 바꾸면(열쇠가 바뀌어 새로 그린다) 인스펙터를 맨 위부터 보인다
  useLayoutEffect(() => {
    const scroller = scrollParent(rootRef.current);
    if (scroller) scroller.scrollTop = 0;
  }, []);

  useEffect(() => {
    if (!request || handledFocus.get(state) === request.nonce) return;
    handledFocus.set(state, request.nonce);
    const root = rootRef.current;
    if (request.target === "id") {
      const input = root?.querySelector<HTMLInputElement>('[data-testid="rpg-field-id"]');
      input?.focus();
      input?.select?.();
    } else if (hasCommands) {
      setCmdFocus({ location: request.location ?? commandLocation(index, { list: [], index: 0 }), nonce: request.nonce });
    } else {
      root?.querySelector<HTMLElement>('[data-testid="rpg-cmd-tree"]')?.focus();
    }
  }, [request, state, index, hasCommands]);

  if (!schema) return null;
  if (!isPlainObject(ev)) {
    return (
      <div className="rpg-inspector" data-testid="rpg-inspector" data-mode="broken">
        <div className="rpg-arg-note is-warning">events[{index + 1}] 는 객체가 아니라 고칠 수 없다 ({stringifyJsonLossless(ev)})</div>
      </div>
    );
  }
  const store = services.store;
  const problems = state.problemsOf(index);
  const fields = schema.fields.filter((f) => f.type !== "list");
  const refs: RefSources = { schema, game: store.game, items: store.items, events: list, projectEvents: store.projectEvents(doc.path, list) };
  const files = store.fileList();
  const argCtx: ArgContext = { schema, refs, files, imageUrl: services.imageUrl, disabled: state.locked !== null, confirm: services.confirm ?? defaultConfirm };
  const known = new Set(fields.map((f) => f.name).concat("commands"));
  const eventLevel = problems.filter((p) => {
    const rest = p.location.slice(`events[${index + 1}]`.length);
    const key = /^\.([A-Za-z_][A-Za-z0-9_]*)/.exec(rest)?.[1];
    return rest === "" || (key !== undefined && !known.has(key));
  });

  const change = (spec: ArgSpec, value: unknown, session?: string) => {
    const r = state.run((ed) => ed.setField(index, spec.name, value, session ? { mergeKey: session } : {}));
    setNotice(r.ok ? null : r.reason);
  };
  const remove = () => {
    const r = state.run((ed) => ed.removeEvents([index]));
    if (r.ok) state.clearSelection();
    else setNotice(r.reason);
  };
  const picker = services.location;
  const location: CommandLocationActions | undefined = picker
    ? {
        applies: (cmd) => picker.applies(state, cmd),
        blockers: (cmd) => picker.blockers(state, cmd),
        pick: (path) => void picker.pick(state, index, path),
        reveal: (path) => void picker.reveal(state, index, path),
      }
    : undefined;
  const badge = triggerBadge(field(ev, "trigger"));
  const x = field(ev, "x");
  const y = field(ev, "y");

  return (
    <div className="rpg-inspector" data-testid="rpg-inspector" data-mode="event" data-index={index} ref={rootRef}>
      <div className="rpg-inspector-head">
        <span className={`rpg-badge is-${badge.token}`} title={badge.label}>
          {badge.letter}
        </span>
        <strong data-testid="rpg-inspector-id">{eventLabel(ev, index)}</strong>
        <span className="muted" data-testid="rpg-inspector-where">
          events[{index + 1}], 타일 {cellText(x)},{cellText(y)}
        </span>
        <span className="rpg-toolbar-gap" />
        <button type="button" className="btn btn-ghost rpg-mini" disabled={state.locked !== null} data-testid="rpg-inspector-remove" onClick={remove}>
          지우기
        </button>
      </div>
      <LockBanner reason={state.locked} />
      {services.play && <PlayButtons doc={doc} index={index} play={services.play} />}
      <ProblemList problems={eventLevel} testId="rpg-inspector-event-problems" />
      <div className="rpg-inspector-fields" data-testid="rpg-inspector-fields">
        {fields.map((f) => (
          <ArgRow
            key={f.name}
            spec={f}
            value={field(ev, f.name)}
            onChange={(v, s) => change(f, v, s)}
            ctx={argCtx}
            sessionPrefix={`rpg-event-${index}-${f.name}`}
            testId={`rpg-field-${f.name}`}
            problems={fieldProblems(problems, index, f.name)}
          />
        ))}
      </div>
      {notice && (
        <div className="rpg-arg-note is-error" role="alert" data-testid="rpg-inspector-notice">
          {notice}
        </div>
      )}
      <div className="rpg-inspector-commands">
        <div className="rpg-inspector-subhead">커맨드</div>
        <CommandListEditor
          editor={state.editor}
          eventIndex={index}
          eventKey={state.section.keyAt(index)}
          schema={schema}
          apply={(c) => doc.apply(c)}
          problems={state.eventProblems}
          refs={refs}
          files={files}
          imageUrl={services.imageUrl}
          locked={state.locked}
          clipboard={services.commandClipboard}
          confirm={services.confirm}
          onRefused={services.notify}
          focusRequest={cmdFocus}
          location={location}
        />
      </div>
    </div>
  );
});
