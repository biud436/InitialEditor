// ext-rpg 가 프로젝트에서 읽는 것 (docs/plans/e5-rpg.md 2.4). 작업 공간의 백엔드로 읽고, 파일이 바뀌면 다시 읽는다.
//
//   event-commands.json       스키마. 모르는 버전이면 레이어를 잠근다
//   rpg-game.json             맵 등록, 아이템 표 경로, 실행 변수
//   아이템 표                  아이템 칸의 제안과 없는 id 경고
//   맵마다의 정의 파일(Lua)     같은 id 경고 (어림)
//   등록된 맵 파일의 events     깃발과 변수 이름의 제안
//   등록된 맵 파일의 엔진 판정   맵 이동의 대상 고르기가 막히는 이유 (파일 없음, 엔진이 열 수 없는 맵)
//   resources/ 아래 파일 목록   외형과 얼굴을 후보 중 있는 파일로 풀기, 파일 고르기, 없는 파일 경고
//   .initial-editor/rpg-play.json  맵마다의 시작 상태
//
// 실패는 이유를 남기고 콘솔에 알리며 던지지 않는다. 스키마나 설정을 읽을 때마다(성공이든 실패든, 파일이 사라졌든)
// onChange 를 부른다 (확장이 refreshLayer 로 잇는다). DOM 은 모른다.

import type { ChangeEvent, Workspace } from "@initial-editor/core";
import { action, makeObservable, observable, runInAction } from "mobx";
import { bareProjectPath, GAME_CONFIG_MISSING, GAME_CONFIG_PATH, parseGameConfig, parseItemTable, type GameConfig, type ItemTable } from "./model/game";
import { asList, field, parseJsonLossless } from "./model/json";
import type { RpgSources } from "./model/layer";
import { checkMapFile, mapFileProblem, type MapFileCheck } from "./model/location";
import { PLAY_MEMORY_PATH, readPlayMemory, writePlayMemory } from "./model/play";
import { EVENT_SCHEMA_PATH, parseEventSchema, schemaLockReason, type EventSchema } from "./model/schema";
import { defFileIds } from "./model/validate";

const LOG = "rpg";
const FILES_ROOT = "resources";
/** 파일 목록의 한도 (넘으면 거기서 멈추고 알린다) */
const MAX_FILES = 20000;

export interface RpgProjectStoreDeps {
  workspace: Pick<Workspace, "backend" | "project" | "log">;
  /** 스키마나 설정을 다시 읽었다 (레이어를 다시 붙이거나 새로 고친다) */
  onChange?(): void;
}

type ReadResult = { kind: "missing" } | { kind: "text"; text: string } | { kind: "error"; message: string };

export class RpgProjectStore implements RpgSources {
  schema: EventSchema | null = null;
  schemaPresent = false;
  schemaProblem: string | null = null;
  game: GameConfig | null = null;
  gameProblem: string | null = null;
  items: ItemTable | null = null;
  itemsProblem: string | null = null;
  /** resources/ 아래 파일 (프로젝트 기준). 아직 모르면 null */
  files: ReadonlySet<string> | null = null;
  /** 첫 읽기가 끝났다 */
  loaded = false;
  /** 정의 파일 경로 → 어림 id */
  readonly defs = observable.map<string, ReadonlySet<string> | null>({}, { deep: false });
  /** 등록된 맵 파일 → events (제안 재료) */
  readonly mapEvents = observable.map<string, readonly unknown[]>({}, { deep: false });
  /** 등록된 맵 파일 → 엔진 규칙의 판정 */
  readonly mapChecks = observable.map<string, MapFileCheck>({}, { deep: false });
  /** 맵 경로 → 시작 상태 글 */
  readonly playMemory = observable.map<string, string>({}, { deep: false });

  private generation = 0;
  private disposers: Array<() => void> = [];

  constructor(private readonly deps: RpgProjectStoreDeps) {
    makeObservable(this, {
      schema: observable.ref,
      schemaPresent: observable,
      schemaProblem: observable,
      game: observable.ref,
      gameProblem: observable,
      items: observable.ref,
      itemsProblem: observable,
      files: observable.ref,
      loaded: observable,
      clear: action,
    });
    const { project } = deps.workspace;
    this.disposers.push(
      project.onOpened(() => void this.load()),
      project.onClosed(() => {
        this.clear();
        this.deps.onChange?.();
      }),
      project.onFileChange((e) => void this.onFileChange(e)),
    );
    if (project.isOpen) void this.load();
  }

