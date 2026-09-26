import js from "@eslint/js";
import tseslint from "typescript-eslint";

// core 는 DOM 도 PIXI 도 모른다 (docs/plans/01-tech-stack.md 5절). 그래야 Node 로 테스트되고
// 씬 포맷 변환을 엔진 픽스처와 대조할 수 있다. 여기서 import 와 전역을 막는다.
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "legacy/**", "src-tauri/**", "tests/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
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
