// scripts/version.mjs (yarn version:set, yarn version:check) 를 가짜 저장소에서 본다. 마지막 시험은 이 저장소 자신이 맞는지.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
type Main = (argv: string[], deps?: Record<string, unknown>) => Promise<number>;
const version = (await import(pathToFileURL(path.join(REPO, "scripts", "version.mjs")).href)) as {
  main: Main;
  isSemver(v: string): boolean;
  checkRepo(repo: string, opts?: { tag?: string; bundles?: string }): { version: string; problems: string[] };
  cargoTomlVersion(text: string): string | null;
  cargoLockVersion(text: string): string | null;
};

let tmp = "";
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "version-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(rel: string, text: string) {
  const file = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
const read = (rel: string) => fs.readFileSync(path.join(tmp, rel), "utf8");

function fakeRepo(v = "2.0.0-dev") {
  write("package.json", json({ name: "root", version: v, private: true, workspaces: ["packages/*"] }));
  write("packages/core/package.json", json({ name: "@initial-editor/core", version: v }));
  write("packages/app/package.json", json({ name: "@initial-editor/app", version: v, dependencies: { "@initial-editor/core": v, react: "^18.3.0" }, devDependencies: { "@initial-editor/tools": "workspace:*" } }));
  write("src-tauri/Cargo.toml", `[package]\nname = "initial-editor"\nversion = "${v}"\nedition = "2021"\n\n[dependencies]\nserde = { version = "1" }\n`);
  write("src-tauri/Cargo.lock", `version = 4\n\n[[package]]\nname = "initial-editor"\nversion = "${v}"\ndependencies = [\n "serde",\n]\n\n[[package]]\nname = "other"\nversion = "${v}"\n`);
  write("src-tauri/tauri.conf.json", json({ productName: "InitialEditor", version: "../package.json" }));
}

function run(argv: string[], extra: Record<string, unknown> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return version.main(argv, { repo: tmp, log: (s: string) => out.push(s), error: (s: string) => err.push(s), ...extra }).then((code) => ({ code, out, err }));
}