  dispose(): void {
    this.generation++;
    for (const d of this.disposers.reverse()) d();
    this.disposers = [];
  }

  // ---- RpgSources ----

  defIds(defPath: string): ReadonlySet<string> | null {
    return this.defs.get(bareProjectPath(defPath)) ?? null;
  }

  get fileExists(): ((projectPath: string) => boolean) | null {
    const files = this.files;
    return files ? (p: string) => files.has(bareProjectPath(p)) : null;
  }

  /** 프로젝트 파일 목록 (정렬, 모르면 빈 목록) */
  fileList(): string[] {
    return this.files ? [...this.files].sort() : [];
  }

  /** 등록된 맵들의 events (지금 편집 중인 맵은 current 로 바꿔 넣는다) */
  projectEvents(currentPath?: string | null, current?: readonly unknown[]): Array<readonly unknown[]> {
    const out: Array<readonly unknown[]> = [];
    const here = currentPath ? bareProjectPath(currentPath) : null;
    for (const [path, events] of this.mapEvents) if (path !== here) out.push(events);
    if (current) out.push(current);
    return out;
  }

  /**
   * 등록된 맵 파일을 엔진이 열 수 없는 이유. 열 수 있으면 null, 아직 모르거나 등록되지 않은 경로면 undefined.
   * 파일 목록은 resources/ 아래만 알아서 그 밖의 타일셋 그림은 있다고 본다
   */
  mapFileProblem(path: string): string | null | undefined {
    const key = bareProjectPath(path);
    const exists = this.fileExists;
    const imageExists = exists ? (p: string) => !(p === FILES_ROOT || p.startsWith(`${FILES_ROOT}/`)) || exists(p) : null;
    return mapFileProblem(key, this.mapChecks.get(key), imageExists);
  }

  startState(mapPath: string): string {
    return this.playMemory.get(bareProjectPath(mapPath)) ?? "";
  }

  /** 맵의 시작 상태를 기억하고 .initial-editor/rpg-play.json 에 쓴다 */
  async setStartState(mapPath: string, text: string): Promise<void> {
    const key = bareProjectPath(mapPath);
    const value = text.trim();
    if ((this.playMemory.get(key) ?? "") === value) return;
    runInAction(() => {
      if (value === "") this.playMemory.delete(key);
      else this.playMemory.set(key, value);
    });
    try {
      await this.deps.workspace.backend().writeText(PLAY_MEMORY_PATH, writePlayMemory(this.playMemory));
    } catch (e) {
      this.deps.workspace.log.warn(LOG, `${PLAY_MEMORY_PATH} 에 쓰지 못했다 (이번 실행 동안만 기억한다): ${(e as Error).message}`);
    }
  }

  // ---- 읽기 ----

  clear(): void {
    this.generation++;
    this.schema = null;
    this.schemaPresent = false;
    this.schemaProblem = null;
    this.game = null;
    this.gameProblem = null;
    this.items = null;
    this.itemsProblem = null;
    this.files = null;
    this.loaded = false;
    this.defs.clear();
    this.mapEvents.clear();
    this.mapChecks.clear();
    this.playMemory.clear();
  }

  private async read(path: string): Promise<ReadResult> {
    try {
      const backend = this.deps.workspace.backend();
      if (!(await backend.exists(path))) return { kind: "missing" };
      return { kind: "text", text: await backend.readText(path) };
    } catch (e) {
      return { kind: "error", message: (e as Error).message };
    }
  }

