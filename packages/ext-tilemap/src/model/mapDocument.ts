// 맵 문서: resources/maps/<이름>.json 하나. 타일, 통행, 오브젝트를 한 되돌리기 스택에서 고친다.
// 편집 상태(현재 레이어, 도구, 붓, 보이기, 오브젝트 선택)도 여기에 둔다. 맵 뷰와 팔레트와 레이어 패널과
// 인스펙터가 모두 이 문서 하나를 본다.
// 확장 레이어(docs/plans/e5-rpg.md 2.2)는 섹션 하나를 맡는 상태로 붙는다 (layerStates). 상태가 붙은 섹션은
// 저장할 때 상태의 serialize() 값을 쓰고, 다시 읽으면 reset(raw), 크기를 바꾸면 shift(offset)를 받는다.
// 상태의 편집 명령도 같은 되돌리기 스택(doc.apply)에 들어간다.

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { basename, Document, type Command, type ProjectBackend } from "@initial-editor/core";
import { parseMap, serializeMap, type MapData } from "./format";
import type { MapLayerBinding, MapLayerState } from "./layers";
import { MapModel } from "./mapModel";
import { anchorOffset, type CellOffset, type ResizeAnchor } from "./resize";
import { validateObjects, type MapObjectSchema, type ObjectProblem } from "./schema";
import { singleBrush, type Brush } from "./tiles";

export const MAP_KIND = "map";
export const MAPS_DIR = "resources/maps";

export function isMapPath(path: string): boolean {
  return /^resources\/maps\/[^/]+\.json$/i.test(path);
}

/** 맵 뷰 도구. collision 은 통행 붓, object 는 오브젝트 선택과 끌기, ext 는 대상 확장 레이어의 도구 */
export type MapTool = "pen" | "rect" | "fill" | "erase" | "pick" | "collision" | "object" | "ext";

/** 편집 대상: 타일 레이어 번호, 통행, 오브젝트 레이어, 확장 레이어 (id) */
export type MapTarget = { kind: "layer"; index: number } | { kind: "collision" } | { kind: "objects" } | { kind: "ext"; id: string };

