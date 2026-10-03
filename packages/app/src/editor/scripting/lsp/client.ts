// LSP 클라이언트의 수명과 문서 동기화 (docs/plans/language-server.md 4절). Monaco 를 모른다:
// 문서는 file URI 와 글로 열고 바꾸고 닫으며, Monaco 쪽은 binding.ts 가 잇는다.
//   시작: initialize → initialized. 서버가 묻는 설정(workspace/configuration)은 settings() 가 답한다.
//   문서: didOpen, didChange(언제나 전체 글), didClose. 바뀐 글은 모아 두었다가 요청 직전이나 잠깐 뒤에 보낸다.
//   끝: shutdown → exit. 서버가 먼저 끝나면 onClose 로 알린다.

import type * as lsp from "vscode-languageserver-protocol";
import { RpcConnection, type CancelToken, type MessageTransport } from "./rpc";

export interface ClientOptions {
  /** 서버가 볼 작업 공간의 절대 경로 */
  root: string;
  rootUri: string;
  /** 서버가 설정의 한 갈래(section)를 물을 때의 답. 모르는 갈래는 null */
  settings(section: string): unknown;
  /** 서버의 로그와 알림 (window/logMessage, window/showMessage) */
  onLog?(type: number, message: string): void;
  onDiagnostics?(params: lsp.PublishDiagnosticsParams): void;
  /** 바뀐 글을 모았다가 보내는 시간 (ms) */
  changeDelay?: number;
}

/** 클라이언트가 처리하는 기능 (initialize 의 capabilities) */
export const CLIENT_CAPABILITIES: lsp.ClientCapabilities = {
  general: { positionEncodings: ["utf-16"] },
  workspace: { configuration: true, workspaceFolders: true, didChangeConfiguration: { dynamicRegistration: false }, didChangeWatchedFiles: { dynamicRegistration: false } },
  window: { workDoneProgress: false, showMessage: {} },
  textDocument: {
    synchronization: { didSave: false, willSave: false, dynamicRegistration: false },
    publishDiagnostics: { relatedInformation: false, tagSupport: { valueSet: [1, 2] }, versionSupport: false },
    completion: {
      contextSupport: true,
      completionItem: {
        snippetSupport: true,
        documentationFormat: ["markdown", "plaintext"],
        insertReplaceSupport: true,
        labelDetailsSupport: true,
        deprecatedSupport: true,
        tagSupport: { valueSet: [1] },
        resolveSupport: { properties: ["documentation", "detail", "additionalTextEdits"] },
      },
    },
    hover: { contentFormat: ["markdown", "plaintext"] },
    signatureHelp: { signatureInformation: { documentationFormat: ["markdown", "plaintext"], parameterInformation: { labelOffsetSupport: true }, activeParameterSupport: true }, contextSupport: true },
    definition: { linkSupport: true },
    references: {},
    documentHighlight: {},
    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
    rename: { prepareSupport: true },
  },
};

interface OpenDocument {
  languageId: string;
  version: number;
  text: string;
  /** 서버에 아직 보내지 않은 글이 있다 */
  dirty: boolean;
}

export class LanguageClient {
  readonly connection: RpcConnection;
  capabilities: lsp.ServerCapabilities = {};
  serverInfo: { name: string; version?: string } | null = null;
  private readonly docs = new Map<string, OpenDocument>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private stopping = false;

  constructor(
    transport: MessageTransport,
    private readonly options: ClientOptions,
  ) {
    this.connection = new RpcConnection(transport, (message) => options.onLog?.(1, message));
    const c = this.connection;
    c.onRequest("workspace/configuration", (params) => (params as lsp.ConfigurationParams).items.map((item) => options.settings(item.section ?? "")));
    c.onRequest("workspace/workspaceFolders", () => [{ uri: options.rootUri, name: lastSegment(options.root) }]);
    c.onRequest("client/registerCapability", () => null);
    c.onRequest("client/unregisterCapability", () => null);
    c.onRequest("window/showMessageRequest", () => null);
    c.onRequest("window/workDoneProgress/create", () => null);
    c.onNotification("window/logMessage", (p) => options.onLog?.((p as lsp.LogMessageParams).type, (p as lsp.LogMessageParams).message));
    c.onNotification("window/showMessage", (p) => options.onLog?.((p as lsp.ShowMessageParams).type, (p as lsp.ShowMessageParams).message));
    c.onNotification("textDocument/publishDiagnostics", (p) => options.onDiagnostics?.(p as lsp.PublishDiagnosticsParams));
  }

