// 맵 뷰의 타일 고르기 (타일맵 확장의 pickCell). 확장의 폼이 맵 위의 좌표를 받을 때 쓴다.
//   고르는 동안 그 맵 뷰는 띠(요청의 글과 취소 단추)를 보이고, 뷰의 왼쪽 누름과 키는 도구 대신 여기로 온다
//   맵 안의 타일을 누르면 그 타일로 끝난다. 맵 밖(뷰의 여백)이나 뷰 밖을 누르거나 Esc 를 누르면 취소다
//   끝나면 요청의 returnTo 문서를 활성으로 돌린다. 다른 탭을 고르면 그 탭에 두고 취소한다
//   returnTo 문서가 닫히면 취소한다 (돌아갈 곳이 없다). 고르는 맵이 닫히면 취소하고 returnTo 로 돌아간다
//   새 요청은 앞의 요청을 취소한다. 뷰의 누름 자리는 MapView 가 data-pick-surface 로 알린다

import type { Document, DocumentRegistry } from "@initial-editor/core";
import type { Point } from "@initial-editor/ext-tilemap";
import type { MapDocument } from "@initial-editor/ext-tilemap/model";
import { action, makeObservable, observable } from "mobx";

/** 고르기가 끝난 까닭 */
export type PickEnd = "picked" | "cancel" | "tab" | "targetClosed" | "sourceClosed" | "replaced" | "disposed";

export interface ActivePick {
  readonly doc: MapDocument;
  readonly prompt: string;
  readonly returnTo: Document | null;
}

/** 고르는 동안 뷰의 누름을 받는 요소의 속성 (이 밖의 누름은 취소다) */
export const PICK_SURFACE_ATTR = "data-pick-surface";

/** 끝난 뒤 returnTo 로 돌아가는 까닭 */
const RETURNS: ReadonlySet<PickEnd> = new Set(["picked", "cancel", "targetClosed"]);

export interface CellPickerDeps {
  documents: DocumentRegistry;
  /** Esc 와 뷰 밖 누름을 듣는 창. 없으면 듣지 않는다 (테스트) */
  window?: Pick<Window, "addEventListener" | "removeEventListener"> | null;
}

export class CellPicker {
  /** 지금 고르는 것 (관찰 가능: 맵 뷰가 띠를 그린다) */
  active: ActivePick | null = null;
  /** 마지막으로 끝난 까닭 (테스트와 로그) */
  lastEnd: PickEnd | null = null;
  private resolve: ((cell: Point | null) => void) | null = null;
  private offs: Array<() => void> = [];

  constructor(private readonly deps: CellPickerDeps) {
    makeObservable<CellPicker, "finish">(this, { active: observable.ref, lastEnd: observable, start: action, finish: action });
  }

  /** doc 의 뷰에서 타일 하나를 고르기 시작한다. 고른 타일, 취소면 null */
  start(doc: MapDocument, request: { prompt: string; returnTo?: Document | null }): Promise<Point | null> {
    if (this.active) this.finish(null, "replaced");
    const returnTo = request.returnTo ?? null;
    const docs = this.deps.documents;
    if (!docs.documents.includes(doc) || (returnTo && !docs.documents.includes(returnTo))) return Promise.resolve(null);
    const promise = new Promise<Point | null>((resolve) => (this.resolve = resolve));
    this.active = { doc, prompt: request.prompt, returnTo };
    this.offs.push(
      docs.events.on("activate", (d) => {
        if (d !== doc) this.finish(null, "tab");
      }),
      docs.events.on("close", (d) => {
        if (d === returnTo) this.finish(null, "sourceClosed");
        else if (d === doc) this.finish(null, "targetClosed");
      }),
    );
    const win = this.deps.window;
    if (win) {
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape" || e.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        this.cancel();
      };
      const onPointer = (e: PointerEvent) => {
        const target = e.target as Element | null;
        if (!target?.closest?.(`[${PICK_SURFACE_ATTR}="true"]`)) this.cancel();
      };
      win.addEventListener("keydown", onKey, true);
      win.addEventListener("pointerdown", onPointer, true);
      this.offs.push(
        () => win.removeEventListener("keydown", onKey, true),
        () => win.removeEventListener("pointerdown", onPointer, true),
      );
    }
    return promise;
  }

  /** doc 의 뷰에서 고르는 중인가 */
  isPicking(doc: MapDocument): boolean {
    return this.active?.doc === doc;
  }

  /** 뷰의 누름: 맵 안의 타일이면 고르고, 맵 밖(null)이면 취소한다. 다른 문서의 뷰면 무시한다 */
  choose(doc: MapDocument, cell: Point | null): void {
    if (this.active?.doc !== doc) return;
    if (cell) this.finish({ x: cell.x, y: cell.y }, "picked");
    else this.finish(null, "cancel");
  }

  /** 바꾼 것 없이 끝내고 returnTo 로 돌아간다 */
  cancel(): void {
    if (this.active) this.finish(null, "cancel");
  }

  private finish(cell: Point | null, end: PickEnd): void {
    const active = this.active;
    const resolve = this.resolve;
    if (!active || !resolve) return;
    for (const off of this.offs.splice(0)) off();
    this.active = null;
    this.resolve = null;
    this.lastEnd = end;
    const back = active.returnTo;
    if (back && RETURNS.has(end) && this.deps.documents.documents.includes(back)) this.deps.documents.activate(back);
    resolve(cell);
  }

  dispose(): void {
    this.finish(null, "disposed");
  }
}
