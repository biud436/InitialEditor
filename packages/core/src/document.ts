// 문서와 명령과 되돌리기 (docs/plans/02-scope-and-screens.md 4절).
//
// 에디터가 여는 것은 전부 문서이고, 문서는 저장과 되돌리기의 단위다. 문서를 고치는 길은
// 명령 객체(Command) 하나뿐이다. 확장도 document.apply(cmd) 로만 고친다. 그래야 타일 칠하기와
// 오브젝트 이동이 한 스택에 들어간다.

import { action, computed, makeObservable, observable } from "mobx";
import { BackendError } from "./backend";
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
  /**
   * 참이면 문서를 바꾸지 않는 명령이다 (칸에 이미 있는 값을 다시 넣기, 이미 고른 것을 다시 고르기). 스택은 실행하지도 쌓지도 않아
   * 되돌리기 단계가 늘지 않고 문서가 수정됨이 되지 않는다. 명령을 만들 때의 문서와 견준 값이다
   */
  readonly unchanged?: boolean;
}

/** 되돌리기 목록의 한 칸. id는 이 명령을 실행한 뒤의 상태를 가리킨다 */
interface UndoEntry {
  readonly cmd: Command;
  readonly id: number;
}

export class UndoStack {
  private undoList: UndoEntry[] = [];
  private redoList: UndoEntry[] = [];
  /** 가장 오래 남은 명령 아래의 상태 id (비어 있을 때의 상태) */
  private baseId = 0;
  private nextId = 0;
  readonly events = new Emitter<{ change: void }>();

