import { defineConfig } from "vitest/config";

// 진짜 LuaLS 와 에디터의 LSP 클라이언트 (docs/plans/language-server.md 7절). LuaLS 프로세스를 띄우므로 루트의 yarn test 와 가른다.
// LuaLS 는 yarn luals:fetch 가 받은 src-tauri/luals 또는 INITIAL_EDITOR_LUALS. CI 에서는 없으면 실패한다
export default defineConfig({
  test: {
    include: ["tests/luals/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
