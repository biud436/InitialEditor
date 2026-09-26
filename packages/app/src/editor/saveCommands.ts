// 파일 > 저장과 모두 저장. 저장은 Editor.saveDocument로 하고(밖에서 바뀐 파일은 거기서 모달로 묻는다), 결과를 토스트로 알린다.
// Editor.saveDocument는 createDocumentSaver가 만든다: 디스크 확인, 같은 문서의 저장 합치기와 줄 세우기, 결과 알림.

import { ReloadFailedError, type Document, type SaveGuard, type SaveOutcome } from "@initial-editor/core";

export interface DocumentSaverDeps {
  /** 저장 직전 디스크 확인과 충돌 모달 */
  guard: SaveGuard;
  /** 저장했을 때 (documentSaved를 알린다) */
  onSaved(doc: Document): void;
  log: { info(source: "editor", text: string): unknown; error(source: "editor", text: string): unknown };
}

/** 문서 하나의 진행 중인 저장 */
interface RunningSave {
  readonly task: Promise<SaveOutcome>;
  /** asking이면 아직 디스크를 확인하거나 모달을 기다리는 중이라 쓰기 전이다 */
  readonly phase: { asking: boolean };
}

/**
 * 문서를 저장하는 함수를 만든다. 충돌이면 guard로 묻고, 저장했을 때만 onSaved를 부르며, 다시 읽기와 취소와 다시 읽기 실패는 콘솔에 남긴다.
 * 같은 문서의 저장이 확인이나 모달을 기다리는 중이면 거기에 합치고(아직 쓰기 전), 이미 쓰는 중이면 끝난 뒤 최신 내용으로 한 번 더 저장한다
 */
export function createDocumentSaver(deps: DocumentSaverDeps): (doc: Document) => Promise<SaveOutcome> {
  const running = new Map<Document, RunningSave>();
  /** 쓰는 중에 들어와 그 저장이 끝나기를 기다리는 다음 저장 */
  const queued = new Map<Document, Promise<SaveOutcome>>();

  const run = async (doc: Document, phase: RunningSave["phase"]): Promise<SaveOutcome> => {
    const name = doc.path ?? doc.title;
    let outcome: SaveOutcome;
    try {
      outcome = await doc.saveChecked(deps.guard, {
        acting: () => {
          phase.asking = false;
        },
      });
    } catch (e) {
      if (e instanceof ReloadFailedError) deps.log.error("editor", `${name}을(를) 다시 읽지 못했다: ${e.reason}`);
      throw e;
    }
    if (outcome === "saved") deps.onSaved(doc);
    else if (outcome === "reloaded") deps.log.info("editor", `저장하지 않고 디스크 내용으로 다시 읽었다: ${name}`);
    else deps.log.info("editor", `저장을 취소했다: ${name}`);
    return outcome;
  };

  const start = (doc: Document): Promise<SaveOutcome> => {
    const phase = { asking: true };
    const task = run(doc, phase).finally(() => {
      if (running.get(doc)?.task === task) running.delete(doc);
    });
    running.set(doc, { task, phase });
    return task;
  };

  return (doc) => {
    const waiting = queued.get(doc);
    if (waiting) return waiting;
    const current = running.get(doc);
    if (!current) return start(doc);
    if (current.phase.asking) return current.task;
    const next = current.task
      .catch(() => undefined)
      .then(() => {
        queued.delete(doc);
        return start(doc);
      });
    queued.set(doc, next);
    return next;
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
    if (e instanceof ReloadFailedError) host.toasts.error(e.message);
    else host.toasts.error(`${doc.title}을(를) 저장하지 못했다: ${(e as Error).message}`);
    return null;
  }
}

export interface SaveAllResult {
  saved: string[];
  reloaded: string[];
  cancelled: string[];
  /** "제목 (이유)" 꼴 */
  failed: string[];
  /** 충돌 모달에서 다시 읽기를 골랐지만 다시 읽지 못한 것. "제목 (이유)" 꼴 */
  reloadFailed: string[];
}

/** 모두 저장의 토스트 문구. 실패가 있으면 error, 저장하지 않은 것이 있으면 info */
export function saveAllMessage(r: SaveAllResult): { level: "success" | "info" | "error"; text: string } {
  const parts = [r.failed.length > 0 ? `${r.saved.length}개를 저장했고 ${r.failed.length}개는 저장하지 못했다: ${r.failed.join(", ")}` : `${r.saved.length}개 문서를 저장했다`];
  if (r.reloadFailed.length > 0) parts.push(`다시 읽지 못한 것: ${r.reloadFailed.join(", ")}`);
  if (r.reloaded.length > 0) parts.push(`다시 읽은 것: ${r.reloaded.join(", ")}`);
  if (r.cancelled.length > 0) parts.push(`저장하지 않은 것: ${r.cancelled.join(", ")}`);
  const level = r.failed.length + r.reloadFailed.length > 0 ? "error" : r.reloaded.length + r.cancelled.length > 0 ? "info" : "success";
  return { level, text: parts.join(". ") };
}

/** 수정한 문서를 차례로 저장한다. 충돌 모달에서 취소한 문서는 건너뛰고 나머지를 이어 저장한다 */
export async function saveAllDocuments(host: SaveHost): Promise<SaveAllResult> {
  const result: SaveAllResult = { saved: [], reloaded: [], cancelled: [], failed: [], reloadFailed: [] };
  for (const doc of [...host.documents.dirtyDocuments]) {
    try {
      const outcome = await host.saveDocument(doc);
      result[outcome].push(doc.title);
    } catch (e) {
      if (e instanceof ReloadFailedError) result.reloadFailed.push(`${doc.title} (${e.reason})`);
      else result.failed.push(`${doc.title} (${(e as Error).message})`);
    }
  }
  const { level, text } = saveAllMessage(result);
  host.toasts[level](text);
  return result;
}
