// LSP 클라이언트를 Monaco 에 잇는다 (docs/plans/language-server.md 4.3절).
//   모델: 언어가 맞는 initial: 모델을 열고 바뀔 때마다 알리고 닫는다 (client.ts 가 모았다가 보낸다).
//   진단: 서버가 보낸 것을 URI 마다 두었다가 모델의 마커로. 표시 범위(끔, 구문 오류만, 규칙 목록)는 바뀌면 다시 건다.
//   공급자: 완성(과 resolve), 호버, 시그니처, 정의, 참조, 같은 기호 강조, 문서 기호, 이름 바꾸기.
//   다른 파일: 정의로 가기는 에디터의 탭으로 연다 (registerEditorOpener). 미리보기 창과 이름 바꾸기가 다른 파일의 모델을
//   찾으므로, 결과에 든 파일 중 모델이 없는 것은 디스크에서 읽어 만들어 둔다 (닫힌 파일이라 읽기만 한다).

import type * as lsp from "vscode-languageserver-protocol";
import { monaco } from "../monaco";
import type { LanguageClient } from "./client";
import {
  completionItems,
  fromPosition,
  toCompletionItem,
  toDocumentSymbols,
  toHighlights,
  toHover,
  toLocations,
  toMarker,
  toRange,
  toSignatureHelp,
  toWorkspaceEdit,
  workspaceEditFiles,
} from "./convert";
import { filterDiagnostics, type DiagnosticsMode } from "./diagnostics";
import { fileUri, filePath, joinPath, relativeTo } from "./uri";

export const MODEL_SCHEME = "initial";
const MARKER_OWNER = "language-server";

export interface BindingOptions {
  client: LanguageClient;
  languageId: string;
  /** 서버가 보는 프로젝트 루트 (절대 경로) */
  root: string;
  diagnosticsMode(): DiagnosticsMode;
  /** 프로젝트 상대 경로를 에디터의 탭으로 연다 (줄과 열은 1부터) */
  openFile(path: string, line: number, column: number): Promise<boolean>;
  /** 프로젝트 상대 경로의 글 (모델이 없는 파일을 읽을 때) */
  readFile(path: string): Promise<string>;
  /** 이름 바꾸기가 고칠 파일을 문서로 연다 (고친 뒤 저장할 수 있게) */
  openForEdit(paths: string[]): Promise<void>;
}

export class MonacoBinding {
  private readonly disposables: monaco.IDisposable[] = [];
  private readonly modelListeners = new Map<string, monaco.IDisposable>();
  private readonly diagnostics = new Map<string, lsp.Diagnostic[]>();
  /** 결과를 보이려고 만든 읽기 전용 모델 */
  private readonly shadowModels = new Set<monaco.editor.ITextModel>();
  private readonly lspItems = new WeakMap<monaco.languages.CompletionItem, lsp.CompletionItem>();

  constructor(private readonly o: BindingOptions) {}

  /** 프로젝트 상대 경로를 서버의 URI 로 */
  serverUri(path: string): string {
    return fileUri(joinPath(this.o.root, path));
  }

  /** 서버의 URI 를 프로젝트 상대 경로로. 루트 밖이면 null */
  projectPath(uri: string): string | null {
    const abs = filePath(uri);
    if (abs === null) return null;
    const rel = relativeTo(this.o.root, abs);
    return rel ? rel : null;
  }

  private modelUri(uri: string): monaco.Uri | null {
    const rel = this.projectPath(uri);
    return rel === null ? null : monaco.Uri.from({ scheme: MODEL_SCHEME, path: "/" + rel });
  }

