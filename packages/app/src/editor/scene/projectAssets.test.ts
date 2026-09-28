import { IgnoreRules, MemoryBackend, ProjectScope } from "@initial-editor/core";
import { describe, expect, it } from "vitest";
import { ProjectAssets, walkFiles } from "./projectAssets";

async function backend() {
  const b = new MemoryBackend({
    "game.json": "{}",
    "resources/images/hero.png": new Uint8Array([1]),
    "resources/images/wip/draft.png": new Uint8Array([2]),
    "resources/.cache/thumb.png": new Uint8Array([3]),
    "resources/fonts/hangul.fnt": "info",
    "scripts/lua/components/bird.lua": "return {}",
    "scripts/lua/components/old/bird.lua": "return {}",
  });
  await b.open("memory://a");
  return b;
}

describe("자산 목록과 프로젝트 파일의 범위", () => {
  it("walkFiles 는 점으로 시작하는 폴더와 무시 파일이 뺀 것을 건너뛴다", async () => {
    const b = await backend();
    expect(await walkFiles(b, "resources")).toEqual(["resources/fonts/hangul.fnt", "resources/images/hero.png", "resources/images/wip/draft.png"]);
    const scope = new ProjectScope(IgnoreRules.parse("wip/\n"));
    expect(await walkFiles(b, "resources", 8, scope)).toEqual(["resources/fonts/hangul.fnt", "resources/images/hero.png"]);
  });

  it("인스펙터의 이미지와 컴포넌트 목록이 호스트의 범위를 따른다", async () => {
    const b = await backend();
    const scope = new ProjectScope(IgnoreRules.parse("/resources/images/wip/\n/scripts/lua/components/old/\n"));
    const assets = new ProjectAssets({ backend: () => b, isOpen: () => true, scope: () => scope });
    await assets.refresh();
    expect(assets.images).toEqual(["resources/images/hero.png"]);
    expect(assets.fonts).toEqual(["resources/fonts/hangul.fnt"]);
    expect(assets.luaComponents).toEqual(["components/bird"]);
    assets.dispose();
  });
});
