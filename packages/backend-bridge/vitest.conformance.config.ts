import { defineConfig } from "vitest/config";

// 브리지 적합성 테스트: 진짜 서버를 띄우므로 루트의 yarn test 와 분리한다 (yarn test:conformance)
export default defineConfig({
  test: {
    include: ["test/conformance/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
