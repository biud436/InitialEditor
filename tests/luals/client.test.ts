// 진짜 LuaLS 와 에디터의 LSP 클라이언트 (yarn test:luals, docs/plans/language-server.md 7절).
// 앱의 LanguageClient 와 설정(luaSettings)을 그대로 쓰고, 전송만 Node 의 자식 프로세스다.
//   1. RPG 템플릿으로 만든 새 프로젝트: .luarc.json 의 규칙으로 템플릿의 Lua 파일 전부에 경고 이상이 없다 (LuaLS 의 검사 모드)
//   2. 스텁도 .luarc.json 도 없는 프로젝트: 앱이 준 스텁과 설정으로 엔진 API 를 알고, 오타와 인자 수를 잡는다
//   3. 완성, 호버, 정의, 참조, 이름 바꾸기, 문서 기호가 프로젝트 파일 사이에서 된다

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as lsp from "vscode-languageserver-protocol";
import { LanguageClient } from "../../packages/app/src/editor/scripting/lsp/client";
import { completionItems, workspaceEditFiles } from "../../packages/app/src/editor/scripting/lsp/convert";
import { isSyntaxDiagnostic } from "../../packages/app/src/editor/scripting/lsp/diagnostics";
import { configurationFor, PROJECT_STUB } from "../../packages/app/src/editor/scripting/lsp/luaSettings";
import { fileUri } from "../../packages/app/src/editor/scripting/lsp/uri";
import { templatePlan, type TemplateManifest } from "../../packages/app/src/editor/scene/templateManifest";
import { LUALS_MISSING, lualsExe, NodeLuals, writeProject } from "./support";

const TEMPLATES = fileURLToPath(new URL("../../packages/app/templates/", import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(TEMPLATES, "MANIFEST.json"), "utf8")) as TemplateManifest;
const exe = lualsExe();

interface Session {
  root: string;
  client: LanguageClient;
  server: NodeLuals;
  diagnostics: Map<string, lsp.Diagnostic[]>;
  published: string[];
}

async function startSession(root: string, library: string[]): Promise<Session> {
  if (!exe) throw new Error(LUALS_MISSING);
  const server = new NodeLuals(exe, root);
  const diagnostics = new Map<string, lsp.Diagnostic[]>();
  const published: string[] = [];
  const client = new LanguageClient(server, {
    root,
    rootUri: fileUri(root),
    settings: (section) => configurationFor(section, library),
    onDiagnostics: (p) => {
      diagnostics.set(p.uri, p.diagnostics);
      published.push(p.uri);
    },
    changeDelay: 10,
  });
  await client.start();
  return { root, client, server, diagnostics, published };
}

async function stopSession(s: Session | undefined): Promise<void> {
  if (!s) return;
  await s.client.stop();
  s.server.cleanup();
  fs.rmSync(s.root, { recursive: true, force: true });
}

function open(s: Session, rel: string): string {
  const uri = fileUri(path.join(s.root, rel));
  s.client.open(uri, "lua", 1, fs.readFileSync(path.join(s.root, rel), "utf8"));
  return uri;
}

/** 모든 uri 의 진단이 한 번 이상 오고 quietMs 동안 새 진단이 없을 때까지 */
async function settle(s: Session, uris: string[], quietMs = 1500, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  let seen = s.published.length;
  let quietSince = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 100));
    if (s.published.length !== seen) {
      seen = s.published.length;
      quietSince = Date.now();
    }
    const all = uris.every((u) => s.diagnostics.has(u));
    if (all && Date.now() - quietSince >= quietMs) return;
    if (Date.now() - start > timeoutMs) throw new Error(`진단을 기다리다 시간이 다 됐다 (받은 파일 ${uris.filter((u) => s.diagnostics.has(u)).length}/${uris.length})`);
  }
}

