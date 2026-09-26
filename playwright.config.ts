import { defineConfig, devices } from "@playwright/test";

// 브라우저 모드 UI 스모크 (docs/plans/e0-foundation.md 마일스톤 6).
// 테스트(tests/e2e/)가 브리지 서버를 임시 프로젝트로 직접 띄우고, 여기서는 Vite preview 만 띄운다.
// 엔진 저장소 위치는 INITIAL2D_DIR (기본 ../Initial2D).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "yarn workspace @initial-editor/app preview --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