  private modelPath(model: monaco.editor.ITextModel): string | null {
    if (model.uri.scheme !== MODEL_SCHEME) return null;
    return model.uri.path.replace(/^\//, "");
  }

  private tracks(model: monaco.editor.ITextModel): boolean {
    return model.getLanguageId() === this.o.languageId && this.modelPath(model) !== null;
  }

  install(): void {
    for (const model of monaco.editor.getModels()) this.attach(model);
    this.disposables.push(
      monaco.editor.onDidCreateModel((model) => this.attach(model)),
      monaco.editor.onWillDisposeModel((model) => this.detach(model)),
      monaco.editor.onDidChangeModelLanguage(({ model }) => {
        this.detach(model);
        this.attach(model);
      }),
      monaco.editor.registerEditorOpener({
        openCodeEditor: (_source, resource, selectionOrPosition) => {
          if (resource.scheme !== MODEL_SCHEME) return false;
          const path = resource.path.replace(/^\//, "");
          const at = selectionOrPosition && "startLineNumber" in selectionOrPosition ? { line: selectionOrPosition.startLineNumber, column: selectionOrPosition.startColumn } : selectionOrPosition ? { line: selectionOrPosition.lineNumber, column: selectionOrPosition.column } : { line: 1, column: 1 };
          return this.o.openFile(path, at.line, at.column);
        },
      }),
      ...this.registerProviders(),
    );
  }

  dispose(): void {
    for (const d of this.disposables.splice(0)) d.dispose();
    for (const [, l] of this.modelListeners) l.dispose();
    this.modelListeners.clear();
    for (const model of monaco.editor.getModels()) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
    }
    for (const model of this.shadowModels) if (!model.isDisposed()) model.dispose();
    this.shadowModels.clear();
    this.diagnostics.clear();
  }

  /** 진단 표시 범위가 바뀌었다 */
  refreshMarkers(): void {
    for (const model of monaco.editor.getModels()) {
      const path = this.modelPath(model);
      if (path === null || !this.tracks(model)) continue;
      this.applyMarkers(model, this.diagnostics.get(this.serverUri(path)) ?? []);
    }
  }

  setDiagnostics(params: lsp.PublishDiagnosticsParams): void {
    const rel = this.projectPath(params.uri);
    if (rel === null) return;
    const key = this.serverUri(rel);
    this.diagnostics.set(key, params.diagnostics);
    const model = monaco.editor.getModel(monaco.Uri.from({ scheme: MODEL_SCHEME, path: "/" + rel }));
    if (model && this.tracks(model)) this.applyMarkers(model, params.diagnostics);
  }

  /** 열린 모델의 마커 (시험과 상태 표시용) */
  diagnosticsFor(path: string): lsp.Diagnostic[] {
    return this.diagnostics.get(this.serverUri(path)) ?? [];
  }

  private applyMarkers(model: monaco.editor.ITextModel, diagnostics: lsp.Diagnostic[]): void {
    monaco.editor.setModelMarkers(model, MARKER_OWNER, filterDiagnostics(diagnostics, this.o.diagnosticsMode()).map(toMarker));
  }

  private attach(model: monaco.editor.ITextModel): void {
    if (!this.tracks(model) || this.modelListeners.has(model.id)) return;
    const path = this.modelPath(model)!;
    const uri = this.serverUri(path);
    this.o.client.open(uri, this.o.languageId, model.getVersionId(), model.getValue());
    this.modelListeners.set(
      model.id,
      model.onDidChangeContent(() => this.o.client.change(uri, model.getVersionId(), model.getValue())),
    );
    const known = this.diagnostics.get(uri);
    if (known) this.applyMarkers(model, known);
  }

  private detach(model: monaco.editor.ITextModel): void {
    const listener = this.modelListeners.get(model.id);
    if (!listener) return;
    listener.dispose();
    this.modelListeners.delete(model.id);
    this.shadowModels.delete(model);
    const path = this.modelPath(model);
    if (path === null) return;
    const uri = this.serverUri(path);
    // 같은 경로의 다른 모델이 남아 있으면(문서가 모델을 바꿔 끼운 경우) 닫지 않는다
    const other = monaco.editor.getModels().find((m) => m !== model && !m.isDisposed() && this.tracks(m) && this.modelPath(m) === path);
    if (!other) this.o.client.close(uri);
  }

  /** 결과의 다른 파일에 모델이 없으면 디스크에서 읽어 만든다 */
  private async ensureModels(uris: monaco.Uri[]): Promise<void> {
    const missing = [...new Map(uris.map((u) => [u.toString(), u])).values()].filter((u) => !monaco.editor.getModel(u));
    await Promise.all(
      missing.map(async (uri) => {
        const path = uri.path.replace(/^\//, "");
        let text: string;
        try {
          text = await this.o.readFile(path);
        } catch {
          return;
        }
        if (monaco.editor.getModel(uri)) return;
        const model = monaco.editor.createModel(text, this.o.languageId, uri);
        this.shadowModels.add(model);
      }),
    );
  }

  private doc(model: monaco.editor.ITextModel): lsp.TextDocumentIdentifier {
    return { uri: this.serverUri(this.modelPath(model) ?? "") };
  }

  private registerProviders(): monaco.IDisposable[] {
    const id = this.o.languageId;
    const client = this.o.client;
    const caps = client.capabilities;
    const out: monaco.IDisposable[] = [];
    const ready = (model: monaco.editor.ITextModel) => client.isRunning && this.tracks(model);

    if (caps.completionProvider) {
      const resolve = !!caps.completionProvider.resolveProvider;
      out.push(
        monaco.languages.registerCompletionItemProvider(id, {
          triggerCharacters: caps.completionProvider.triggerCharacters ?? [".", ":"],
          provideCompletionItems: async (model, position, context, token) => {
            if (!ready(model)) return { suggestions: [] };
            const word = model.getWordUntilPosition(position);
            const full = model.getWordAtPosition(position);
            const range = {
              insert: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, position.column),
              replace: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, full?.endColumn ?? position.column),
            };
            const lspContext: lsp.CompletionContext = { triggerKind: (context.triggerKind + 1) as lsp.CompletionTriggerKind };
            if (context.triggerCharacter) lspContext.triggerCharacter = context.triggerCharacter;
            const result = await client.request<lsp.CompletionList | lsp.CompletionItem[] | null>("textDocument/completion", { textDocument: this.doc(model), position: fromPosition(position), context: lspContext }, token);
            const { items, incomplete } = completionItems(result);
            return {
              incomplete,
              suggestions: items.map((item) => {
                const converted = toCompletionItem(item, range);
                this.lspItems.set(converted, item);
                return converted;
              }),
            };
          },
          resolveCompletionItem: resolve
            ? async (item, token) => {
                const original = this.lspItems.get(item);
                if (!original || !client.isRunning) return item;
                const resolved = await client.request<lsp.CompletionItem>("completionItem/resolve", original, token);
                const converted = toCompletionItem(resolved, item.range);
                return { ...item, detail: converted.detail ?? item.detail, documentation: converted.documentation ?? item.documentation, additionalTextEdits: converted.additionalTextEdits ?? item.additionalTextEdits };
              }
            : undefined,
        }),
      );
    }

    if (caps.hoverProvider) {
      out.push(
        monaco.languages.registerHoverProvider(id, {
          provideHover: async (model, position, token) => {
            if (!ready(model)) return null;
            return toHover(await client.request<lsp.Hover | null>("textDocument/hover", { textDocument: this.doc(model), position: fromPosition(position) }, token));
          },
        }),
      );
    }

    if (caps.signatureHelpProvider) {
      out.push(
        monaco.languages.registerSignatureHelpProvider(id, {
          signatureHelpTriggerCharacters: caps.signatureHelpProvider.triggerCharacters ?? ["(", ","],
          signatureHelpRetriggerCharacters: caps.signatureHelpProvider.retriggerCharacters ?? [","],
          provideSignatureHelp: async (model, position, token, context) => {
            if (!ready(model)) return null;
            const help = await client.request<lsp.SignatureHelp | null>(
              "textDocument/signatureHelp",
              {
                textDocument: this.doc(model),
                position: fromPosition(position),
                context: { triggerKind: context.triggerKind as lsp.SignatureHelpTriggerKind, triggerCharacter: context.triggerCharacter, isRetrigger: context.isRetrigger },
              },
              token,
            );
            const value = toSignatureHelp(help);
            return value ? { value, dispose() {} } : null;
          },
        }),
      );
    }

    if (caps.definitionProvider) {
      out.push(
        monaco.languages.registerDefinitionProvider(id, {
          provideDefinition: async (model, position, token) => {
            if (!ready(model)) return null;
            const result = await client.request<lsp.Location | lsp.Location[] | lsp.LocationLink[] | null>("textDocument/definition", { textDocument: this.doc(model), position: fromPosition(position) }, token);
            const locations = toLocations(result, (u) => this.modelUri(u));
            await this.ensureModels(locations.map((l) => l.uri));
            return locations;
          },
        }),
      );
    }

    if (caps.referencesProvider) {
      out.push(
        monaco.languages.registerReferenceProvider(id, {
          provideReferences: async (model, position, context, token) => {
            if (!ready(model)) return null;
            const result = await client.request<lsp.Location[] | null>("textDocument/references", { textDocument: this.doc(model), position: fromPosition(position), context: { includeDeclaration: context.includeDeclaration } }, token);
            const locations = toLocations(result, (u) => this.modelUri(u));
            await this.ensureModels(locations.map((l) => l.uri));
            return locations;
          },
        }),
      );
    }

    if (caps.documentHighlightProvider) {
      out.push(
        monaco.languages.registerDocumentHighlightProvider(id, {
          provideDocumentHighlights: async (model, position, token) => {
            if (!ready(model)) return null;
            return toHighlights(await client.request<lsp.DocumentHighlight[] | null>("textDocument/documentHighlight", { textDocument: this.doc(model), position: fromPosition(position) }, token));
          },
        }),
      );
    }

    if (caps.documentSymbolProvider) {
      out.push(
        monaco.languages.registerDocumentSymbolProvider(id, {
          displayName: "LuaLS",
          provideDocumentSymbols: async (model, token) => {
            if (!ready(model)) return null;
            return toDocumentSymbols(await client.request<lsp.DocumentSymbol[] | lsp.SymbolInformation[] | null>("textDocument/documentSymbol", { textDocument: this.doc(model) }, token));
          },
        }),
      );
    }

    if (caps.renameProvider) {
      const prepare = typeof caps.renameProvider === "object" && !!caps.renameProvider.prepareProvider;
      out.push(
        monaco.languages.registerRenameProvider(id, {
          provideRenameEdits: async (model, position, newName, token) => {
            if (!ready(model)) return { edits: [] };
            const result = await client.request<lsp.WorkspaceEdit | null>("textDocument/rename", { textDocument: this.doc(model), position: fromPosition(position), newName }, token);
            const files = workspaceEditFiles(result);
            if (!files) return { edits: [], rejectReason: "파일을 만들거나 지우는 이름 바꾸기는 지원하지 않습니다" };
            const paths = [...files.keys()].map((u) => this.projectPath(u)).filter((p): p is string => p !== null);
            const outside = files.size - paths.length;
            if (outside > 0) return { edits: [], rejectReason: `프로젝트 밖의 파일 ${outside}개를 변경해야 해서 이름을 바꾸지 않았습니다` };
            await this.o.openForEdit(paths.filter((p) => p !== this.modelPath(model)));
            return toWorkspaceEdit(files, (u) => this.modelUri(u));
          },
          resolveRenameLocation: prepare
            ? async (model, position, token) => {
                if (!ready(model)) return { range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: "", rejectReason: "언어 서버가 준비되지 않았습니다" };
                const result = await client.request<lsp.PrepareRenameResult | null>("textDocument/prepareRename", { textDocument: this.doc(model), position: fromPosition(position) }, token);
                const word = model.getWordAtPosition(position);
                const wordRange = word ? new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) : null;
                if (!result) return { range: wordRange ?? new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: "", rejectReason: "이 위치의 이름은 바꿀 수 없습니다" };
                if ("defaultBehavior" in result) return wordRange && word ? { range: wordRange, text: word.word } : { range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: "", rejectReason: "이 위치의 이름은 바꿀 수 없습니다" };
                if ("placeholder" in result) return { range: toRange(result.range), text: result.placeholder };
                const range = toRange(result);
                return { range, text: model.getValueInRange(range) };
              }
            : undefined,
        }),
      );
    }
    return out;
  }
}
