// 화면 뼈대: 메뉴 바(브라우저 모드), 툴바, 도킹, 상태 바, 토스트, 모달. 브라우저와 Tauri 가 같은 App 을 쓴다.

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useEditor } from "../editor/EditorContext";
import { installNativeMenu } from "../editor/nativeMenu";
import { installShortcuts, installUnloadGuard } from "../editor/shortcuts";
import { Dock } from "./Dock";
import { MenuBar } from "./MenuBar";
import { Modals } from "./Modals";
import { StatusBar } from "./StatusBar";
import { Toasts } from "./Toasts";
import { Toolbar } from "./Toolbar";

export const App = observer(function App() {
  const editor = useEditor();

  // 모달 대화상자가 떠 있으면 전역 단축키를 부르지 않는다
  useEffect(() => installShortcuts(editor.commands, window, { suspended: () => editor.modals.top !== null }), [editor]);

  // 브라우저 모드: 저장하지 않은 문서가 있으면 새로 고침이나 탭 닫기 전에 묻는다
  useEffect(() => (editor.isBrowser ? installUnloadGuard(() => editor.documents.dirtyDocuments.length > 0) : undefined), [editor]);

  useEffect(() => {
    let dispose: (() => void) | null = null;
    let cancelled = false;
    void installNativeMenu(editor).then((d) => {
      if (cancelled) d();
      else dispose = d;
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [editor]);

  return (
    <div className="app" data-mode={editor.mode}>
      {editor.isBrowser && <MenuBar />}
      <Toolbar />
      <Dock />
      <StatusBar />
      <Toasts />
      <Modals />
    </div>
  );
});