describe("판 번호 (version.mjs)", () => {
  it("SemVer 만 받는다", () => {
    for (const ok of ["2.0.0", "2.0.0-alpha.1", "2.0.0-dev", "10.2.3-rc.1+build.5"]) expect(version.isSemver(ok), ok).toBe(true);
    for (const bad of ["2.0", "v2.0.0", "2.0.0-", "02.0.0", "2.0.0-01", ""]) expect(version.isSemver(bad), bad).toBe(false);
  });

  it("Cargo.toml 의 [package] 판과 Cargo.lock 의 자기 항목만 읽는다", () => {
    fakeRepo("1.2.3");
    expect(version.cargoTomlVersion(read("src-tauri/Cargo.toml"))).toBe("1.2.3");
    expect(version.cargoTomlVersion('[dependencies]\nversion = "9"\n')).toBeNull();
    expect(version.cargoLockVersion(read("src-tauri/Cargo.lock"))).toBe("1.2.3");
  });

  it("다 맞으면 check 가 통과한다 (workspace: 의존은 판을 적지 않아도 된다)", async () => {
    fakeRepo();
    const r = await run(["check"]);
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out[0]).toMatch(/^OK 판 2\.0\.0-dev/);
  });

  it("set 은 루트, 패키지, 워크스페이스 의존, Cargo.toml, Cargo.lock 의 자기 항목을 한꺼번에 고치고 yarn install 을 부른다", async () => {
    fakeRepo();
    const install = vi.fn(() => 0);
    const r = await run(["set", "2.0.0-alpha.1"], { install });
    expect(r.code).toBe(0);
    expect(install).toHaveBeenCalledTimes(1);
    expect(JSON.parse(read("package.json")).version).toBe("2.0.0-alpha.1");
    const app = JSON.parse(read("packages/app/package.json"));
    expect(app.version).toBe("2.0.0-alpha.1");
    expect(app.dependencies).toEqual({ "@initial-editor/core": "2.0.0-alpha.1", react: "^18.3.0" });
    expect(app.devDependencies["@initial-editor/tools"]).toBe("workspace:*");
    expect(read("src-tauri/Cargo.toml")).toContain('version = "2.0.0-alpha.1"\nedition');
    expect(read("src-tauri/Cargo.toml")).toContain('serde = { version = "1" }');
    const lock = read("src-tauri/Cargo.lock");
    expect(lock).toContain('name = "initial-editor"\nversion = "2.0.0-alpha.1"');
    expect(lock).toContain('name = "other"\nversion = "2.0.0-dev"');
    expect(read("src-tauri/tauri.conf.json")).toContain('"../package.json"');
    expect((await run(["check", "--tag", "v2.0.0-alpha.1"])).code).toBe(0);
  });

  it("--no-install 이면 yarn install 을 부르지 않는다. SemVer 가 아니면 2", async () => {
    fakeRepo();
    const install = vi.fn(() => 0);
    expect((await run(["set", "2.0.1", "--no-install"], { install })).code).toBe(0);
    expect(install).not.toHaveBeenCalled();
    const bad = await run(["set", "v2.0.1"], { install });
    expect(bad.code).toBe(2);
    expect(bad.err[0]).toMatch(/SemVer/);
    expect(JSON.parse(read("package.json")).version).toBe("2.0.1");
  });

  it("하나라도 어긋나면 실패하고 어디인지 적는다", async () => {
    fakeRepo();
    write("packages/core/package.json", json({ name: "@initial-editor/core", version: "2.0.0" }));
    const r = await run(["check"]);
    expect(r.code).toBe(1);
    expect(r.err).toEqual(["FAIL packages/core/package.json: version 값이 2.0.0, 루트 package.json 은 2.0.0-dev"]);
  });

  it("tauri.conf.json 의 version 이 경로가 아니면 실패", async () => {
    fakeRepo();
    write("src-tauri/tauri.conf.json", json({ version: "2.0.0-dev" }));
    const r = await run(["check"]);
    expect(r.code).toBe(1);
    expect(r.err[0]).toMatch(/tauri\.conf\.json 의 version 은 "\.\.\/package\.json"/);
  });

  it("태그가 판과 다르거나 v 로 시작하지 않으면 실패", async () => {
    fakeRepo();
    expect((await run(["check", "--tag", "v2.0.0-dev"])).code).toBe(0);
    expect((await run(["check", "--tag", "v2.0.0"])).err[0]).toMatch(/태그 v2\.0\.0 가 판 2\.0\.0-dev 과 다르다/);
    expect((await run(["check", "--tag", "2.0.0-dev"])).err[0]).toMatch(/v<판>/);
  });

  it("번들 이름에 판이 없으면 실패. .app 폴더 안은 보지 않는다", async () => {
    fakeRepo("2.0.0-alpha.1");
    const bundles = path.join(tmp, "out");
    write("out/dmg/InitialEditor_2.0.0-alpha.1_aarch64.dmg", "x");
    write("out/appimage/InitialEditor_2.0.0-alpha.1_amd64.AppImage", "x");
    write("out/deb/InitialEditor_2.0.0-alpha.1_amd64.deb", "x");
    write("out/nsis/InitialEditor_2.0.0-alpha.1_x64-setup.exe", "x");
    write("out/macos/InitialEditor.app/Contents/MacOS/helper.exe", "x");
    expect((await run(["check", "--bundles", bundles])).code).toBe(0);
    write("out/nsis/InitialEditor_2.0.0_x64-setup.exe", "x");
    const r = await run(["check", "--bundles", bundles]);
    expect(r.code).toBe(1);
    expect(r.err).toEqual(["FAIL 번들 이름에 판 2.0.0-alpha.1 이 없다: InitialEditor_2.0.0_x64-setup.exe"]);
    fs.mkdirSync(path.join(tmp, "empty"));
    expect((await run(["check", "--bundles", path.join(tmp, "empty")])).err[0]).toMatch(/설치 파일이 없다/);
  });

  it("인자가 틀리면 2", async () => {
    fakeRepo();
    for (const argv of [[], ["bump"], ["set"], ["check", "--tag"], ["check", "--no-install"], ["check", "--bogus"]]) expect((await run(argv)).code, argv.join(" ")).toBe(2);
  });

  it("이 저장소의 판이 한 가지다 (CI 의 yarn version:check 와 같다)", () => {
    expect(version.checkRepo(REPO).problems).toEqual([]);
  });
});
