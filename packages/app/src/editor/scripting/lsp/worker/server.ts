// 워커 안의 작은 언어 서버 (docs/plans/language-server.md 8절 단계 2). 연결은 에디터 쪽과 같은 RpcConnection 이다.
//   열린 문서: 바뀔 때마다 분석해 구문 오류를 보내고(publishDiagnostics) 기호를 색인에 넣는다.
//   작업 공간: initialized 뒤 에디터에 프로젝트의 스크립트(initial/workspaceFiles)를 물어 색인을 만들고,
//              디스크 변경(didChangeWatchedFiles)은 initial/readFile 로 다시 읽는다.
//   요청: 문서 기호, 정의(낱말의 끝 이름으로 지금 문서와 색인을 찾는다), 완성(지금 문서의 이름과 다른 파일의 클래스, 모듈, 상수.
//         엔진 API 는 에디터의 명세 공급자가 준다).
// 구문 오류가 있어 기호를 못 뽑은 글은 색인에 마지막으로 성공한 기호를 남긴다.

import type * as lsp from "vscode-languageserver-protocol";
import type { RpcConnection } from "../rpc";
import { flattenSymbols, wordAt, type AnalyzedSymbol, type Analysis, type Analyzer } from "./analysis";
import { READ_FILE, WORKSPACE_FILES, type WorkspaceFile } from "./protocol";

const COMPLETION_KIND: Record<number, lsp.CompletionItemKind> = { 2: 9, 5: 7, 6: 2, 12: 3, 14: 21 };
/**
 * 다른 파일에서 완성에 더하는 기호의 종류: 모듈, 클래스, 상수. 함수와 메서드는 대개 받는 쪽(M.add, obj.update)을 붙여 부르고,
 * 씬 파일마다 정의하는 씬 함수(Update, update)가 씬 계약 스니펫과 겹치므로 지금 문서의 것만 더한다
 */
const OTHER_FILE_KINDS = new Set<number>([2, 5, 14]);
const MAX_COMPLETIONS = 500;

export class AnalyzerServer {
  private readonly open = new Map<string, { text: string; analysis: Analysis }>();
  /** URI 마다 마지막으로 뽑은 기호 (열린 문서와 작업 공간) */
  private readonly index = new Map<string, AnalyzedSymbol[]>();
  private analyzer: Analyzer | null = null;
  private exitHandler: () => void = () => {};

  constructor(
    private readonly conn: RpcConnection,
    private readonly load: () => Promise<Analyzer>,
    private readonly info: { name: string; version?: string },
  ) {}

  /** exit 알림을 받으면 부른다 (워커를 닫는다) */
  onExit(handler: () => void): void {
    this.exitHandler = handler;
  }

  install(): void {
    const c = this.conn;
    c.onRequest("initialize", async () => {
      this.analyzer = await this.load();
      return {
        capabilities: {
          textDocumentSync: 1,
          documentSymbolProvider: true,
          definitionProvider: true,
          completionProvider: { triggerCharacters: [] },
        },
        serverInfo: this.info,
      } satisfies lsp.InitializeResult;
    });
    c.onNotification("initialized", () => void this.loadWorkspace());
    c.onRequest("shutdown", () => null);
    c.onNotification("exit", () => this.exitHandler());
    c.onNotification("textDocument/didOpen", (p) => {
      const { textDocument } = p as lsp.DidOpenTextDocumentParams;
      this.update(textDocument.uri, textDocument.text);
    });
    c.onNotification("textDocument/didChange", (p) => {
      const { textDocument, contentChanges } = p as lsp.DidChangeTextDocumentParams;
      const last = contentChanges[contentChanges.length - 1];
      if (last && !("range" in last)) this.update(textDocument.uri, last.text);
    });
    c.onNotification("textDocument/didClose", (p) => {
      const { textDocument } = p as lsp.DidCloseTextDocumentParams;
      this.open.delete(textDocument.uri);
      this.conn.notify("textDocument/publishDiagnostics", { uri: textDocument.uri, diagnostics: [] });
    });
    c.onNotification("workspace/didChangeWatchedFiles", (p) => void this.filesChanged((p as lsp.DidChangeWatchedFilesParams).changes));
    c.onNotification("workspace/didChangeConfiguration", () => {});
    c.onRequest("textDocument/documentSymbol", (p) => this.documentSymbols((p as lsp.DocumentSymbolParams).textDocument.uri));
    c.onRequest("textDocument/definition", (p) => this.definition(p as lsp.DefinitionParams));
    c.onRequest("textDocument/completion", (p) => this.completion(p as lsp.CompletionParams));
  }

