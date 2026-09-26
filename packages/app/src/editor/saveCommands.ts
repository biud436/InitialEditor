// 파일 > 저장과 모두 저장. 저장은 Editor.saveDocument로 하고(밖에서 바뀐 파일은 거기서 모달로 묻는다), 결과를 토스트로 알린다.

import type { Document, SaveOutcome } from "@initial-editor/core";

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
