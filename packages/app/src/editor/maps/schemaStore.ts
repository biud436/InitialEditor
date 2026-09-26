// 맵 오브젝트 스키마 저장소 (editor.mapSchema). 프로젝트의 resources/schema/map-objects.json을 읽어
// 열린 맵 문서마다 넣는다. 인스펙터 폼, 오브젝트 목록의 묶음, 여기서 실행의 환경 변수가 이 값을 본다.
//   - 프로젝트를 열면 읽고, 닫으면 비운다
//   - 그 파일이 바뀌면(에디터 저장이든 밖의 편집이든) 다시 읽는다
//   - 새로 열린 맵 문서에도 현재 스키마를 넣는다
// 읽기와 해석의 실패는 error에 두고 콘솔에 남기며, 예외를 밖으로 던지지 않는다.

import type { Document, DocumentRegistry, LogStore, Project, ProjectBackend } from "@initial-editor/core";
import { MapDocument, parseObjectSchema, SCHEMA_PATH, type MapObjectSchema } from "@initial-editor/ext-tilemap/model";
import { action, makeObservable, observable } from "mobx";
import type { Editor } from "../Editor";
import { registerMapObjectCommands } from "./objectTools/commands";

export type MapSchemaSource = "project" | "none";

const LOG = "maps";

export interface MapSchemaHost {
  readonly backend: ProjectBackend;
  readonly project: Project;
  readonly documents: DocumentRegistry;
  readonly log: LogStore;
  readonly events: { on(event: "projectOpened" | "projectClosed", listener: () => void): () => void };
}

/** 맵 문서면 그것, 아니면 null */
export function asMapDocument(doc: Document | null | undefined): MapDocument | null {
  return doc instanceof MapDocument ? doc : null;
}

export class MapSchemaStore {
  /** 해석한 스키마. 파일이 없거나 해석에 실패하면 null */
  current: MapObjectSchema | null = null;
  /** 마지막 읽기의 오류 문구 (없으면 null) */
  error: string | null = null;
  /** project: 프로젝트의 파일에서 읽었다, none: 스키마가 없다 */
  source: MapSchemaSource = "none";
  /** 지금 읽는 중 */
  loading = false;

  private token = 0;
  private disposers: Array<() => void> = [];
  private projectUnwatch: (() => void) | null = null;

  constructor(private readonly host: MapSchemaHost) {
    makeObservable(this, {
      current: observable.ref,
      error: observable,
      source: observable,
      loading: observable,
      setResult: action,
      clear: action,
    });
  }

  get path(): string {
    return SCHEMA_PATH;
  }

  /** 에디터 이벤트에 붙는다. 프로젝트가 이미 열려 있으면 바로 읽는다 */
  install(): void {
    const host = this.host;
    this.disposers.push(
      host.events.on("projectOpened", () => {
        this.watchProject();
        void this.load();
      }),
      host.events.on("projectClosed", () => {
        this.unwatchProject();
        this.clear();
      }),
      host.documents.events.on("open", (doc) => {
        const map = asMapDocument(doc);
        if (map && map.schema !== this.current) map.setSchema(this.current);
      }),
    );
    if (host.project.isOpen) {
      this.watchProject();
      void this.load();
    }
  }

  dispose(): void {
    this.unwatchProject();
    for (const d of this.disposers.reverse()) d();
    this.disposers = [];
  }

  /** 스키마 파일을 다시 읽고 열린 맵 문서에 넣는다. 결과 스키마(없으면 null) */
  async load(): Promise<MapObjectSchema | null> {
    const token = ++this.token;
    const { backend, project, log } = this.host;
    if (!project.isOpen) {
      this.clear();
      return null;
    }
    this.setLoading(true);
    let text: string | null = null;
    let error: string | null = null;
    try {
      text = (await backend.exists(SCHEMA_PATH)) ? await backend.readText(SCHEMA_PATH) : null;
    } catch (e) {
      error = `${SCHEMA_PATH} 을(를) 읽지 못했다: ${(e as Error).message}`;
    }
    if (token !== this.token) return this.current;
    let schema: MapObjectSchema | null = null;
    if (text !== null && error === null) {
      try {
        schema = parseObjectSchema(text);
      } catch (e) {
        error = `맵 오브젝트 스키마 오류 (${SCHEMA_PATH}): ${(e as Error).message}`;
      }
    }
    this.setResult(schema, error, schema ? "project" : "none");
    if (error) log.error(LOG, error);
    else if (schema) log.info(LOG, `맵 오브젝트 스키마: 타입 ${schema.types.length}개 (${schema.types.map((t) => t.type).join(", ")})${schema.play ? ", 여기서 실행 있음" : ""}`);
    else log.info(LOG, `맵 오브젝트 스키마가 없다 (${SCHEMA_PATH}). 오브젝트는 타입과 좌표만 보인다`);
    return schema;
  }

  setResult(schema: MapObjectSchema | null, error: string | null, source: MapSchemaSource): void {
    this.current = schema;
    this.error = error;
    this.source = source;
    this.loading = false;
    this.applyToOpenDocuments();
  }

  clear(): void {
    this.token++;
    this.current = null;
    this.error = null;
    this.source = "none";
    this.loading = false;
    this.applyToOpenDocuments();
  }

  private setLoading(value: boolean): void {
    action(() => (this.loading = value))();
  }

  private applyToOpenDocuments(): void {
    for (const doc of this.host.documents.documents) {
      const map = asMapDocument(doc);
      if (map && map.schema !== this.current) map.setSchema(this.current);
    }
  }

  private watchProject(): void {
    this.unwatchProject();
    this.projectUnwatch = this.host.project.events.on("change", (e) => {
      if (e.path === SCHEMA_PATH) void this.load();
    });
  }

  private unwatchProject(): void {
    this.projectUnwatch?.();
    this.projectUnwatch = null;
  }
}

/** editor.mapSchema를 만들어 붙이고, 맵 오브젝트 커맨드(여기서 실행)와 메뉴를 등록한다 */
export function installMapSchema(editor: Editor): MapSchemaStore {
  const store = new MapSchemaStore(editor);
  editor.mapSchema = store;
  store.install();
  registerMapObjectCommands(editor);
  return store;
}
