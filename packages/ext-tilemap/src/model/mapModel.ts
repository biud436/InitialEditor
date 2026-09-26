// 편집 중인 맵. 타일 배열은 크므로(256x28 두 장이면 1만 4천 칸) 관찰 가능한 배열로 두지 않고,
// 평범한 배열을 고친 뒤 바뀐 칸을 이벤트로 알린다 (렌더러는 그 칸만 다시 그린다). 오브젝트는
// 수가 적고 인스펙터가 반응해야 하므로 관찰 가능한 배열이다.
// 고치는 길은 명령 객체뿐이다 (document.apply(cmd)). 명령은 아래 팩토리로 만든다.

/* eslint-disable @typescript-eslint/no-this-alias -- 명령 객체의 execute/undo/merge 가 모델을 닫아 들고 있다 */
import { action, makeObservable, observable, runInAction } from "mobx";
import { Emitter, type Command } from "@initial-editor/core";
import { cloneMap, cloneObject, structuredCloneJson, type MapData, type MapObject, type TileLayer } from "./format";
import type { CellChange } from "./tiles";

export interface MapModelEvents {
  /** layer 는 레이어 번호, "collision" 은 통행 */
  cells: { layer: number | "collision"; indices: number[] };
  /** 레이어 목록 자체가 바뀌었다 (추가, 삭제, 순서, 이름) */
  layers: void;
  /** 맵 전체를 갈아 끼웠다 (다시 읽기) */
  reset: void;
}

export class MapModel {
  /** 타일과 통행과 메타데이터 (objects 는 아래 관찰 배열이 진실이다) */
  private data: MapData;
  readonly objects = observable.array<MapObject>([], { deep: false });
  /** 바뀔 때마다 오른다 (MobX 반응용) */
  revision = 0;
  readonly events = new Emitter<MapModelEvents>();

  constructor(data: MapData) {
    this.data = cloneMap(data);
    this.objects.replace(data.objects.map(cloneObject));
    makeObservable(this, { revision: observable, bump: action });
  }

  get width(): number {
    return this.data.width;
  }
  get height(): number {
    return this.data.height;
  }
  get tileWidth(): number {
    return this.data.tileWidth;
  }
  get tileHeight(): number {
    return this.data.tileHeight;
  }
  get name(): string {
    return this.data.name;
  }
  get tilesets() {
    return this.data.tilesets;
  }
  get layers(): readonly TileLayer[] {
    return this.data.layers;
  }
  get collision(): readonly number[] | null {
    return this.data.collision;
  }
  /** 픽셀 크기 */
  get pixelWidth(): number {
    return this.data.width * this.data.tileWidth;
  }
  get pixelHeight(): number {
    return this.data.height * this.data.tileHeight;
  }

  bump(): void {
    this.revision++;
  }

  toData(): MapData {
    const out = cloneMap(this.data);
    out.objects = this.objects.map(cloneObject);
    return out;
  }

  replaceAll(data: MapData): void {
    this.data = cloneMap(data);
    runInAction(() => this.objects.replace(data.objects.map(cloneObject)));
    this.bump();
    this.events.emit("reset", undefined);
  }

  findObject(id: string): MapObject | undefined {
    return this.objects.find((o) => o.id === id);
  }

  objectIds(): string[] {
    return this.objects.map((o) => o.id);
  }

  private writeCells(target: number | "collision", pairs: Iterable<[number, number]>): void {
    const arr = target === "collision" ? this.data.collision : this.data.layers[target]?.data;
    if (!arr) throw new Error(`레이어가 없다: ${String(target)}`);
    const indices: number[] = [];
    for (const [i, v] of pairs) {
      arr[i] = v;
      indices.push(i);
    }
    this.bump();
    this.events.emit("cells", { layer: target, indices });
  }

  private replaceObject(id: string, next: MapObject): void {
    const i = this.objects.findIndex((o) => o.id === id);
    if (i < 0) throw new Error(`오브젝트가 없다: ${id}`);
    this.objects[i] = next;
    this.bump();
  }

  // ---- 타일과 통행 ----

