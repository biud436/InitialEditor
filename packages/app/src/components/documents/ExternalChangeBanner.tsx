// 밖에서 바뀐 파일 위의 배너 (03-project-and-runtime.md 파일 규칙 4). 미수정 문서는 조용히 다시 읽히므로
// 이 배너는 수정 중인 문서와 다시 읽기에 실패한 문서에 뜬다: "다시 읽기" 는 디스크 내용으로, "내 것 유지" 는 내 수정을 남긴다.
// 다시 읽기에 실패한 문서는 저장이 막히고, "내 것으로 덮어쓰기"를 고르면 지금 내용을 디스크에 쓴다.
// "내 것 유지"는 배너만 거둔다. 저장할 때 디스크가 다르면 저장 충돌 모달(SaveConflictDialog)이 한 번 더 묻는다.

import type { Document } from "@initial-editor/core";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEditor } from "../../editor/EditorContext";

export const ExternalChangeBanner = observer(function ExternalChangeBanner({ doc }: { doc: Document }) {
  const editor = useEditor();
  const reload = async () => {
    try {
      await doc.reloadFromDisk();
      editor.toasts.info(`디스크에서 다시 읽음: ${doc.title}`);
    } catch (e) {
      editor.toasts.error(`다시 읽기 실패: ${(e as Error).message}`);
    }
  };
  const keep = () => {
    runInAction(() => {
      doc.externallyChanged = false;
      doc.markDirty();
    });
  };
  const overwrite = async () => {
    doc.allowOverwrite();
    try {
      await editor.saveDocument(doc);
      editor.toasts.success(`편집 내용으로 덮어씀: ${doc.title}`);
    } catch (e) {
      editor.toasts.error(`저장 실패: ${(e as Error).message}`);
    }
  };
  const error = doc.reloadError;
  return (
    <div className="doc-banner" role="status" data-testid="external-change-banner" data-error={error !== null || undefined}>
      {error !== null ? (
        <span>디스크에서 다시 읽기 실패로 저장 차단: {error}</span>
      ) : (
        <span>외부에서 변경된 파일. 편집 내용이 디스크와 다름</span>
      )}
      <button type="button" className="btn btn-primary" onClick={() => void reload()}>
        다시 읽기
      </button>
      {error !== null ? (
        <button type="button" className="btn" onClick={() => void overwrite()}>
          편집 내용으로 덮어쓰기
        </button>
      ) : (
        <button type="button" className="btn" onClick={keep}>
          편집 내용 유지
        </button>
      )}
    </div>
  );
});
