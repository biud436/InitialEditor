// 저장 충돌 모달 (03-project-and-runtime.md 파일 규칙 4). 저장 직전 파일이 밖에서 바뀌었거나 지워졌거나
// 다시 읽지 못했으면 덮어쓰기, 다시 읽기, 취소 중에서 고르게 한다. 다시 읽기는 저장하지 않은 수정을 버리므로 한 번 더 묻는다.

import type { Document, SaveConflict, SaveConflictChoice, SaveGuard } from "@initial-editor/core";
import type { ModalStore } from "./modals";

const TITLES: Record<SaveConflict["kind"], string> = {
  changed: "밖에서 바뀐 파일",
  missing: "지워진 파일",
  unreadable: "다시 읽지 못한 파일",
};

export function saveConflictTitle(conflict: SaveConflict): string {
  return TITLES[conflict.kind];
}

export function saveConflictMessage(name: string, conflict: SaveConflict): string {
  switch (conflict.kind) {
    case "changed":
      return `${name}이(가) 밖에서 바뀌었다. 덮어쓰면 디스크의 새 내용이 사라지고, 다시 읽으면 저장하지 않은 내 수정이 사라진다.`;
    case "missing":
      return `${name}이(가) 디스크에서 지워졌다. 덮어쓰면 내 것으로 다시 만든다.`;
    case "unreadable":
      return `${name}을(를) 디스크에서 다시 읽지 못했다: ${conflict.reason ?? "이유 모름"}\n덮어쓰면 디스크의 내용이 사라진다.`;
  }
}

/** 모달 본문. 지워진 파일은 다시 읽을 것이 없어 다시 읽기를 두지 않는다. 처음 초점은 취소다 */
export function SaveConflictBody({ name, conflict, onChoose }: { name: string; conflict: SaveConflict; onChoose: (choice: SaveConflictChoice) => void }) {
  return (
    <>
      <div className="modal-body" data-testid="save-conflict" data-kind={conflict.kind}>
        {saveConflictMessage(name, conflict)}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => onChoose("cancel")} data-autofocus>
          취소
        </button>
        {conflict.kind !== "missing" && (
          <button type="button" className="btn" onClick={() => onChoose("reload")}>
            다시 읽기
          </button>
        )}
        <button type="button" className="btn btn-danger" onClick={() => onChoose("overwrite")}>
          덮어쓰기
        </button>
      </div>
    </>
  );
}

/** 충돌을 모달로 묻는다. Escape나 가림막으로 닫으면 취소다 */
export function askSaveConflict(modals: ModalStore, doc: Document, conflict: SaveConflict): Promise<SaveConflictChoice> {
  let choice: SaveConflictChoice = "cancel";
  return modals
    .custom({
      title: saveConflictTitle(conflict),
      width: 480,
      render: (close) => (
        <SaveConflictBody
          name={doc.title}
          conflict={conflict}
          onChoose={(c) => {
            choice = c;
            close();
          }}
        />
      ),
    })
    .then(() => choice);
}

/** 다시 읽기 전에 저장하지 않은 수정을 버릴지 한 번 더 묻는다 */
export function confirmDiscardEdits(modals: ModalStore, doc: Document): Promise<boolean> {
  return modals.confirm({
    title: "다시 읽기",
    message: `${doc.title}의 저장하지 않은 수정을 버리고 디스크의 내용으로 다시 읽을까?`,
    okLabel: "버리고 다시 읽기",
    danger: true,
  });
}

/** 에디터의 저장 확인: 디스크는 readText로 읽고, 묻는 것은 모달로 한다 */
export function modalSaveGuard(modals: ModalStore, readText: (path: string) => Promise<string>): SaveGuard {
  return {
    readText,
    askConflict: (doc, conflict) => askSaveConflict(modals, doc, conflict),
    confirmDiscard: (doc) => confirmDiscardEdits(modals, doc),
  };
}
