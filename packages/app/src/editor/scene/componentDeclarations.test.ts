import { MemoryBackend } from "@initial-editor/core/testing";
import { describe, expect, it } from "vitest";
import { ComponentDeclarations } from "./componentDeclarations";

describe("ComponentDeclarations", () => {
  it("처음 물으면 모르고, 읽고 나면 선언, 없음, 깨짐을 준다", async () => {
    const be = new MemoryBackend({
      "scripts/components/a.json": '{ "version": 1, "fields": [{ "key": "n", "type": "integer", "default": 2 }] }',
      "scripts/components/bad.json": '{ "version": 1, "fields": [{ "key": "n", "type": "vector" }] }',
    });
    await be.open("/mem");
    const decls = new ComponentDeclarations(() => be);
    const changed: string[] = [];
    decls.events.on("changed", (name) => changed.push(name));
    expect(decls.lookup("components/a")).toBeUndefined();
    const a = await decls.resolve("components/a");
    expect(a).toEqual({ kind: "declared", path: "scripts/components/a.json", declaration: { version: 1, fields: [{ key: "n", type: "integer", default: 2 }] } });
    expect(decls.lookup("components/a")).toEqual(a);
    expect(await decls.resolve("components/none")).toEqual({ kind: "none", path: "scripts/components/none.json" });
    const bad = await decls.resolve("components/bad");
    expect(bad.kind).toBe("broken");
    expect(bad.kind === "broken" && bad.message).toMatch(/fields\[0\]\.type/);
    expect(changed).toEqual(["components/a", "components/none", "components/bad"]);
  });

  it("선언 파일이나 그 폴더가 바뀌면 다시 읽고, 답이 바뀐 것만 알린다", async () => {
    const be = new MemoryBackend({ "scripts/components/a.json": '{ "version": 1, "fields": [] }' });
    await be.open("/mem");
    const decls = new ComponentDeclarations(() => be);
    await decls.resolve("components/a");
    await decls.resolve("components/b");
    const changed: string[] = [];
    decls.events.on("changed", (name) => changed.push(name));
    decls.fileChanged("scripts/components/a.json");
    await decls.resolve("components/a");
    expect(changed).toEqual([]);
    await be.writeText("scripts/components/b.json", '{ "version": 1, "fields": [{ "key": "on", "type": "boolean" }] }');
    await be.remove("scripts/components/a.json");
    decls.fileChanged("scripts/components");
    await decls.resolve("components/a");
    await decls.resolve("components/b");
    expect(changed.sort()).toEqual(["components/a", "components/b"]);
    expect(decls.lookup("components/a")?.kind).toBe("none");
    expect(decls.lookup("components/b")?.kind).toBe("declared");
    decls.clear();
    expect(decls.lookup("components/b")).toBeUndefined();
  });
});
