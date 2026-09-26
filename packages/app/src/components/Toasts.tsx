// 오른쪽 아래 토스트. 잠시 뒤 스스로 사라지고 누르면 바로 닫힌다.

import { observer } from "mobx-react-lite";
import { useEditor } from "../editor/EditorContext";
import "./Toasts.css";

export const Toasts = observer(function Toasts() {
  const editor = useEditor();
  return (
    <div className="toasts" aria-live="polite" data-testid="toasts">
      {editor.toasts.toasts.map((t) => (
        <button key={t.id} type="button" className={`toast toast-${t.level}`} onClick={() => editor.toasts.dismiss(t.id)}>
          {t.text}
        </button>
      ))}
    </div>
  );
});
