// 씬 뷰의 맵 파일 캐시. 타일맵 오브젝트가 가리키는 맵 파일(resources/maps/*.json)을 경로마다 한 번 읽어 해석한다.
// 프로젝트 파일이 바뀌면 SceneSupport가 fileChanged로 알린다: 읽어 둔 맵이면 버리고, 어느 경로든 changed를
// 내보낸다. 타일맵 노드는 제 맵 파일이나 타일셋 그림이 바뀌었을 때 다시 그린다.

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
