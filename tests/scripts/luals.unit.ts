// scripts/fetch-luals.mjs: 인자, 앱에 싣는 경로 고르기, tar 읽기, 압축을 확인하고 푸는 흐름 (합성 압축)

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

interface Pins {
  version: string;
  assets: Record<string, { name: string; sha256: string }>;
}

const mod = (await import(pathToFileURL(path.join(REPO, "scripts", "fetch-luals.mjs")).href)) as {
  LUALS: Pins;
  parseArgs(argv: string[]): { target: string | null; from: string | null };
  keep(rel: string): boolean;
  readTar(buf: Buffer): Array<{ name: string; mode: number; data: Buffer }>;
  fetchLuals(args: { target: string | null; from: string | null }, repo: string, log: (m: string) => void, pins?: Pins): Promise<Record<string, unknown>>;
};

const tmpDirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "fetch-luals-"));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** 배포본과 같은 모양의 tar.gz (시스템 tar 로 만든다) */
function fakeArchive(dir: string): string {
  const src = path.join(dir, "src");
  const files: Record<string, string> = {
    "bin/lua-language-server": "#!/bin/sh\n",
    "bin/main.lua": "-- main",
    "main.lua": "-- root",
    LICENSE: "MIT License\n",
    "changelog.md": "# changes",
    "script/a.lua": "return 1",
    "locale/en-us/script.lua": "en",
    "locale/ja-jp/script.lua": "ja",
    "meta/template/basic.lua": "---@meta",
    "meta/3rd/love2d/config.json": "{}",
    "meta/spell/dictionary.txt": "words",
    "meta/default utf8/basic.lua": "-- generated",
  };
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(src, rel)), { recursive: true });
    fs.writeFileSync(path.join(src, rel), text);
  }
  fs.chmodSync(path.join(src, "bin/lua-language-server"), 0o755);
  const archive = path.join(dir, "lua-language-server-9.9.9-test.tar.gz");
  // macOS 의 tar 는 확장 속성을 ._ 파일로 싣는다. 배포본에는 없다
  execFileSync("tar", ["czf", archive, "-C", src, "."], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  return archive;
}

