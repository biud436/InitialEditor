// 맵 이동의 대상 고르기와 대상 보기 (e5 문서 4절). 커맨드 폼의 두 단추가 부른다. DOM 은 모른다.
//
//   맵에서 고르기  대상 맵을 탭으로 열고(타일맵 확장의 pickCell, 같은 맵이면 그 뷰에서) 누른 타일의 x, y 를 원래 맵의
//                 되돌리기 스택에 한 명령(setArgs)으로 넣는다. 끝나면 원래 맵의 탭으로 돌아와 그 커맨드의 폼을 연다.
//                 Esc 나 맵 밖 누름은 바꾼 것 없이 돌아온다. 원래 맵이 닫혔거나, 그 이벤트나 커맨드가 고르는 동안
//                 바뀌었으면 넣지 않는다
//   대상 보기      대상 맵을 탭으로 열고 x, y 타일을 뷰 가운데에 둔다 (revealCell)

import type { DocumentRegistry } from "@initial-editor/core";
import type { CellPickRequest, Point } from "@initial-editor/ext-tilemap";
import { EVENTS_LAYER_ID, type EventsLayerState } from "../model/layer";
import { field, isPlainObject, type JsonObject } from "../model/json";
import { locationArgs, locationTarget, pickBlocked, revealBlocked, type LocationArgs, type LocationSources, type LocationTarget } from "../model/location";
import { commandSpec, type CommandSpec } from "../model/schema";
import { commandLocation, getCommand, type CommandPath } from "../model/tree";

/** 맵 뷰 위 띠의 글 */
export const PICK_PROMPT = "타일을 클릭해 이동 위치 지정 (Esc: 취소)";

/** 타일맵 확장의 맵 뷰 길 (TilemapApi 의 일부) */
export interface MapViewsPort {
  pickCell(request: CellPickRequest): Promise<Point | null>;
  revealCell(path: string, cell: Point): Promise<boolean>;
  mapViewsBlocked(): string | undefined;
}

export interface LocationPickerDeps {
  views: MapViewsPort;
  documents: DocumentRegistry;
  sources: LocationSources;
  /** 짧은 알림 (넣지 못한 까닭) */
  notify?(message: string): void;
}

/** 고르기가 끝난 모양 */
export type PickOutcome = "picked" | "unchanged" | "cancelled" | "closed" | "changed" | "refused" | "blocked";

/** 두 단추의 막는 이유 (없으면 쓸 수 있다) */
export interface LocationBlockers {
  pick?: string;
  reveal?: string;
}

/** 이 커맨드의 맵 위치 인자와 대상 맵 */
function locate(state: EventsLayerState, cmd: unknown, sources: LocationSources): { spec: CommandSpec; args: LocationArgs; target: LocationTarget } | null {
  const schema = state.schema;
  if (!schema || !isPlainObject(cmd)) return null;
  const spec = commandSpec(schema, cmd.code);
  const args = locationArgs(spec);
  return spec && args ? { spec, args, target: locationTarget(cmd, args, sources) } : null;
}

function commandAt(state: EventsLayerState, index: number, path: CommandPath): JsonObject | null {
  const schema = state.schema;
  if (!schema) return null;
  try {
    const cmd = getCommand(field(state.section.list[index], "commands"), path, schema);
    return isPlainObject(cmd) ? cmd : null;
  } catch {
    return null;
  }
}

export class LocationPicker {
  constructor(private readonly deps: LocationPickerDeps) {}

  /** 이 커맨드가 맵 위치 인자를 가졌는가 (단추를 그릴지) */
  applies(state: EventsLayerState, cmd: unknown): boolean {
    return locate(state, cmd, this.deps.sources) !== null;
  }

  /** 두 단추의 막는 이유. 레이어가 잠기면 고르기만 막는다 (대상 보기는 고치지 않는다) */
  blockers(state: EventsLayerState, cmd: unknown): LocationBlockers {
    const found = locate(state, cmd, this.deps.sources);
    if (!found) return { pick: "맵 위치 인자가 없는 커맨드", reveal: "맵 위치 인자가 없는 커맨드" };
    const views = this.deps.views.mapViewsBlocked();
    return { pick: pickBlocked(found.target, state.locked, views), reveal: revealBlocked(found.target, views) };
  }

  /** 대상 맵에서 타일을 골라 이 커맨드의 x, y 에 넣는다 */
  async pick(state: EventsLayerState, eventIndex: number, path: CommandPath): Promise<PickOutcome> {
    const doc = state.doc;
    const cmd = commandAt(state, eventIndex, path);
    const found = locate(state, cmd, this.deps.sources);
    const blocked = found ? this.blockers(state, cmd).pick : "맵 위치 인자가 없는 커맨드";
    if (!found || !cmd || blocked || !found.target.ok) {
      if (blocked) this.deps.notify?.(blocked);
      return "blocked";
    }
    const eventKey = state.section.keyAt(eventIndex);
    const cell = await this.deps.views.pickCell({ path: found.target.path, prompt: PICK_PROMPT, returnTo: doc });
    // 원래 맵이 닫혔거나 레이어가 떨어졌다
    if (!this.deps.documents.documents.includes(doc) || doc.layerState(EVENTS_LAYER_ID) !== state) return "closed";
    const index = eventKey === undefined ? -1 : state.section.indexOfKey(eventKey);
    const now = index < 0 ? null : commandAt(state, index, path);
    if (!now || now.code !== cmd.code || field(now, found.args.map) !== field(cmd, found.args.map)) {
      if (cell) this.deps.notify?.("고르는 동안 이벤트나 커맨드가 바뀌어 x, y 를 넣지 않음");
      return "changed";
    }
    state.select([index]);
    state.requestFocus("commands", commandLocation(index, path));
    if (!cell) return "cancelled";
    const r = state.run((ed) => ed.setArgs(index, path, { [found.args.x]: cell.x, [found.args.y]: cell.y }));
    if (!r.ok) {
      this.deps.notify?.(r.reason);
      return "refused";
    }
    return r.command.unchanged ? "unchanged" : "picked";
  }

  /** 대상 맵을 열고 x, y 타일을 뷰 가운데에 둔다. 열었으면 true */
  async reveal(state: EventsLayerState, eventIndex: number, path: CommandPath): Promise<boolean> {
    const cmd = commandAt(state, eventIndex, path);
    const found = locate(state, cmd, this.deps.sources);
    const blocked = found ? this.blockers(state, cmd).reveal : "맵 위치 인자가 없는 커맨드";
    if (!found || blocked || !found.target.ok || !found.target.cell) {
      if (blocked) this.deps.notify?.(blocked);
      return false;
    }
    return this.deps.views.revealCell(found.target.path, found.target.cell);
  }
}
