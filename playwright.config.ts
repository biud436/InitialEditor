import { defineConfig, devices } from "@playwright/test";

// 미리보기 포트. 작업 트리 둘에서 동시에 돌릴 때 E2E_PORT 로 바꾼다
const PORT = Number(process.env.E2E_PORT ?? 4173);

// WebKit 프로젝트가 도는 스펙. 브라우저 엔진에 따라 동작이 갈리는 것만 (Tauri 의 macOS 웹뷰가 WKWebView 다)
const WEBKIT_SPECS = ["scripting.spec.ts", "script-tabs.spec.ts", "graph-editor.spec.ts", "language-server.spec.ts"];

// 브라우저 모드 UI 스모크 (docs/plans/e0-foundation.md 마일스톤 6).
// 테스트(tests/e2e/)가 브리지 서버를 임시 프로젝트로 직접 띄우고, 여기서는 Vite preview 만 띄운다.
// 엔진 저장소 위치는 INITIAL2D_DIR (기본 ../Initial2D).
// 프로젝트는 chromium(모든 스펙, yarn test:e2e)과 webkit(WEBKIT_SPECS, yarn test:e2e:webkit) 둘이다.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: WEBKIT_SPECS },
  ],
  webServer: {
    command: `yarn workspace @initial-editor/app preview --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
