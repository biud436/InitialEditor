// 디스크의 파일을 읽는 동작(실행, 안드로이드 스테이징) 앞에서 저장 안 된 문서가 있으면 묻는 대화상자.
// 고르는 것은 취소, 저장하지 않고 진행, 모두 저장하고 진행. Escape 나 가림막은 취소다.

import type { ModalStore } from "./modals";
import { saveAllDocuments, type SaveHost } from "./saveCommands";

export type DirtyChoice = "save" | "keep" | "cancel";

export interface DirtyAsk {
  title: string;
  message: string;
  keepLabel: string;
  saveLabel: string;
  testId: string;
  /** 처음 초점: 진행하지 않는 쪽(cancel)이나 모두 저장하고 진행(save) */
  focus: "cancel" | "save";
}

export function askDirtyChoice(modals: ModalStore, ask: DirtyAsk): Promise<DirtyChoice> {
  let choice: DirtyChoice = "cancel";
  return modals
    .custom({
      title: ask.title,
      width: 480,
      render: (close) => {
        const pick = (c: DirtyChoice) => () => {
          choice = c;
          close();
        };
        return (
          <>
            <div className="modal-body" data-testid={ask.testId}>
              {ask.message}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={pick("cancel")} data-autofocus={ask.focus === "cancel" || undefined}>
                취소
              </button>
              <button type="button" className="btn" onClick={pick("keep")}>
                {ask.keepLabel}
              </button>
              <button type="button" className="btn btn-primary" onClick={pick("save")} data-autofocus={ask.focus === "save" || undefined}>
                {ask.saveLabel}
              </button>
            </div>
          </>
        );
      },
    })
    .then(() => choice);
}

/** 저장 안 된 문서가 있으면 묻고, 고른 대로 모두 저장한다. 진행해도 되면 true (취소했거나 하나라도 저장하지 못하면 false) */
export async function saveBeforeDiskAction(host: SaveHost & { readonly modals: ModalStore }, ask: (titles: string[]) => DirtyAsk): Promise<boolean> {
  const dirty = host.documents.dirtyDocuments;
  if (dirty.length === 0) return true;
  const choice = await askDirtyChoice(host.modals, ask(dirty.map((d) => d.title)));
  if (choice === "cancel") return false;
  if (choice === "keep") return true;
  const result = await saveAllDocuments(host);
  return !(result.cancelled.length || result.failed.length || result.reloadFailed.length);
}
