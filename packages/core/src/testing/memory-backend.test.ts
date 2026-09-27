// 메모리 백엔드가 이번 세션에 쓴 것을 세는가 (volatileWrites). 브라우저 모드의 떠나기 전 확인이 이것을 본다.
// 밖의 엔진이 없으므로 capabilities.hmr은 늘 false다.

import { describe, expect, it } from "vitest";
import { MemoryBackend } from "./memory-backend";

describe("MemoryBackend.volatileWrites", () => {
  it("처음 파일과 밖의 변경 흉내는 세지 않고, 쓰기와 폴더 만들기와 지우기와 이름 바꾸기를 센다", async () => {
    const backend = new MemoryBackend({ "game.json": "{}", "scripts/lua/main.lua": "-- a" });
    await backend.open("memory://sample");
    expect(backend.capabilities.hmr).toBe(false);
    expect(backend.volatileWrites).toBe(0);
    backend.simulateExternalChange("scripts/lua/main.lua", "modify", "-- outside");
    expect(backend.volatileWrites).toBe(0);
    await backend.writeText("scripts/lua/main.lua", "-- b");
    expect(backend.volatileWrites).toBe(1);
    await backend.mkdir("scripts/lua/games");
    await backend.writeText("scripts/lua/games/a.lua", "-- c");
    await backend.rename("scripts/lua/games/a.lua", "scripts/lua/games/b.lua");
    await backend.remove("scripts/lua/games/b.lua");
    expect(backend.volatileWrites).toBe(5);
  });

  it("에디터 자신의 상태(.initial-editor/ 아래)는 세지 않는다", async () => {
    const backend = new MemoryBackend({ "game.json": "{}" });
    await backend.open("memory://sample");
    await backend.writeText(".initial-editor/layout.json", "{}");
    await backend.mkdir(".initial-editor/cache");
    await backend.rename(".initial-editor/layout.json", ".initial-editor/layout.old.json");
    await backend.remove(".initial-editor/layout.old.json");
    expect(backend.volatileWrites).toBe(0);
    // 에디터 폴더 밖으로 옮기면 프로젝트 파일이 생긴 것이다
    await backend.writeText(".initial-editor/notes.txt", "x");
    await backend.rename(".initial-editor/notes.txt", "notes.txt");
    expect(backend.volatileWrites).toBe(1);
  });
});
