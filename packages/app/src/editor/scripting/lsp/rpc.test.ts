import { describe, expect, it } from "vitest";
import { LanguageClient } from "./client";
import { REQUEST_CANCELLED, ResponseError, RpcConnection, type CancelToken, type MessageTransport } from "./rpc";

/** 서버 쪽을 손으로 움직이는 전송 */
class FakeTransport implements MessageTransport {
  sent: Array<Record<string, unknown>> = [];
  private messageListeners = new Set<(text: string) => void>();
  private closeListeners = new Set<(reason: string) => void>();
  closed = false;
  /** 보낸 메시지에 자동으로 답한다 (method → result) */
  autoReply = new Map<string, unknown>();

  send(text: string): void {
    const message = JSON.parse(text) as Record<string, unknown>;
    this.sent.push(message);
    const method = message.method as string | undefined;
    if (message.id !== undefined && method && this.autoReply.has(method)) {
      queueMicrotask(() => this.deliver({ jsonrpc: "2.0", id: message.id, result: this.autoReply.get(method) }));
    }
  }
  onMessage(listener: (text: string) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }
  onClose(listener: (reason: string) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }
  close(): void {
    this.end("닫음");
  }
  end(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const l of this.closeListeners) l(reason);
  }
  deliver(message: object): void {
    for (const l of this.messageListeners) l(JSON.stringify(message));
  }
  methods(): string[] {
    return this.sent.map((m) => (m.method as string) ?? `response:${String(m.id)}`);
  }
}

