import { describe, expect, it } from "vitest";
import type * as lsp from "vscode-languageserver-protocol";
import { LanguageClient } from "../client";
import { RpcConnection, type MessageTransport } from "../rpc";
import { luaAnalyzer } from "./luaAnalyzer";
import { AnalyzerServer } from "./server";

/** 메모리 안의 전송 한 쌍 (메시지는 다음 마이크로태스크에 닿는다) */
function pair(): [MessageTransport, MessageTransport] {
  const make = () => ({ listeners: new Set<(t: string) => void>(), closes: new Set<(r: string) => void>() });
  const a = make();
  const b = make();
  const side = (me: ReturnType<typeof make>, other: ReturnType<typeof make>): MessageTransport => ({
    send: (t) => queueMicrotask(() => other.listeners.forEach((l) => l(t))),
    onMessage: (l) => (me.listeners.add(l), () => me.listeners.delete(l)),
    onClose: (l) => (me.closes.add(l), () => me.closes.delete(l)),
    // 상대 쪽은 이미 보낸 메시지를 다 받은 뒤에 닫힌다
    close: () => {
      me.closes.forEach((l) => l("닫음"));
      queueMicrotask(() => other.closes.forEach((l) => l("닫음")));
    },
  });
  return [side(a, b), side(b, a)];
}

const UTIL = "local M = {}\nfunction M.add(a, b) return a + b end\nreturn M\n";
const MAIN = 'local Util = require("scripts/lua/util")\nfunction Initialize()\n  local s = Util.add(1, 2)\nend\n';
const uri = (p: string) => `file:///project/${p}`;
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

async function setup(disk: Record<string, string>) {
  const [clientSide, serverSide] = pair();
  const server = new AnalyzerServer(new RpcConnection(serverSide), async () => luaAnalyzer, { name: "luaparse", version: "0.3.1" });
  server.install();
  const diagnostics = new Map<string, lsp.Diagnostic[]>();
  const reads: string[] = [];
  const client = new LanguageClient(clientSide, {
    root: "/project",
    rootUri: "file:///project",
    settings: () => null,
    onDiagnostics: (p) => diagnostics.set(p.uri, p.diagnostics),
    changeDelay: 1,
    workspace: {
      files: async () => Object.entries(disk).map(([p, text]) => ({ uri: uri(p), text })),
      read: async (u) => {
        reads.push(u);
        const p = u.replace("file:///project/", "");
        return disk[p] ?? null;
      },
    },
  });
  const init = await client.start();
  await tick();
  return { client, server, diagnostics, reads, init };
}