  get isRunning(): boolean {
    return this.started && !this.stopping && !this.connection.isClosed;
  }

  async start(): Promise<lsp.InitializeResult> {
    const o = this.options;
    const params: lsp.InitializeParams = {
      processId: null,
      clientInfo: { name: "InitialEditor" },
      locale: "en",
      rootPath: o.root,
      rootUri: o.rootUri,
      workspaceFolders: [{ uri: o.rootUri, name: lastSegment(o.root) }],
      capabilities: CLIENT_CAPABILITIES,
    };
    const result = await this.connection.request<lsp.InitializeResult>("initialize", params);
    this.capabilities = result.capabilities ?? {};
    this.serverInfo = result.serverInfo ?? null;
    this.connection.notify("initialized", {});
    this.started = true;
    for (const [uri, doc] of this.docs) this.sendOpen(uri, doc);
    return result;
  }

  /** 설정이 바뀌었다고 알린다. 서버는 workspace/configuration 으로 다시 묻는다 */
  configurationChanged(): void {
    if (this.isRunning) this.connection.notify("workspace/didChangeConfiguration", { settings: null });
  }

  open(uri: string, languageId: string, version: number, text: string): void {
    const doc: OpenDocument = { languageId, version, text, dirty: false };
    this.docs.set(uri, doc);
    if (this.started) this.sendOpen(uri, doc);
  }

  change(uri: string, version: number, text: string): void {
    const doc = this.docs.get(uri);
    if (!doc) return;
    doc.version = version;
    doc.text = text;
    doc.dirty = true;
    if (this.flushTimer === null) this.flushTimer = setTimeout(() => this.flush(), this.options.changeDelay ?? 150);
  }

  close(uri: string): void {
    const doc = this.docs.get(uri);
    if (!doc) return;
    this.docs.delete(uri);
    if (this.started) this.connection.notify("textDocument/didClose", { textDocument: { uri } });
  }

  isOpen(uri: string): boolean {
    return this.docs.has(uri);
  }

  /** 디스크의 파일이 바뀌었다 (열린 문서가 아닌 것도) */
  filesChanged(changes: lsp.FileEvent[]): void {
    if (this.isRunning && changes.length) this.connection.notify("workspace/didChangeWatchedFiles", { changes });
  }

  /** 모아 둔 글을 보낸다 */
  flush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.started) return;
    for (const [uri, doc] of this.docs) {
      if (!doc.dirty) continue;
      doc.dirty = false;
      this.connection.notify("textDocument/didChange", { textDocument: { uri, version: doc.version }, contentChanges: [{ text: doc.text }] });
    }
  }

  /** 요청. 문서에 대한 요청 전에는 모아 둔 글을 먼저 보낸다 */
  request<R>(method: string, params: unknown, token?: CancelToken): Promise<R> {
    this.flush();
    return this.connection.request<R>(method, params, token);
  }

  /** shutdown 과 exit 를 보내고 연결을 닫는다. 서버가 답하지 않아도 timeoutMs 뒤에 닫는다 */
  async stop(timeoutMs = 2000): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    if (this.started && !this.connection.isClosed) {
      await Promise.race([this.connection.request("shutdown", null).catch(() => null), new Promise((r) => setTimeout(r, timeoutMs))]);
      this.connection.notify("exit", null);
    }
    this.connection.dispose();
  }

  private sendOpen(uri: string, doc: OpenDocument): void {
    doc.dirty = false;
    this.connection.notify("textDocument/didOpen", { textDocument: { uri, languageId: doc.languageId, version: doc.version, text: doc.text } });
  }
}

function lastSegment(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
