// 맵 문서: resources/maps/<이름>.json 하나. 타일, 통행, 오브젝트를 한 되돌리기 스택에서 고친다.
// 편집 상태(현재 레이어, 도구, 붓, 보이기, 오브젝트 선택)도 여기에 둔다. 맵 뷰와 팔레트와 레이어 패널과
// 인스펙터가 모두 이 문서 하나를 본다.

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { basename, Document, type ProjectBackend } from "@initial-editor/core";
import { parseMap, serializeMap, type MapData } from "./format";
import { MapModel } from "./mapModel";
import { validateObjects, type MapObjectSchema, type ObjectProblem } from "./schema";
import { singleBrush, type Brush } from "./tiles";

export const MAP_KIND = "map";
export const MAPS_DIR = "resources/maps";

export function isMapPath(path: string): boolean {
  return /^resources\/maps\/[^/]+\.json$/i.test(path);
}

/** 맵 뷰 도구. collision 은 통행 붓, object 는 오브젝트 선택과 끌기 */
export type MapTool = "pen" | "rect" | "fill" | "erase" | "pick" | "collision" | "object";

/** 편집 대상: 타일 레이어 번호, 통행, 오브젝트 레이어 */
export type MapTarget = { kind: "layer"; index: number } | { kind: "collision" } | { kind: "objects" };

export class MapDocument extends Document {
  readonly model: MapModel;
  /** 스키마 (없으면 null). 확장이 프로젝트를 열 때 읽어 넣는다 */
  schema: MapObjectSchema | null = null;
  target: MapTarget = { kind: "layer", index: 0 };
  tool: MapTool = "pen";
  brush: Brush = singleBrush(1);
  /** 팔레트에서 보고 있는 타일셋 */
  paletteTileset = 0;
  /** 레이어별 보이기 (저장하지 않는다) */
  readonly hiddenLayers = observable.set<number>();
  showCollision = false;
  showObjects = true;
  /** 선택된 오브젝트 id */
  readonly selection = observable.set<string>();

  constructor(
    private readonly backend: ProjectBackend,
    path: string,
    data: MapData,
    schema: MapObjectSchema | null = null,
  ) {
    super(MAP_KIND, path, basename(path));
    this.model = new MapModel(data);
    this.schema = schema;
    makeObservable(this, {
      schema: observable.ref,
      target: observable.ref,
      tool: observable,
      brush: observable.ref,
      paletteTileset: observable,
      showCollision: observable,
      showObjects: observable,
      problems: computed,
      selectedIds: computed,
      setTarget: action,
      setTool: action,
      setBrush: action,
      setSchema: action,
      toggleLayer: action,
      select: action,
      clearSelection: action,
    });
    // 다시 읽기나 크기 바꾸기 뒤에 없는 오브젝트는 선택에서 뺀다
    this.model.events.on("reset", () =>
      runInAction(() => {
        for (const id of [...this.selection]) if (!this.model.findObject(id)) this.selection.delete(id);
      }),
    );
  }

  static async open(backend: ProjectBackend, path: string, schema: MapObjectSchema | null = null): Promise<MapDocument> {
    const text = await backend.readText(path);
    const doc = new MapDocument(backend, path, parseMap(text), schema);
    doc.noteDiskText(text);
    return doc;
  }

  /** 오브젝트 검사 결과 (스키마와 대조) */
  get problems(): ObjectProblem[] {
    void this.model.revision;
    return validateObjects(this.model.objects, this.schema);
  }

  get selectedIds(): string[] {
    return this.model.objects.filter((o) => this.selection.has(o.id)).map((o) => o.id);
  }

  setTarget(target: MapTarget): void {
    this.target = target;
    if (target.kind === "collision") this.showCollision = true;
    if (target.kind === "objects") {
      this.showObjects = true;
      this.tool = "object";
    } else if (this.tool === "object") {
      this.tool = target.kind === "collision" ? "collision" : "pen";
    }
    if (target.kind === "collision" && this.tool !== "erase") this.tool = "collision";
    if (target.kind === "layer" && this.tool === "collision") this.tool = "pen";
  }

  setTool(tool: MapTool): void {
    this.tool = tool;
    if (tool === "collision") this.setTarget({ kind: "collision" });
    if (tool === "object") this.setTarget({ kind: "objects" });
  }

  setBrush(brush: Brush): void {
    this.brush = brush;
    if (this.tool === "erase" || this.tool === "pick" || this.tool === "object" || this.tool === "collision") this.tool = "pen";
    if (this.target.kind !== "layer") this.target = { kind: "layer", index: 0 };
  }

  setSchema(schema: MapObjectSchema | null): void {
    this.schema = schema;
  }

  toggleLayer(index: number): void {
    if (this.hiddenLayers.has(index)) this.hiddenLayers.delete(index);
    else this.hiddenLayers.add(index);
  }

  select(ids: Iterable<string>, additive = false): void {
    if (!additive) this.selection.clear();
    for (const id of ids) this.selection.add(id);
  }

  clearSelection(): void {
    this.selection.clear();
  }

  text(): string {
    return serializeMap(this.model.toData());
  }

  async save(): Promise<void> {
    if (!this.path) throw new Error("경로가 없는 맵은 저장할 수 없다");
    this.assertCanSave();
    // 쓰는 동안 들어온 편집은 dirty로 남도록 쓰기 전의 상태로 표시한다
    const state = this.undo.stateId;
    const text = this.text();
    await this.backend.writeText(this.path, text);
    this.noteDiskText(text);
    this.markSaved(state);
  }

  async reload(): Promise<void> {
    if (!this.path) return;
    const text = await this.backend.readText(this.path);
    const data = parseMap(text);
    this.model.replaceAll(data);
    this.undo.clear();
    this.noteDiskText(text);
    this.markSaved();
  }
}
