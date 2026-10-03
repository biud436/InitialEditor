// 자가 검사 모드의 앱 쪽 입구 (docs/plans/e6-packaging.md 5절). main.tsx 가 셸의 selftest_plan 으로 계획을 받으면
// 격리된 저장소(isolatedStorage)로 에디터를 만들고, 그린 뒤 startSelftest 를 부른다.

import { MemorySettingsStorage, type RunMode, type SettingsStorage } from "@initial-editor/core";
import type { MapSelftestProbe } from "@initial-editor/ext-tilemap";
import { when } from "mobx";
import { APP_COMMIT } from "../about";
import type { Editor } from "../Editor";
import type { KeyValueStorage } from "../LocalStorageSettingsStorage";
import { playRequest, type PlayHost } from "../maps/objectTools/playHere";
import { writeProjectTemplate } from "../scene/projectTemplates";
import { completionItems, toDocumentSymbols, toHover } from "../scripting/lsp/convert";
import type * as lsp from "vscode-languageserver-protocol";
import type { CspCollector } from "./csp";
import { parsePlan } from "./plan";
import { runSelftest, type SelftestDeps, type SelftestHost, type SelftestShell } from "./runSelftest";

export { installCspCollector, type CspCollector, type CspViolation } from "./csp";
export { parsePlan, type SelftestPlan } from "./plan";
export { runSelftest, type SelftestHost, type SelftestReport, type SelftestShell } from "./runSelftest";

/** 페이지 안에서만 사는 키 값 저장소 (레이아웃이 localStorage 대신 쓴다) */
export class MemoryKeyValueStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

/**
 * 자가 검사의 격리: 설정(최근 프로젝트와 엔진 경로와 신뢰 기록 포함)은 메모리에서 기본값으로 시작하고 저장하지 않는다.
 * 레이아웃도 메모리다. 셸은 창 위치(window-state)를 붙이지 않고 웹뷰 저장소를 남기지 않는다 (src-tauri/src/lib.rs)
 */
export function isolatedStorage(): { storage: SettingsStorage; local: KeyValueStorage } {
  return { storage: new MemorySettingsStorage(), local: new MemoryKeyValueStorage() };
}

/** 계획이 있으면 격리된 저장소. 없으면 평소 저장소 (계획이 있을 때는 평소 저장소를 만들지도 않는다) */
export function chooseStorage(plan: unknown, create: () => SettingsStorage): { storage: SettingsStorage; local?: KeyValueStorage } {
  return plan ? isolatedStorage() : { storage: create() };
}

