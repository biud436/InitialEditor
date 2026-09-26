// 화면 뼈대: 메뉴 바(브라우저 모드), 툴바, 도킹, 상태 바, 토스트, 모달. 브라우저와 Tauri 가 같은 App 을 쓴다.

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useEditor } from "../editor/EditorContext";
import { installNativeMenu } from "../editor/nativeMenu";
import { installShortcuts } from "../editor/shortcuts";
import { Dock } from "./Dock";
import { MenuBar } from "./MenuBar";
import { Modals } from "./Modals";
import { StatusBar } from "./StatusBar";
import { Toasts } from "./Toasts";
import { Toolbar } from "./Toolbar";

export const App = observer(function App() {
  const editor = useEditor();

  useEffect(() => installShortcuts(editor.commands), [editor]);

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
