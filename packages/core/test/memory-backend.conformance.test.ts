// 적합성 테스트 한 벌을 메모리 백엔드에 돌린다. 이 벌이 스스로 말이 되는지도 여기서 확인된다.
import { MemoryBackend } from "../src/testing/memory-backend";
import { backendConformance } from "../src/testing/conformance";

backendConformance("MemoryBackend", async () => {
  const backend = new MemoryBackend({ "game.json": "{}" });
  return {
    backend,
    root: "/mem/project",
    hmrUnreachable: false,
    async externalWrite(rel, text) {
      backend.simulateExternalChange(rel, "modify", text);
    },
    async cleanup() {},
  };
});