describe("fetch-luals", () => {
  it("인자: --target 과 --from, 모르는 인자는 2", () => {
    expect(mod.parseArgs(["--target", "x86_64-unknown-linux-gnu", "--from", "a.tgz"])).toEqual({ target: "x86_64-unknown-linux-gnu", from: "a.tgz" });
    expect(() => mod.parseArgs(["--target"])).toThrow(/값이 없다/);
    expect(() => mod.parseArgs(["--nope"])).toThrow(/모르는 인자/);
  });

  it("앱에 싣는 경로: 다른 엔진용 정의, 사전, 미리 만든 메타, 다른 번역, 변경 기록은 뺀다", () => {
    for (const rel of ["bin/lua-language-server", "main.lua", "script/a.lua", "locale/en-us/script.lua", "meta/template/basic.lua", "meta/whimsical/x.lua", "LICENSE", "debugger.lua"]) expect(mod.keep(rel), rel).toBe(true);
    for (const rel of ["changelog.md", "meta/3rd/love2d/config.json", "meta/spell/dictionary.txt", "meta/default utf8/basic.lua", "locale/ja-jp/script.lua"]) expect(mod.keep(rel), rel).toBe(false);
  });

  it("고정한 판은 다섯 대상이고 sha256 은 64자", () => {
    expect(Object.keys(mod.LUALS.assets).sort()).toEqual(["aarch64-apple-darwin", "aarch64-unknown-linux-gnu", "x86_64-apple-darwin", "x86_64-pc-windows-msvc", "x86_64-unknown-linux-gnu"]);
    for (const a of Object.values(mod.LUALS.assets)) expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(mod.LUALS.assets["x86_64-pc-windows-msvc"].name).toMatch(/\.zip$/);
  });

  it.skipIf(process.platform === "win32")("sha256 을 대조하고 거른 것만 풀고, 실행 권한과 판 정보와 LICENSE 를 남긴다", async () => {
    const dir = tmp();
    const archive = fakeArchive(dir);
    const sha = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
    const repo = path.join(dir, "repo");
    const pins = { version: "9.9.9", assets: { "test-target": { name: path.basename(archive), sha256: sha } } };
    const logs: string[] = [];
    const meta = await mod.fetchLuals({ target: "test-target", from: archive }, repo, (m: string) => logs.push(m), pins);
    const out = path.join(repo, "src-tauri", "luals");
    const listed = execFileSync("find", [".", "-type", "f"], { cwd: out, encoding: "utf8" }).split("\n").filter(Boolean).map((f) => f.slice(2)).sort();
    expect(listed).toEqual(["LICENSE", "bin/lua-language-server", "bin/main.lua", "locale/en-us/script.lua", "luals.json", "main.lua", "meta/template/basic.lua", "script/a.lua"]);
    expect(fs.statSync(path.join(out, "bin/lua-language-server")).mode & 0o111).toBeTruthy();
    expect(fs.statSync(path.join(out, "bin/main.lua")).mode & 0o111).toBe(0);
    expect(meta).toMatchObject({ version: "9.9.9", target: "test-target", sha256: sha, files: 7 });
    expect(JSON.parse(fs.readFileSync(path.join(out, "luals.json"), "utf8")).version).toBe("9.9.9");
    expect(fs.readFileSync(path.join(repo, "src-tauri", "licenses", "luals", "LICENSE"), "utf8")).toBe("MIT License\n");
    expect(logs.at(-1)).toMatch(/파일 7개/);

    // 다시 받으면 예전 것을 지우고 새로 푼다
    fs.writeFileSync(path.join(out, "stale.txt"), "x");
    await mod.fetchLuals({ target: "test-target", from: archive }, repo, () => {}, pins);
    expect(fs.existsSync(path.join(out, "stale.txt"))).toBe(false);
  });

  it("sha256 이 다르면 풀지 않는다. 모르는 대상은 2", async () => {
    const dir = tmp();
    const archive = fakeArchive(dir);
    const repo = path.join(dir, "repo");
    const pins = { version: "9.9.9", assets: { "test-target": { name: path.basename(archive), sha256: "0".repeat(64) } } };
    await expect(mod.fetchLuals({ target: "test-target", from: archive }, repo, () => {}, pins)).rejects.toThrow(/sha256 이 다르다/);
    expect(fs.existsSync(path.join(repo, "src-tauri", "luals"))).toBe(false);
    await expect(mod.fetchLuals({ target: "riscv-none", from: archive }, repo, () => {}, pins)).rejects.toMatchObject({ code: 2 });
  });

  it("tar 의 pax 와 GNU 긴 이름, ./ 머리를 읽는다", () => {
    const block = (name: string, size: number, type: string, prefix = "") => {
      const h = Buffer.alloc(512);
      h.write(name, 0, "utf8");
      h.write("0000644\0", 100, "latin1");
      h.write(size.toString(8).padStart(11, "0") + "\0", 124, "latin1");
      h.write(type, 156, "latin1");
      h.write("ustar\0", 257, "latin1");
      h.write(prefix, 345, "utf8");
      return h;
    };
    const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc((512 - (b.length % 512)) % 512)]);
    const longName = "meta/" + "x".repeat(120) + ".lua";
    const paxBody = Buffer.from(`${"30 path=pax/renamed/file.lua\n".length} path=pax/renamed/file.lua\n`);
    const tar = Buffer.concat([
      block("./bin/a", 1, "0"),
      pad(Buffer.from("A")),
      block("././@LongLink", longName.length, "L"),
      pad(Buffer.from(longName)),
      block("short", 1, "0"),
      pad(Buffer.from("B")),
      block("ignored", paxBody.length, "x"),
      pad(paxBody),
      block("x", 1, "0"),
      pad(Buffer.from("C")),
      block("dir/", 0, "5"),
      block("file.lua", 1, "0", "deep/prefix"),
      pad(Buffer.from("D")),
      Buffer.alloc(1024),
    ]);
    expect(mod.readTar(tar).map((f) => [f.name, f.data.toString()])).toEqual([
      ["bin/a", "A"],
      [longName, "B"],
      ["pax/renamed/file.lua", "C"],
      ["deep/prefix/file.lua", "D"],
    ]);
  });
});
