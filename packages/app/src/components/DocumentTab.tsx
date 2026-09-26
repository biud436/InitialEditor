// 문서 탭. 제목과 저장 안 됨 점과 닫기 버튼. 탭 클릭과 끌기는 dockview 가 한다. 저장 안 된 문서는 닫기 전에 묻는다.

import type { IDockviewPanelHeaderProps } from "dockview";
import { observer } from "mobx-react-lite";
import { useEditor } from "../editor/EditorContext";
import { CloseIcon } from "./icons";

export const DocumentTab = observer(function DocumentTab(props: IDockviewPanelHeaderProps) {
  const editor = useEditor();
  const doc = editor.documentDock.findDocument(props.api.id);
  const title = doc?.title ?? props.api.title ?? props.api.id;
  const dirty = doc?.dirty ?? false;
  const close = async () => {
    if (doc?.dirty) {
      const ok = await editor.modals.confirm({
        title: "탭 닫기",
        message: `${title} 에 저장하지 않은 변경이 있다. 저장하지 않고 닫을까?`,
        okLabel: "닫기",
        danger: true,
      });
      if (!ok) return;
    }
    props.api.close();
  };
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
          void close();
        }}
      >
        <CloseIcon size={11} />
      </button>
    </div>
  );
});
