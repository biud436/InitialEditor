import { Project } from "@initial-editor/core";
import { MemoryBackend, waitFor } from "@initial-editor/core/testing";
import { describe, expect, it } from "vitest";
import { ProjectTreeModel } from "./projectTree";

async function openSample() {
  const backend = new MemoryBackend({
    "game.json": "{}",
    "scripts/lua/main.lua": "print(1)",
    "scripts/ruby/main.rb": "puts 1",
    "resources/images/a.png": new Uint8Array([1, 2, 3]),
    "README.md": "# hi",
  });
  const project = new Project(backend);
  await project.open("memory://t");
  const tree = new ProjectTreeModel(project);
  return { backend, project, tree };
}

const names = (tree: ProjectTreeModel) => tree.rows.map((r) => "  ".repeat(r.depth) + r.entry.name);

describe("ProjectTreeModel", () => {
  it("루트는 폴더 먼저 이름순이고, 폴더는 펼칠 때 읽는다 (게으른 로딩)", async () => {
    const { project, tree } = await openSample();
    expect(names(tree)).toEqual(["resources", "scripts", "game.json", "README.md"]);
    expect(project.folders.has("scripts")).toBe(false);
    await tree.expand("scripts");
    expect(project.folders.has("scripts")).toBe(true);
    expect(project.folders.has("scripts/lua")).toBe(false);
    expect(names(tree)).toEqual(["resources", "scripts", "  lua", "  ruby", "game.json", "README.md"]);
    await tree.toggle("scripts/lua");
    expect(names(tree)).toContain("    main.lua");
    tree.collapse("scripts");
    expect(names(tree)).toEqual(["resources", "scripts", "game.json", "README.md"]);
    // 접었다 펼치면 캐시를 쓴다 (다시 읽지 않아도 하위 펼침은 접힌 채)
    await tree.expand("scripts");
    expect(names(tree)).toEqual(["resources", "scripts", "  lua", "  ruby", "game.json", "README.md"]);
    tree.dispose();
  });

  it("밖에서 파일이 생기거나 지워지면 새로 고침을 따라간다", async () => {
    const { backend, project, tree } = await openSample();
    await tree.expand("scripts");
    await tree.expand("scripts/lua");
    backend.simulateExternalChange("scripts/lua/new.lua", "create", "x");
    await waitFor(() => names(tree).includes("    new.lua"));
    backend.simulateExternalChange("scripts/lua/main.lua", "delete");
    await waitFor(() => !names(tree).includes("    main.lua"));
    // 폴더가 지워지면 펼침과 선택도 정리된다
    tree.select("scripts/lua/new.lua");
    await backend.remove("scripts/lua");
    await waitFor(() => !project.folders.has("scripts/lua"));
    expect(tree.isExpanded("scripts/lua")).toBe(false);
    expect(tree.selected).toBe("scripts");
    tree.dispose();
  });

  it("reveal 은 조상을 펼치고 선택한다", async () => {
    const { tree } = await openSample();
    await tree.reveal("scripts/ruby/main.rb");
    expect(tree.isExpanded("scripts")).toBe(true);
    expect(tree.isExpanded("scripts/ruby")).toBe(true);
    expect(tree.selected).toBe("scripts/ruby/main.rb");
    expect(names(tree)).toContain("    main.rb");
    tree.dispose();
  });

  it("프로젝트를 닫으면 비고, 다시 열면 펼침이 없다", async () => {
    const { project, tree } = await openSample();
    await tree.expand("scripts");
    await project.close();
    expect(tree.rows).toEqual([]);
    expect(tree.isExpanded("scripts")).toBe(false);
    await project.open("memory://t");
    expect(names(tree)).toEqual(["resources", "scripts", "game.json", "README.md"]);
    tree.dispose();
  });
});
