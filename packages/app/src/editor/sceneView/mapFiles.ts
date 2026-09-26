// 씬 뷰의 맵 파일 캐시. 타일맵 오브젝트가 가리키는 맵 파일(resources/maps/*.json)을 경로마다 한 번 읽어 해석한다.
// 프로젝트 파일이 바뀌면 SceneSupport가 fileChanged로 알린다: 읽어 둔 맵이면 버리고, 어느 경로든 changed를
// 내보낸다. 타일맵 노드는 제 맵 파일이나 타일셋 그림이 바뀌었을 때 다시 그린다.
// MapFileExistence는 맵 파일이 있는지를 기억해 씬 검사(맵 파일이 없는 타일맵)가 동기로 읽게 한다.

import { Emitter, type ProjectBackend } from "@initial-editor/core";
import { parseMap, type MapData } from "@initial-editor/ext-tilemap/model";

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

/**
 * 타일맵이 가리키는 맵 파일이 있는지 (씬 검사가 읽는다). 처음 묻는 경로는 백엔드에 확인을 보내고 모른다(undefined)고 답한다.
 * 답이 오거나 바뀌면 changed를 내보낸다. 파일이 바뀌면 그 경로(폴더면 그 아래 경로)를 다시 확인하고, 그동안은 옛 답을 준다.
 * 확인하지 못한 경로(루트 밖 등)는 모른다로 둔다
 */
export class MapFileExistence {
  /** 경로 → 있음, 없음, 확인 못 함(null) */
  private readonly known = new Map<string, boolean | null>();
  /** 확인 중인 경로 → 요청 번호 (늦게 온 옛 답을 버린다) */
  private readonly pending = new Map<string, number>();
  private seq = 0;
  readonly events = new Emitter<{ changed: string }>();

  constructor(private readonly backend: () => ProjectBackend) {}

  /** 있으면 true, 없으면 false, 아직 모르면 undefined */
  exists(path: string): boolean | undefined {
    if (!this.known.has(path) && !this.pending.has(path)) this.check(path);
    return this.known.get(path) ?? undefined;
  }

  /** 프로젝트 파일 하나가 바뀌었다 (만들기, 고치기, 지우기, 폴더 이름 바꾸기) */
  fileChanged(path: string): void {
    for (const p of new Set([...this.known.keys(), ...this.pending.keys()])) {
      if (p === path || p.startsWith(`${path}/`)) this.check(p);
    }
  }

  clear(): void {
    this.known.clear();
    this.pending.clear();
  }

  private check(path: string): void {
    const run = ++this.seq;
    this.pending.set(path, run);
    let request: Promise<boolean>;
    try {
      request = this.backend().exists(path);
    } catch (e) {
      request = Promise.reject(e);
    }
    const settle = (value: boolean | null) => {
      if (this.pending.get(path) !== run) return;
      this.pending.delete(path);
      const before = this.known.get(path);
      this.known.set(path, value);
      if ((before ?? null) !== value) this.events.emit("changed", path);
    };
    request.then(
      (ok) => settle(ok),
      () => settle(null),
    );
  }
}
