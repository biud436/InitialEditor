// 브라우저 폴더 백엔드에 적합성 한 벌을 돌린다. File System Access API 는 메모리 가짜(fakeFs.ts)다.
// 폴링 간격만 줄인다 (기본 1.5초는 backend.test.ts 와 e2e 가 본다).

import { backendConformance } from "@initial-editor/core/testing";
import { FsAccessBackend } from "../src/FsAccessBackend";
import { HandleStore, MemoryFolderTable } from "../src/handleStore";
import { FakeFs } from "./fakeFs";

backendConformance("FsAccessBackend (가짜 파일 시스템)", async () => {
  const fs = new FakeFs({ name: "conformance", permission: { state: "granted" } });
  fs.writeFile("game.json", "{}\n");
  const handles = new HandleStore(new MemoryFolderTable());
  const record = await handles.remember(fs.root());
  const backend = new FsAccessBackend({ handles, pollMs: 100 });
  return {
    backend,
    root: record.key,
    hmrUnreachable: false,
    async externalWrite(rel, text) {
      fs.writeFile(rel, text);
    },
    async cleanup() {},
  };
});

backendConformance("FsAccessBackend (OPFS, move 있음)", async () => {
  const fs = new FakeFs({ name: "", move: true });
  fs.writeFile("e2e/game.json", "{}\n");
  const backend = new FsAccessBackend({ handles: new HandleStore(new MemoryFolderTable()), opfsRoot: async () => fs.root(), pollMs: 100 });
  return {
    backend,
    root: "opfs:e2e",
    hmrUnreachable: false,
    async externalWrite(rel, text) {
      fs.writeFile(`e2e/${rel}`, text);
    },
    async cleanup() {},
  };
});
