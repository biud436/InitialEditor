// 스크립트 문서 (E1). Lua, Ruby, JSON 과 그 밖의 텍스트 파일을 Monaco 모델로 연다.
//   되돌리기는 Monaco 의 스택이다 (02-scope-and-screens.md 4절). 코어의 UndoStack 은 비워 두고, dirty 는
//   모델의 alternativeVersionId 와 마지막 저장 시점을 비교해 markDirty/markSaved 로 맞춘다.
//   저장은 UTF-8 과 LF 로 (03-project-and-runtime.md 파일 규칙 5). 밖에서 바뀌면 Editor 가 미수정이면 reload 를,
//   수정 중이면 externallyChanged 를 올려 배너(ExternalChangeBanner)가 뜬다.

import { Document, basename, extname, generatedFrom, type ProjectBackend } from "@initial-editor/core";
import { action, makeObservable, observable, runInAction } from "mobx";
import { languageForExtension, monaco } from "../scripting/monaco";

export const SCRIPT_KIND = "script";
/** 이 확장자는 ScriptDocument 로 연다 (E0 의 TextPreviewDocument 를 대신한다) */
export const SCRIPT_EXTENSIONS = new Set(["lua", "rb", "json", "txt", "md", "csv", "fnt"]);

const LF = () => monaco.editor.EndOfLinePreference.LF;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export class ScriptDocument extends Document {
  model: monaco.editor.ITextModel | null = null;
  loaded = false;
  error: string | null = null;
  /** 그래프에서 만든 파일이면 그 그래프의 경로 (편집기는 읽기 전용이다) */
  graphSource: string | null = null;
  readonly language: string;
  /** 탭을 오갈 때 커서와 스크롤을 지킨다 (뷰가 뗄 때 저장하고 붙일 때 되살린다) */
  viewState: monaco.editor.ICodeEditorViewState | null = null;
  private codeEditor: monaco.editor.IStandaloneCodeEditor | null = null;
  private savedVersionId = 0;
  private pendingReveal: { line: number; column: number } | null = null;
  private modelListener: monaco.IDisposable | null = null;

  constructor(
    private readonly backend: ProjectBackend,
    path: string,
  ) {
    super(SCRIPT_KIND, path, basename(path));
    this.language = languageForExtension(extname(path));
    makeObservable<ScriptDocument, "setModel">(this, { model: observable.ref, loaded: observable, error: observable, graphSource: observable, setModel: action });
  }

  /** 지금 모델의 텍스트 (LF) */
  get text(): string {
    return this.model?.getValue(LF()) ?? "";
  }

  get lineCount(): number {
    return this.model?.getLineCount() ?? 0;
  }

  /** 뷰가 붙어 있는가 (찾기와 되돌리기 커맨드가 본다) */
  get hasEditor(): boolean {
    return this.codeEditor !== null;
  }

  async load(): Promise<void> {
    if (!this.path) return;
    try {
      const text = await this.backend.readText(this.path);
      this.setModel(text);
      this.noteDiskText(text);
    } catch (e) {
      runInAction(() => {
        this.error = (e as Error).message;
        this.loaded = true;
      });
      throw e;
    }
  }

  private setModel(text: string): void {
    const uri = monaco.Uri.from({ scheme: "initial", path: "/" + this.path });
    this.modelListener?.dispose();
    this.model?.dispose();
    monaco.editor.getModel(uri)?.dispose();
    const model = monaco.editor.createModel(text, this.language, uri);
    model.setEOL(monaco.editor.EndOfLineSequence.LF);
    this.savedVersionId = model.getAlternativeVersionId();
    this.modelListener = model.onDidChangeContent(() => this.syncDirty());
    this.model = model;
    this.loaded = true;
    this.error = null;
    this.graphSource = /\.(lua|rb)$/.test(this.path ?? "") ? generatedFrom(text) : null;
    this.markSaved();
  }

  /** 모델이 마지막 저장 시점과 다르면 dirty, 되돌려서 같아지면 다시 깨끗하다 */
  private syncDirty(): void {
    const model = this.model;
    if (!model) return;
    const clean = model.getAlternativeVersionId() === this.savedVersionId;
    if (!clean) {
      if (!this.dirty) this.markDirty();
    } else if (this.dirty && !this.externallyChanged) {
      this.markSaved();
    }
  }

  async save(): Promise<void> {
    const model = this.model;
    if (!this.path || !model) return;
    // 쓰는 동안 들어온 편집은 dirty 로 남도록, 쓰기 전의 판을 저장된 판으로 삼는다
    const version = model.getAlternativeVersionId();
    const text = model.getValue(LF());
    await this.backend.writeText(this.path, text);
    this.noteDiskText(text);
    this.savedVersionId = version;
    if (model.getAlternativeVersionId() === version) this.markSaved();
  }

  /** 디스크 내용으로 바꾼다. 되돌리기 스택은 남긴다 (setValue 는 스택을 지우므로 편집으로 넣는다) */
  async reload(): Promise<void> {
    if (!this.path) return;
    const model = this.model;
    if (!model) {
      await this.load();
      return;
    }
    const text = await this.backend.readText(this.path);
    if (model.getValue(LF()) !== text) {
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null);
    }
    this.savedVersionId = model.getAlternativeVersionId();
    this.noteDiskText(text);
    this.markSaved();
  }

  attachEditor(editor: monaco.editor.IStandaloneCodeEditor): void {
    this.codeEditor = editor;
    const pending = this.pendingReveal;
    if (pending) {
      this.pendingReveal = null;
      this.reveal(pending.line, pending.column);
    }
  }

  detachEditor(editor: monaco.editor.IStandaloneCodeEditor): void {
    if (this.codeEditor === editor) this.codeEditor = null;
  }

  /** 그 줄 그 열로 간다 (1부터). 뷰가 아직 없으면 붙을 때 간다 */
  reveal(line: number, column = 1): void {
    const editor = this.codeEditor;
    const model = editor?.getModel();
    if (!editor || !model) {
      this.pendingReveal = { line, column };
      return;
    }
    const lineNumber = clamp(line, 1, model.getLineCount());
    const col = clamp(column, 1, model.getLineMaxColumn(lineNumber));
    editor.setPosition({ lineNumber, column: col });
    editor.revealLineInCenter(lineNumber);
    editor.focus();
  }

  /** reveal 의 별명. 실행기의 콘솔 오류 링크(runner/openErrorLink.ts)가 문서에 이 이름이 있는지 보고 부른다 */
  revealLine(line: number, column = 1): void {
    this.reveal(line, column);
  }

  focus(): void {
    this.codeEditor?.focus();
  }

  /** Monaco 액션 (예: "actions.find"). 없으면 false */
  runAction(id: string): boolean {
    const a = this.codeEditor?.getAction(id);
    if (!a) return false;
    void a.run();
    return true;
  }

  /** Monaco 핸들러 (예: "undo", "redo") */
  trigger(handlerId: string): void {
    this.codeEditor?.trigger("initial-editor", handlerId, null);
  }

  /** 선택된 텍스트 (없으면 빈 문자열). 프로젝트 찾기의 초기값에 쓴다 */
  selectedText(): string {
    const editor = this.codeEditor;
    const selection = editor?.getSelection();
    if (!editor || !selection || selection.isEmpty()) return "";
    return editor.getModel()?.getValueInRange(selection) ?? "";
  }

  dispose(): void {
    this.modelListener?.dispose();
    this.modelListener = null;
    const model = this.model;
    runInAction(() => {
      this.model = null;
    });
    model?.dispose();
    super.dispose();
  }
}