  /** 분석기가 예상 밖의 예외를 던지면 그 글은 진단도 기호도 없는 것으로 본다 (워커를 살려 둔다) */
  private analyze(text: string): Analysis {
    if (!this.analyzer) return { diagnostics: [], symbols: [] };
    try {
      return this.analyzer.analyze(text);
    } catch {
      return { diagnostics: [], symbols: [] };
    }
  }

  private remember(uri: string, analysis: Analysis): void {
    if (analysis.symbols.length || !analysis.diagnostics.length) this.index.set(uri, analysis.symbols);
  }

  private update(uri: string, text: string): void {
    const analysis = this.analyze(text);
    this.open.set(uri, { text, analysis });
    this.remember(uri, analysis);
    this.conn.notify("textDocument/publishDiagnostics", { uri, diagnostics: analysis.diagnostics });
  }

  private async loadWorkspace(): Promise<void> {
    let files: WorkspaceFile[];
    try {
      files = await this.conn.request<WorkspaceFile[]>(WORKSPACE_FILES, {});
    } catch {
      return;
    }
    for (const f of files) if (!this.open.has(f.uri)) this.remember(f.uri, this.analyze(f.text));
  }

  private async filesChanged(changes: lsp.FileEvent[]): Promise<void> {
    for (const change of changes) {
      if (this.open.has(change.uri)) continue;
      if (change.type === 3) {
        this.index.delete(change.uri);
        continue;
      }
      try {
        const text = await this.conn.request<string | null>(READ_FILE, { uri: change.uri });
        if (text !== null) this.remember(change.uri, this.analyze(text));
      } catch {
        // 읽지 못한 파일은 색인에서 그대로 둔다
      }
    }
  }

  /** 문서의 기호. 쓰는 중이라 구문 오류가 나서 뽑지 못했으면 마지막으로 뽑은 것 */
  private symbolsOf(uri: string): AnalyzedSymbol[] {
    return this.index.get(uri) ?? this.open.get(uri)?.analysis.symbols ?? [];
  }

  private documentSymbols(uri: string): lsp.DocumentSymbol[] {
    const toLsp = (s: AnalyzedSymbol): lsp.DocumentSymbol => ({ name: s.name, kind: s.kind, range: s.range, selectionRange: s.selectionRange, children: s.children.map(toLsp) });
    return this.symbolsOf(uri).map(toLsp);
  }

  private definition(p: lsp.DefinitionParams): lsp.Location[] {
    const doc = this.open.get(p.textDocument.uri);
    if (!doc) return [];
    const at = wordAt(doc.text, p.position);
    if (!at) return [];
    const here = flattenSymbols(this.symbolsOf(p.textDocument.uri)).filter((s) => s.key === at.word);
    if (here.length) return here.map((s) => ({ uri: p.textDocument.uri, range: s.selectionRange }));
    const out: lsp.Location[] = [];
    for (const [uri, symbols] of this.index) {
      if (uri === p.textDocument.uri) continue;
      for (const s of flattenSymbols(symbols)) if (s.key === at.word) out.push({ uri, range: s.selectionRange });
    }
    return out;
  }

  private completion(p: lsp.CompletionParams): lsp.CompletionList {
    const doc = this.open.get(p.textDocument.uri);
    if (!doc) return { isIncomplete: false, items: [] };
    // 받는 쪽 뒤(. : ::)의 멤버는 명세 공급자가 준다
    const line = doc.text.split("\n")[p.position.line] ?? "";
    if (/[.:]\s*[A-Za-z0-9_]*$/.test(line.slice(0, p.position.character))) return { isIncomplete: false, items: [] };
    const seen = new Map<string, lsp.CompletionItem>();
    const add = (s: AnalyzedSymbol, uri: string) => {
      if (seen.has(s.key) || seen.size >= MAX_COMPLETIONS) return;
      seen.set(s.key, { label: s.key, kind: COMPLETION_KIND[s.kind] ?? 3, detail: s.name === s.key ? fileName(uri) : `${s.name} (${fileName(uri)})`, sortText: `2${s.key}` });
    };
    for (const s of flattenSymbols(this.symbolsOf(p.textDocument.uri))) add(s, p.textDocument.uri);
    for (const [uri, symbols] of this.index) {
      if (uri === p.textDocument.uri) continue;
      for (const s of flattenSymbols(symbols)) if (OTHER_FILE_KINDS.has(s.kind)) add(s, uri);
    }
    return { isIncomplete: false, items: [...seen.values()] };
  }
}

function fileName(uri: string): string {
  return decodeURIComponent(uri.slice(uri.lastIndexOf("/") + 1));
}