  /**
   * 칸 칠하기. 같은 coalesceKey 의 연속 명령(한 번의 붓질)은 하나로 합쳐지고, 되돌리면 붓질 전으로 간다.
   * layer 가 "collision" 이면 통행을 칠한다 (맵에 통행이 없으면 만든다).
   */
  paintCells(layer: number | "collision", changes: CellChange[], coalesceKey?: string): Command {
    const model = this;
    const befores = new Map<number, number>();
    const afters = new Map<number, number>();
    let createdCollision = false;
    const read = (i: number) => (layer === "collision" ? model.data.collision?.[i] ?? 0 : model.data.layers[layer].data[i]);
    const record = (list: CellChange[]) => {
      for (const c of list) {
        if (!befores.has(c.index)) befores.set(c.index, read(c.index));
        afters.set(c.index, c.value);
      }
    };
    record(changes);
    const cmd: Command & { pending: CellChange[]; befores: Map<number, number> } = {
      label: layer === "collision" ? "통행 칠하기" : `타일 칠하기: ${this.data.layers[layer]?.name ?? layer}`,
      coalesceKey,
      pending: changes,
      befores,
      execute: () => {
        if (layer === "collision" && !model.data.collision) {
          model.data.collision = new Array(model.data.width * model.data.height).fill(0);
          createdCollision = true;
        }
        model.writeCells(layer, afters.entries());
      },
      undo: () => {
        model.writeCells(layer, befores.entries());
        if (createdCollision) {
          model.data.collision = null;
          createdCollision = false;
          model.events.emit("cells", { layer: "collision", indices: [] });
        }
      },
      merge(next) {
        // UndoStack.push 는 다음 명령을 실행한 뒤 merge 한다. 그 칸의 "전" 은 이 붓질 이전 값이어야 하므로,
        // 이 명령이 이미 본 칸은 제 기록을 두고, 처음 보는 칸만 다음 명령이 실행 전에 적어 둔 값을 쓴다
        const other = next as typeof cmd;
        for (const c of other.pending) {
          if (!befores.has(c.index)) befores.set(c.index, other.befores.get(c.index) ?? 0);
          afters.set(c.index, c.value);
        }
        return true;
      },
    };
    return cmd;
  }

  // ---- 레이어 ----

  addLayer(name: string, at = this.data.layers.length): Command {
    const model = this;
    const layer: TileLayer = { name, data: new Array(this.data.width * this.data.height).fill(0), extra: {} };
    return {
      label: `레이어 추가: ${name}`,
      execute: () => {
        model.data.layers.splice(at, 0, { ...layer, data: [...layer.data] });
        model.bump();
        model.events.emit("layers", undefined);
      },
      undo: () => {
        model.data.layers.splice(at, 1);
        model.bump();
        model.events.emit("layers", undefined);
      },
    };
  }

  removeLayer(index: number): Command {
    const model = this;
    let removed: TileLayer | null = null;
    return {
      label: `레이어 삭제: ${this.data.layers[index]?.name ?? index}`,
      execute: () => {
        if (model.data.layers.length <= 1) throw new Error("마지막 레이어는 지울 수 없다");
        removed = model.data.layers.splice(index, 1)[0];
        model.bump();
        model.events.emit("layers", undefined);
      },
      undo: () => {
        if (removed) model.data.layers.splice(index, 0, removed);
        model.bump();
        model.events.emit("layers", undefined);
      },
    };
  }

  renameLayer(index: number, name: string): Command {
    const model = this;
    const before = this.data.layers[index].name;
    const set = (n: string) => {
      model.data.layers[index].name = n;
      model.bump();
      model.events.emit("layers", undefined);
    };
    return { label: `레이어 이름: ${before} → ${name}`, execute: () => set(name), undo: () => set(before) };
  }

  moveLayer(from: number, to: number): Command {
    const model = this;
    const move = (a: number, b: number) => {
      const [l] = model.data.layers.splice(a, 1);
      model.data.layers.splice(b, 0, l);
      model.bump();
      model.events.emit("layers", undefined);
    };
    return { label: "레이어 순서", execute: () => move(from, to), undo: () => move(to, from) };
  }

  // ---- 오브젝트 ----

  addObject(obj: MapObject, index?: number): Command {
    const model = this;
    return {
      label: `오브젝트 추가: ${obj.id}`,
      execute: action(() => {
        if (model.findObject(obj.id)) throw new Error(`id 가 겹친다: ${obj.id}`);
        model.objects.splice(Math.min(index ?? model.objects.length, model.objects.length), 0, cloneObject(obj));
        model.bump();
      }),
      undo: action(() => {
        const i = model.objects.findIndex((o) => o.id === obj.id);
        if (i >= 0) model.objects.splice(i, 1);
        model.bump();
      }),
    };
  }

  removeObjects(ids: string[]): Command {
    const model = this;
    let removed: Array<{ index: number; obj: MapObject }> = [];
    return {
      label: ids.length === 1 ? `오브젝트 삭제: ${ids[0]}` : `오브젝트 ${ids.length}개 삭제`,
      execute: action(() => {
        removed = [];
        model.objects.forEach((o, index) => {
          if (ids.includes(o.id)) removed.push({ index, obj: o });
        });
        for (let k = removed.length - 1; k >= 0; k--) model.objects.splice(removed[k].index, 1);
        model.bump();
      }),
      undo: action(() => {
        for (const r of removed) model.objects.splice(r.index, 0, r.obj);
        model.bump();
      }),
    };
  }