function token(): CancelToken & { cancel(): void } {
  const listeners = new Set<() => void>();
  let cancelled = false;
  return {
    get isCancellationRequested() {
      return cancelled;
    },
    onCancellationRequested(listener) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    cancel() {
      cancelled = true;
      for (const l of listeners) l();
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("RpcConnection", () => {
  it("요청과 응답을 id 로 짝짓고 오류는 ResponseError 로", async () => {
    const t = new FakeTransport();
    const rpc = new RpcConnection(t);
    const a = rpc.request("a", { x: 1 });
    const b = rpc.request("b", null);
    expect(t.sent.map((m) => [m.id, m.method])).toEqual([
      [1, "a"],
      [2, "b"],
    ]);
    t.deliver({ jsonrpc: "2.0", id: 2, error: { code: -32601, message: "없다" } });
    t.deliver({ jsonrpc: "2.0", id: 1, result: { ok: true } });
    await expect(a).resolves.toEqual({ ok: true });
    await expect(b).rejects.toBeInstanceOf(ResponseError);
  });

  it("서버의 요청에 답하고, 모르는 요청은 method not found", async () => {
    const t = new FakeTransport();
    const rpc = new RpcConnection(t);
    rpc.onRequest("workspace/configuration", (p) => (p as { items: unknown[] }).items.map(() => 7));
    t.deliver({ jsonrpc: "2.0", id: "s1", method: "workspace/configuration", params: { items: [{}, {}] } });
    t.deliver({ jsonrpc: "2.0", id: "s2", method: "nope", params: null });
    await tick();
    expect(t.sent).toContainEqual({ jsonrpc: "2.0", id: "s1", result: [7, 7] });
    expect(t.sent.find((m) => m.id === "s2")).toMatchObject({ error: { code: -32601 } });
  });

  it("알림을 처리기로 넘긴다", () => {
    const t = new FakeTransport();
    const rpc = new RpcConnection(t);
    const got: unknown[] = [];
    rpc.onNotification("textDocument/publishDiagnostics", (p) => got.push(p));
    t.deliver({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri: "file:///a.lua", diagnostics: [] } });
    expect(got).toEqual([{ uri: "file:///a.lua", diagnostics: [] }]);
  });

  it("취소하면 $/cancelRequest 를 보내고, 이미 취소된 토큰이면 보내지 않고 실패한다", async () => {
    const t = new FakeTransport();
    const rpc = new RpcConnection(t);
    const tk = token();
    const p = rpc.request("slow", null, tk);
    tk.cancel();
    expect(t.sent[1]).toEqual({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 1 } });
    t.deliver({ jsonrpc: "2.0", id: 1, error: { code: REQUEST_CANCELLED, message: "cancelled" } });
    await expect(p).rejects.toMatchObject({ code: REQUEST_CANCELLED });

    const done = token();
    done.cancel();
    await expect(rpc.request("x", null, done)).rejects.toMatchObject({ code: REQUEST_CANCELLED });
    expect(t.sent).toHaveLength(2);
  });

  it("전송이 닫히면 남은 요청이 실패하고 이후 요청도 실패한다", async () => {
    const t = new FakeTransport();
    const rpc = new RpcConnection(t);
    const reasons: string[] = [];
    rpc.onClose((r) => reasons.push(r));
    const p = rpc.request("a", null);
    t.end("서버 종료");
    await expect(p).rejects.toThrow("서버 종료");
    await expect(rpc.request("b", null)).rejects.toThrow("끊겼습니다");
    expect(reasons).toEqual(["서버 종료"]);
    expect(rpc.isClosed).toBe(true);
  });

  it("알림 처리기가 던져도 연결은 산다", async () => {
    const t = new FakeTransport();
    const errors: string[] = [];
    const rpc = new RpcConnection(t, (m) => errors.push(m));
    rpc.onNotification("boom", () => {
      throw new Error("터졌다");
    });
    t.deliver({ jsonrpc: "2.0", method: "boom", params: null });
    expect(errors[0]).toContain("boom");
    const p = rpc.request("after", null);
    t.deliver({ jsonrpc: "2.0", id: 1, result: 7 });
    await expect(p).resolves.toBe(7);
  });

  it("JSON 이 아닌 메시지는 알리고 무시한다", () => {
    const t = new FakeTransport();
    const errors: string[] = [];
    new RpcConnection(t, (m) => errors.push(m));
    for (const l of (t as unknown as { messageListeners: Set<(s: string) => void> }).messageListeners) l("not json");
    expect(errors[0]).toContain("JSON");
  });
});

describe("LanguageClient", () => {
  function client(t: FakeTransport) {
    t.autoReply.set("initialize", { capabilities: { completionProvider: { triggerCharacters: ["."] } }, serverInfo: { name: "fake", version: "1.0" } });
    t.autoReply.set("shutdown", null);
    const diagnostics: unknown[] = [];
    const c = new LanguageClient(t, {
      root: "/proj",
      rootUri: "file:///proj",
      settings: (section) => (section === "Lua" ? { runtime: { version: "Lua 5.3" } } : null),
      onDiagnostics: (p) => diagnostics.push(p),
      changeDelay: 5,
    });
    return { c, diagnostics };
  }

  it("initialize 다음 initialized, 그 전에 연 문서는 시작한 뒤에 didOpen", async () => {
    const t = new FakeTransport();
    const { c } = client(t);
    c.open("file:///proj/a.lua", "lua", 1, "print(1)");
    expect(t.sent).toHaveLength(0);
    const result = await c.start();
    expect(result.serverInfo?.version).toBe("1.0");
    expect(t.methods()).toEqual(["initialize", "initialized", "textDocument/didOpen"]);
    const init = t.sent[0].params as { rootUri: string; capabilities: { textDocument: { completion: unknown } } };
    expect(init.rootUri).toBe("file:///proj");
    expect(init.capabilities.textDocument.completion).toBeTruthy();
    expect(c.capabilities.completionProvider?.triggerCharacters).toEqual(["."]);
  });

  it("바뀐 글은 모았다가 한 번에 보내고, 요청 전에는 먼저 보낸다", async () => {
    const t = new FakeTransport();
    const { c } = client(t);
    await c.start();
    c.open("file:///proj/a.lua", "lua", 1, "a");
    c.change("file:///proj/a.lua", 2, "ab");
    c.change("file:///proj/a.lua", 3, "abc");
    const req = c.request("textDocument/hover", { textDocument: { uri: "file:///proj/a.lua" } });
    const changes = t.sent.filter((m) => m.method === "textDocument/didChange");
    expect(changes).toHaveLength(1);
    expect(changes[0].params).toEqual({ textDocument: { uri: "file:///proj/a.lua", version: 3 }, contentChanges: [{ text: "abc" }] });
    expect(t.methods().slice(-2)).toEqual(["textDocument/didChange", "textDocument/hover"]);
    t.deliver({ jsonrpc: "2.0", id: (t.sent.at(-1) as { id: number }).id, result: null });
    await req;

    c.change("file:///proj/a.lua", 4, "abcd");
    await new Promise((r) => setTimeout(r, 20));
    expect(t.sent.filter((m) => m.method === "textDocument/didChange")).toHaveLength(2);
    c.close("file:///proj/a.lua");
    expect(t.methods().at(-1)).toBe("textDocument/didClose");
    expect(c.isOpen("file:///proj/a.lua")).toBe(false);
  });

  it("설정 요청에 갈래마다 답하고, 진단 알림을 넘긴다", async () => {
    const t = new FakeTransport();
    const { c, diagnostics } = client(t);
    await c.start();
    t.deliver({ jsonrpc: "2.0", id: 99, method: "workspace/configuration", params: { items: [{ section: "Lua" }, { section: "files.exclude" }] } });
    t.deliver({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri: "file:///proj/a.lua", diagnostics: [] } });
    await tick();
    expect(t.sent.find((m) => m.id === 99)).toEqual({ jsonrpc: "2.0", id: 99, result: [{ runtime: { version: "Lua 5.3" } }, null] });
    expect(diagnostics).toHaveLength(1);
  });

  it("끄면 shutdown 과 exit 를 보내고 전송을 닫는다", async () => {
    const t = new FakeTransport();
    const { c } = client(t);
    await c.start();
    await c.stop();
    expect(t.methods().slice(-2)).toEqual(["shutdown", "exit"]);
    expect(t.closed).toBe(true);
    expect(c.isRunning).toBe(false);
  });

  it("서버가 shutdown 에 답하지 않아도 시간이 지나면 닫는다", async () => {
    const t = new FakeTransport();
    const { c } = client(t);
    await c.start();
    t.autoReply.delete("shutdown");
    await c.stop(10);
    expect(t.closed).toBe(true);
  });
});