export function editorSelftestHost(editor: Editor, csp: Pick<CspCollector, "list">): SelftestHost {
  return {
    app: { version: editor.version, commit: APP_COMMIT, platform: editor.platform, mode: editor.mode, backend: editor.backend.kind },
    get backend() {
      return editor.backend;
    },
    get runner() {
      return editor.runner;
    },
    openProject: (root) => editor.openProject(root),
    closeProject: () => editor.closeProject(),
    openPath: (path) => editor.openPath(path),
    findDocument: (path) => editor.documents.findByPath(path) ?? null,
    saveDocument: (doc) => editor.saveDocument(doc),
    logEntries: () => editor.log.entries,
    modals: () => editor.modals.stack.map((m) => ({ id: m.id, title: m.title })),
    closeModal: (id) => editor.modals.close(id),
    writeTemplate: (backend, options) => writeProjectTemplate(backend, options),
    mapViewStatus: (doc) => {
      const r = editor.mapSupport.rendererFor(doc);
      return r ? { ready: r.status.ready, error: r.status.error, warning: r.status.warning } : null;
    },
    captureMapTiles: async (doc, rect) => editor.mapSupport.rendererFor(doc)?.captureTiles(rect) ?? null,
    cspViolations: () => csp.list,
    extensionProbe: (id) => editor.extensions.exportsOf<{ selftest?: MapSelftestProbe }>(id)?.selftest ?? null,
    languageServer: (language) => {
      const server = language === "mruby" ? editor.scripting.rubyServer : editor.scripting.languageServer;
      if (!server.hasLauncher) return null;
      const call = async <T,>(method: string, path: string, line: number, character: number): Promise<T | null> => {
        const client = server.client;
        const binding = server.binding;
        if (!client || !binding) throw new Error(`언어 서버가 실행 중이 아닙니다 (${server.state})`);
        return client.request<T>(method, { textDocument: { uri: binding.serverUri(path) }, position: { line, character } });
      };
      return {
        get state() {
          return server.state;
        },
        get version() {
          return server.version;
        },
        get reason() {
          return server.reason;
        },
        completion: async (path, line, character) => {
          const result = await call<lsp.CompletionList | lsp.CompletionItem[]>("textDocument/completion", path, line, character);
          return completionItems(result).items.map((i) => i.label);
        },
        hover: async (path, line, character) => {
          const hover = await call<lsp.Hover>("textDocument/hover", path, line, character);
          return (toHover(hover)?.contents ?? []).map((c) => c.value).join("\n");
        },
        symbols: async (path) => {
          const client = server.client;
          const binding = server.binding;
          if (!client || !binding) throw new Error(`언어 서버가 실행 중이 아닙니다 (${server.state})`);
          const result = await client.request<lsp.DocumentSymbol[] | lsp.SymbolInformation[] | null>("textDocument/documentSymbol", { textDocument: { uri: binding.serverUri(path) } });
          return toDocumentSymbols(result).flatMap(function names(s): string[] {
            return [s.name, ...(s.children ?? []).flatMap(names)];
          });
        },
      };
    },
    playMap: async (doc, request, opts) => {
      // 프로젝트를 연 뒤의 엔진 탐색이 끝나기를 기다린다. 그동안 앱의 실행 길은 "엔진을 찾는 중" 으로 막힌다
      await when(() => !editor.runner.resolving, { timeout: 60_000 }).catch(() => {});
      return playRequest(selftestPlayHost(editor, opts), doc, request);
    },
  };
}

/** 에디터 그대로이되 러너의 시작에 계획의 mode 와 env 를 더한다 (요청의 변수가 이긴다) */
function selftestPlayHost(editor: Editor, opts: { mode: RunMode; env: Record<string, string> }): PlayHost {
  const runner = editor.runner;
  return {
    get documents() {
      return editor.documents;
    },
    get toasts() {
      return editor.toasts;
    },
    get log() {
      return editor.log;
    },
    get mapSupport() {
      return editor.mapSupport;
    },
    get modals() {
      return editor.modals;
    },
    get mapSchema() {
      return editor.mapSchema;
    },
    get tilemap() {
      return editor.tilemap;
    },
    saveDocument: (doc) => editor.saveDocument(doc),
    runner: {
      get unavailableReason() {
        return runner.unavailableReason;
      },
      get startHint() {
        return runner.startHint;
      },
      start: (o) => runner.start({ ...o, mode: opts.mode, env: { ...opts.env, ...o.env } }),
    },
  };
}

/** 계획을 검사하고 흐름을 돈다. 계획이 틀리면 보고서에 이유를 적고 2 로 끝낸다 */
export async function startSelftest(editor: Editor, raw: unknown, shell: SelftestShell, csp: Pick<CspCollector, "list">, deps?: SelftestDeps): Promise<void> {
  let plan;
  try {
    plan = parsePlan(raw);
  } catch (e) {
    await shell.finish(JSON.stringify({ version: 1, ok: false, error: `plan: ${(e as Error).message}` }, null, 2) + "\n", 2);
    return;
  }
  editor.log.info("editor", `자가 검사 시작: 프로젝트 ${plan.projects.length}개, 창 ${plan.showWindow ? "보임" : "숨김"}`);
  await runSelftest(plan, editorSelftestHost(editor, csp), shell, deps);
}
