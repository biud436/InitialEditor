import { defineConfig } from "vitest/config";

// 진짜 엔진과의 교차 검사 (docs/plans/rm2k-tilemap.md 6절). 엔진 프로세스를 띄우므로 루트의 yarn test 와 가른다
export default defineConfig({
  test: {
    include: ["test/engine/**/*.test.ts"],
    environment: "node",
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
