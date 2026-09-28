// 오브젝트 추가 대화상자 (씬 > 오브젝트 추가 > 목록에서 고르기, Ctrl+Shift+A). 코어 타입과 확장이 등록한 타입을
// 라벨과 아이콘으로 보이고, 고르면 씬 뷰의 카메라 중심(없으면 0, 0)에 더해 선택한다.

import { observer } from "mobx-react-lite";
import type { Editor } from "../Editor";
import { useEditor } from "../EditorContext";
import { TypeIcon } from "./typeIcons";

const AddObjectList = observer(function AddObjectList({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const types = editor.sceneTools.objectTypes();
  const pick = (type: string) => {
    onClose();
    editor.sceneTools.addObject(type);
  };
  return (
    <div data-testid="add-object-dialog">
      <div className="modal-body add-object-body">
        {types.length === 0 && <div className="muted">등록된 오브젝트 타입 없음</div>}
        <div className="add-object-list" role="listbox" aria-label="오브젝트 타입">
          {types.map((t, i) => (
            <button key={t.type} type="button" className="add-object-item" role="option" aria-selected={false} onClick={() => pick(t.type)} data-type={t.type} data-testid="add-object-type" data-autofocus={i === 0 ? true : undefined}>
              <span className="add-object-icon">
                <TypeIcon icon={t.icon ?? t.type} size={16} />
              </span>
              <span className="add-object-label">{t.label}</span>
              <span className="muted add-object-type">{t.type}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
});

export function openAddObjectDialog(editor: Editor): Promise<void> {
  return editor.modals.custom({ title: "오브젝트 추가", width: 380, render: (close) => <AddObjectList onClose={close} /> });
}
