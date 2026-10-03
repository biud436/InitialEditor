// LSP 의 JSON-RPC 2.0 연결 (docs/plans/language-server.md 4절). 전송은 메시지 단위(JSON 문자열)라서
// Content-Length 머리는 전송 쪽(Tauri 셸, 워커)이 다룬다. 요청과 응답의 짝, 알림, 서버가 거는 요청, 취소($/cancelRequest)만 한다.

/** 메시지 하나씩 주고받는 통로. 끝나면 onClose 가 한 번 불린다 */
export interface MessageTransport {
  send(text: string): void;
  onMessage(listener: (text: string) => void): () => void;
  onClose(listener: (reason: string) => void): () => void;
  close(): void;
}

/** 요청을 그만둘 때 (Monaco 의 CancellationToken 과 같은 모양) */
export interface CancelToken {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

export class ResponseError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

/** 요청을 취소해서 끝났다 (LSP 의 RequestCancelled) */
export const REQUEST_CANCELLED = -32800;
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

type Id = number | string;

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  method: string;
}

type RequestHandler = (params: unknown) => unknown;
type NotificationHandler = (params: unknown) => void;

export class RpcConnection {
  private nextId = 0;
  private readonly pending = new Map<Id, Pending>();
  private readonly requestHandlers = new Map<string, RequestHandler>();
  private readonly notificationHandlers = new Map<string, NotificationHandler>();
  private closedReason: string | null = null;
  private readonly closeListeners = new Set<(reason: string) => void>();
  private readonly offs: Array<() => void>;

  constructor(
    private readonly transport: MessageTransport,
    private readonly onProtocolError: (message: string) => void = () => {},
  ) {
    this.offs = [transport.onMessage((text) => this.receive(text)), transport.onClose((reason) => this.closed(reason))];
  }

  get isClosed(): boolean {
    return this.closedReason !== null;
  }

  request<R>(method: string, params: unknown, token?: CancelToken): Promise<R> {
    if (this.closedReason !== null) return Promise.reject(new Error(`언어 서버 연결이 끊겼습니다: ${this.closedReason}`));
    const id = ++this.nextId;
    return new Promise<R>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, method });
      if (token) {
        if (token.isCancellationRequested) {
          this.pending.delete(id);
          reject(new ResponseError(REQUEST_CANCELLED, "취소됨"));
          return;
        }
        const sub = token.onCancellationRequested(() => {
          sub.dispose();
          if (this.pending.has(id) && this.closedReason === null) this.write({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } });
        });
      }
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    if (this.closedReason !== null) return;
    this.write({ jsonrpc: "2.0", method, params });
  }

  onRequest(method: string, handler: RequestHandler): void {
    this.requestHandlers.set(method, handler);
  }

  onNotification(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.set(method, handler);
  }

  onClose(listener: (reason: string) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  /** 전송을 닫는다. 남은 요청은 실패로 끝난다 */
  dispose(): void {
    this.transport.close();
    this.closed("연결을 닫았습니다");
  }

  private write(message: object): void {
    this.transport.send(JSON.stringify(message));
  }

  private receive(text: string): void {
    let message: { id?: Id | null; method?: string; params?: unknown; result?: unknown; error?: { code: number; message: string; data?: unknown } };
    try {
      message = JSON.parse(text);
    } catch {
      this.onProtocolError(`언어 서버가 JSON 이 아닌 메시지를 보냈습니다: ${text.slice(0, 80)}`);
      return;
    }
    if (typeof message.method === "string") {
      if (message.id !== undefined && message.id !== null) this.answer(message.id, message.method, message.params);
      else {
        try {
          this.notificationHandlers.get(message.method)?.(message.params);
        } catch (e) {
          this.onProtocolError(`알림 처리 실패 (${message.method}): ${(e as Error)?.message ?? String(e)}`);
        }
      }
      return;
    }
    if (message.id === undefined || message.id === null) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) pending.reject(new ResponseError(message.error.code, message.error.message, message.error.data));
    else pending.resolve(message.result ?? null);
  }

  private answer(id: Id, method: string, params: unknown): void {
    const handler = this.requestHandlers.get(method);
    if (!handler) {
      this.write({ jsonrpc: "2.0", id, error: { code: METHOD_NOT_FOUND, message: `처리하지 않는 요청: ${method}` } });
      return;
    }
    Promise.resolve()
      .then(() => handler(params))
      .then(
        (result) => this.closedReason === null && this.write({ jsonrpc: "2.0", id, result: result ?? null }),
        (e: unknown) => this.closedReason === null && this.write({ jsonrpc: "2.0", id, error: { code: INTERNAL_ERROR, message: (e as Error)?.message ?? String(e) } }),
      );
  }

  private closed(reason: string): void {
    if (this.closedReason !== null) return;
    this.closedReason = reason;
    for (const off of this.offs) off();
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const p of pending) p.reject(new Error(`언어 서버 연결이 끊겼습니다 (${p.method}): ${reason}`));
    for (const listener of this.closeListeners) listener(reason);
  }
}