describe("AnalyzerServer (워커의 언어 서버)", () => {
  it("initialize 의 기능, 열면 구문 오류를 보내고 고치면 지운다", async () => {
    const { client, diagnostics, init } = await setup({});
    expect(init.capabilities).toMatchObject({ textDocumentSync: 1, documentSymbolProvider: true, definitionProvider: true });
    expect(init.serverInfo).toEqual({ name: "luaparse", version: "0.3.1" });
    client.open(uri("scripts/lua/a.lua"), "lua", 1, "function f(\n");
    await tick();
    expect(diagnostics.get(uri("scripts/lua/a.lua"))).toHaveLength(1);
    client.change(uri("scripts/lua/a.lua"), 2, "function f() end\n");
    client.flush();
    await tick();
    expect(diagnostics.get(uri("scripts/lua/a.lua"))).toEqual([]);
    client.close(uri("scripts/lua/a.lua"));
    await tick();
    expect(diagnostics.get(uri("scripts/lua/a.lua"))).toEqual([]);
  });

  it("작업 공간을 색인해 다른 파일의 정의를 찾고, 문서 기호와 완성 이름을 준다", async () => {
    const { client } = await setup({ "scripts/lua/util.lua": UTIL, "scripts/lua/main.lua": MAIN });
    client.open(uri("scripts/lua/main.lua"), "lua", 1, MAIN);
    const def = await client.request<lsp.Location[]>("textDocument/definition", { textDocument: { uri: uri("scripts/lua/main.lua") }, position: { line: 2, character: 18 } });
    expect(def).toEqual([{ uri: uri("scripts/lua/util.lua"), range: { start: { line: 1, character: 11 }, end: { line: 1, character: 14 } } }]);
    const symbols = await client.request<lsp.DocumentSymbol[]>("textDocument/documentSymbol", { textDocument: { uri: uri("scripts/lua/main.lua") } });
    expect(symbols.map((s) => s.name)).toEqual(["Initialize"]);
    const completion = await client.request<lsp.CompletionList>("textDocument/completion", { textDocument: { uri: uri("scripts/lua/main.lua") }, position: { line: 3, character: 0 } });
    // 다른 파일의 함수(M.add)는 받는 쪽을 붙여 부르므로 더하지 않는다. 지금 문서의 이름만
    expect(completion.items.map((i) => i.label)).toEqual(["Initialize"]);
    expect(completion.items[0].detail).toBe("main.lua");
    // 받는 쪽 뒤의 멤버는 명세 공급자의 몫이다
    const member = await client.request<lsp.CompletionList>("textDocument/completion", { textDocument: { uri: uri("scripts/lua/main.lua") }, position: { line: 2, character: 17 } });
    expect(member.items).toEqual([]);
  });

  it("디스크 변경을 다시 읽고, 지우면 색인에서 뺀다. 구문 오류가 난 글은 마지막 기호를 남긴다", async () => {
    const disk: Record<string, string> = { "scripts/lua/util.lua": UTIL };
    const { client, reads } = await setup(disk);
    client.open(uri("scripts/lua/main.lua"), "lua", 1, MAIN);
    const defAt = () => client.request<lsp.Location[]>("textDocument/definition", { textDocument: { uri: uri("scripts/lua/main.lua") }, position: { line: 2, character: 18 } });
    disk["scripts/lua/util.lua"] = "local M = {}\n\nfunction M.add(a, b) return a + b end\nreturn M\n";
    client.filesChanged([{ uri: uri("scripts/lua/util.lua"), type: 2 }]);
    await tick();
    expect(reads).toEqual([uri("scripts/lua/util.lua")]);
    expect((await defAt())[0].range.start.line).toBe(2);
    disk["scripts/lua/util.lua"] = "function M.add(\n";
    client.filesChanged([{ uri: uri("scripts/lua/util.lua"), type: 2 }]);
    await tick();
    expect((await defAt())[0].range.start.line).toBe(2);
    client.filesChanged([{ uri: uri("scripts/lua/util.lua"), type: 3 }]);
    await tick();
    expect(await defAt()).toEqual([]);
  });

  it("쓰는 중이라 구문 오류가 난 문서는 마지막으로 뽑은 기호로 완성과 기호를 준다", async () => {
    const { client } = await setup({});
    const a = uri("scripts/lua/a.lua");
    client.open(a, "lua", 1, "local function wrap(v) return v end\n");
    await tick();
    client.change(a, 2, "local function wrap(v) return v end\nwra\n");
    client.flush();
    await tick();
    const completion = await client.request<lsp.CompletionList>("textDocument/completion", { textDocument: { uri: a }, position: { line: 1, character: 3 } });
    expect(completion.items.map((i) => i.label)).toEqual(["wrap"]);
    const symbols = await client.request<lsp.DocumentSymbol[]>("textDocument/documentSymbol", { textDocument: { uri: a } });
    expect(symbols.map((s) => s.name)).toEqual(["wrap"]);
  });

  it("같은 문서의 정의가 먼저다", async () => {
    const text = "local function add() end\nadd()\n";
    const { client } = await setup({ "scripts/lua/util.lua": UTIL });
    client.open(uri("scripts/lua/b.lua"), "lua", 1, text);
    const def = await client.request<lsp.Location[]>("textDocument/definition", { textDocument: { uri: uri("scripts/lua/b.lua") }, position: { line: 1, character: 1 } });
    expect(def).toEqual([{ uri: uri("scripts/lua/b.lua"), range: { start: { line: 0, character: 15 }, end: { line: 0, character: 18 } } }]);
  });

  it("shutdown 과 exit 를 받으면 워커를 닫는다", async () => {
    const { client, server } = await setup({});
    let exited = false;
    server.onExit(() => (exited = true));
    await client.stop();
    await tick();
    expect(client.isRunning).toBe(false);
    expect(exited).toBe(true);
  });
});
