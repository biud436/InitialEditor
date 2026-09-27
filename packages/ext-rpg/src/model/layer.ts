// 이벤트 레이어의 상태와 붙이기 규칙 (docs/plans/e5-rpg.md 2.2, 3절). 타일맵 확장의 맵 레이어 자리에 붙는다.
// 뷰와 도구와 인스펙터는 src/ui 가 더한다. 엔진 교차 검사는 이 파일만으로 앱과 같은 길(MapDocument 에 붙이기)을 돈다.
//
//   붙는 맵   rpg-game.json 에 file 이나 alt 로 등록된 맵. 스키마 파일이 없는 프로젝트에는 붙지 않고 힌트도 없다
//   잠금      스키마를 읽지 못함(모르는 버전 포함), 스키마가 사라짐, 설정을 읽지 못함, 등록에서 빠짐, alt 가 있는 맵,
//             events 가 배열이 아님. 잠겨도 떼지 않는다 (편집 중인 값은 되돌리기 스택과 함께 남고 저장된다)
//   문제      validateEvents 의 오류와 경고가 레이어의 문제다. 정보는 인스펙터에만 보인다
//   고른 것   이벤트 번호. 목록이 줄어 밖으로 나간 번호는 보지 않는다

import type { Command } from "@initial-editor/core";
import type { MapLayerSpec } from "@initial-editor/ext-tilemap";
import { shiftEvents, type CellOffset, type MapDocument, type MapLayerState, type ObjectProblem } from "@initial-editor/ext-tilemap/model";
import { action, computed, makeObservable, observable } from "mobx";
import { EditRefused, EventEditor, EventListCommand, type EditContext } from "./commands";
import { EVENTS_SECTION, EventsSection } from "./events";
import { itemIds, mapEntryFor, mapReadOnlyReason, type GameConfig, type ItemTable, type MapMatch } from "./game";
import type { Cell } from "./play";
import type { EventSchema } from "./schema";
import { validateEvents, type EventProblem, type MapGeometry } from "./validate";

export const EVENTS_LAYER_ID = "rpg.events";
export const EVENTS_LAYER_LABEL = "이벤트";
/** 오브젝트 위. 다른 확장 레이어와의 순서 */
export const EVENTS_LAYER_ORDER = 10;
export const EVENTS_TOOL_KEY = "N";

/** 레이어가 읽는 프로젝트의 것. 확장의 저장소가 채우고, 교차 검사는 고정 값을 준다. 읽을 때마다 지금 값이다 */
export interface RpgSources {
  /** 마지막으로 읽은 스키마. 없거나 읽지 못했으면 null */
  readonly schema: EventSchema | null;
  /** 스키마 파일이 있는가 (읽기가 끝난 뒤). 없으면 RPG 프로젝트가 아니다 */
  readonly schemaPresent: boolean;
  /** 스키마 파일이 있는데 쓸 수 없는 이유 (모르는 버전 포함). 레이어의 잠금 문구가 된다 */
  readonly schemaProblem: string | null;
  readonly game: GameConfig | null;
  /** rpg-game.json 을 읽지 못한 이유 (없으면 GAME_CONFIG_MISSING) */
  readonly gameProblem: string | null;
  readonly items: ItemTable | null;
  /** 정의 파일에서 어림으로 찾은 이벤트 id. 읽지 못했으면 null */
  defIds?(defPath: string): ReadonlySet<string> | null;
  /** 프로젝트 파일이 있는가 (프로젝트 기준, ./ 없이). 목록을 아직 모르면 null */
  readonly fileExists?: ((projectPath: string) => boolean) | null;
}

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 끄는 중의 미리보기 (뷰가 그린다) */
export type EventDrag =
  | { kind: "move"; indices: readonly number[]; dx: number; dy: number; ok: boolean; keepArea: boolean }
  | { kind: "box"; from: Cell; to: Cell }
  | { kind: "area"; index: number; area: Area; ok: boolean };

export type FocusTarget = "id" | "commands";

export type RunResult = { ok: true; command: EventListCommand } | { ok: false; reason: string };

// 스키마 없이 붙은 상태(처음부터 모르는 버전)가 섹션을 만들 때만 쓴다. 잠겨 있어 편집 명령이 이 값을 보기 전에 거절한다
const NO_SCHEMA: EventSchema = {
  version: 0,
  fields: [],
  reserved: [],
  commands: [],
  conditions: [],
  assets: { charset: new Map(), face: new Map() },
  sheets: { charset: { frameW: 1, frameH: 1, sheetCols: 1, perSheet: 1, patterns: 1, standPattern: 0, dirRows: {} }, face: { size: 1, cols: 1, perSheet: 1 } },
  route: { moves: [], turnPrefix: "turn:", waitPrefix: "wait:" },
  stateReserved: [],
};

