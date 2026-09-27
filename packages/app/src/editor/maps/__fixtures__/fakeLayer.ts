// 테스트용 가짜 확장 레이어. 맵 파일의 모르는 키 "marks" 를 맡고, 도구와 뷰와 인스펙터가 받은 것을 기록한다.
// 앱이 여는 자리(렌더러의 레이어, 도구 넘기기, 레이어 패널, 인스펙터, 커맨드, 저장 전 질문)를 RPG 없이 확인한다.

import { type Command } from "@initial-editor/core";
import type { MapLayerKey, MapLayerPointer, MapLayerSpec, MapLayerTool, MapLayerToolContext, MapLayerView, MapLayerViewContext } from "@initial-editor/ext-tilemap";
import type { MapDocument, MapLayerState, ObjectProblem } from "@initial-editor/ext-tilemap/model";
import { action, makeObservable, observable } from "mobx";

export interface Mark {
  id: string;
  x: number;
  y: number;
}

export class FakeMarksState implements MapLayerState {
  items: Mark[];
  locked: string | null = null;
  disposed = false;

  constructor(raw: unknown) {
    this.items = Array.isArray(raw) ? (raw as Mark[]) : [];
    makeObservable(this, { items: observable.ref, locked: observable, replace: action, lock: action });
  }

  replace(items: Mark[]): void {
    this.items = items;
  }

  lock(reason: string | null): void {
    this.locked = reason;
  }

  add(mark: Mark): Command {
    const before = this.items;
    return { label: `표식 추가: ${mark.id}`, execute: () => this.replace([...before, mark]), undo: () => this.replace(before) };
  }

  serialize(): unknown {
    return this.items.length > 0 ? this.items : undefined;
  }

  problems(): ObjectProblem[] {
    return this.items.flatMap((m, i): ObjectProblem[] => (m.x < 0 ? [{ severity: "error", message: `${m.id} 이(가) 맵 밖이다`, location: `marks[${i + 1}]` }] : []));
  }

  reset(raw: unknown): void {
    this.replace(Array.isArray(raw) ? (raw as Mark[]) : []);
  }

  refresh(): void {}

  dispose(): void {
    this.disposed = true;
  }
}

export interface FakeLayerLog {
  pointers: Array<[string, MapLayerPointer]>;
  keys: MapLayerKey[];
  views: Array<{ ctx: MapLayerViewContext; redraws: number; disposed: boolean }>;
  tools: Array<{ ctx: MapLayerToolContext; disposed: boolean }>;
}

export interface FakeLayerOptions {
  id?: string;
  label?: string;
  section?: string;
  order?: number;
  toolKey?: string;
  /** 이 경로의 맵에만 붙는다 (없으면 모든 맵) */
  paths?: string[];
  hint?: string;
  /** 도구가 처리하는 키 (mod 는 Ctrl 조합). 기본: Ctrl+C, Delete */
  handles?: (k: MapLayerKey) => boolean;
  Inspector?: unknown;
}

/** 가짜 레이어와 그 기록 */
export function fakeLayer(opts: FakeLayerOptions = {}): { spec: MapLayerSpec; log: FakeLayerLog } {
  const log: FakeLayerLog = { pointers: [], keys: [], views: [], tools: [] };
  const handles = opts.handles ?? ((k) => (k.mod && k.key.toLowerCase() === "c") || k.key === "Delete");
  const spec: MapLayerSpec = {
    id: opts.id ?? "test.marks",
    label: opts.label ?? "표식",
    section: opts.section ?? "marks",
    order: opts.order,
    toolKey: opts.toolKey ?? "M",
    attach(doc: MapDocument) {
      if (opts.paths && !opts.paths.includes(doc.path ?? "")) return null;
      return new FakeMarksState(doc.model.rawSection(opts.section ?? "marks"));
    },
    hint: () => opts.hint,
    createView(ctx) {
      const entry = { ctx, redraws: 0, disposed: false };
      log.views.push(entry);
      const view: MapLayerView = {
        redraw: () => void entry.redraws++,
        dispose: () => void (entry.disposed = true),
      };
      return view;
    },
    createTool(ctx) {
      const entry = { ctx, disposed: false };
      log.tools.push(entry);
      const tool: MapLayerTool = {
        pointerDown: (p) => void log.pointers.push(["down", p]),
        pointerMove: (p) => void log.pointers.push(["move", p]),
        pointerUp: (p) => void log.pointers.push(["up", p]),
        doubleClick: (p) => void log.pointers.push(["double", p]),
        keyDown: (k) => {
          log.keys.push(k);
          return handles(k);
        },
        cursor: () => "copy",
        wantsRightButton: () => true,
        dispose: () => void (entry.disposed = true),
      };
      return tool;
    },
    Inspector: opts.Inspector,
  };
  return { spec, log };
}
