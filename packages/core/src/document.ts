// 문서와 명령과 되돌리기 (docs/plans/02-scope-and-screens.md 4절).
//
// 에디터가 여는 것은 전부 문서이고, 문서는 저장과 되돌리기의 단위다. 문서를 고치는 길은
// 명령 객체(Command) 하나뿐이다. 확장도 document.apply(cmd) 로만 고친다. 그래야 타일 칠하기와
// 오브젝트 이동이 한 스택에 들어간다.

import { action, computed, makeObservable, observable } from "mobx";
import { Emitter } from "./events";

export interface Command {
  /** 편집 메뉴에 "되돌리기: 오브젝트 이동" 처럼 보인다 */
  readonly label: string;
  execute(): void;
  undo(): void;
  /**
   * 같은 키를 가진 연속 명령은 하나로 합쳐진다 (슬라이더 드래그, 연속 타일 칠하기).
   * 합칠 수 있으면 merge 가 true 를 돌려주고, 이 명령이 다음 명령을 흡수한다.
   */
  readonly coalesceKey?: string;
  merge?(next: Command): boolean;
}

export class UndoStack {
  private undoList: Command[] = [];
  private redoList: Command[] = [];
  readonly events = new Emitter<{ change: void }>();

  constructor(private readonly limit = 200) {
    makeObservable<UndoStack, "undoList" | "redoList">(this, {
      undoList: observable.shallow,
      redoList: observable.shallow,
      canUndo: computed,
      canRedo: computed,
      undoLabel: computed,
      redoLabel: computed,
      push: action,
      undo: action,
      redo: action,
      clear: action,
    });
  }

  get canUndo(): boolean {
    return this.undoList.length > 0;
  }

  get canRedo(): boolean {
    return this.redoList.length > 0;
  }

  get undoLabel(): string | null {
    return this.undoList.length ? this.undoList[this.undoList.length - 1].label : null;
  }

  get redoLabel(): string | null {
    return this.redoList.length ? this.redoList[this.redoList.length - 1].label : null;
  }

  get depth(): number {
    return this.undoList.length;
  }

  /** 명령을 실행하고 스택에 넣는다. 합쳐지면 스택 길이는 그대로다 */
  push(cmd: Command): void {
    cmd.execute();
    const top = this.undoList[this.undoList.length - 1];
    if (top && cmd.coalesceKey && top.coalesceKey === cmd.coalesceKey && top.merge?.(cmd)) {
      this.redoList = [];
      this.events.emit("change", undefined);
      return;
    }
    this.undoList.push(cmd);
    if (this.undoList.length > this.limit) this.undoList.shift();
    this.redoList = [];
    this.events.emit("change", undefined);
  }

  undo(): boolean {
    const cmd = this.undoList.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoList.push(cmd);
    this.events.emit("change", undefined);
    return true;
  }

  redo(): boolean {
    const cmd = this.redoList.pop();
    if (!cmd) return false;
    cmd.execute();
    this.undoList.push(cmd);
    this.events.emit("change", undefined);
    return true;
  }

  clear(): void {
    this.undoList = [];
    this.redoList = [];
    this.events.emit("change", undefined);
  }
}

export type DocumentKind = "scene" | "script" | "asset" | "welcome" | string;

/**
 * 열린 문서 하나. 저장과 되돌리기의 단위.
 * 구체 문서(씬, 스크립트)는 이것을 상속해 load/save 를 채운다.
 */
export abstract class Document {
  readonly undo = new UndoStack();
  /** 마지막 저장(또는 로드) 시점의 되돌리기 깊이. 이것과 다르면 dirty */
  private savedDepth = 0;
  /** 되돌리기 밖에서 바뀐 것(외부 재로드 등)을 표시할 때 */
  private forcedDirty = false;
  /** 외부에서 바뀌었는데 아직 반영하지 않았다 (배너를 띄운다) */
  externallyChanged = false;

  constructor(
    readonly kind: DocumentKind,
    /** 루트 기준 상대 경로. 아직 저장 안 된 새 문서는 null */
    public path: string | null,
    public title: string,
  ) {
    makeObservable<Document, "savedDepth" | "forcedDirty">(this, {
      savedDepth: observable,
      forcedDirty: observable,
      externallyChanged: observable,
      path: observable,
      title: observable,
      dirty: computed,
      markSaved: action,
      markDirty: action,
      apply: action,
    });
  }

  get dirty(): boolean {
    return this.forcedDirty || this.undo.depth !== this.savedDepth;
  }

  apply(cmd: Command): void {
    this.undo.push(cmd);
  }

  markSaved(): void {
    this.savedDepth = this.undo.depth;
    this.forcedDirty = false;
    this.externallyChanged = false;
  }

  markDirty(): void {
    this.forcedDirty = true;
  }

  /** 파일로 저장한다. 구체 문서가 구현하고, 성공하면 markSaved 를 부른다 */
  abstract save(): Promise<void>;
  /** 디스크의 내용으로 되돌린다 (외부 변경 반영) */
  abstract reload(): Promise<void>;
  /** 닫을 때 정리 */
  dispose(): void {
    this.undo.clear();
  }
}

/** 열린 문서 목록과 활성 문서 */
export class DocumentRegistry {
  documents: Document[] = [];
  active: Document | null = null;
  readonly events = new Emitter<{ open: Document; close: Document; activate: Document | null }>();

  constructor() {
    makeObservable(this, {
      documents: observable.shallow,
      active: observable.ref,
      open: action,
      close: action,
      activate: action,
      dirtyDocuments: computed,
    });
  }

  get dirtyDocuments(): Document[] {
    return this.documents.filter((d) => d.dirty);
  }

  findByPath(path: string): Document | undefined {
    return this.documents.find((d) => d.path === path);
  }

  /** 같은 경로가 이미 열려 있으면 그것을 활성으로 하고 돌려준다 */
  open(doc: Document): Document {
    const existing = doc.path ? this.findByPath(doc.path) : undefined;
    if (existing) {
      this.activate(existing);
      return existing;
    }
    this.documents.push(doc);
    this.events.emit("open", doc);
    this.activate(doc);
    return doc;
  }

  close(doc: Document): void {
    const i = this.documents.indexOf(doc);
    if (i < 0) return;
    this.documents.splice(i, 1);
    doc.dispose();
    this.events.emit("close", doc);
    if (this.active === doc) {
      this.activate(this.documents[Math.min(i, this.documents.length - 1)] ?? null);
    }
  }

  activate(doc: Document | null): void {
    if (doc && !this.documents.includes(doc)) return;
    this.active = doc;
    this.events.emit("activate", doc);
  }
}