/** 맵 하나에 붙은 이벤트 레이어 */
export class EventsLayerState implements MapLayerState {
  readonly section: EventsSection;
  readonly editor: EventEditor;
  /** 마지막으로 받은 스키마. 스키마 파일이 사라지거나 버전이 바뀌어도 들고 있어 편집 중인 값을 쓴다 */
  schema: EventSchema | null = null;
  locked: string | null = null;
  /** 고른 이벤트 번호 (목록 밖의 번호는 selected 가 뺀다) */
  readonly selection = observable.set<number>();
  drag: EventDrag | null = null;
  /** 인스펙터에 초점을 보내 달라는 요청 (nonce 가 바뀔 때마다) */
  focusRequest: { target: FocusTarget; nonce: number } | null = null;
  /** 스키마 없이 붙었을 때 쓸 원본 */
  private raw: unknown;
  private nonce = 0;

  constructor(
    readonly doc: MapDocument,
    readonly sources: RpgSources,
  ) {
    const raw = doc.model.rawSection(EVENTS_SECTION);
    this.raw = raw === null ? undefined : raw;
    this.schema = sources.schema;
    this.section = new EventsSection(raw, this.schema ?? NO_SCHEMA);
    this.editor = new EventEditor(this.section, () => this.editContext());
    makeObservable<EventsLayerState, "applyLock">(this, {
      schema: observable.ref,
      locked: observable,
      drag: observable.ref,
      focusRequest: observable.ref,
      eventProblems: computed,
      layerProblems: computed,
      selected: computed,
      match: computed,
      select: action,
      toggle: action,
      clearSelection: action,
      setDrag: action,
      requestFocus: action,
      refresh: action,
      reset: action,
      applyLock: action,
    });
    this.applyLock();
  }

  /** 이 맵의 등록 항목 (빠졌으면 null) */
  get match(): MapMatch | null {
    return mapEntryFor(this.sources.game, this.doc.path ?? "");
  }

  /** 맵의 크기와 통행 (칠하기와 크기 바꾸기를 따라간다) */
  geometry(): MapGeometry {
    void this.doc.model.revision;
    const m = this.doc.model;
    return { width: m.width, height: m.height, collision: m.collision };
  }

  private editContext(): EditContext {
    return { schema: this.schema ?? NO_SCHEMA, map: this.geometry(), locked: this.locked };
  }

  /** 이 맵의 이벤트 문제 전부 (정보 포함). 스키마가 없으면 빈 목록 */
  get eventProblems(): EventProblem[] {
    const schema = this.schema;
    if (!schema) return [];
    void this.section.revision;
    const match = this.match;
    const items = this.sources.items;
    return validateEvents(this.section.list, {
      schema,
      map: this.geometry(),
      game: this.sources.game,
      items: items ? itemIds(items) : null,
      defIds: match ? (this.sources.defIds?.(match.entry.def) ?? null) : null,
      fileExists: this.sources.fileExists ?? null,
    });
  }

  /** 레이어의 문제: 오류와 경고 (앱의 레이어 패널 오류 수와 저장 전 질문) */
  get layerProblems(): ObjectProblem[] {
    return this.eventProblems.flatMap((p): ObjectProblem[] => (p.severity === "info" ? [] : [{ severity: p.severity, message: p.message, location: p.location }]));
  }

  problems(): ObjectProblem[] {
    return this.layerProblems;
  }

  /** 이 이벤트의 문제 (정보 포함) */
  problemsOf(index: number): EventProblem[] {
    return this.eventProblems.filter((p) => p.eventIndex === index);
  }

  serialize(): unknown {
    return this.schema ? this.section.serialize() : this.raw;
  }

  reset(raw: unknown): void {
    this.raw = raw === null ? undefined : raw;
    this.section.reset(raw);
    this.selection.clear();
    this.drag = null;
    this.applyLock();
  }

  refresh(): void {
    const next = this.sources.schema;
    if (next && next !== this.schema) {
      this.schema = next;
      this.section.setSchema(next);
    }
    this.applyLock();
  }

  private applyLock(): void {
    this.locked = this.lockReason();
  }

  /** 편집을 막는 이유. 없으면 null */
  lockReason(): string | null {
    const s = this.sources;
    if (s.schemaProblem) return s.schemaProblem;
    if (!s.schemaPresent || !this.schema) return "event-commands.json 이 없어 이벤트를 고칠 수 없다 (파일을 되살리면 풀린다)";
    if (s.gameProblem) return `rpg-game.json 을 읽지 못해 이벤트를 고칠 수 없다 (${s.gameProblem})`;
    const match = this.match;
    if (!match) return "rpg-game.json 에서 이 맵이 빠져 이벤트를 고칠 수 없다 (등록을 되살리면 풀린다)";
    const readOnly = mapReadOnlyReason(match);
    if (readOnly) return readOnly;
    return this.section.shapeError;
  }

