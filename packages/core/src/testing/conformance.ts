// ProjectBackend 적합성 테스트 한 벌 (docs/plans/e0-foundation.md 마일스톤 3).
// 백엔드가 늘 때마다 그대로 돌린다: MemoryBackend(core), BridgeBackend(backend-bridge, 진짜 서버를 띄운다).
// Tauri 구현은 웹뷰 없이는 못 돌리므로 같은 케이스를 Rust 단위 테스트(src-tauri)로 옮긴다.
//
// 이 파일은 vitest 안에서만 import 한다 (@initial-editor/core/testing).

import { describe, expect, it, afterEach } from "vitest";
import { BackendError, type ChangeEvent, type ProjectBackend } from "../backend";
import { encodeUtf8 } from "../utf8";

export interface ConformanceHarness {
  backend: ProjectBackend;
  /** open() 에 넘길 값 (Tauri 는 폴더 경로, 브리지는 URL) */
  root: string;
  /** 에디터를 거치지 않고 파일을 쓴다 (외부 변경 감시 테스트). 못 하면 생략 */
  externalWrite?(rel: string, text: string): Promise<void>;
  /** hmrPush 의 상대가 없는 것이 확실한가 (있으면 unreachable 검사를 건너뛴다) */
  hmrUnreachable?: boolean;
  cleanup(): Promise<void>;
}

export async function waitFor<T>(fn: () => T | undefined | null | false, timeoutMs = 4000, stepMs = 25): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v as T;
    if (Date.now() > deadline) throw new Error("waitFor: 시간 초과");
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

const KOREAN_TEXT = "-- 대사에는 줄바꿈과 따옴표와 한글이 들어간다\nlocal s = \"안녕, \\\"세계\\\"\"\nreturn s\n";

