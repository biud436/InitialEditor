// 참조 칸의 제안 목록 (엔진 M2 2.3 의 ref, E5 4절).
//
//   map        rpg-game.json 의 맵 이름
//   item       아이템 표의 id (이름과 함께)
//   character  이 맵의 이벤트 id 와 player
//   flag, var  이 프로젝트의 맵 파일들에서 이미 쓰인 이름 (이름표는 나중 후보)
// 시작 상태 칸(INITIAL2D_RPG_STATE)의 제안도 여기서 만든다: 깃발, 변수, item:<id>.

import { asList, field, isJsonText, isPlainObject } from "./json";
import { commandSpec, judgedCondition, type EventSchema, type RefKind } from "./schema";
import { walkCommands } from "./tree";
import type { GameConfig, ItemTable } from "./game";

export interface Suggestion {
  value: string;
  /** 보일 설명 (아이템 이름 등) */
  detail?: string;
}

export interface RefSources {
  schema: EventSchema;
  game?: GameConfig | null;
  items?: ItemTable | null;
  /** 이 맵의 events */
  events?: readonly unknown[];
  /** 이 프로젝트의 맵 파일마다의 events (이 맵 포함) */
  projectEvents?: ReadonlyArray<readonly unknown[]>;
}

export interface StateNames {
  flags: string[];
  vars: string[];
}

/** 이벤트 목록들에서 쓰인 깃발과 변수 이름 (setFlag.key, setVar.key, 조건의 flag 와 var). 처음 나온 순서, 글인 키만 */
export function usedStateNames(schema: EventSchema, eventLists: ReadonlyArray<readonly unknown[]>): StateNames {
  const flags = new Set<string>();
  const vars = new Set<string>();
  const note = (kind: RefKind | undefined, value: unknown) => {
    if (!isJsonText(value) || value === "") return;
    if (kind === "flag") flags.add(value);
    else if (kind === "var") vars.add(value);
  };
  for (const events of eventLists) {
    for (const ev of events) {
      const commands = field(ev, "commands");
      if (commands === undefined || !asList(commands)) continue;
      walkCommands(commands, schema, (cmd) => {
        const spec = commandSpec(schema, cmd.code);
        for (const a of spec?.args ?? []) {
          const v = field(cmd, a.name);
          if (a.type === "ref") note(a.ref, v);
          else if (a.type === "condition" && isPlainObject(v)) {
            const kind = judgedCondition(schema, v);
            for (const ca of kind?.args ?? []) if (ca.type === "ref") note(ca.ref, field(v, ca.name));
          }
        }
      });
    }
  }
  return { flags: [...flags], vars: [...vars] };
}

/** ref 칸 하나의 제안 */
export function refSuggestions(kind: RefKind, src: RefSources): Suggestion[] {
  switch (kind) {
    case "map":
      return (src.game?.maps ?? []).map((m) => ({ value: m.name, detail: m.file }));
    case "item":
      return [...(src.items?.items ?? [])].sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000)).map((i) => (i.name ? { value: i.id, detail: i.name } : { value: i.id }));
    case "character": {
      const out: Suggestion[] = [];
      const seen = new Set<string>();
      for (const ev of src.events ?? []) {
        const id = field(ev, "id");
        if (isJsonText(id) && id !== "" && !seen.has(id)) {
          seen.add(id);
          out.push(field(ev, "charset") === undefined ? { value: id, detail: "외형 없음" } : { value: id });
        }
      }
      for (const r of src.schema.reserved) if (!seen.has(r)) out.push({ value: r, detail: "플레이어" });
      return out;
    }
    case "flag":
    case "var": {
      const names = usedStateNames(src.schema, src.projectEvents ?? (src.events ? [src.events] : []));
      return (kind === "flag" ? names.flags : names.vars).map((value) => ({ value }));
    }
  }
}

/** 시작 상태 칸의 제안: 깃발 이름, 변수 이름=, item:<id>=1 */
export function startStateSuggestions(src: RefSources): Suggestion[] {
  const names = usedStateNames(src.schema, src.projectEvents ?? (src.events ? [src.events] : []));
  return [
    ...names.flags.map((f) => ({ value: f, detail: "플래그" })),
    ...names.vars.map((v) => ({ value: `${v}=`, detail: "변수" })),
    ...(src.items?.items ?? []).map((i) => ({ value: `item:${i.id}=1`, detail: i.name ?? "아이템" })),
  ];
}
