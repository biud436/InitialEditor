// 게임 설정 resources/data/rpg-game.json 과 아이템 표 resources/data/items.json (엔진 M2 2.4, 2.5).
//
// 맵 등록(name, file, alt, def), 아이템 표의 경로, 여기서 실행 변수(play.env, play.probe)가 있다.
// 게임(scripts/lua/games/rpgdemo/config.lua)도 같은 파일로 맵 목록을 만들므로 모양 규칙을 그대로 따른다:
// 파일 전체를 쓸 수 없으면 GameConfigError, 틀린 maps 항목과 items 경로는 빼고 problems 로 알린다.
// 이벤트 레이어가 붙는 맵은 mapEntryFor 가 정한다 (file 이나 alt 로 등록된 맵).

import { engineLength, field, isArrayPlace, isObjectPlace, isInteger, isPlainObject, asList } from "./json";

export const GAME_CONFIG_PATH = "resources/data/rpg-game.json";
/** 저장소가 rpg-game.json 이 없을 때 남기는 이유 (RPG 프로젝트가 아니다) */
export const GAME_CONFIG_MISSING = "파일이 없다";

export interface MapEntry {
  name: string;
  /** INITIAL2D_NO_RTP 기준으로 게임이 여는 맵 (프로젝트 기준, ./ 없이) */
  file: string;
  /** 같은 지오메트리의 RTP 판 */
  alt: string[];
  /** 맵 정의 Lua 파일 */
  def: string;
}

export interface PlaySection {
  env: Record<string, string>;
  /** 자동 재생이 env 위에 더하는 변수 */
  probe: Record<string, string>;
}

export interface DataProblem {
  /** "maps[2].name" 꼴 (1부터 센다, 엔진과 같다) */
  path: string;
  message: string;
}

export interface GameConfig {
  version: number;
  maps: MapEntry[];
  /** 아이템 표 경로. 없거나 틀리면 null */
  items: string | null;
  play: PlaySection | null;
  problems: DataProblem[];
}

export class GameConfigError extends Error {
  constructor(
    message: string,
    public readonly location?: string,
  ) {
    super(location ? `${location}: ${message}` : message);
    this.name = "GameConfigError";
  }
}

/** 프로젝트 기준 경로: "./" 과 역슬래시와 겹친 / 를 정리한다 (에디터 문서 경로와 같은 꼴) */
export function bareProjectPath(path: string): string {
  let p = path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  while (p.startsWith("./")) p = p.slice(2);
  return p;
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v !== "";
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new GameConfigError(`${what}: JSON 이 아니다: ${(e as Error).message}`);
  }
}

function stringRecord(raw: unknown, where: string, problems: DataProblem[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw === undefined || raw === null) return out;
  if (!isPlainObject(raw)) {
    problems.push({ path: where, message: "객체가 아니다" });
    return out;
  }
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
    else problems.push({ path: `${where}.${k}`, message: "글이 아니다" });
  }
  return out;
}

/** rpg-game.json 을 읽는다 (config.lua 의 load 와 같은 규칙) */
export function parseGameConfig(text: string): GameConfig {
  const data = parseJson(text, "rpg-game.json");
  if (!isObjectPlace(data)) throw new GameConfigError("설정이 객체가 아니다");
  const version = field(data, "version");
  if (version !== 1) throw new GameConfigError(`모르는 버전 ${String(version)}`, "version");
  const rawMaps = field(data, "maps");
  if (!isArrayPlace(rawMaps)) throw new GameConfigError("맵 목록이 배열이 아니다", "maps");

  const problems: DataProblem[] = [];
  const maps: MapEntry[] = [];
  const seen = new Map<string, number>();
  const list = asList(rawMaps)!;
  for (let i = 0; i < engineLength(list); i++) {
    const here = `maps[${i + 1}]`;
    const entry = list[i];
    const before = problems.length;
    const add = (path: string, message: string) => problems.push({ path, message });
    if (!isObjectPlace(entry)) {
      add(here, "맵 항목이 객체가 아니다");
      continue;
    }
    const name = field(entry, "name");
    if (!nonEmptyString(name)) add(`${here}.name`, "이름이 비었거나 글이 아니다");
    else if (seen.has(name)) add(`${here}.name`, `이름 ${name} 가 maps[${seen.get(name)}] 와 겹친다`);
    for (const key of ["file", "def"]) {
      if (!nonEmptyString(field(entry, key))) add(`${here}.${key}`, "경로가 비었거나 글이 아니다");
    }
    const alt = field(entry, "alt");
    const alts: string[] = [];
    if (alt !== undefined) {
      if (!isArrayPlace(alt)) add(`${here}.alt`, "alt 가 배열이 아니다");
      else {
        const altList = asList(alt)!;
        for (let k = 0; k < engineLength(altList); k++) {
          const a = altList[k];
          if (!nonEmptyString(a)) add(`${here}.alt[${k + 1}]`, "경로가 비었거나 글이 아니다");
          else alts.push(bareProjectPath(a));
        }
      }
    }
    if (problems.length === before) {
      maps.push({ name: name as string, file: bareProjectPath(field(entry, "file") as string), alt: alts, def: bareProjectPath(field(entry, "def") as string) });
      seen.set(name as string, i + 1);
    }
  }

  let items: string | null = null;
  const rawItems = field(data, "items");
  if (rawItems === undefined) problems.push({ path: "items", message: "아이템 표 경로가 없다" });
  else if (!nonEmptyString(rawItems)) problems.push({ path: "items", message: "아이템 표 경로가 비었거나 글이 아니다" });
  else items = bareProjectPath(rawItems);

  let play: PlaySection | null = null;
  const rawPlay = field(data, "play");
  if (rawPlay !== undefined) {
    if (!isPlainObject(rawPlay)) problems.push({ path: "play", message: "객체가 아니다" });
    else play = { env: stringRecord(rawPlay.env, "play.env", problems), probe: stringRecord(rawPlay.probe, "play.probe", problems) };
  }
  return { version: 1, maps, items, play, problems };
}

