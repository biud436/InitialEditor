import { defineConfig, devices } from "@playwright/test";

// 화면 검수판 (yarn review, docs/plans/quality.md 5.2절). 먼저 yarn build.
// 테스트가 아니라 촬영이라 기본 e2e(playwright.config.ts)와 가른다. 화면 크기와 테마는 장면마다 따로 정한다
const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "tests/review",
  timeout: 120_000,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: {
    command: `yarn workspace @initial-editor/app preview --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
