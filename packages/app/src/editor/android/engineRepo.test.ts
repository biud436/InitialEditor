import { describe, expect, it } from "vitest";
import { isRepoTrusted, repoCandidates, repoFromEngine, stageDestPath, stageScriptPath, withTrustedScript, type RepoCandidate } from "./engineRepo";

describe("엔진 저장소 후보", () => {
  it("순서는 설정 > 열린 프로젝트 > 찾은 엔진의 저장소 > 형제 폴더이고, 설정 말고는 신뢰가 필요하다", () => {
    const list = repoCandidates({
      settingsPath: "/opt/Initial2D/",
      root: "/home/u/games/flappy",
      enginePath: "/home/u/src/Initial2D/build/Initial2D",
      engineSource: "sibling",
      platform: "mac",
    });
    expect(list).toEqual([
      { source: "settings", repo: "/opt/Initial2D", script: "/opt/Initial2D/android/prepare_assets.sh", needsTrust: false },
      { source: "project", repo: "/home/u/games/flappy", script: "/home/u/games/flappy/android/prepare_assets.sh", needsTrust: true },
      { source: "engine", repo: "/home/u/src/Initial2D", script: "/home/u/src/Initial2D/android/prepare_assets.sh", needsTrust: true },
      { source: "sibling", repo: "/home/u/games/Initial2D", script: "/home/u/games/Initial2D/android/prepare_assets.sh", needsTrust: true },
    ]);
  });

  it("비어 있는 설정은 건너뛰고, 사람이 고른 엔진의 저장소는 신뢰한다", () => {
    const list = repoCandidates({ settingsPath: "  ", root: "/p", enginePath: "/e/Initial2D/build/Initial2D", engineSource: "settings", platform: "linux" });
    expect(list.map((c) => [c.source, c.repo, c.needsTrust])).toEqual([
      ["project", "/p", true],
      ["engine", "/e/Initial2D", false],
      ["sibling", "/Initial2D", true],
    ]);
  });

  it("같은 폴더는 처음 것만 남긴다 (프로젝트가 곧 엔진 저장소)", () => {
    const list = repoCandidates({
      settingsPath: "",
      root: "/home/u/Initial2D",
      enginePath: "/home/u/Initial2D/build/Initial2D",
      engineSource: "project-build",
      platform: "mac",
    });
    // 찾은 엔진의 저장소도, 형제 폴더 ../Initial2D 도 자기 자신이다
    expect(list.map((c) => [c.source, c.repo])).toEqual([["project", "/home/u/Initial2D"]]);
  });

  it("앱에 든 엔진처럼 build/Initial2D 꼴이 아니면 엔진에서 저장소를 끌어내지 않는다", () => {
    expect(repoFromEngine("/Applications/InitialEditor.app/Contents/MacOS/Initial2D")).toBeNull();
    expect(repoFromEngine(null)).toBeNull();
    expect(repoFromEngine("/e/Initial2D/build/Initial2D")).toBe("/e/Initial2D");
    expect(repoFromEngine("/e/Initial2D/build//Initial2D")).toBe("/e/Initial2D");
    expect(repoFromEngine("/e/Initial2D/build/Initial2D-debug")).toBeNull();
  });

  it("Windows 경로 (역슬래시, 드라이브 뿌리, 대소문자를 가리지 않는 중복)", () => {
    expect(repoFromEngine("C:\\src\\Initial2D\\build\\Initial2D.exe")).toBe("C:\\src\\Initial2D");
    expect(repoFromEngine("C:\\build\\Initial2D.exe")).toBe("C:\\");
    expect(stageScriptPath("C:\\src\\Initial2D")).toBe("C:\\src\\Initial2D\\android\\prepare_assets.sh");
    expect(stageDestPath("C:\\src\\Initial2D\\")).toBe("C:\\src\\Initial2D\\android\\app\\src\\main\\assets\\");
    const list = repoCandidates({
      settingsPath: "c:\\games\\flappy",
      root: "C:\\games\\flappy",
      enginePath: "C:\\games\\Initial2D\\build\\Initial2D.exe",
      engineSource: "sibling",
      platform: "win",
    });
    expect(list.map((c) => [c.source, c.repo])).toEqual([
      ["settings", "c:\\games\\flappy"],
      ["engine", "C:\\games\\Initial2D"],
    ]);
    const atRoot = repoCandidates({ settingsPath: "", root: "D:\\game", enginePath: null, engineSource: "none", platform: "win" });
    expect(atRoot.map((c) => c.repo)).toEqual(["D:\\game", "D:\\Initial2D"]);
  });

  it("대상은 android/app/src/main/assets/ 다", () => {
    expect(stageDestPath("/home/u/Initial2D")).toBe("/home/u/Initial2D/android/app/src/main/assets/");
  });
});

describe("스크립트 신뢰", () => {
  const project: RepoCandidate = { source: "project", repo: "/p", script: "/p/android/prepare_assets.sh", needsTrust: true };
  const settings: RepoCandidate = { source: "settings", repo: "/e", script: "/e/android/prepare_assets.sh", needsTrust: false };

  it("설정의 저장소는 묻지 않고, 나머지는 허용 기록에 그 스크립트가 있어야 한다", () => {
    expect(isRepoTrusted(settings, undefined)).toBe(true);
    expect(isRepoTrusted(project, undefined)).toBe(false);
    expect(isRepoTrusted(project, { allow: true, exes: ["/other/android/prepare_assets.sh"] })).toBe(false);
    expect(isRepoTrusted(project, { allow: false, exes: [project.script] })).toBe(false);
    expect(isRepoTrusted(project, { allow: true, exes: [project.script] })).toBe(true);
  });

  it("허용하면 기록에 더하고, 이미 허용한 것은 남긴다", () => {
    expect(withTrustedScript(undefined, project.script)).toEqual({ allow: true, exes: [project.script] });
    expect(withTrustedScript({ allow: true, exes: ["/a.sh", project.script] }, project.script)).toEqual({ allow: true, exes: ["/a.sh", project.script] });
    expect(withTrustedScript({ allow: false, exes: ["/a.sh"] }, project.script)).toEqual({ allow: true, exes: [project.script] });
  });
});
