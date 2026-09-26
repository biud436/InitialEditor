// 문서 탭. 제목과 저장 안 됨 점과 닫기 버튼. 탭 클릭과 끌기는 dockview 가 한다.

import type { IDockviewPanelHeaderProps } from "dockview";
import { observer } from "mobx-react-lite";
import { useEditor } from "../editor/EditorContext";
import { CloseIcon } from "./icons";

export const DocumentTab = observer(function DocumentTab(props: IDockviewPanelHeaderProps) {
  const editor = useEditor();
  const doc = editor.documentDock.findDocument(props.api.id);
  const title = doc?.title ?? props.api.title ?? props.api.id;
  const dirty = doc?.dirty ?? false;
  return (
    <div className={"doc-tab" + (dirty ? " is-dirty" : "")} data-testid="doc-tab" data-dirty={dirty || undefined} title={doc?.path ?? undefined}>
      <span className="doc-tab-title">{title}</span>
      {dirty && (
        <span className="doc-tab-dirty" aria-label="저장 안 됨">
          ●
        </span>
      )}
      <button
        type="button"
        className="doc-tab-close"
        aria-label={`${title} 닫기`}
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          props.api.close();
        }}
      >
        <CloseIcon size={11} />
      </button>
    </div>
  );
});
