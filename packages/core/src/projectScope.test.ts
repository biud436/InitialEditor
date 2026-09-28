import { describe, expect, it } from "vitest";
import { IgnoreRules, inProjectBase, ProjectScope } from "./projectScope";

describe("inProjectBase: 엔진이 읽는 것", () => {
  it("game.json, scripts/, resources/ 와 그 안", () => {
    expect(inProjectBase("game.json", "file")).toBe(true);
    expect(inProjectBase("scripts", "dir")).toBe(true);
    expect(inProjectBase("resources/maps/town.json", "file")).toBe(true);
    expect(inProjectBase("resources/rtp/CharSet/Actor1.png", "file")).toBe(true);
    expect(inProjectBase("", "dir")).toBe(true);
  });

  it("그 밖의 최상위 항목과 점으로 시작하는 이름은 뺀다", () => {
    for (const [p, k] of [
      ["README.md", "file"],
      ["docs", "dir"],
      ["build", "dir"],
      ["scripts", "file"],
      ["game.json", "dir"],
      [".initial-editor", "dir"],
      [".initial-editor/layout.json", "file"],
      [".git", "dir"],
      ["scripts/.DS_Store", "file"],
      ["resources/.cache/a.png", "file"],
      [".initial-editorignore", "file"],
    ] as const) {
      expect(inProjectBase(p, k), p).toBe(false);
    }
  });

  it("정규화할 수 없는 경로는 범위 밖", () => {
    expect(inProjectBase("../escape.txt", "file")).toBe(false);
    expect(inProjectBase("/abs/game.json", "file")).toBe(false);
  });
});

describe("IgnoreRules: .gitignore 문법", () => {
  it("슬래시가 없는 패턴은 어느 깊이의 이름에나, 슬래시가 있으면 루트 기준", () => {
    const r = IgnoreRules.parse("*.psd\n/resources/aldebaran/src\nnotes.txt\n");
    expect(r.ignores("resources/art/hero.psd", "file")).toBe(true);
    expect(r.ignores("resources/aldebaran/src", "dir")).toBe(true);
    expect(r.ignores("resources/aldebaran/src/stage1/a.png", "file")).toBe(true);
    expect(r.ignores("resources/other/aldebaran/src", "dir")).toBe(false);
    expect(r.ignores("scripts/notes.txt", "file")).toBe(true);
    expect(r.ignores("resources/art/hero.png", "file")).toBe(false);
  });

  it("끝의 슬래시는 폴더에만, **는 폴더를 건너고, ? 와 [..]", () => {
    const r = IgnoreRules.parse("build/\nresources/**/tmp\nlevel?.json\n*.[ab]k\n");
    expect(r.ignores("resources/build", "dir")).toBe(true);
    expect(r.ignores("resources/build", "file")).toBe(false);
    expect(r.ignores("resources/tmp", "dir")).toBe(true);
    expect(r.ignores("resources/a/b/tmp/x.png", "file")).toBe(true);
    expect(r.ignores("resources/maps/level1.json", "file")).toBe(true);
    expect(r.ignores("resources/maps/level10.json", "file")).toBe(false);
    expect(r.ignores("resources/x.ak", "file")).toBe(true);
    expect(r.ignores("resources/x.ck", "file")).toBe(false);
  });

  it("! 는 다시 넣고 마지막 규칙이 이긴다. 뺀 폴더 안은 다시 넣지 못한다", () => {
    const r = IgnoreRules.parse("*.zip\n!keep.zip\nresources/raw/\n!resources/raw/ok.png\n");
    expect(r.ignores("resources/a.zip", "file")).toBe(true);
    expect(r.ignores("resources/keep.zip", "file")).toBe(false);
    expect(r.ignores("resources/raw/ok.png", "file")).toBe(true);
  });

  it("주석, 빈 줄, 끝 공백, 이스케이프한 # 과 !", () => {
    const r = IgnoreRules.parse("# 주석\n\n  \nsecret.txt   \n\\#hash.txt\n\\!bang.txt\n");
    expect(r.size).toBe(3);
    expect(r.ignores("scripts/secret.txt", "file")).toBe(true);
    expect(r.ignores("scripts/#hash.txt", "file")).toBe(true);
    expect(r.ignores("scripts/!bang.txt", "file")).toBe(true);
  });

  it("점과 괄호 같은 정규식 문자는 글자 그대로", () => {
    const r = IgnoreRules.parse("a.b(1).txt\n");
    expect(r.ignores("scripts/a.b(1).txt", "file")).toBe(true);
    expect(r.ignores("scripts/aXb(1).txt", "file")).toBe(false);
  });
});

describe("ProjectScope", () => {
  it("기본 범위에서 무시 파일이 뺀 것", () => {
    const scope = new ProjectScope(IgnoreRules.parse("*.psd\n/resources/rtp/\n"));
    expect(scope.includes("resources/maps/a.json", "file")).toBe(true);
    expect(scope.includes("resources/art/a.psd", "file")).toBe(false);
    expect(scope.includes("resources/rtp", "dir")).toBe(false);
    expect(scope.includes("resources/rtp/CharSet/a.png", "file")).toBe(false);
    expect(scope.includes("README.md", "file")).toBe(false);
    // 무시 파일은 범위를 넓히지 못한다
    expect(new ProjectScope(IgnoreRules.parse("!README.md\n")).includes("README.md", "file")).toBe(false);
  });
});
