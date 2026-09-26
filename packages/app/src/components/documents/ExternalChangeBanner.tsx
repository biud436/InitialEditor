// 밖에서 바뀐 파일 위의 배너 (03-project-and-runtime.md 파일 규칙 4). 미수정 문서는 조용히 다시 읽히므로
// 이 배너는 수정 중인 문서와 다시 읽기에 실패한 문서에 뜬다: "다시 읽기" 는 디스크 내용으로, "내 것 유지" 는 내 수정을 남긴다.
// 다시 읽기에 실패한 문서는 저장이 막히고, "내 것으로 덮어쓰기"를 고르면 지금 내용을 디스크에 쓴다.

import type { Document } from "@initial-editor/core";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useEditor } from "../../editor/EditorContext";

export const ExternalChangeBanner = observer(function ExternalChangeBanner({ doc }: { doc: Document }) {
  const editor = useEditor();
  const reload = async () => {
    try {
      await doc.reloadFromDisk();
      editor.toasts.info(`다시 읽었다: ${doc.title}`);
    } catch (e) {
      editor.toasts.error(`다시 읽지 못했다: ${(e as Error).message}`);
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
      editor.toasts.success(`내 것으로 덮어썼다: ${doc.title}`);
    } catch (e) {
      editor.toasts.error(`저장하지 못했다: ${(e as Error).message}`);
    }
  };
  const error = doc.reloadError;
  return (
    <div className="doc-banner" role="status" data-testid="external-change-banner" data-error={error !== null || undefined}>
      {error !== null ? (
        <span>디스크의 파일을 다시 읽지 못해 저장을 막았다: {error}</span>
      ) : (
        <span>이 파일이 밖에서 바뀌었다. 지금 보는 내용은 디스크와 다르다.</span>
      )}
      <button type="button" className="btn btn-primary" onClick={() => void reload()}>
        다시 읽기
      </button>
      {error !== null ? (
        <button type="button" className="btn" onClick={() => void overwrite()}>
          내 것으로 덮어쓰기
        </button>
      ) : (
        <button type="button" className="btn" onClick={keep}>
          내 것 유지
        </button>
      )}
    </div>
  );
});
