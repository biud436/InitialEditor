import { CommandRegistry, ExtensionHost, ExtensionRegistries, MenuRegistry, type Extension } from "@initial-editor/core";
import { tilemapExtension } from "@initial-editor/ext-tilemap";
import { autorun } from "mobx";
import { describe, expect, it } from "vitest";
import { attachObjectTypeParts } from "./objectTypeParts";

function host() {
  const registries = new ExtensionRegistries();
  const h = new ExtensionHost({ commands: new CommandRegistry({ platform: "mac" }), menus: new MenuRegistry(), registries });
  return { h, registries };
}

const Inspector = () => null;
const createSceneNode = () => null;

describe("오브젝트 타입에 앱의 부분 붙이기", () => {
  it("나중에 등록되는 타입에도 붙고, 반응이 돌 때는 이미 붙어 있다", async () => {
    const { h, registries } = host();
    const stop = attachObjectTypeParts(registries.objectTypes, "tilemap", { Inspector, createSceneNode });
    const seen: unknown[] = [];
    const off = autorun(() => seen.push(registries.objectTypes.get("tilemap")?.createSceneNode));
    await h.activateAll([tilemapExtension]);
    const spec = registries.objectTypes.get("tilemap")!;
    expect(spec.Inspector).toBe(Inspector);
    expect(spec.createSceneNode).toBe(createSceneNode);
    expect(seen).toEqual([undefined, createSceneNode]);
    off();
    stop();
  });

  it("이미 있는 타입에 붙고, 확장이 준 것은 덮지 않는다", async () => {
    const { h, registries } = host();
    const own = () => "own";
    const ext: Extension = { id: "x", name: "x", activate: (api) => void api.registerObjectType({ type: "x", label: "x", defaults: {}, createSceneNode: own }) };
    await h.activate(ext);
    attachObjectTypeParts(registries.objectTypes, "x", { Inspector, createSceneNode });
    const spec = registries.objectTypes.get("x")!;
    expect(spec.createSceneNode).toBe(own);
    expect(spec.Inspector).toBe(Inspector);
  });

  it("확장을 해제하면 명세가 그대로 거둬지고, 멈추면 붙인 것을 뗀다", async () => {
    const { h, registries } = host();
    const stop = attachObjectTypeParts(registries.objectTypes, "tilemap", { Inspector });
    await h.activateAll([tilemapExtension]);
    const first = registries.objectTypes.get("tilemap")!;
    await h.deactivate("tilemap");
    expect(registries.objectTypes.has("tilemap")).toBe(false);
    // 다시 켜면 새 명세에도 붙는다
    await h.activateAll([tilemapExtension]);
    const second = registries.objectTypes.get("tilemap")!;
    expect(second).not.toBe(first);
    expect(second.Inspector).toBe(Inspector);
    stop();
    expect(second.Inspector).toBeUndefined();
    await h.deactivate("tilemap");
    await h.activateAll([tilemapExtension]);
    expect(registries.objectTypes.get("tilemap")!.Inspector).toBeUndefined();
  });
});
