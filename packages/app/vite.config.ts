import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolveAppCommit } from "./src/buildCommit";

// 브라우저 모드와 Tauri 모드가 같은 번들을 쓴다. Tauri 는 dist/ 를 웹뷰에 올린다.
// 개발: yarn dev (5173). 미리보기(Playwright 가 띄운다): yarn preview (4173).
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// 정보 창의 커밋 (GITHUB_SHA > CF_PAGES_COMMIT_SHA > git rev-parse > "dev")
const commit = resolveAppCommit(process.env, () =>
  execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { cwd: new URL(".", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
);

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ["VITE_"],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  resolve: {
    // 워크스페이스 패키지(core)가 제 node_modules 의 mobx 를 들지 않게 한 벌로 묶는다.
    dedupe: ["mobx", "mobx-react-lite", "react", "react-dom"],
  },
  // devUrl(tauri.conf.json)과 CSP 가 127.0.0.1 이다. localhost 는 IPv6(::1)로만 열릴 수 있어 주소를 고정한다
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    // 저장소 루트의 dist/ 로 낸다. Cloudflare Pages 가 옛 에디터 때부터 `yarn build` 뒤 dist/ 를 배포한다
    outDir: "../../dist",
    emptyOutDir: true,
    target: "es2022",
    // 웹판은 소스맵을 둔다 (오류 추적). 데스크톱 번들(yarn build:desktop)은 뺀다: Tauri 가 프런트를 실행 파일에 넣는다
    sourcemap: process.env.VITE_SOURCEMAP !== "0",
  },
});