interface AttachedLayer {
  readonly binding: MapLayerBinding;
  readonly state: MapLayerState;
}

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
  /** 숨긴 확장 레이어 id (저장하지 않는다) */
  readonly hiddenExtLayers = observable.set<string>();
  /** 붙은 확장 레이어 (id → 상태). 붙지 않은 레이어는 없다 */
  private readonly attached = observable.map<string, AttachedLayer>({}, { deep: false });

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
      objectProblems: computed,
      selectedIds: computed,
      setTarget: action,
      setTool: action,
      setBrush: action,
      setSchema: action,
      toggleLayer: action,
      toggleExtLayer: action,
      select: action,
      clearSelection: action,
      refreshLayer: action,
      detachLayer: action,
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

  /** 오브젝트 검사 결과 (스키마와 대조)와 확장 레이어의 문제 (layer 에 레이어 id) */
  get problems(): ObjectProblem[] {
    return [...this.objectProblems, ...this.layerProblems()];
  }

  /** 오브젝트 검사 결과만 (맵 오브젝트 패널이 본다) */
  get objectProblems(): ObjectProblem[] {
    void this.model.revision;
    return validateObjects(this.model.objects, this.schema);
  }

  /** 확장 레이어의 문제. 레이어마다 problems() 를 부른다 (상태가 관찰 가능하면 따라온다) */
  layerProblems(): ObjectProblem[] {
    const out: ObjectProblem[] = [];
    for (const [id, { state }] of this.attached) {
      for (const p of state.problems()) out.push(p.layer === undefined ? { ...p, layer: id } : p);
    }
    return out;
  }

  /** 저장 전에 물을 확장 레이어의 오류 */
  layerErrors(): ObjectProblem[] {
    return this.layerProblems().filter((p) => p.severity === "error");
  }

  // ---- 확장 레이어 ----

  /** 붙은 레이어 id (붙은 순서) */
  get layerIds(): string[] {
    return [...this.attached.keys()];
  }

  layerState(id: string): MapLayerState | null {
    return this.attached.get(id)?.state ?? null;
  }

  /**
   * 레이어를 붙이거나 새로 고친다. 상태가 없으면 attach 를 부르고(null 이면 그대로 둔다), 있으면 refresh() 다.
   * 이미 붙은 상태는 떼지 않는다 (스키마가 사라져도 편집 중인 값을 지키고 상태가 locked 로 알린다). 붙은 상태를 돌려준다
   */
  refreshLayer(binding: MapLayerBinding): MapLayerState | null {
    const current = this.attached.get(binding.id);
    if (current) {
      current.state.refresh();
      return current.state;
    }
    const state = binding.attach(this);
    if (state) this.attached.set(binding.id, { binding, state });
    return state;
  }

  /**
   * 레이어를 뗀다 (등록을 거둘 때). 저장할 글이 바뀌지 않도록 상태의 값을 섹션 원본에 남긴 뒤 dispose 한다.
   * 대상이 그 레이어였으면 오브젝트로 돌아간다
   */
  detachLayer(id: string): void {
    const entry = this.attached.get(id);
    if (!entry) return;
    this.model.setRawSection(entry.binding.section, entry.state.serialize());
    this.attached.delete(id);
    this.hiddenExtLayers.delete(id);
    entry.state.dispose();
    if (this.target.kind === "ext" && this.target.id === id) this.setTarget({ kind: "objects" });
  }

  /** 섹션의 지금 값: 붙은 상태가 있으면 그 serialize(), 없으면 원본 사본 */
  sectionValue(key: string): unknown {
    for (const { binding, state } of this.attached.values()) if (binding.section === key) return state.serialize();
    return this.model.rawSection(key);
  }

  /**
   * 크기 바꾸기 명령 (되돌리기 한 단계): 모델의 칸과 오브젝트와 원본 events, 그리고 붙은 레이어의 shift.
   * 모델이 원본을 옮기는 섹션은 events 뿐이다. 실행 뒤에 붙은 events 상태는 옮겨진 원본에서 읽었으므로,
   * 되돌릴 때 반대로 옮겨 원래 자리로 돌린다. 다른 섹션은 붙어 있을 때만 옮긴다
   */
  resizeCommand(width: number, height: number, anchor: ResizeAnchor = "top-left"): Command {
    const inner = this.model.resize(width, height, anchor, this.schema);
    let offset: CellOffset | null = null;
    let shifted: Array<{ state: MapLayerState; cmd: Command }> = [];
    return {
      label: inner.label,
      execute: action(() => {
        offset = anchorOffset(anchor, { width: this.model.width, height: this.model.height }, { width, height });
        inner.execute();
        shifted = [];
        for (const { state } of this.attached.values()) {
          const cmd = state.shift?.(offset) ?? null;
          if (!cmd) continue;
          cmd.execute();
          shifted.push({ state, cmd });
        }
      }),
      undo: action(() => {
        for (const s of [...shifted].reverse()) s.cmd.undo();
        const back = offset ? { dx: -offset.dx, dy: -offset.dy } : null;
        if (back) {
          for (const { binding, state } of this.attached.values()) {
            if (binding.section === "events" && !shifted.some((s) => s.state === state)) state.shift?.(back)?.execute();
          }
        }
        shifted = [];
        inner.undo();
      }),
    };
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
    } else if (target.kind === "ext") {
      this.hiddenExtLayers.delete(target.id);
      this.tool = "ext";
    } else if (this.tool === "object" || this.tool === "ext") {
      this.tool = target.kind === "collision" ? "collision" : "pen";
    }
    if (target.kind === "collision" && this.tool !== "erase") this.tool = "collision";
    if (target.kind === "layer" && this.tool === "collision") this.tool = "pen";
  }

  /** 도구를 고른다. ext 는 대상이 확장 레이어일 때만 (레이어는 setTarget 으로 고른다) */
  setTool(tool: MapTool): void {
    if (tool === "ext" && this.target.kind !== "ext") return;
    this.tool = tool;
    if (tool === "collision") this.setTarget({ kind: "collision" });
    if (tool === "object") this.setTarget({ kind: "objects" });
  }

  setBrush(brush: Brush): void {
    this.brush = brush;
    if (this.tool === "erase" || this.tool === "pick" || this.tool === "object" || this.tool === "collision" || this.tool === "ext") this.tool = "pen";
    if (this.target.kind !== "layer") this.target = { kind: "layer", index: 0 };
  }

  setSchema(schema: MapObjectSchema | null): void {
    this.schema = schema;
  }

  toggleLayer(index: number): void {
    if (this.hiddenLayers.has(index)) this.hiddenLayers.delete(index);
    else this.hiddenLayers.add(index);
  }

  toggleExtLayer(id: string): void {
    if (this.hiddenExtLayers.has(id)) this.hiddenExtLayers.delete(id);
    else this.hiddenExtLayers.add(id);
  }

  select(ids: Iterable<string>, additive = false): void {
    if (!additive) this.selection.clear();
    for (const id of ids) this.selection.add(id);
  }

  clearSelection(): void {
    this.selection.clear();
  }

  /** 저장할 글. 붙은 레이어의 섹션은 상태의 serialize() 값이다 (undefined 면 키를 쓰지 않는다) */
  text(): string {
    const data = this.model.toData();
    for (const { binding, state } of this.attached.values()) {
      const value = state.serialize();
      if (binding.section === "events") data.events = value === undefined || value === null ? null : (value as unknown[]);
      else if (value === undefined) delete data.extra[binding.section];
      else data.extra[binding.section] = value;
    }
    return serializeMap(data);
  }

  async save(): Promise<void> {
    if (!this.path) throw new Error("경로 없는 맵은 저장 불가");
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
    for (const { binding, state } of this.attached.values()) state.reset(this.model.rawSection(binding.section));
    this.undo.clear();
    this.noteDiskText(text);
    this.markSaved();
  }

  /** 닫을 때: 붙은 레이어 상태를 정리한다 */
  dispose(): void {
    for (const { state } of this.attached.values()) state.dispose();
    runInAction(() => this.attached.clear());
    super.dispose();
  }
}
