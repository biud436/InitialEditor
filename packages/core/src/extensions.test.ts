import { describe, expect, it } from "vitest";
import { CommandRegistry } from "./commands";
import { type Extension, ExtensionHost, ExtensionRegistries, topoSort } from "./extensions";
import { MenuRegistry } from "./menus";

function host() {
  const commands = new CommandRegistry({ platform: "mac" });
  const menus = new MenuRegistry();
  const registries = new ExtensionRegistries();
  return { host: new ExtensionHost({ commands, menus, registries }), commands, menus, registries };
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
    expect(() => topoSort([a])).toThrow(/없다/);
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
    await expect(h.host.activate(bad)).rejects.toThrow(/이미 있다/);
    expect(h.host.active.has("bad")).toBe(false);
    expect(h.registries.objectTypes.size).toBe(0);
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
