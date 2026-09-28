// 진입점. 백엔드를 고르고(Tauri, 브리지, 메모리, 브라우저 폴더) 에디터를 만들어 같은 App 을 띄운다.
// Tauri 셸이 자가 검사 계획을 주면(INITIAL_EDITOR_SELFTEST, docs/plans/e6-packaging.md 5절) 설정과 레이아웃을 메모리에 둔
// 에디터로 계획을 돌린다. 웹뷰 보안 정책(CSP) 위반은 에디터를 만들기 전부터 모은다.

// PIXI 8 은 셰이더 준비에 new Function 을 쓴다. 데스크톱의 CSP 에는 unsafe-eval 이 없으므로 그 길을 끈다
import "pixi.js/unsafe-eval";
import { createRoot } from "react-dom/client";
import "./theme/tokens.css";
import "./theme/base.css";
import { App } from "./components/App";
import { chooseMode, createBackend, createSettingsStorage, isFolderFallback, parseQuery } from "./editor/backends";
import { Editor } from "./editor/Editor";
import { EditorProvider } from "./editor/EditorContext";
import { detectPlatform } from "./editor/platform";
import { chooseStorage, installCspCollector, startSelftest } from "./editor/selftest";
import { selftestFinish, selftestPlan, selftestProgress, selftestWriteLog, startupOpenPath } from "@initial-editor/backend-tauri";

declare global {
  interface Window {
    /** 디버깅용: 콘솔에서 에디터를 만진다 */
    initialEditor?: Editor;
  }
}

const csp = installCspCollector(document);

async function boot(): Promise<void> {
  const query = parseQuery(window.location.search);
  const mode = chooseMode(query, { VITE_DEFAULT_BACKEND: import.meta.env.VITE_DEFAULT_BACKEND as string | undefined });
  const plan = mode === "tauri" ? await selftestPlan().catch(() => null) : null;
  const { storage, local } = chooseStorage(plan, () => createSettingsStorage(mode));
  const saved = await storage.load().catch(() => null);
  const selection = createBackend(mode, query, saved?.bridgeUrl);
  if (mode === "tauri" && !plan) {
    // Tauri 는 URL 질의 대신 환경 변수나 --open 인자로 시작 프로젝트를 받는다
    const startupPath = await startupOpenPath().catch(() => null);
    if (startupPath) selection.autoOpenRoot = startupPath;
  }
  const editor = new Editor({
    mode,
    backend: selection.backend,
    storage,
    local,
    platform: detectPlatform(),
    bridgeUrl: selection.bridgeUrl,
    autoOpenRoot: selection.autoOpenRoot,
  });
  window.initialEditor = editor;
  await editor.start();
  if (isFolderFallback(mode)) editor.log.info("editor", "폴더 열기(File System Access API) 미지원 브라우저, 메모리 모드로 시작됨 (크롬, 엣지에서 지원)");
  const container = document.getElementById("root");
  if (!container) throw new Error("#root 요소 없음");
  createRoot(container).render(
    <EditorProvider value={editor}>
      <App />
    </EditorProvider>,
  );
  if (plan) void startSelftest(editor, plan, { progress: selftestProgress, writeLog: selftestWriteLog, finish: selftestFinish }, csp);
}

void boot();
