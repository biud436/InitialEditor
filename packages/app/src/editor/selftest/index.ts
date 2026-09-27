// 자가 검사 모드의 앱 쪽 입구 (docs/plans/e6-packaging.md 5절). main.tsx 가 셸의 selftest_plan 으로 계획을 받으면
// 격리된 저장소(isolatedStorage)로 에디터를 만들고, 그린 뒤 startSelftest 를 부른다.

import { MemorySettingsStorage, type SettingsStorage } from "@initial-editor/core";
import { APP_COMMIT } from "../about";
import type { Editor } from "../Editor";
import type { KeyValueStorage } from "../LocalStorageSettingsStorage";
import { writeProjectTemplate } from "../scene/projectTemplates";
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
