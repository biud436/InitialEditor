import { IGNORE_FILE, Project } from "@initial-editor/core";
import { MemoryBackend, waitFor } from "@initial-editor/core/testing";
import { describe, expect, it } from "vitest";
import { PROJECT_VIEW_FILE } from "./projectFilter";
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
  it("루트는 폴더 먼저 이름순이고, 폴더는 펼칠 때 읽는다 (게으른 로딩). 필터가 README.md 를 숨긴다", async () => {
    const { project, tree } = await openSample();
    expect(names(tree)).toEqual(["resources", "scripts", "game.json"]);
    expect(project.folders.has("scripts")).toBe(false);
    await tree.expand("scripts");
    expect(project.folders.has("scripts")).toBe(true);
    expect(project.folders.has("scripts/lua")).toBe(false);
    expect(names(tree)).toEqual(["resources", "scripts", "  lua", "  ruby", "game.json"]);
    await tree.toggle("scripts/lua");
    expect(names(tree)).toContain("    main.lua");
    tree.collapse("scripts");
    expect(names(tree)).toEqual(["resources", "scripts", "game.json"]);
    // 접었다 펼치면 캐시를 쓴다 (다시 읽지 않아도 하위 펼침은 접힌 채)
    await tree.expand("scripts");
    expect(names(tree)).toEqual(["resources", "scripts", "  lua", "  ruby", "game.json"]);
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
    expect(names(tree)).toEqual(["resources", "scripts", "game.json"]);
    tree.dispose();
  });
});

describe("프로젝트 뷰의 필터", () => {
  async function openWith(files: Record<string, string | Uint8Array>) {
    const backend = new MemoryBackend({ "game.json": "{}", "scripts/lua/main.lua": "print(1)", "resources/maps/a.json": "{}", "resources/art/hero.psd": "psd", ...files });
    const project = new Project(backend);
    await project.open("memory://f");
    const warnings: string[] = [];
    const tree = new ProjectTreeModel(project, { warn: (m) => warnings.push(m) });
    await waitFor(() => tree.rows.length > 0);
    return { backend, project, tree, warnings };
  }

  it("처음부터 켜져 프로젝트 파일만 보이고 숨긴 수를 센다. 끄면 전부 보이고 상태를 .initial-editor/ 에 남긴다", async () => {
    const { backend, project, tree } = await openWith({ "README.md": "# hi", "docs/notes.md": "x", ".gitignore": "x" });
    expect(tree.filter.enabled).toBe(true);
    expect(names(tree)).toEqual(["resources", "scripts", "game.json"]);
    expect(tree.hiddenCount).toBe(3);
    tree.filter.toggle();
    expect(names(tree)).toEqual(["docs", "resources", "scripts", ".gitignore", "game.json", "README.md"]);
    expect(tree.hiddenCount).toBe(0);
    const saved = async () => ((await backend.exists(PROJECT_VIEW_FILE)) ? (JSON.parse(await backend.readText(PROJECT_VIEW_FILE)) as unknown) : null);
    for (let i = 0; i < 200 && JSON.stringify(await saved()) !== '{"filter":false}'; i++) await new Promise((r) => setTimeout(r, 10));
    expect(await saved()).toEqual({ filter: false });
    // 다시 열면 끈 상태가 남아 있다
    await project.close();
    await project.open("memory://f");
    await waitFor(() => tree.filter.enabled === false && names(tree).includes("README.md"));
    tree.dispose();
  });

  it("무시 파일이 더 빼고, 바뀌면 다시 읽는다. 펼친 폴더 안의 숨긴 것도 센다", async () => {
    const { backend, tree } = await openWith({ [IGNORE_FILE]: "*.psd\n" });
    await tree.expand("resources");
    await tree.expand("resources/art");
    await waitFor(() => !names(tree).includes("      hero.psd"));
    expect(names(tree)).toEqual(["resources", "  art", "  maps", "scripts", "game.json"]);
    expect(tree.hiddenCount).toBe(2); // .initial-editorignore 와 hero.psd
    expect(tree.isHidden("resources/art/hero.psd", "file")).toBe(true);
    await backend.writeText(IGNORE_FILE, "/resources/maps/\n");
    await waitFor(() => names(tree).includes("    hero.psd") && !names(tree).includes("  maps"));
    tree.dispose();
  });

  it("틀린 상태 파일과 읽을 수 없는 무시 파일은 기본값", async () => {
    const { tree } = await openWith({ [PROJECT_VIEW_FILE]: "{ not json", [IGNORE_FILE]: new Uint8Array([0xff, 0xfe, 0x00]) });
    expect(tree.filter.enabled).toBe(true);
    expect(tree.filter.scope.includes("resources/art/hero.psd", "file")).toBe(true);
    tree.dispose();
  });
});
