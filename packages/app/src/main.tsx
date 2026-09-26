// 진입점. 백엔드를 고르고(Tauri, 브리지, 메모리) 에디터를 만들어 같은 App 을 띄운다.

import { createRoot } from "react-dom/client";
import "./theme/tokens.css";
import "./theme/base.css";
import { App } from "./components/App";
import { chooseMode, createBackend, createSettingsStorage, parseQuery } from "./editor/backends";
import { Editor } from "./editor/Editor";
import { EditorProvider } from "./editor/EditorContext";
import { detectPlatform } from "./editor/platform";
import { startupOpenPath } from "@initial-editor/backend-tauri";

declare global {
  interface Window {
    /** 디버깅용: 콘솔에서 에디터를 만진다 */
    initialEditor?: Editor;
  }
}

async function boot(): Promise<void> {
  const query = parseQuery(window.location.search);
  const mode = chooseMode(query, { VITE_DEFAULT_BACKEND: import.meta.env.VITE_DEFAULT_BACKEND as string | undefined });
  const storage = createSettingsStorage(mode);
  const saved = await storage.load().catch(() => null);
  const selection = createBackend(mode, query, saved?.bridgeUrl);
  if (mode === "tauri") {
    // Tauri 는 URL 질의 대신 환경 변수나 --open 인자로 시작 프로젝트를 받는다
    const startupPath = await startupOpenPath().catch(() => null);
    if (startupPath) selection.autoOpenRoot = startupPath;
  }
  const editor = new Editor({
    mode,
    backend: selection.backend,
    storage,
    platform: detectPlatform(),
    bridgeUrl: selection.bridgeUrl,
    autoOpenRoot: selection.autoOpenRoot,
  });
  window.initialEditor = editor;
  await editor.start();
  const container = document.getElementById("root");
  if (!container) throw new Error("#root 가 없다");
  createRoot(container).render(
    <EditorProvider value={editor}>
      <App />
    </EditorProvider>,
  );
}

void boot();