  constructor(private readonly limit = 200) {
    makeObservable<UndoStack, "undoList" | "redoList" | "baseId">(this, {
      undoList: observable.shallow,
      redoList: observable.shallow,
      baseId: observable,
      canUndo: computed,
      canRedo: computed,
      undoLabel: computed,
      redoLabel: computed,
      stateId: computed,
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
    return this.undoList.length ? this.undoList[this.undoList.length - 1].cmd.label : null;
  }

  get redoLabel(): string | null {
    return this.redoList.length ? this.redoList[this.redoList.length - 1].cmd.label : null;
  }

  get depth(): number {
    return this.undoList.length;
  }

  /**
   * 지금 상태의 id. 새 명령과 합쳐진 명령은 새 id를 받고, 되돌리기와 다시 실행은 id를 오간다.
   * 같은 id면 같은 내용이다 (문서의 dirty가 저장 시점의 id와 비교한다)
   */
  get stateId(): number {
    const top = this.undoList[this.undoList.length - 1];
    return top ? top.id : this.baseId;
  }

  /** 명령을 실행하고 스택에 넣는다. 합쳐지면 스택 길이는 그대로지만 상태 id는 새로 받는다. 바꾸는 것이 없는 명령(unchanged)은 버린다 */
  push(cmd: Command): void {
    if (cmd.unchanged) return;
    cmd.execute();
    const last = this.undoList.length - 1;
    const top = this.undoList[last];
    if (top && cmd.coalesceKey && top.cmd.coalesceKey === cmd.coalesceKey && top.cmd.merge?.(cmd)) {
      this.undoList[last] = { cmd: top.cmd, id: ++this.nextId };
      this.redoList = [];
      this.events.emit("change", undefined);
      return;
    }
    this.undoList.push({ cmd, id: ++this.nextId });
    if (this.undoList.length > this.limit) {
      // 버린 명령 뒤의 상태가 이제 가장 밑이다
      this.baseId = this.undoList.shift()!.id;
    }
    this.redoList = [];
    this.events.emit("change", undefined);
  }

  undo(): boolean {
    const entry = this.undoList.pop();
    if (!entry) return false;
    entry.cmd.undo();
    this.redoList.push(entry);
    this.events.emit("change", undefined);
    return true;
  }

  redo(): boolean {
    const entry = this.redoList.pop();
    if (!entry) return false;
    entry.cmd.execute();
    this.undoList.push(entry);
    this.events.emit("change", undefined);
    return true;
  }

  /** 스택을 비운다. 내용이 바뀌었을 수 있으므로 새 상태 id를 받는다 */
  clear(): void {
    this.undoList = [];
    this.redoList = [];
    this.baseId = ++this.nextId;
    this.events.emit("change", undefined);
  }
}

export type DocumentKind = "scene" | "script" | "asset" | "welcome" | string;

/** 저장 직전에 찾은 충돌. changed는 밖에서 바뀌었고, missing은 지워졌고, unreadable은 다시 읽지 못했다 */
export interface SaveConflict {
  kind: "changed" | "missing" | "unreadable";
  /** unreadable이면 다시 읽지 못한 이유 */
  reason?: string;
}

/** 저장 충돌 모달에서 고른 것 */
export type SaveConflictChoice = "overwrite" | "reload" | "cancel";

/** 저장 요청의 결과. reloaded는 내 수정을 버리고 디스크 내용으로 다시 읽었다 */
export type SaveOutcome = "saved" | "reloaded" | "cancelled";

/** 저장 충돌 모달에서 다시 읽기를 골랐는데 디스크의 파일을 다시 읽지 못했다. 저장 실패와 구분해 알린다 */
export class ReloadFailedError extends Error {
  constructor(
    /** 다시 읽지 못한 이유 (배너에도 남는다) */
    readonly reason: string,
  ) {
    super(`다시 읽기 실패: ${reason}`);
    this.name = "ReloadFailedError";
  }
}

/** saveChecked가 어디까지 왔는지 알린다 */
export interface SaveProgress {
  /** 확인과 모달을 마치고 쓰기(또는 다시 읽기)를 시작한다. 이 뒤의 편집은 이번 저장에 들어가지 않는다 */
  acting?(): void;
}

/** 저장 직전 확인에 쓰는 것. 에디터가 백엔드와 모달로 채운다 */
export interface SaveGuard {
  readText(path: string): Promise<string>;
  /** 충돌을 알리고 덮어쓰기, 다시 읽기, 취소 중에서 고르게 한다 */
  askConflict(doc: Document, conflict: SaveConflict): Promise<SaveConflictChoice>;
  /** 다시 읽으면 저장하지 않은 수정이 사라지므로 한 번 더 묻는다 */
  confirmDiscard(doc: Document): Promise<boolean>;
}

/**
 * 열린 문서 하나. 저장과 되돌리기의 단위.
 * 구체 문서(씬, 스크립트)는 이것을 상속해 load/save 를 채운다.
 */
export abstract class Document {
  readonly undo = new UndoStack();
  /** 마지막 저장(또는 로드) 시점의 되돌리기 상태 id. 이것과 다르면 dirty */
  private savedStateId = this.undo.stateId;
  /** 되돌리기 밖에서 바뀐 것(외부 재로드 등)을 표시할 때 */
  private forcedDirty = false;
  /** 외부에서 바뀌었는데 아직 반영하지 않았다 (배너를 띄운다) */
  externallyChanged = false;
  /** 밖에서 바뀐 파일을 다시 읽지 못한 이유. 있으면 저장을 막는다 (다시 읽기에 성공하거나 allowOverwrite로 풀린다) */
  reloadError: string | null = null;
  /** 마지막으로 디스크에서 읽었거나 디스크에 쓴 내용. 저장 직전 디스크와 견준다 (모르면 null) */
  private diskText: string | null = null;
  /** 덮어쓰기를 골랐다: 다음 저장은 디스크와 견주지 않는다 */
  private overwriteChosen = false;

  constructor(
    readonly kind: DocumentKind,
    /** 루트 기준 상대 경로. 아직 저장 안 된 새 문서는 null */
    public path: string | null,
    public title: string,
  ) {
    makeObservable<Document, "savedStateId" | "forcedDirty">(this, {
      savedStateId: observable,
      forcedDirty: observable,
      externallyChanged: observable,
      reloadError: observable,
      path: observable,
      title: observable,
      dirty: computed,
      saveBlocked: computed,
      markSaved: action,
      markDirty: action,
      markReloadFailed: action,
      allowOverwrite: action,
      apply: action,
    });
  }

  get dirty(): boolean {
    return this.forcedDirty || this.undo.stateId !== this.savedStateId;
  }

  /** 다시 읽지 못한 파일이다. 저장하면 디스크의 더 새 내용을 덮어쓰므로 막는다 */
  get saveBlocked(): boolean {
    return this.reloadError !== null;
  }

  apply(cmd: Command): void {
    this.undo.push(cmd);
  }

  /**
   * 저장됐다고 표시한다. stateId는 디스크에 쓴 내용의 상태 id로, 쓰기를 기다리기 전에 받아 두면
   * 기다리는 동안 들어온 편집이 dirty로 남는다
   */
  markSaved(stateId: number = this.undo.stateId): void {
    this.savedStateId = stateId;
    this.forcedDirty = false;
    this.externallyChanged = false;
    this.reloadError = null;
    this.overwriteChosen = false;
  }

  /** 디스크와 맞춘 내용을 기억한다. 구체 문서가 파일을 읽거나 쓴 뒤 부른다 */
  noteDiskText(text: string): void {
    this.diskText = text;
    this.overwriteChosen = false;
  }

  markDirty(): void {
    this.forcedDirty = true;
  }

  /** 다시 읽기에 실패했다: 배너에 이유를 띄우고 저장을 막는다 */
  markReloadFailed(message: string): void {
    this.externallyChanged = true;
    this.reloadError = message;
    this.overwriteChosen = false;
  }

  /** 덮어쓰기를 골랐다 (배너나 저장 충돌 모달): 막힌 저장을 풀고, 다음 저장은 디스크와 견주지 않고 지금 내용을 쓴다 */
  allowOverwrite(): void {
    this.externallyChanged = false;
    this.reloadError = null;
    this.forcedDirty = true;
    this.overwriteChosen = true;
  }

  /** 저장이 막혀 있으면 던진다. 구체 문서의 save가 쓰기 전에 부른다 */
  assertCanSave(): void {
    if (this.reloadError !== null) {
      throw new Error(`${this.title}: 디스크에서 다시 읽기 실패로 저장 차단 (다시 읽기나 편집 내용으로 덮어쓰기 선택 필요): ${this.reloadError}`);
    }
  }

  /** 디스크에서 다시 읽는다. 실패하면 이유를 남기고 저장을 막은 뒤 다시 던진다 */
  async reloadFromDisk(): Promise<void> {
    try {
      await this.reload();
    } catch (e) {
      this.markReloadFailed((e as Error).message);
      throw e;
    }
  }

  /**
   * 저장하면 디스크의 더 새 내용을 덮어쓰는지 본다 (03-project-and-runtime.md 파일 규칙 4).
   * 다시 읽지 못했으면 unreadable, 알던 파일이 없으면 missing, 디스크가 마지막으로 맞춘 내용과 다르면 changed다.
   * 맞춘 내용을 모르는 문서는 밖에서 바뀐 알림(배너)만 본다. 덮어쓰기를 골랐으면 보지 않는다
   */
  async findSaveConflict(readText: (path: string) => Promise<string>): Promise<SaveConflict | null> {
    if (!this.path) return null;
    if (this.reloadError !== null) return { kind: "unreadable", reason: this.reloadError };
    if (this.overwriteChosen) return null;
    let disk: string;
    try {
      disk = await readText(this.path);
    } catch (e) {
      if (e instanceof BackendError && e.code === "not_found") {
        return this.diskText !== null || this.externallyChanged ? { kind: "missing" } : null;
      }
      throw new Error(`디스크의 파일 확인 실패로 저장 중단: ${(e as Error).message}`);
    }
    if (this.diskText !== null) return disk === this.diskText ? null : { kind: "changed" };
    return this.externallyChanged ? { kind: "changed" } : null;
  }

  /**
   * 디스크를 확인하고 저장한다. 충돌이면 guard로 묻는다: 덮어쓰기는 내 것을 쓰고,
   * 다시 읽기는 (수정 중이면 한 번 더 물은 뒤) 디스크 내용으로 바꾸고, 취소는 아무것도 하지 않는다.
   * 다시 읽지 못하면 ReloadFailedError를 던진다 (배너에 이유가 남고 저장은 막힌다).
   * 쓰기나 다시 읽기를 시작할 때 progress.acting을 부른다
   */
  async saveChecked(guard: SaveGuard, progress: SaveProgress = {}): Promise<SaveOutcome> {
    const conflict = await this.findSaveConflict((path) => guard.readText(path));
    if (conflict) {
      const choice = await guard.askConflict(this, conflict);
      if (choice === "cancel") return "cancelled";
      if (choice === "reload") {
        if (this.dirty && !(await guard.confirmDiscard(this))) return "cancelled";
        progress.acting?.();
        try {
          await this.reloadFromDisk();
        } catch (e) {
          throw new ReloadFailedError((e as Error).message);
        }
        return "reloaded";
      }
      this.allowOverwrite();
    }
    progress.acting?.();
    await this.save();
    return "saved";
  }

  /**
   * 파일로 저장한다. 구체 문서가 구현하고, assertCanSave로 막힘을 확인한 뒤 성공하면 쓴 내용을 noteDiskText로 남기고
   * markSaved를 부른다. 디스크 확인 없이 쓰므로 에디터는 saveChecked를 쓴다
   */
  abstract save(): Promise<void>;
  /** 디스크의 내용으로 되돌린다 (외부 변경 반영). 읽은 내용을 noteDiskText로 남긴다. 밖에서 부를 때는 실패를 기록하는 reloadFromDisk를 쓴다 */
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
