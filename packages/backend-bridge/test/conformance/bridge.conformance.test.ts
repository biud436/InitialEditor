// 브리지 백엔드에 적합성 한 벌을 돌린다. 진짜 브리지 서버(엔진 저장소 tools/bridge/server.js)를
// 임시 프로젝트 폴더로 띄운다. 엔진 저장소 위치는 INITIAL2D_DIR (기본 ../Initial2D).
// 실행: yarn test:conformance (루트의 yarn test 에는 들어가지 않는다. 서버를 띄우기 때문이다)

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "vitest";
import { backendConformance } from "@initial-editor/core/testing";
import { BridgeBackend } from "../../src/index";

const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? path.join(process.cwd(), "..", "..", "..", "Initial2D"));
const serverPath = path.join(engineDir, "tools", "bridge", "server.js");

interface BridgeModule {
  createBridge(options: { project: string; hmrPort?: number; log?: (m: string) => void }): {
    listen(port: number): Promise<{ port: number }>;
    close(): Promise<void>;
  };
}

if (!existsSync(serverPath)) {
  describe("ProjectBackend 적합성: BridgeBackend", () => {
    it.skip(`엔진 저장소를 찾지 못했다 (${serverPath}). INITIAL2D_DIR 를 설정한다`, () => {});
  });
} else {
  backendConformance("BridgeBackend", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ie-bridge-conf-"));
    await writeFile(path.join(root, "game.json"), "{}\n");
    // 리로드가 push 할 스크립트가 하나는 있어야 "상대가 없다"(502)까지 간다 (없으면 409 로 먼저 끝난다)
    await mkdir(path.join(root, "scripts", "lua"), { recursive: true });
    await writeFile(path.join(root, "scripts", "lua", "main.lua"), "function init() end\n");
    await mkdir(path.join(root, "resources"), { recursive: true });
    const mod = (await import(pathToFileURL(serverPath).href)) as BridgeModule;
    const bridge = mod.createBridge({ project: root, hmrPort: 1 });
    const addr = await bridge.listen(0);
    const url = `http://127.0.0.1:${addr.port}`;
    const backend = new BridgeBackend(url);
    return {
      backend,
      root: url,
      hmrUnreachable: true,
      async externalWrite(rel, text) {
        const abs = path.join(root, ...rel.split("/"));
        await mkdir(path.dirname(abs), { recursive: true });
        await writeFile(abs, text);
      },
      async cleanup() {
        await bridge.close();
        await rm(root, { recursive: true, force: true });
      },
    };
  });
}
