import { defineConfig, devices } from "@playwright/test";

// 사용자 가이드(docs/guide/images)의 화면 촬영 (yarn guide:screenshots). 먼저 yarn build.
// 테스트가 아니라 촬영이라 기본 e2e(playwright.config.ts)와 가른다
const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "tests/guide",
  timeout: 120_000,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  },
  webServer: {
    command: `yarn workspace @initial-editor/app preview --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
