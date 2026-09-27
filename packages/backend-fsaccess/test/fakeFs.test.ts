// 가짜가 명세대로 움직이는지 (적합성 테스트가 이 가짜에 기대므로 가짜 자체를 먼저 확인한다).

import { describe, expect, it } from "vitest";
import { FakeFs } from "./fakeFs";

const text = async (fs: FakeFs, name: string) => (await (await (await fs.root().getFileHandle(name)).getFile()).text());

describe("FakeFs", () => {
  it("없으면 NotFoundError, 종류가 다르면 TypeMismatchError, 잘못된 이름은 TypeError", async () => {
    const fs = new FakeFs();
    fs.writeFile("dir/a.txt", "a");
    const root = fs.root();
    await expect(root.getFileHandle("nope")).rejects.toMatchObject({ name: "NotFoundError" });
    await expect(root.getFileHandle("dir")).rejects.toMatchObject({ name: "TypeMismatchError" });
    await expect((await root.getDirectoryHandle("dir")).getDirectoryHandle("a.txt")).rejects.toMatchObject({ name: "TypeMismatchError" });
    for (const bad of ["", ".", "..", "a/b"]) await expect(root.getFileHandle(bad)).rejects.toBeInstanceOf(TypeError);
  });

  it("차 있는 폴더는 recursive 없이 지우면 InvalidModificationError", async () => {
    const fs = new FakeFs();
    fs.writeFile("dir/a.txt", "a");
    await expect(fs.root().removeEntry("dir")).rejects.toMatchObject({ name: "InvalidModificationError" });
    await fs.root().removeEntry("dir", { recursive: true });
    expect(fs.nodeAt(["dir"])).toBeNull();
    await expect(fs.root().removeEntry("dir")).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("쓰기는 close 에서 한 번에 바뀌고 abort 는 버린다", async () => {
    const fs = new FakeFs();
    fs.writeFile("a.txt", "old");
    const handle = await fs.root().getFileHandle("a.txt");
    const w = await handle.createWritable();
    await w.write(new TextEncoder().encode("new"));
    expect(await text(fs, "a.txt")).toBe("old");
    await w.close();
    expect(await text(fs, "a.txt")).toBe("new");
    const w2 = await handle.createWritable();
    await w2.write(new TextEncoder().encode("half"));
    await w2.abort();
    expect(await text(fs, "a.txt")).toBe("new");
    await expect(w2.write(new Uint8Array(1))).rejects.toBeInstanceOf(TypeError);
  });

  it("File 을 만든 뒤 파일이 바뀌면 읽기가 NotReadableError", async () => {
    const fs = new FakeFs();
    fs.writeFile("a.txt", "1");
    const file = await (await fs.root().getFileHandle("a.txt")).getFile();
    fs.writeFile("a.txt", "2");
    await expect(file.arrayBuffer()).rejects.toMatchObject({ name: "NotReadableError" });
  });

  it("핸들은 경로다: 지우고 다시 만들면 옛 핸들이 새 파일을 본다. isSameEntry 는 경로와 종류로", async () => {
    const fs = new FakeFs();
    fs.writeFile("a.txt", "1");
    const handle = await fs.root().getFileHandle("a.txt");
    fs.removePath("a.txt");
    await expect(handle.getFile()).rejects.toMatchObject({ name: "NotFoundError" });
    fs.writeFile("a.txt", "2");
    expect(await (await handle.getFile()).text()).toBe("2");
    expect(await handle.isSameEntry(await fs.root().getFileHandle("a.txt"))).toBe(true);
    expect(await fs.root().isSameEntry(handle)).toBe(false);
  });

  it("entries 는 한 층을 돌고, move 는 핸들을 새 자리로 옮긴다", async () => {
    const fs = new FakeFs({ move: true });
    fs.writeFile("a/x.txt", "1");
    fs.writeFile("b.txt", "2");
    const names: string[] = [];
    for await (const [name, handle] of fs.root().entries()) names.push(`${handle.kind}:${name}`);
    expect(names.sort()).toEqual(["directory:a", "file:b.txt"]);
    const b = await fs.root().getFileHandle("b.txt");
    await b.move!(await fs.root().getDirectoryHandle("a"), "c.txt");
    expect(fs.readFile("a/c.txt")).toBe("2");
    expect(fs.readFile("b.txt")).toBeNull();
    expect(await (await b.getFile()).text()).toBe("2");
  });

  it("권한: prompt 면 조작이 NotAllowedError, 제스처 없이 물으면 SecurityError", async () => {
    const fs = new FakeFs({ permission: { state: "prompt", answer: "granted" } });
    const root = fs.root();
    await expect(root.getFileHandle("x", { create: true })).rejects.toMatchObject({ name: "NotAllowedError" });
    await expect(root.requestPermission!({ mode: "readwrite" })).rejects.toMatchObject({ name: "SecurityError" });
    fs.permission!.gesture = true;
    expect(await root.requestPermission!({ mode: "readwrite" })).toBe("granted");
    expect(await root.queryPermission!({ mode: "readwrite" })).toBe("granted");
  });
});
