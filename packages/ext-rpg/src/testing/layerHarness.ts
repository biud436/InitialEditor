// 이벤트 레이어 테스트의 틀: 진짜 픽스처(port_town.json, 두 스키마, 아이템 표)로 맵 문서를 열고 타일맵 확장의 자리에
// 이벤트 레이어를 붙인다 (앱과 같은 길: TilemapContrib.registerMapLayer, 문서 열기). 소스는 MobX 관찰 가능한 고정 값이다.

import { DocumentRegistry, MemoryBackend } from "@initial-editor/core";
import { TilemapContrib, type CellPickRequest, type MapLayerSpec, type Point } from "@initial-editor/ext-tilemap";
import { MapDocument, parseMap } from "@initial-editor/ext-tilemap/model";
import { action, makeObservable, observable } from "mobx";
import type { GameConfig, ItemTable } from "../model/game";
import { field } from "../model/json";
import { EVENTS_LAYER_ID, eventsLayerCore, eventsStateOf, type EventsLayerState, type RpgSources } from "../model/layer";
import { checkMapFile, mapFileProblem, mapSizeOf, type MapFileCheck, type MapSize } from "../model/location";
import { eventPlayBlocked, mapEventsOf, type EventPlayMode } from "../model/rpgPlay";
import type { EventSchema } from "../model/schema";
import type { MapViewsPort } from "../ui/locationPick";
import type { RpgPlayActions, RpgStoreView } from "../ui/services";
import { fixtureGame, fixtureItems, fixtureSchema, fixtureText } from "./fixtures";

export const PORT_TOWN = "resources/maps/port_town.json";
export const INN = "resources/maps/inn.json";
export const VILLAGE = "resources/maps/village.json";
export const MEADOW = "resources/maps/meadow.json";

/** 테스트가 쓰는 프로젝트 파일 (프로젝트 기준) */
export const HARNESS_FILES: readonly string[] = [
  "resources/charsets/placeholder.png",
  "resources/faces/placeholder.png",
  "resources/tiles/port16.png",
  "resources/audio/door.wav",
  "resources/audio/ui_decision.wav",
  PORT_TOWN,
  INN,
];

/** 픽스처를 다 읽은 소스. 칸을 바꾸고 refreshLayer 를 부르면 저장소가 다시 읽은 것과 같다 */
export class MutableSources implements RpgStoreView {
  schema: EventSchema | null = fixtureSchema();
  schemaPresent = true;
  schemaProblem: string | null = null;
  game: GameConfig | null = fixtureGame();
  gameProblem: string | null = null;
  items: ItemTable | null = fixtureItems();
  files: Set<string> | null = new Set(HARNESS_FILES);
  defs = new Map<string, ReadonlySet<string>>();
  /** 맵 파일의 엔진 판정. 없는 경로는 파일 목록에 있으면 mapText 의 글로 판정하고, 없으면 missing */
  readonly mapChecks = observable.map<string, MapFileCheck>({}, { deep: false });
  readonly memory = new Map<string, string>();
  /** setStartState 로 쓴 것 */
  readonly writes: Array<[string, string]> = [];

  constructor(over: Partial<Pick<MutableSources, "schema" | "schemaPresent" | "schemaProblem" | "game" | "gameProblem" | "items" | "files" | "defs">> = {}) {
    Object.assign(this, over);
    makeObservable(this, {
      schema: observable.ref,
      schemaPresent: observable,
      schemaProblem: observable,
      game: observable.ref,
      gameProblem: observable,
      items: observable.ref,
      files: observable.ref,
      defs: observable.ref,
      set: action,
    });
  }

  /** 칸 여럿을 한 번에 바꾼다 */
  set(over: Partial<Pick<MutableSources, "schema" | "schemaPresent" | "schemaProblem" | "game" | "gameProblem" | "items" | "files" | "defs">>): void {
    Object.assign(this, over);
  }