  /** 프로젝트를 열었다: 전부 읽고 한 번 알린다 */
  async load(): Promise<void> {
    const gen = ++this.generation;
    if (!this.deps.workspace.project.isOpen) return;
    const [schema, game, files, memory] = await Promise.all([this.read(EVENT_SCHEMA_PATH), this.read(GAME_CONFIG_PATH), this.listFiles(), this.read(PLAY_MEMORY_PATH)]);
    if (gen !== this.generation) return;
    this.applySchema(schema);
    this.applyGame(game);
    runInAction(() => {
      this.files = files;
      this.playMemory.replace(memory.kind === "text" ? readPlayMemory(memory.text) : new Map());
    });
    await this.loadGameParts(gen);
    if (gen !== this.generation) return;
    runInAction(() => (this.loaded = true));
    if (this.schemaPresent) {
      const s = this.schema;
      this.deps.workspace.log.info(LOG, s ? `이벤트 스키마: 커맨드 ${s.commands.length}종, 등록된 맵 ${this.game?.maps.length ?? 0}개` : `이벤트 스키마를 쓸 수 없다: ${this.schemaProblem}`);
    }
    this.deps.onChange?.();
  }

  private applySchema(r: ReadResult): void {
    let schema: EventSchema | null = null;
    let problem: string | null = null;
    if (r.kind === "error") problem = `event-commands.json 을 읽지 못했다: ${r.message}`;
    else if (r.kind === "text") {
      try {
        schema = parseEventSchema(r.text);
      } catch (e) {
        problem = schemaLockReason(e) ?? `event-commands.json 을 쓸 수 없다: ${(e as Error).message}`;
      }
    }
    runInAction(() => {
      this.schemaPresent = r.kind !== "missing";
      this.schemaProblem = problem;
      // 읽지 못해도 앞의 스키마는 붙은 레이어가 들고 있다. 저장소는 지금 파일의 결과만 둔다
      this.schema = schema;
    });
    if (problem) this.deps.workspace.log.warn(LOG, problem);
  }

  private applyGame(r: ReadResult): void {
    let game: GameConfig | null = null;
    let problem: string | null = null;
    if (r.kind === "missing") problem = GAME_CONFIG_MISSING;
    else if (r.kind === "error") problem = r.message;
    else {
      try {
        game = parseGameConfig(r.text);
        for (const p of game.problems) this.deps.workspace.log.warn(LOG, `rpg-game.json ${p.path}: ${p.message}`);
      } catch (e) {
        problem = (e as Error).message;
      }
    }
    runInAction(() => {
      this.game = game;
      this.gameProblem = problem;
    });
    if (problem && r.kind !== "missing") this.deps.workspace.log.warn(LOG, `rpg-game.json 을 읽지 못했다: ${problem}`);
  }

  /** 설정이 가리키는 것들: 아이템 표, 정의 파일, 맵 파일의 events */
  private async loadGameParts(gen: number): Promise<void> {
    const game = this.game;
    const itemsPath = game?.items ?? null;
    const defPaths = [...new Set((game?.maps ?? []).map((m) => m.def))];
    const mapPaths = [...new Set((game?.maps ?? []).flatMap((m) => [m.file, ...m.alt]))];
    const [items, defs, maps] = await Promise.all([
      itemsPath ? this.read(itemsPath) : Promise.resolve<ReadResult>({ kind: "missing" }),
      Promise.all(defPaths.map((p) => this.read(p))),
      Promise.all(mapPaths.map((p) => this.read(p))),
    ]);
    if (gen !== this.generation) return;
    this.applyItems(itemsPath, items);
    runInAction(() => {
      this.defs.replace(new Map(defPaths.map((p, i) => [p, defs[i].kind === "text" ? defFileIds(defs[i].text) : null])));
      const events = new Map<string, readonly unknown[]>();
      mapPaths.forEach((p, i) => {
        const e = eventsOfMapText(maps[i]);
        if (e) events.set(p, e);
      });
      this.mapEvents.replace(events);
      this.mapChecks.replace(new Map(mapPaths.map((p, i) => [p, checkMapFile(maps[i])])));
    });
  }

  private applyItems(path: string | null, r: ReadResult): void {
    let items: ItemTable | null = null;
    let problem: string | null = null;
    if (!path) problem = null;
    else if (r.kind === "missing") problem = `아이템 표가 없다: ${path}`;
    else if (r.kind === "error") problem = `아이템 표를 읽지 못했다: ${r.message}`;
    else {
      try {
        items = parseItemTable(r.text);
      } catch (e) {
        problem = `아이템 표를 쓸 수 없다 (${path}): ${(e as Error).message}`;
      }
    }
    runInAction(() => {
      this.items = items;
      this.itemsProblem = problem;
    });
    if (problem) this.deps.workspace.log.warn(LOG, problem);
  }

