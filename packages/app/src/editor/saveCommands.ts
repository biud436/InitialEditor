// 파일 > 저장과 모두 저장. 저장은 Editor.saveDocument로 하고(밖에서 바뀐 파일은 거기서 모달로 묻는다), 결과를 토스트로 알린다.
// Editor.saveDocument는 createDocumentSaver가 만든다: 디스크 확인, 같은 문서의 저장 합치기, 결과 알림.

import type { Document, SaveGuard, SaveOutcome } from "@initial-editor/core";

export interface DocumentSaverDeps {
  /** 저장 직전 디스크 확인과 충돌 모달 */
  guard: SaveGuard;
  /** 저장했을 때 (documentSaved를 알린다) */
  onSaved(doc: Document): void;
  log: { info(source: "editor", text: string): unknown };
}

/**
 * 문서를 저장하는 함수를 만든다. 디스크를 확인해 충돌이면 guard로 묻고, 저장했을 때만 onSaved를 부르며,
 * 다시 읽기와 취소는 콘솔에 남긴다. 같은 문서의 저장이 진행 중이면 그 결과를 함께 기다린다 (모달이 겹쳐 뜨지 않는다)
 */
export function createDocumentSaver(deps: DocumentSaverDeps): (doc: Document) => Promise<SaveOutcome> {
  const running = new Map<Document, Promise<SaveOutcome>>();
  const run = async (doc: Document): Promise<SaveOutcome> => {
    const outcome = await doc.saveChecked(deps.guard);
    if (outcome === "saved") deps.onSaved(doc);
    else if (outcome === "reloaded") deps.log.info("editor", `저장하지 않고 디스크 내용으로 다시 읽었다: ${doc.path ?? doc.title}`);
    else deps.log.info("editor", `저장을 취소했다: ${doc.path ?? doc.title}`);
    return outcome;
  };
  return (doc) => {
    const current = running.get(doc);
    if (current) return current;
    const task = run(doc).finally(() => running.delete(doc));
    running.set(doc, task);
    return task;
  };
}

export interface SaveHost {
  readonly documents: { readonly active: Document | null; readonly dirtyDocuments: Document[] };
  readonly toasts: { success(text: string): unknown; info(text: string): unknown; error(text: string): unknown };
  saveDocument(doc: Document): Promise<SaveOutcome>;
}

/** 활성 문서를 저장한다. 저장하지 못했으면 null */
export async function saveActiveDocument(host: SaveHost): Promise<SaveOutcome | null> {
  const doc = host.documents.active;
  if (!doc) return null;
  try {
    const outcome = await host.saveDocument(doc);
    if (outcome === "saved") host.toasts.success(`저장했다: ${doc.title}`);
    else if (outcome === "reloaded") host.toasts.info(`저장하지 않고 디스크 내용으로 다시 읽었다: ${doc.title}`);
    return outcome;
  } catch (e) {
    host.toasts.error(`${doc.title}을(를) 저장하지 못했다: ${(e as Error).message}`);
    return null;
  }
}

export interface SaveAllResult {
  saved: string[];
  reloaded: string[];
  cancelled: string[];
  /** "제목 (이유)" 꼴 */
  failed: string[];
}

/** 모두 저장의 토스트 문구. 실패가 있으면 error, 저장하지 않은 것이 있으면 info */
export function saveAllMessage(r: SaveAllResult): { level: "success" | "info" | "error"; text: string } {
  const parts = [r.failed.length > 0 ? `${r.saved.length}개를 저장했고 ${r.failed.length}개는 저장하지 못했다: ${r.failed.join(", ")}` : `${r.saved.length}개 문서를 저장했다`];
  if (r.reloaded.length > 0) parts.push(`다시 읽은 것: ${r.reloaded.join(", ")}`);
  if (r.cancelled.length > 0) parts.push(`저장하지 않은 것: ${r.cancelled.join(", ")}`);
  const level = r.failed.length > 0 ? "error" : r.reloaded.length + r.cancelled.length > 0 ? "info" : "success";
  return { level, text: parts.join(". ") };
}

/** 수정한 문서를 차례로 저장한다. 충돌 모달에서 취소한 문서는 건너뛰고 나머지를 이어 저장한다 */
export async function saveAllDocuments(host: SaveHost): Promise<SaveAllResult> {
  const result: SaveAllResult = { saved: [], reloaded: [], cancelled: [], failed: [] };
  for (const doc of [...host.documents.dirtyDocuments]) {
    try {
      const outcome = await host.saveDocument(doc);
      result[outcome].push(doc.title);
    } catch (e) {
      result.failed.push(`${doc.title} (${(e as Error).message})`);
    }
  }
  const { level, text } = saveAllMessage(result);
  host.toasts[level](text);
  return result;
}