function position(text: string, needle: string, offset = 0): lsp.Position {
  const index = text.indexOf(needle);
  if (index < 0) throw new Error(`글에 없다: ${needle}`);
  const before = text.slice(0, index + offset);
  const lines = before.split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

describe.skipIf(!exe && !process.env.CI)("LuaLS 와 LSP 클라이언트", () => {
  it("LuaLS 실행 파일이 있다", () => {
    expect(exe, LUALS_MISSING).toBeTruthy();
  });

  it("RPG 템플릿으로 만든 새 프로젝트: 템플릿의 Lua 파일 전부가 .luarc.json 의 규칙으로 경고 없이 읽힌다", () => {
    // 프로젝트에 .luarc.json 이 있으면 LuaLS 는 그 규칙을 쓰므로 LuaLS 의 검사 모드로 프로젝트 전체를 본다
    // (편집기는 열린 파일만 진단을 받고, 진단이 없는 파일에는 알림이 오지 않는다)
    const files: Record<string, string> = {};
    for (const entry of templatePlan(manifest, "rpg", "lua")) {
      if (entry.kind === "text") files[entry.to] = fs.readFileSync(path.join(TEMPLATES, entry.path), "utf8");
    }
    expect(files[".luarc.json"], "템플릿에 .luarc.json 이 있다").toBeTruthy();
    expect(files[PROJECT_STUB], "템플릿에 스텁이 있다").toBeTruthy();
    expect(Object.keys(files).filter((f) => f.endsWith(".lua")).length).toBeGreaterThan(20);
    const root = writeProject(files);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "initial-luals-check-"));
    try {
      const run = spawnSync(exe!, [`--check=${root}`, "--checklevel=Warning", "--check_format=json", `--logpath=${work}`, `--metapath=${path.join(work, "meta")}`], { encoding: "utf8", timeout: 120_000 });
      expect(run.stdout + run.stderr).toContain("Diagnosis complete");
      const report = path.join(work, "check.json");
      const found = fs.existsSync(report) ? (JSON.parse(fs.readFileSync(report, "utf8")) as Record<string, lsp.Diagnostic[]>) : {};
      const list = Object.entries(found).flatMap(([uri, ds]) => ds.map((d) => `${path.relative(root, fileURLToPath(uri))}:${d.range.start.line + 1} [${String(d.code)}]`));
      expect(list).toEqual([]);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  describe("스텁도 .luarc.json 도 없는 프로젝트", () => {
    let s: Session | undefined;
    let main = "";
    const MAIN = [
      'local Util = require("scripts/lua/util")',
      "",
      "function Initialize()",
      "  DrawText(10, 20, \"제목\")",
      "  DrawTxt(1, 2, \"x\")",
      "  DrawText(1, 2)",
      "  local total = Util.add(1, 2)",
      "  print(total)",
      "end",
      "",
      "function Update(elapsed)",
      "  local h = Sprite.Create(0, 0, 32, 32, 1, \"bird\")",
      "  Sprite.SetPosition(h, elapsed, 0)",
      "  Sprite.",
      "end",
      "",
    ].join("\n");
    const UTIL = ["local M = {}", "", "--- 두 수를 더한다", "---@param a number", "---@param b number", "---@return number", "function M.add(a, b)", "  return a + b", "end", "", "return M", ""].join("\n");

    beforeAll(async () => {
      const root = writeProject({ "scripts/lua/main.lua": MAIN, "scripts/lua/util.lua": UTIL, "game.json": '{"script":"lua"}\n' });
      // 앱은 프로젝트에 스텁이 없으면 번들의 스텁을 앱 캐시에 쓰고 그 경로를 library 로 준다
      const lib = path.join(path.dirname(root), `${path.basename(root)}-lib`);
      fs.mkdirSync(lib, { recursive: true });
      fs.copyFileSync(path.join(TEMPLATES, PROJECT_STUB), path.join(lib, "initial2d.lua"));
      s = await startSession(root, [path.join(lib, "initial2d.lua")]);
      main = open(s, "scripts/lua/main.lua");
      await settle(s, [main]);
    });
    afterAll(async () => {
      if (s) fs.rmSync(`${s.root}-lib`, { recursive: true, force: true });
      await stopSession(s);
    });

    it("엔진 API 를 알고, 이름 오타와 인자 수, 구문 오류를 잡는다", () => {
      const diags = s!.diagnostics.get(main) ?? [];
      const byCode = diags.filter((d) => (d.severity ?? 1) <= 2).map((d) => [d.range.start.line + 1, String(d.code)]);
      expect(byCode).toContainEqual([5, "undefined-global"]);
      expect(byCode).toContainEqual([6, "missing-parameter"]);
      // 14줄의 "Sprite." 는 구문 오류다
      expect(diags.some((d) => isSyntaxDiagnostic(d) && d.range.start.line + 1 >= 14)).toBe(true);
      // DrawText, Sprite, Util, print 는 정의되어 있다
      const undefinedGlobals = diags.filter((d) => d.code === "undefined-global").map((d) => (typeof d.message === "string" ? d.message : d.message.value));
      expect(undefinedGlobals).toEqual(["Undefined global `DrawTxt`."]);
    });

    it("Sprite. 뒤의 완성에 엔진 API 와 문서가 있다", async () => {
      const result = await s!.client.request<lsp.CompletionList | lsp.CompletionItem[] | null>("textDocument/completion", {
        textDocument: { uri: main },
        position: position(MAIN, "  Sprite.\n", "  Sprite.".length),
        context: { triggerKind: 2, triggerCharacter: "." },
      });
      const labels = completionItems(result).items.map((i) => i.label);
      expect(labels.some((l) => l.startsWith("SetPosition"))).toBe(true);
      expect(labels.some((l) => l.startsWith("Create"))).toBe(true);
    });

    it("호버에 스텁의 한국어 설명이 나온다", async () => {
      const hover = await s!.client.request<lsp.Hover | null>("textDocument/hover", { textDocument: { uri: main }, position: position(MAIN, "DrawText(10", 2) });
      const value = hover && typeof hover.contents === "object" && "value" in hover.contents ? hover.contents.value : "";
      expect(value).toContain("DrawText");
      expect(value).toContain("텍스트 그리기");
    });

    it("정의로 가기와 참조가 다른 파일을 가리킨다", async () => {
      const def = await s!.client.request<lsp.Location[] | lsp.LocationLink[] | null>("textDocument/definition", { textDocument: { uri: main }, position: position(MAIN, "Util.add", 6) });
      const target = def && def.length ? ("targetUri" in def[0] ? def[0].targetUri : def[0].uri) : "";
      expect(fileURLToPath(target)).toBe(path.join(s!.root, "scripts/lua/util.lua"));
      const refs = await s!.client.request<lsp.Location[] | null>("textDocument/references", { textDocument: { uri: main }, position: position(MAIN, "Util.add", 6), context: { includeDeclaration: true } });
      const files = new Set((refs ?? []).map((r) => path.relative(s!.root, fileURLToPath(r.uri))));
      expect([...files].sort()).toEqual(["scripts/lua/main.lua", "scripts/lua/util.lua"]);
    });

    it("이름 바꾸기가 두 파일을 고친다", async () => {
      const at = { textDocument: { uri: main }, position: position(MAIN, "Util.add", 6) };
      const prepared = await s!.client.request<lsp.PrepareRenameResult | null>("textDocument/prepareRename", at);
      expect(prepared).toBeTruthy();
      const edit = await s!.client.request<lsp.WorkspaceEdit | null>("textDocument/rename", { ...at, newName: "sum" });
      const files = workspaceEditFiles(edit)!;
      const rel = [...files.keys()].map((u) => path.relative(s!.root, fileURLToPath(u))).sort();
      expect(rel).toEqual(["scripts/lua/main.lua", "scripts/lua/util.lua"]);
      for (const edits of files.values()) expect(edits.every((e) => e.newText === "sum")).toBe(true);
    });

    it("문서 기호에 씬 함수가 있다", async () => {
      const symbols = await s!.client.request<lsp.DocumentSymbol[] | null>("textDocument/documentSymbol", { textDocument: { uri: main } });
      const names = (symbols ?? []).map((x) => x.name);
      expect(names).toEqual(expect.arrayContaining(["Initialize", "Update"]));
    });

    it("고친 글을 보내면 진단이 바뀐다", async () => {
      const fixed = MAIN.replace('DrawTxt(1, 2, "x")', 'DrawText(1, 2, "x")').replace("  Sprite.\n", "");
      const before = s!.published.length;
      s!.client.change(main, 2, fixed);
      s!.client.flush();
      const start = Date.now();
      while (Date.now() - start < 30_000) {
        await new Promise((r) => setTimeout(r, 100));
        const d = s!.diagnostics.get(main) ?? [];
        if (s!.published.length > before && !d.some((x) => x.code === "undefined-global")) break;
      }
      const codes = (s!.diagnostics.get(main) ?? []).filter((d) => (d.severity ?? 1) <= 2).map((d) => String(d.code));
      expect(codes).toEqual(["missing-parameter"]);
    });
  });
});
