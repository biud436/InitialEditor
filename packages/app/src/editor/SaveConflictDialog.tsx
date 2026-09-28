// 저장 충돌 모달 (03-project-and-runtime.md 파일 규칙 4). 저장 직전 파일이 밖에서 바뀌었거나 지워졌거나
// 다시 읽지 못했으면 덮어쓰기, 다시 읽기, 취소 중에서 고르게 한다. 다시 읽기는 저장하지 않은 수정을 버리므로 한 번 더 묻는다.

import type { Document, SaveConflict, SaveConflictChoice, SaveGuard } from "@initial-editor/core";
import type { ModalStore } from "./modals";

const TITLES: Record<SaveConflict["kind"], string> = {
  changed: "외부에서 변경된 파일",
  missing: "삭제된 파일",
  unreadable: "다시 읽기 실패한 파일",
};

export function saveConflictTitle(conflict: SaveConflict): string {
  return TITLES[conflict.kind];
}

export function saveConflictMessage(name: string, conflict: SaveConflict): string {
  switch (conflict.kind) {
    case "changed":
      return `${name}: 외부에서 변경됨. 덮어쓰기: 디스크의 새 내용 손실. 다시 읽기: 저장하지 않은 변경 손실`;
    case "missing":
      return `${name}: 디스크에서 삭제됨. 덮어쓰기: 편집 내용으로 파일 다시 생성`;
    case "unreadable":
      return `${name} 다시 읽기 실패: ${conflict.reason ?? "원인 불명"}\n덮어쓰기: 디스크의 내용 손실`;
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
    message: `${doc.title}: 저장하지 않은 변경을 버리고 디스크 내용으로 다시 읽을까요?`,
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