export interface MapMatch {
  entry: MapEntry;
  /** file 로 등록되었는가, alt 로 등록되었는가 */
  role: "file" | "alt";
}

/** 이 맵 파일이 등록된 항목. 등록되지 않았으면 null (이벤트 레이어가 붙지 않는다) */
export function mapEntryFor(config: GameConfig | null | undefined, path: string): MapMatch | null {
  if (!config) return null;
  const p = bareProjectPath(path);
  for (const entry of config.maps) {
    if (entry.file === p) return { entry, role: "file" };
    if (entry.alt.includes(p)) return { entry, role: "alt" };
  }
  return null;
}

export function mapByName(config: GameConfig | null | undefined, name: string): MapEntry | undefined {
  return config?.maps.find((m) => m.name === name);
}

/** 등록된 맵이 읽기 전용인 이유. alt 가 있는 항목은 두 파일에 이벤트를 두 벌 둬야 한다 */
export function mapReadOnlyReason(match: MapMatch | null): string | null {
  if (!match || match.entry.alt.length === 0) return null;
  return "RTP 판과 기본 판 두 파일이라 이벤트를 두 벌 둬야 한다. 이전 전에는 Lua 정의 파일에서 고친다";
}

// ---- 아이템 표 ----

export interface ItemEntry {
  id: string;
  name?: string;
  desc?: string;
  order?: number;
}

export interface ItemTable {
  items: ItemEntry[];
  problems: DataProblem[];
}

export class ItemTableError extends GameConfigError {
  constructor(message: string, location?: string) {
    super(message, location);
    this.name = "ItemTableError";
  }
}

/** items.json 을 읽는다 (config.lua 의 loadItems 와 같은 규칙). 틀린 항목은 빼고 알린다 */
export function parseItemTable(text: string): ItemTable {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ItemTableError(`JSON 이 아니다: ${(e as Error).message}`);
  }
  if (!isObjectPlace(data)) throw new ItemTableError("아이템 표가 객체가 아니다");
  const raw = field(data, "items");
  if (!isArrayPlace(raw)) throw new ItemTableError("아이템 목록이 배열이 아니다", "items");
  const problems: DataProblem[] = [];
  const items: ItemEntry[] = [];
  const seen = new Map<string, number>();
  const list = asList(raw)!;
  for (let i = 0; i < engineLength(list); i++) {
    const here = `items[${i + 1}]`;
    const item = list[i];
    const before = problems.length;
    const add = (path: string, message: string) => problems.push({ path, message });
    if (!isObjectPlace(item)) {
      add(here, "아이템이 객체가 아니다");
      continue;
    }
    const id = field(item, "id");
    if (!nonEmptyString(id)) add(`${here}.id`, "id 가 비었거나 글이 아니다");
    else if (seen.has(id)) add(`${here}.id`, `id ${id} 가 items[${seen.get(id)}] 와 겹친다`);
    for (const key of ["name", "desc"]) {
      const v = field(item, key);
      if (v !== undefined && typeof v !== "string") add(`${here}.${key}`, `글이 아니다 (지금은 ${typeof v})`);
    }
    const order = field(item, "order");
    if (order !== undefined && !isInteger(order)) add(`${here}.order`, `정수가 아니다 (지금은 ${String(order)})`);
    if (problems.length === before) {
      const entry: ItemEntry = { id: id as string };
      const name = field(item, "name");
      const desc = field(item, "desc");
      if (typeof name === "string") entry.name = name;
      if (typeof desc === "string") entry.desc = desc;
      if (isInteger(order)) entry.order = order;
      items.push(entry);
      seen.set(id as string, i + 1);
    }
  }
  return { items, problems };
}

/** 아이템 id 모음 (검사와 제안이 쓴다) */
export function itemIds(table: ItemTable | null | undefined): Set<string> {
  return new Set((table?.items ?? []).map((i) => i.id));
}
