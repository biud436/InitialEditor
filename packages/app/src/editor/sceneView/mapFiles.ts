// 씬 뷰의 맵 파일 캐시. 타일맵 오브젝트가 가리키는 맵 파일(resources/maps/*.json)을 경로마다 한 번 읽어 해석한다.
// 프로젝트 파일이 바뀌면 SceneSupport가 fileChanged로 알린다: 읽어 둔 맵이면 버리고, 어느 경로든 changed를
// 내보낸다. 타일맵 노드는 제 맵 파일이나 타일셋 그림이 바뀌었을 때 다시 그린다.
// MapFileCheck는 맵 파일을 엔진이 열 수 있는지(엔진의 Tilemap::load 규칙과 타일셋 그림이 있는지)를 기억해
// 씬 검사(엔진이 거부할 타일맵)가 동기로 읽게 한다.

import { BackendError, Emitter, type ProjectBackend } from "@initial-editor/core";
import type { MapFileProblem } from "@initial-editor/ext-tilemap";
import { checkEngineMap, parseMap, type MapData } from "@initial-editor/ext-tilemap/model";

export class MapFileCache {
  private readonly entries = new Map<string, Promise<MapData>>();
  readonly events = new Emitter<{ changed: string }>();

  constructor(private readonly backend: () => ProjectBackend) {}

  /** 경로의 맵. 읽거나 해석하지 못하면 거부된 Promise 이고 캐시에 남기지 않는다. 돌려준 맵은 고치지 않는다 */
  load(path: string): Promise<MapData> {
    const existing = this.entries.get(path);
    if (existing) return existing;
    const promise = this.backend()
      .readText(path)
      .then((text) => parseMap(text))
      .catch((e: unknown) => {
        if (this.entries.get(path) === promise) this.entries.delete(path);
        throw e;
      });
    this.entries.set(path, promise);
    return promise;
  }

  has(path: string): boolean {
    return this.entries.has(path);
  }

  /** 프로젝트 파일 하나가 바뀌었다 (만들기, 고치기, 지우기) */
  fileChanged(path: string): void {
    this.entries.delete(path);
    this.events.emit("changed", path);
  }

  clear(): void {
    this.entries.clear();
  }
}

/** 맵 파일의 상태: 엔진이 연다(ok), 없다(missing), 있지만 엔진이 열지 못한다(invalid) */
export type MapFileStatus = { kind: "ok" } | MapFileProblem;

const OK: MapFileStatus = { kind: "ok" };
const MISSING: MapFileStatus = { kind: "missing" };

function sameStatus(a: MapFileStatus | null | undefined, b: MapFileStatus | null): boolean {
  if (!a || !b) return (a ?? null) === b;
  return a.kind === b.kind && (a.kind !== "invalid" || (b.kind === "invalid" && a.reason === b.reason));
}

/**
 * 타일맵이 가리키는 맵 파일을 엔진이 열 수 있는지 (씬 검사가 읽는다). 엔진의 Tilemap::load 규칙(checkEngineMap)으로
 * 해석하고, 타일셋 그림이 프로젝트에 있는지 본다. 처음 묻는 경로는 백엔드에 확인을 보내고 모른다(undefined)고 답한다.
 * 답이 오거나 바뀌면 changed를 내보낸다. 맵 파일이나 그 맵의 타일셋 그림이 바뀌면(폴더면 그 아래) 다시 확인하고,
 * 그동안은 옛 답을 준다. 해석한 결과는 경로와 내용으로 기억해 내용이 같으면 다시 해석하지 않는다. 그림이 있는지는
 * 늘 다시 본다. 확인하지 못한 경로(루트 밖 등)는 모른다로 둔다
 */
export class MapFileCheck {
  /** 경로 → 상태, 확인 못 함(null) */
  private readonly known = new Map<string, MapFileStatus | null>();
  /** 확인 중인 경로 → 요청 번호 (늦게 온 옛 답을 버린다) */
  private readonly pending = new Map<string, number>();
  /** 경로 → 마지막으로 해석한 내용과 그 결과 (엔진 규칙의 판정과 타일셋 그림 경로) */
  private readonly parsed = new Map<string, { text: string; status: MapFileStatus; images: string[] }>();
  private seq = 0;
  readonly events = new Emitter<{ changed: string }>();

  constructor(private readonly backend: () => ProjectBackend) {}

  /** 상태. 아직 모르면 undefined, 확인하지 못했으면 null */
  status(path: string): MapFileStatus | null | undefined {
    if (!this.known.has(path) && !this.pending.has(path)) this.check(path);
    return this.known.get(path);
  }

  /** 씬 검사가 읽는 문제. 문제없거나 모르면 null */
  problem(path: string): MapFileProblem | null {
    const status = this.status(path);
    return status && status.kind !== "ok" ? status : null;
  }

  /** 프로젝트 파일 하나가 바뀌었다 (만들기, 고치기, 지우기, 폴더 이름 바꾸기) */
  fileChanged(path: string): void {
    const under = (p: string) => p === path || p.startsWith(`${path}/`);
    for (const p of new Set([...this.known.keys(), ...this.pending.keys()])) {
      if (under(p) || (this.parsed.get(p)?.images ?? []).some(under)) this.check(p);
    }
  }

  clear(): void {
    this.known.clear();
    this.pending.clear();
    this.parsed.clear();
  }

  private check(path: string): void {
    const run = ++this.seq;
    this.pending.set(path, run);
    const settle = (value: MapFileStatus | null) => {
      if (this.pending.get(path) !== run) return;
      this.pending.delete(path);
      const before = this.known.get(path);
      this.known.set(path, value);
      if (!sameStatus(before, value)) this.events.emit("changed", path);
    };
    this.read(path).then(settle, () => settle(null));
  }

  /** 읽어서 해석한다. 없으면 missing, 읽었지만 다른 까닭으로 읽지 못하면 exists로 없는지만 가린다 */
  private async read(path: string): Promise<MapFileStatus | null> {
    const backend = this.backend();
    let text: string;
    try {
      text = await backend.readText(path);
    } catch (e) {
      if (e instanceof BackendError && e.code === "not_found") return MISSING;
      return (await backend.exists(path)) ? null : MISSING;
    }
    const { status, images } = this.parse(path, text);
    if (status.kind !== "ok") return status;
    for (const image of images) {
      if (!(await backend.exists(image))) return { kind: "invalid", reason: `타일셋 이미지 파일 없음: ${image}` };
    }
    return OK;
  }

  private parse(path: string, text: string): { status: MapFileStatus; images: string[] } {
    const cached = this.parsed.get(path);
    if (cached && cached.text === text) return cached;
    const check = checkEngineMap(text);
    const entry = check.ok
      ? { text, status: OK, images: check.images }
      : { text, status: { kind: "invalid", reason: check.reason } as MapFileStatus, images: [] };
    this.parsed.set(path, entry);
    return entry;
  }
}
