import { defineConfig } from "vitest/config";

// 한 러너로 모든 패키지의 단위 테스트를 돈다. React 컴포넌트 테스트는 파일 머리에
// `// @vitest-environment jsdom` 을 적는다. 브리지 적합성 테스트(서버를 띄운다)는
// 별도 스크립트(yarn test:conformance)로 돈다.
export default defineConfig({
  test: {
    // tests/e2e/support 의 도우미 단위 테스트는 *.unit.ts 다 (Playwright 가 *.test.ts 를 모으지 않게)
    include: ["packages/*/src/**/*.test.ts", "packages/*/src/**/*.test.tsx", "packages/*/test/**/*.test.ts", "tests/e2e/support/**/*.unit.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "packages/backend-bridge/test/conformance/**"],
    environment: "node",
  },
});
