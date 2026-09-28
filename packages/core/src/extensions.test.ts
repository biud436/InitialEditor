import { autorun } from "mobx";
import { describe, expect, it, vi } from "vitest";
import type { ChangeEvent } from "./backend";
import { CommandRegistry } from "./commands";
import { DocumentRegistry } from "./document";
import { Emitter } from "./events";
import { detachedWorkspace, type Extension, type ExtensionApi, ExtensionHost, ExtensionRegistries, topoSort, type Workspace } from "./extensions";
import { LogStore } from "./log";
import { MenuRegistry } from "./menus";
import { MemoryBackend } from "./testing/memory-backend";

function host(workspace?: Workspace) {
  const commands = new CommandRegistry({ platform: "mac" });
  const menus = new MenuRegistry();
  const registries = new ExtensionRegistries();
  return { host: new ExtensionHost({ commands, menus, registries, workspace }), commands, menus, registries };
}

describe("topoSort", () => {
  it("의존을 먼저 놓는다", () => {
    const a: Extension = { id: "a", name: "a", activate() {} };
    const b: Extension = { id: "b", name: "b", dependsOn: ["a"], activate() {} };
    const c: Extension = { id: "c", name: "c", dependsOn: ["b", "a"], activate() {} };
    expect(topoSort([c, b, a]).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("순환과 빠진 의존은 오류", () => {
    const a: Extension = { id: "a", name: "a", dependsOn: ["b"], activate() {} };
    const b: Extension = { id: "b", name: "b", dependsOn: ["a"], activate() {} };
    expect(() => topoSort([a, b])).toThrow(/순환/);
    expect(() => topoSort([a])).toThrow(/의존 확장 b 없음/);
  });
});

describe("ExtensionHost", () => {
  it("등록한 것을 해제하면 전부 거둔다", async () => {
    const h = host();
    const ext: Extension = {
      id: "tilemap",
      name: "타일맵",
      activate(api) {
        api.registerObjectType({ type: "tilemap", label: "타일맵", defaults: {} });
        api.registerAssetType({ id: "tileset", label: "타일셋", extensions: ["png"] });
        api.registerPanel({ id: "palette", title: "타일 팔레트", Component: null });
        api.registerTool({ id: "pen", label: "펜", appliesTo: ["tilemap"] });
        api.registerCommand({ id: "tilemap.import", label: "맵 가져오기", run() {} });
        api.registerMenu({ path: "도구/타일맵/맵 가져오기", commandId: "tilemap.import" });
        api.registerValidator(() => []);
        api.registerExporter({ id: "v1", label: "v1", run() {} });
      },
    };
    await h.host.activate(ext);
    expect(h.registries.objectTypes.has("tilemap")).toBe(true);
    expect(h.registries.assetTypeFor("PNG")?.id).toBe("tileset");
    expect(h.registries.panels.size).toBe(1);
    expect(h.registries.tools.size).toBe(1);
    expect(h.commands.get("tilemap.import")).toBeDefined();
    expect(h.menus.tree().length).toBe(1);
    expect(h.registries.validators.length).toBe(1);
    expect(h.registries.exporters.size).toBe(1);

    await h.host.deactivate("tilemap");
    expect(h.registries.objectTypes.size).toBe(0);
    expect(h.registries.assetTypes.size).toBe(0);
    expect(h.registries.panels.size).toBe(0);
    expect(h.registries.tools.size).toBe(0);
    expect(h.commands.get("tilemap.import")).toBeUndefined();
    expect(h.menus.tree().length).toBe(0);
    expect(h.registries.validators.length).toBe(0);
    expect(h.registries.exporters.size).toBe(0);
  });

  it("중복 등록은 오류이고, 실패한 활성화는 흔적을 남기지 않는다", async () => {
    const h = host();
    const bad: Extension = {
      id: "bad",
      name: "bad",
      activate(api) {
        api.registerObjectType({ type: "x", label: "x", defaults: {} });
        api.registerObjectType({ type: "x", label: "x", defaults: {} });
      },
    };
    await expect(h.host.activate(bad)).rejects.toThrow(/오브젝트 타입 중복 등록: x/);
    expect(h.host.active.has("bad")).toBe(false);
    expect(h.registries.objectTypes.size).toBe(0);
  });

  it("누가 보고 있는 레지스트리에 등록해도 액션 밖 변경 경고가 없다", async () => {
    const h = host();
    const seen: number[] = [];
    const stop = autorun(() => seen.push(h.registries.panels.size + h.registries.objectTypes.size + h.registries.validators.length));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await h.host.activate({
        id: "p",
        name: "p",
        activate(api) {
          api.registerPanel({ id: "p.list", title: "목록", Component: null });
          api.registerObjectType({ type: "x", label: "x", defaults: {} });
          api.registerValidator(() => []);
        },
      });
      await h.host.deactivate("p");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      stop();
    }
    expect(seen).toEqual([0, 1, 2, 3, 2, 1, 0]);
  });

  it("의존하는 확장을 먼저 해제하면 뒤따르는 확장도 해제된다", async () => {
    const h = host();
    const order: string[] = [];
    const base: Extension = { id: "base", name: "base", activate() { order.push("base"); } };
    const rpg: Extension = { id: "rpg", name: "rpg", dependsOn: ["base"], activate() { order.push("rpg"); } };
    expect(await h.host.activateAll([rpg, base])).toEqual(["base", "rpg"]);
    expect(order).toEqual(["base", "rpg"]);
    await h.host.deactivate("base");
    expect(h.host.active.size).toBe(0);
  });
});

describe("확장의 내보내기", () => {
  it("activate 가 돌려준 값을 dependsOn 에 적은 확장이 exportsOf 로 받는다", async () => {
    const h = host();
    const seen: unknown[] = [];
    const base: Extension = { id: "base", name: "base", activate: () => ({ hello: "base" }) };
    const user: Extension = {
      id: "user",
      name: "user",
      dependsOn: ["base"],
      activate(api) {
        seen.push(api.exportsOf<{ hello: string }>("base").hello);
        return 42;
      },
    };
    await h.host.activateAll([user, base]);
    expect(seen).toEqual(["base"]);
    expect(h.host.exportsOf("base")).toEqual({ hello: "base" });
    expect(h.host.exportsOf<number>("user")).toBe(42);
    await h.host.deactivate("base");
    expect(h.host.exportsOf("base")).toBeUndefined();
    expect(h.host.exportsOf("user")).toBeUndefined();
  });

  it("async activate 의 값도 내보내기이고, 돌려주지 않으면 undefined 다", async () => {
    const h = host();
    await h.host.activate({ id: "a", name: "a", activate: async () => "later" });
    await h.host.activate({ id: "b", name: "b", activate() {} });
    expect(h.host.exportsOf("a")).toBe("later");
    expect(h.host.exportsOf("b")).toBeUndefined();
  });

  it("dependsOn 에 적지 않은 확장의 내보내기는 활성이어도 오류다", async () => {
    const h = host();
    let api: ExtensionApi | null = null;
    await h.host.activate({ id: "base", name: "base", activate: () => ({}) });
    await h.host.activate({
      id: "other",
      name: "other",
      activate(a) {
        api = a;
      },
    });
    expect(() => api!.exportsOf("base")).toThrow("확장 other: dependsOn에 base 없음 (내보내기 사용 불가)");
  });
});

describe("작업 공간", () => {
  it("호스트에 준 작업 공간을 확장이 api.workspace 로 본다", async () => {
    const backend = new MemoryBackend({ "a.txt": "a" });
    const changes = new Emitter<{ change: ChangeEvent }>();
    const workspace: Workspace = {
      backend: () => backend,
      project: { isOpen: true, root: "/p", onOpened: () => () => {}, onClosed: () => () => {}, onFileChange: (l) => changes.on("change", l) },
      documents: new DocumentRegistry(),
      log: new LogStore(),
      toasts: { info: () => {}, success: () => {}, warn: () => {}, error: () => {} },
      openPath: async () => {},
    };
    const h = host(workspace);
    const seen: string[] = [];
    await h.host.activate({
      id: "w",
      name: "w",
      activate(api) {
        expect(api.workspace).toBe(workspace);
        expect(api.workspace.backend()).toBe(backend);
        api.onDeactivate(api.workspace.project.onFileChange((e) => seen.push(e.path)));
      },
    });
    changes.emit("change", { path: "a.txt", kind: "modify", origin: "external" });
    await h.host.deactivate("w");
    changes.emit("change", { path: "b.txt", kind: "modify", origin: "external" });
    expect(seen).toEqual(["a.txt"]);
    expect(changes.listenerCount("change")).toBe(0);
  });

  it("작업 공간을 주지 않은 호스트는 프로젝트가 닫힌 빈 작업 공간을 준다", async () => {
    const h = host();
    expect(h.host.workspace.project.isOpen).toBe(false);
    expect(h.host.workspace.documents.documents).toEqual([]);
    expect(() => h.host.workspace.backend()).toThrow("작업 공간에 백엔드 없음");
    await expect(h.host.workspace.openPath("resources/maps/a.json")).rejects.toThrow("작업 공간에 열린 프로젝트 없음: resources/maps/a.json");
    expect(detachedWorkspace().documents).not.toBe(detachedWorkspace().documents);
  });

  it("onDeactivate 는 해제할 때 한 번 부르고, 돌려준 함수로 먼저 불렀으면 다시 부르지 않는다", async () => {
    const h = host();
    const calls: string[] = [];
    await h.host.activate({
      id: "x",
      name: "x",
      activate(api) {
        api.onDeactivate(() => calls.push("later"));
        const early = api.onDeactivate(() => calls.push("early"));
        early();
      },
    });
    expect(calls).toEqual(["early"]);
    await h.host.deactivate("x");
    expect(calls).toEqual(["early", "later"]);
  });
});
