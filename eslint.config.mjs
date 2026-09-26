import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// core 는 DOM 도 PIXI 도 모른다 (docs/plans/01-tech-stack.md 5절). 그래야 Node 로 테스트되고
// 씬 포맷 변환을 엔진 픽스처와 대조할 수 있다. 여기서 import 와 전역을 막는다.
export default tseslint.config(
  // packages/app/public/engine 은 엔진 웹 빌드의 사본이다 (scripts/sync-engine-web.mjs)
  { ignores: ["**/dist/**", "**/node_modules/**", "legacy/**", "src-tauri/**", "tests/**", "packages/app/public/engine/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  // 훅은 조건이나 이른 return 뒤에서 부르지 않는다 (어기면 React 오류 310 으로 화면 전체가 빈다)
  {
    files: ["packages/app/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
  {
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["pixi.js", "pixi.js/*", "react", "react-dom", "monaco-editor", "dockview"] }],
      "no-restricted-globals": ["error", "document", "window", "navigator", "localStorage", "HTMLElement"],
    },
  },
  {
    files: ["packages/backend-bridge/src/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", "document", "window"],
    },
  },
);