  /** resources/ 아래 파일 전부 (숨은 이름은 뺀다). 폴더가 없으면 빈 모음 */
  private async listFiles(): Promise<ReadonlySet<string>> {
    const out = new Set<string>();
    try {
      const backend = this.deps.workspace.backend();
      if (!(await backend.exists(FILES_ROOT))) return out;
      const queue = [FILES_ROOT];
      while (queue.length > 0 && out.size < MAX_FILES) {
        const dir = queue.shift()!;
        for (const e of await backend.list(dir)) {
          if (e.name.startsWith(".")) continue;
          if (e.kind === "dir") queue.push(e.path);
          else out.add(bareProjectPath(e.path));
        }
      }
      if (out.size >= MAX_FILES) this.deps.workspace.log.warn(LOG, `resources/ 의 파일이 ${MAX_FILES}개를 넘어 목록을 거기서 멈췄다`);
    } catch (e) {
      this.deps.workspace.log.warn(LOG, `resources/ 의 파일 목록을 읽지 못했다: ${(e as Error).message}`);
    }
    return out;
  }

  // ---- 바뀐 파일 ----

  private async onFileChange(e: ChangeEvent): Promise<void> {
    if (!this.loaded) return;
    const path = bareProjectPath(e.path);
    const gen = this.generation;
    if (path === FILES_ROOT || path.startsWith(`${FILES_ROOT}/`)) this.noteFile(path, e.kind);
    if (path === EVENT_SCHEMA_PATH) {
      const r = await this.read(path);
      if (gen !== this.generation) return;
      this.applySchema(r);
      this.deps.onChange?.();
      return;
    }
    if (path === GAME_CONFIG_PATH) {
      const r = await this.read(path);
      if (gen !== this.generation) return;
      this.applyGame(r);
      await this.loadGameParts(gen);
      if (gen !== this.generation) return;
      this.deps.onChange?.();
      return;
    }
    const game = this.game;
    if (game?.items && path === game.items) {
      const r = await this.read(path);
      if (gen !== this.generation) return;
      this.applyItems(path, r);
      this.deps.onChange?.();
      return;
    }
    if (game?.maps.some((m) => m.def === path)) {
      const r = await this.read(path);
      if (gen !== this.generation) return;
      runInAction(() => this.defs.set(path, r.kind === "text" ? defFileIds(r.text) : null));
      this.deps.onChange?.();
      return;
    }
    if (game?.maps.some((m) => m.file === path || m.alt.includes(path))) {
      const r = await this.read(path);
      if (gen !== this.generation) return;
      const events = eventsOfMapText(r);
      runInAction(() => {
        if (events) this.mapEvents.set(path, events);
        else this.mapEvents.delete(path);
        this.mapChecks.set(path, checkMapFile(r));
      });
      return;
    }
    if (path === PLAY_MEMORY_PATH && e.origin !== "self") {
      const r = await this.read(path);
      if (gen !== this.generation) return;
      runInAction(() => this.playMemory.replace(r.kind === "text" ? readPlayMemory(r.text) : new Map()));
    }
  }

  private noteFile(path: string, kind: ChangeEvent["kind"]): void {
    const files = this.files;
    if (!files) return;
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (name.startsWith(".")) return;
    if (kind === "create" && !files.has(path)) runInAction(() => (this.files = new Set([...files, path])));
    else if (kind === "delete") {
      // 폴더가 지워졌을 수도 있다: 그 아래 파일도 뺀다
      const prefix = `${path}/`;
      const next = [...files].filter((f) => f !== path && !f.startsWith(prefix));
      if (next.length !== files.size) runInAction(() => (this.files = new Set(next)));
    }
  }
}

/** 맵 파일 글의 events (배열 자리가 아니거나 읽지 못하면 null) */
function eventsOfMapText(r: ReadResult): readonly unknown[] | null {
  if (r.kind !== "text") return null;
  try {
    const events = field(parseJsonLossless(r.text), "events");
    return asList(events) ?? null;
  } catch {
    return null;
  }
}