  /** 옮기기. 같은 coalesceKey 의 연속 명령(끌기)은 하나로 합쳐진다 */
  moveObjects(moves: Array<{ id: string; x: number; y: number }>, coalesceKey?: string): Command {
    const model = this;
    const before = new Map(moves.map((m) => [m.id, { x: model.findObject(m.id)?.x ?? 0, y: model.findObject(m.id)?.y ?? 0 }]));
    const apply = (list: Array<{ id: string; x: number; y: number }>) => {
      for (const m of list) {
        const o = model.findObject(m.id);
        if (o) model.replaceObject(m.id, { ...o, x: m.x, y: m.y });
      }
    };
    const cmd: Command & { target: typeof moves } = {
      label: moves.length === 1 ? `오브젝트 이동: ${moves[0].id}` : `오브젝트 ${moves.length}개 이동`,
      coalesceKey,
      target: moves.map((m) => ({ ...m })),
      execute: action(() => apply(cmd.target)),
      undo: action(() => apply([...before].map(([id, p]) => ({ id, ...p })))),
      merge(next) {
        cmd.target = (next as typeof cmd).target;
        return true;
      },
    };
    return cmd;
  }

  /** x, y, width, height 하나 (숫자, 또는 width/height 를 undefined 로 지우기) */
  setObjectField(id: string, field: "x" | "y" | "width" | "height", value: number | undefined, coalesceKey?: string): Command {
    const model = this;
    const o = this.findObject(id);
    if (!o) throw new Error(`오브젝트가 없다: ${id}`);
    const before = o[field];
    const set = (v: number | undefined) => {
      const cur = { ...model.findObject(id)! };
      if (v === undefined) delete cur[field];
      else cur[field] = v;
      model.replaceObject(id, cur);
    };
    const cmd: Command & { value: number | undefined } = {
      label: `속성 변경: ${id}.${field}`,
      coalesceKey,
      value,
      execute: action(() => set(cmd.value)),
      undo: action(() => set(before)),
      merge(next) {
        cmd.value = (next as typeof cmd).value;
        return true;
      },
    };
    return cmd;
  }

  /** props 의 값 하나. value 가 undefined 면 지운다 */
  setObjectProp(id: string, key: string, value: unknown, coalesceKey?: string): Command {
    const model = this;
    const o = this.findObject(id);
    if (!o) throw new Error(`오브젝트가 없다: ${id}`);
    const before = structuredCloneJson(o.props);
    const cmd: Command & { value: unknown } = {
      label: `속성 변경: ${id}.${key}`,
      coalesceKey,
      value,
      execute: action(() => {
        const cur = model.findObject(id)!;
        const props = { ...cur.props };
        if (cmd.value === undefined) delete props[key];
        else props[key] = cmd.value;
        model.replaceObject(id, { ...cur, props });
      }),
      undo: action(() => {
        const cur = model.findObject(id)!;
        model.replaceObject(id, { ...cur, props: structuredCloneJson(before) });
      }),
      merge(next) {
        cmd.value = (next as typeof cmd).value;
        return true;
      },
    };
    return cmd;
  }

  renameObject(id: string, newId: string): Command {
    const model = this;
    return {
      label: `이름 바꾸기: ${id} → ${newId}`,
      execute: action(() => {
        if (newId === "" || (newId !== id && model.findObject(newId))) throw new Error(`쓸 수 없는 id 다: ${newId}`);
        model.replaceObject(id, { ...model.findObject(id)!, id: newId });
      }),
      undo: action(() => model.replaceObject(newId, { ...model.findObject(newId)!, id })),
    };
  }

  reorderObject(from: number, to: number): Command {
    const model = this;
    const move = (a: number, b: number) => {
      const [o] = model.objects.splice(a, 1);
      model.objects.splice(b, 0, o);
      model.bump();
    };
    return { label: "오브젝트 순서", execute: action(() => move(from, to)), undo: action(() => move(to, from)) };
  }
}

/** 겹치지 않는 새 id (base_1, base_2 ...) */
export function uniqueMapObjectId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const clean = base.replace(/[^\p{L}\p{N}_-]/gu, "_") || "object";
  for (let i = 1; ; i++) {
    const candidate = `${clean}_${i}`;
    if (!set.has(candidate)) return candidate;
  }
}

/** 여러 명령을 되돌리기 한 단계로 */
export function compound(label: string, cmds: Command[]): Command {
  return {
    label,
    execute: () => cmds.forEach((c) => c.execute()),
    undo: () => [...cmds].reverse().forEach((c) => c.undo()),
  };
}