  get fileExists(): ((projectPath: string) => boolean) | null {
    const files = this.files;
    return files ? (p: string) => files.has(p.replace(/^\.\//, "")) : null;
  }

  private mapCheck(path: string): MapFileCheck {
    return this.mapChecks.get(path) ?? (this.files?.has(path) ? checkMapFile({ kind: "text", text: mapText(path) }) : { kind: "missing" });
  }

  mapFileProblem(path: string): string | null | undefined {
    return mapFileProblem(path, this.mapCheck(path), this.fileExists);
  }

  mapSize(path: string): MapSize | undefined {
    return mapSizeOf(this.mapCheck(path));
  }

  defIds(path: string): ReadonlySet<string> | null {
    return this.defs.get(path) ?? null;
  }

  fileList(): string[] {
    return this.files ? [...this.files].sort() : [];
  }

  projectEvents(_path?: string | null, current?: readonly unknown[]): Array<readonly unknown[]> {
    return current ? [current] : [];
  }

  startState(path: string): string {
    return this.memory.get(path) ?? "";
  }

  async setStartState(path: string, text: string): Promise<void> {
    this.writes.push([path, text]);
    this.memory.set(path, text.trim());
  }
}

/** 픽스처를 다 읽은 소스 (over 로 바꾼다) */
export function fixtureSources(over: ConstructorParameters<typeof MutableSources>[0] = {}): MutableSources {
  return new MutableSources(over);
}

export interface LayerHarness {
  backend: MemoryBackend;
  documents: DocumentRegistry;
  contrib: TilemapContrib;
  sources: MutableSources;
  spec: MapLayerSpec;
  /** 문서를 열고 레이어가 붙게 한다 */
  open(path?: string, text?: string): MapDocument;
}

/** 맵 파일 글 (픽스처. 없는 맵은 port_town 의 글에 이벤트만 비운 것) */
export function mapText(path: string): string {
  if (path === PORT_TOWN) return fixtureText("resources/maps/port_town.json");
  if (path === INN) return fixtureText("resources/maps/inn.json");
  const data = JSON.parse(fixtureText("resources/maps/inn.json")) as Record<string, unknown>;
  delete data.events;
  return JSON.stringify(data);
}

export function layerHarness(opts: { sources?: MutableSources; spec?: (s: MutableSources) => MapLayerSpec } = {}): LayerHarness {
  const sources = opts.sources ?? fixtureSources();
  const backend = new MemoryBackend({ [PORT_TOWN]: mapText(PORT_TOWN), [INN]: mapText(INN) });
  void backend.open("/project");
  const documents = new DocumentRegistry();
  const contrib = new TilemapContrib({ documents });
  const spec = opts.spec ? opts.spec(sources) : eventsLayerCore(sources as RpgSources);
  contrib.registerMapLayer(spec);
  return {
    backend,
    documents,
    contrib,
    sources,
    spec,
    open(path = PORT_TOWN, text = mapText(path)) {
      const doc = new MapDocument(backend, path, parseMap(text));
      doc.noteDiskText(text);
      documents.open(doc);
      return doc;
    },
  };
}

/** 붙은 이벤트 레이어 (없으면 던진다) */
export function stateOf(doc: MapDocument): EventsLayerState {
  const st = eventsStateOf(doc);
  if (!st) throw new Error(`이벤트 레이어가 붙지 않았다: ${doc.path} (${String(doc.layerState(EVENTS_LAYER_ID))})`);
  return st;
}

/** 이벤트 실행의 가짜: 막힌 이유는 러너의 이유(runnerReason), 없으면 모델의 eventPlayBlocked. run 은 부른 것을 남긴다 */
export class FakePlay implements RpgPlayActions {
  runnerReason: string | undefined = undefined;
  readonly runs: Array<{ id: unknown; index: number; mode: EventPlayMode }> = [];

  constructor(private readonly sources: MutableSources) {
    makeObservable(this, { runnerReason: observable });
  }

  blocked(doc: MapDocument, index: number, mode: EventPlayMode): string | undefined {
    return this.runnerReason ?? eventPlayBlocked(this.sources, doc, index, mode);
  }

  async run(doc: MapDocument, index: number, mode: EventPlayMode): Promise<boolean> {
    this.runs.push({ id: field(mapEventsOf(doc)[index], "id"), index, mode });
    return true;
  }
}

/** 맵 뷰 길의 가짜: 고르기는 테스트가 end 로 끝낼 때까지 기다리고, 부른 것을 남긴다 */
export class FakeMapViews implements MapViewsPort {
  blocked: string | undefined = undefined;
  readonly picks: CellPickRequest[] = [];
  readonly reveals: Array<[string, Point]> = [];
  private finish: ((cell: Point | null) => void) | null = null;

  constructor() {
    makeObservable(this, { blocked: observable });
  }

  pickCell(request: CellPickRequest): Promise<Point | null> {
    this.picks.push(request);
    return new Promise((resolve) => (this.finish = resolve));
  }

  async revealCell(path: string, cell: Point): Promise<boolean> {
    this.reveals.push([path, cell]);
    return true;
  }

  mapViewsBlocked(): string | undefined {
    return this.blocked;
  }

  /** 고르던 것을 끝낸다 */
  end(cell: Point | null): void {
    const f = this.finish;
    this.finish = null;
    f?.(cell);
  }
}
