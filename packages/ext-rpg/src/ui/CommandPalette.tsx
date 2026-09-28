// 커맨드 팔레트: 스키마 group 으로 묶고 찾기 입력으로 거른다 (e5 문서 4절).
// 스키마 기본값으로 채운 새 커맨드가 엔진 검사에 걸리면(기본값이 없는 file, 빈 script 이름) 넣기 전에 그 인자를 먼저 묻는다.
// 위아래 화살표로 고르고 Enter 로 넣고 Escape 로 닫는다. 처리한 키는 전파를 막는다.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { newCommand } from "../model/commands";
import { field, type JsonObject } from "../model/json";
import { commandSpec, type CommandSpec, type EventSchema } from "../model/schema";
import { checkCommand } from "../model/validate";
import { ArgRow } from "./argWidgets/ArgField";
import type { ArgContext } from "./argWidgets/context";
import type { InsertWhere } from "./commandRows";

interface CommandPaletteProps {
  schema: EventSchema;
  where: InsertWhere;
  /** 넣을 자리 설명 ("참이면 목록의 처음" 같은 글) */
  place?: string;
  ctx: ArgContext;
  /** 넣었으면 true */
  onInsert: (cmd: JsonObject) => boolean;
  onClose: () => void;
}

/** 스키마 순서를 지키며 group 으로 묶는다 */
export function groupCommands(commands: readonly CommandSpec[]): Array<{ group: string; items: CommandSpec[] }> {
  const out: Array<{ group: string; items: CommandSpec[] }> = [];
  for (const c of commands) {
    const g = out.find((x) => x.group === c.group);
    if (g) g.items.push(c);
    else out.push({ group: c.group, items: [c] });
  }
  return out;
}

export function matchCommand(c: CommandSpec, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return [c.label, c.code, c.group].some((s) => s.toLowerCase().includes(q));
}

/** 새 커맨드에서 엔진 검사에 걸리는 인자 이름 */
export function blockingArgs(schema: EventSchema, cmd: JsonObject): Map<string, string> {
  const out = new Map<string, string>();
  checkCommand(schema, cmd, "", (path, message) => {
    const name = /^\.([A-Za-z_][A-Za-z0-9_]*)/.exec(path)?.[1];
    if (name && !out.has(name)) out.set(name, message);
  });
  return out;
}

export function CommandPalette({ schema, where, place, ctx, onInsert, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  /** 넣기 전에 물을 인자가 있는 새 커맨드. ask 는 처음에 걸린 인자 (채워도 사라지지 않게 고정) */
  const [draft, setDraft] = useState<{ cmd: JsonObject; ask: string[] } | null>(null);
  const draftRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => schema.commands.filter((c) => matchCommand(c, query)), [schema, query]);
  const groups = useMemo(() => groupCommands(filtered), [filtered]);
  const current = Math.min(active, filtered.length - 1);

  const asking = draft !== null;
  useEffect(() => {
    if (asking) draftRef.current?.querySelector<HTMLElement>("input, textarea, select")?.focus();
  }, [asking]);

  const pick = (spec: CommandSpec) => {
    const cmd = newCommand(schema, spec.code);
    const ask = blockingArgs(schema, cmd);
    if (ask.size > 0) {
      setDraft({ cmd, ask: [...ask.keys()] });
      return;
    }
    if (onInsert(cmd)) onClose();
  };

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    let handled = true;
    if (e.key === "Escape") onClose();
    else if (!draft && e.key === "ArrowDown") setActive(Math.min(current + 1, filtered.length - 1));
    else if (!draft && e.key === "ArrowUp") setActive(Math.max(current - 1, 0));
    else if (!draft && e.key === "Enter" && filtered[current]) pick(filtered[current]);
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const draftSpec = draft ? commandSpec(schema, draft.cmd.code) : undefined;
  const blocking = draft ? blockingArgs(schema, draft.cmd) : new Map<string, string>();
  return (
    <div className="rpg-palette" role="dialog" aria-label="커맨드 삽입" data-testid="rpg-cmd-palette" onKeyDown={onKey}>
      <div className="rpg-palette-head">
        <span>{where === "above" ? "위에 삽입" : "아래에 삽입"}</span>
        {place && <span className="rpg-path">{place}</span>}
        <button type="button" className="btn btn-ghost rpg-mini" aria-label="닫기" data-testid="rpg-cmd-palette-close" onClick={onClose}>
          ✕
        </button>
      </div>
      {draft && draftSpec ? (
        <div className="rpg-palette-draft" data-testid="rpg-cmd-palette-draft" ref={draftRef}>
          <div className="rpg-arg-note muted">{draftSpec.label}: 삽입 전 입력할 인자</div>
          {draftSpec.args
            .filter((a) => draft.ask.includes(a.name))
            .map((a) => (
              <ArgRow
                key={a.name}
                spec={a}
                value={field(draft.cmd, a.name)}
                onChange={(v) => {
                  const next: JsonObject = { ...draft.cmd };
                  if (v === undefined) delete next[a.name];
                  else next[a.name] = v;
                  setDraft({ ...draft, cmd: next });
                }}
                ctx={ctx}
                sessionPrefix={`rpg-palette:${a.name}`}
                testId={`rpg-palette-arg-${a.name}`}
                problems={blocking.has(a.name) ? [{ severity: "error", message: blocking.get(a.name)!, location: a.name, source: "engine" }] : []}
              />
            ))}
          <div className="rpg-palette-foot">
            <button type="button" className="btn" data-testid="rpg-cmd-palette-back" onClick={() => setDraft(null)}>
              뒤로
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={blocking.size > 0}
              data-testid="rpg-cmd-palette-insert"
              onClick={() => {
                if (onInsert(draft.cmd)) onClose();
              }}
            >
              삽입
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            className="input rpg-palette-search"
            type="search"
            placeholder="찾기"
            aria-label="커맨드 찾기"
            data-testid="rpg-cmd-palette-search"
            value={query}
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <div className="rpg-palette-list" role="listbox" aria-label="커맨드">
            {groups.map((g) => (
              <div key={g.group} className="rpg-palette-group" role="group" aria-label={g.group || "기타"} data-testid={`rpg-palette-group-${g.group}`}>
                <div className="rpg-palette-group-name">{g.group || "기타"}</div>
                {g.items.map((c) => {
                  const i = filtered.indexOf(c);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      role="option"
                      aria-selected={i === current}
                      className={"rpg-palette-item" + (i === current ? " is-active" : "")}
                      data-testid={`rpg-palette-item-${c.code}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(c)}
                    >
                      <span>{c.label}</span>
                      <span className="rpg-palette-code">{c.code}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && <div className="muted rpg-palette-empty">일치하는 커맨드 없음</div>}
          </div>
        </>
      )}
    </div>
  );
}