  /** 맵 크기 바꾸기가 칸을 옮긴다. 원본이 붙기 전에 받는 것과 같은 함수라 되돌리기가 정확하다 */
  shift(offset: CellOffset): Command | null {
    if (!this.section.usable) return null;
    const before = this.section.list;
    const after = shiftEvents(before, offset);
    if (after.every((e, i) => e === before[i])) return null;
    return new EventListCommand("이벤트 옮기기 (맵 크기)", this.section, before, after, []);
  }

  dispose(): void {
    this.drag = null;
  }

  // ---- 고르기 ----

  /** 고른 번호, 오름차순 (목록 밖은 뺀다) */
  get selected(): number[] {
    const n = this.section.list.length;
    return [...this.selection].filter((i) => i >= 0 && i < n).sort((a, b) => a - b);
  }

  /** 하나만 골랐으면 그 번호 */
  get primary(): number | null {
    const s = this.selected;
    return s.length === 1 ? s[0] : null;
  }

  select(indices: Iterable<number>, additive = false): void {
    if (!additive) this.selection.clear();
    for (const i of indices) this.selection.add(i);
  }

  toggle(index: number): void {
    if (this.selection.has(index)) this.selection.delete(index);
    else this.selection.add(index);
  }

  clearSelection(): void {
    this.selection.clear();
  }

  setDrag(drag: EventDrag | null): void {
    this.drag = drag;
  }

  requestFocus(target: FocusTarget): void {
    this.focusRequest = { target, nonce: ++this.nonce };
  }

  // ---- 편집 ----

  /**
   * 편집 명령을 만들어 문서에 넣는다 (한 동작이 되돌리기 한 단계). 잠겼거나 모델이 거절하면 넣지 않고 이유를 돌려준다.
   * select 가 참이면 명령이 다룬 이벤트를 고른다
   */
  run(make: (editor: EventEditor) => EventListCommand, opts: { select?: boolean } = {}): RunResult {
    if (this.locked) return { ok: false, reason: this.locked };
    let command: EventListCommand;
    try {
      command = make(this.editor);
    } catch (e) {
      if (e instanceof EditRefused) return { ok: false, reason: e.message };
      throw e;
    }
    this.doc.apply(command);
    if (opts.select) this.select(command.focus);
    return { ok: true, command };
  }

  /** 명령을 만들어만 본다 (끌기 미리보기의 놓을 수 있는가). 문서는 그대로다 */
  canRun(make: (editor: EventEditor) => EventListCommand): boolean {
    if (this.locked) return false;
    try {
      make(this.editor);
      return true;
    } catch (e) {
      if (e instanceof EditRefused) return false;
      throw e;
    }
  }
}

/** 문서에 붙인다. 이 맵에 붙지 않으면 null (앱이 hint 를 보인다) */
export function attachEventsLayer(doc: MapDocument, sources: RpgSources): EventsLayerState | null {
  if (!doc.path || !sources.schemaPresent) return null;
  // 스키마를 아직 읽는 중이면 기다린다 (읽기가 끝나면 저장소가 refreshLayer 를 부른다)
  if (!sources.schema && !sources.schemaProblem) return null;
  if (!mapEntryFor(sources.game, doc.path)) return null;
  return new EventsLayerState(doc, sources);
}

/** 붙지 않은 맵의 레이어 패널 한 줄. 스키마가 없는 프로젝트는 아무것도 보이지 않는다 */
export function eventsLayerHint(_doc: MapDocument, sources: RpgSources): string | undefined {
  if (!sources.schemaPresent) return undefined;
  if (sources.gameProblem) return `rpg-game.json 을 읽지 못해 이벤트 레이어가 없다 (${sources.gameProblem})`;
  return "이벤트 레이어는 rpg-game.json 에 등록된 맵에만 있다";
}

/** 이벤트 레이어의 DOM 없는 부분 (id, 섹션, 붙이기, 힌트). src/ui 가 뷰와 도구와 인스펙터를 더한다 */
export function eventsLayerCore(sources: RpgSources): MapLayerSpec {
  return {
    id: EVENTS_LAYER_ID,
    label: EVENTS_LAYER_LABEL,
    section: EVENTS_SECTION,
    order: EVENTS_LAYER_ORDER,
    toolKey: EVENTS_TOOL_KEY,
    attach: (doc) => attachEventsLayer(doc, sources),
    hint: (doc) => eventsLayerHint(doc, sources),
  };
}

/** 문서에 붙은 이벤트 레이어 상태. 없으면 null */
export function eventsStateOf(doc: MapDocument | null | undefined): EventsLayerState | null {
  const state = doc?.layerState(EVENTS_LAYER_ID);
  return state instanceof EventsLayerState ? state : null;
}