export function backendConformance(name: string, create: () => Promise<ConformanceHarness>): void {
  describe(`ProjectBackend 적합성: ${name}`, () => {
    let h: ConformanceHarness | null = null;

    async function opened(): Promise<ConformanceHarness> {
      h = await create();
      await h.backend.open(h.root);
      return h;
    }

    afterEach(async () => {
      if (h) {
        await h.backend.close().catch(() => {});
        await h.cleanup();
        h = null;
      }
    });

    it("open 은 이름과 game.json 유무를 준다", async () => {
      const { backend } = await opened();
      const again = await backend.open(h!.root);
      expect(typeof again.name).toBe("string");
      expect(again.name.length).toBeGreaterThan(0);
      expect(typeof again.hasGameJson).toBe("boolean");
    });

    it("텍스트 왕복 (한글, 줄바꿈, 따옴표) 과 상위 폴더 자동 생성", async () => {
      const { backend } = await opened();
      await backend.writeText("scripts/lua/conf/deep/x.lua", KOREAN_TEXT);
      expect(await backend.readText("scripts/lua/conf/deep/x.lua")).toBe(KOREAN_TEXT);
      expect(await backend.exists("scripts/lua/conf/deep")).toBe(true);
      expect(await backend.exists("scripts/lua/conf/deep/x.lua")).toBe(true);
      expect(await backend.exists("scripts/lua/conf/deep/nope.lua")).toBe(false);
    });

    it("바이너리 왕복", async () => {
      const { backend } = await opened();
      const data = new Uint8Array(512);
      for (let i = 0; i < data.length; i++) data[i] = (i * 31) & 0xff;
      await backend.writeBinary("resources/images/blob.bin", data);
      const back = await backend.readBinary("resources/images/blob.bin");
      expect(back.byteLength).toBe(512);
      expect(Array.from(back)).toEqual(Array.from(data));
    });

    it("덮어쓰기는 마지막 내용을 남긴다", async () => {
      const { backend } = await opened();
      await backend.writeText("scripts/a.lua", "1");
      await backend.writeText("scripts/a.lua", "22");
      await backend.writeText("scripts/a.lua", "333");
      expect(await backend.readText("scripts/a.lua")).toBe("333");
    });

    it("list 는 한 층만, 종류와 이름과 경로를 준다", async () => {
      const { backend } = await opened();
      await backend.writeText("scripts/lua/main.lua", "a");
      await backend.writeText("scripts/lua/sub/x.lua", "b");
      await backend.writeText("scripts/ruby/main.rb", "c");
      const root = await backend.list("");
      const scripts = root.find((e) => e.name === "scripts");
      expect(scripts?.kind).toBe("dir");
      expect(scripts?.path).toBe("scripts");
      const lua = await backend.list("scripts/lua");
      expect(lua.map((e) => `${e.kind}:${e.name}`).sort()).toEqual(["dir:sub", "file:main.lua"]);
      expect(lua.find((e) => e.name === "main.lua")?.path).toBe("scripts/lua/main.lua");
      expect(lua.find((e) => e.name === "main.lua")?.size).toBe(1);
      const withSlash = await backend.list("scripts/lua/");
      expect(withSlash.length).toBe(2);
    });

    it("없는 폴더와 없는 파일은 not_found", async () => {
      const { backend } = await opened();
      await expect(backend.list("scripts/nowhere")).rejects.toMatchObject({ code: "not_found" });
      await expect(backend.readText("scripts/nowhere.lua")).rejects.toMatchObject({ code: "not_found" });
      await expect(backend.remove("scripts/nowhere.lua")).rejects.toMatchObject({ code: "not_found" });
    });

    it("루트 밖은 outside_root 로 거부한다 (읽기, 쓰기, 목록, 삭제)", async () => {
      const { backend } = await opened();
      for (const bad of ["../x.lua", "scripts/../../x.lua", "..", "/etc/passwd", "C:\\Windows\\x"]) {
        await expect(backend.readText(bad)).rejects.toBeInstanceOf(BackendError);
        await expect(backend.writeText(bad, "x")).rejects.toMatchObject({ code: "outside_root" });
        await expect(backend.list(bad)).rejects.toMatchObject({ code: "outside_root" });
        await expect(backend.remove(bad)).rejects.toMatchObject({ code: "outside_root" });
      }
    });

    it("mkdir, rename, remove", async () => {
      const { backend } = await opened();
      await backend.mkdir("resources/maps");
      expect(await backend.exists("resources/maps")).toBe(true);
      expect((await backend.list("resources")).map((e) => e.name)).toContain("maps");
      await backend.writeText("resources/maps/a.json", "{}");
      await backend.rename("resources/maps/a.json", "resources/maps/b.json");
      expect(await backend.exists("resources/maps/a.json")).toBe(false);
      expect(await backend.readText("resources/maps/b.json")).toBe("{}");
      await backend.rename("resources/maps", "resources/maps2");
      expect(await backend.readText("resources/maps2/b.json")).toBe("{}");
      await backend.remove("resources/maps2/b.json");
      expect(await backend.exists("resources/maps2/b.json")).toBe(false);
      await backend.remove("resources/maps2");
      expect(await backend.exists("resources/maps2")).toBe(false);
    });

    it("루트 자체는 지우지 못한다", async () => {
      const { backend } = await opened();
      await expect(backend.remove("")).rejects.toBeInstanceOf(BackendError);
    });

    it("watch 는 내가 쓴 것을 알린다", async () => {
      const { backend } = await opened();
      if (!backend.capabilities.watch) return;
      const seen: ChangeEvent[] = [];
      const off = backend.watch((e) => seen.push(e));
      await backend.whenWatching?.();
      await backend.writeText("scripts/watched.lua", "x");
      await waitFor(() => seen.some((e) => e.path === "scripts/watched.lua"));
      await backend.remove("scripts/watched.lua");
      await waitFor(() => seen.some((e) => e.path === "scripts/watched.lua" && e.kind === "delete"));
      off();
      const before = seen.length;
      await backend.writeText("scripts/after-off.lua", "x");
      await new Promise((r) => setTimeout(r, 150));
      expect(seen.length).toBe(before);
    });

    it("watch 는 밖에서 바뀐 것을 external 로 알린다", async () => {
      const harness = await opened();
      const { backend } = harness;
      if (!backend.capabilities.watch || !harness.externalWrite) return;
      const seen: ChangeEvent[] = [];
      const off = backend.watch((e) => seen.push(e));
      await backend.whenWatching?.();
      await harness.externalWrite("scripts/outside.lua", "changed outside");
      const ev = await waitFor(() => seen.find((e) => e.path === "scripts/outside.lua"));
      expect(ev.origin).toBe("external");
      expect(await backend.readText("scripts/outside.lua")).toBe("changed outside");
      off();
    });

    it("capabilities 가 false 인 것은 unsupported 로 거부한다", async () => {
      const { backend } = await opened();
      if (!backend.capabilities.run) {
        await expect(backend.run({ exe: "/nope", cwd: "/nope" })).rejects.toMatchObject({ code: "unsupported" });
      }
      if (!backend.capabilities.pickFolder) {
        await expect(backend.pickFolder()).rejects.toMatchObject({ code: "unsupported" });
      }
    });

    it("hmrPush 는 상대가 없으면 hmr_unreachable", async () => {
      const harness = await opened();
      if (!harness.hmrUnreachable) return;
      await expect(
        harness.backend.hmrPush([{ path: "scripts/lua/main.lua", data: encodeUtf8("x") }], { host: "127.0.0.1", port: 1 }),
      ).rejects.toMatchObject({ code: "hmr_unreachable" });
    });

    it("close 뒤에는 not_open", async () => {
      const { backend } = await opened();
      await backend.close();
      await expect(backend.readText("game.json")).rejects.toMatchObject({ code: "not_open" });
    });
  });
}
