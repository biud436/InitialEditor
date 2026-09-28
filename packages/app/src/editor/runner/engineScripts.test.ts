// 앱에 싣는 엔진을 다루는 스크립트 셋 (docs/plans/e6-packaging.md 마일스톤 3):
//   scripts/fetch-engine.mjs (yarn engine:fetch), scripts/check-engine-pin.mjs (yarn engine:check), scripts/check-sidecar.mjs,
//   scripts/pin-engine.mjs (yarn engine:pin).
// 가짜 저장소(engine-pin.json)와 가짜 엔진 dist 폴더를 임시 폴더에 만들고 스크립트의 main 을 부른다.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const COMMIT = "cac4b94e2dab79e13e5fd2ebdb6686fd23cfd33f";
const OTHER = "179cecce0a0918d06061af8ff58009fc494dc7ae";
const TRIPLE = "aarch64-apple-darwin";
const unix = process.platform !== "win32";

type Main = (argv: string[], deps?: Record<string, unknown>) => Promise<number>;
type Fetch = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

const fetchEngine = (await import(pathToFileURL(path.join(REPO, "scripts", "fetch-engine.mjs")).href)) as { main: Main; parseArgs(argv: string[]): unknown };
const pinEngine = (await import(pathToFileURL(path.join(REPO, "scripts", "pin-engine.mjs")).href)) as { main: Main };
const checkPin = (await import(pathToFileURL(path.join(REPO, "scripts", "check-engine-pin.mjs")).href)) as { main(deps?: Record<string, unknown>): Promise<number> };
const sidecar = (await import(pathToFileURL(path.join(REPO, "scripts", "check-sidecar.mjs")).href)) as {
  main(argv: string[], deps?: Record<string, unknown>): number;
  parseOtoolL(text: string): string[];
  macDepProblems(libs: string[]): string[];
  parseMinos(text: string): string | null;
  parseLdd(text: string): { libs: string[]; missing: string[] };
  linuxDepProblems(libs: string[]): string[];
  locate(target: string, engineJson: string | null): { exe?: string; meta?: string | null; looked?: string[]; error?: string };
};
const dist = (await import(pathToFileURL(path.join(REPO, "scripts", "lib", "engineDist.mjs")).href)) as {
  hostTriple(platform?: string, arch?: string): string | null;
  validatePin(pin: unknown): string[];
  validateDist(d: unknown): string[];
  parseSha256Sums(text: string): Map<string, string>;
  findEngineManifests(repo: string): Array<{ rel: string }>;
};

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

let tmp = "";
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "engine-scripts-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(file: string, data: string | Buffer, mode?: number) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  if (mode) fs.chmodSync(file, mode);
}

/** 가짜 에디터 저장소: 핀만 */
function fakeRepo(pin: Record<string, unknown> = { engineTag: null, engineCommit: COMMIT, ciEngineRef: null }) {
  const repo = path.join(tmp, "editor");
  write(path.join(repo, "engine-pin.json"), JSON.stringify(pin));
  return repo;
}

const ENGINE_BYTES = "#!/bin/sh\necho fake engine\n";

/** 가짜 엔진 체크아웃의 dist/ (tools/build_dist.sh 가 쓰는 모양). THIRD-PARTY.md 는 저장소 루트에 */
function fakeDist(opts: { commit?: string; bytes?: string; size?: number; entrySha?: string; features?: readonly string[]; describe?: string; sums?: Record<string, string>; thirdPartyInDist?: boolean } = {}) {
  const engine = path.join(tmp, "Initial2D");
  const dir = path.join(engine, "dist");
  const bytes = opts.bytes ?? ENGINE_BYTES;
  write(path.join(dir, `Initial2D-${TRIPLE}`), bytes, 0o755);
  write(
    path.join(dir, "engine-dist.json"),
    JSON.stringify({
      comment: "test",
      engineTag: null,
      describe: opts.describe ?? COMMIT.slice(0, 7),
      engineCommit: opts.commit ?? COMMIT,
      native: { [TRIPLE]: { asset: `Initial2D-${TRIPLE}`, size: opts.size ?? Buffer.byteLength(bytes), sha256: opts.entrySha ?? sha(bytes), features: opts.features ?? ["lua", "mruby"] } },
    }),
  );
  write(path.join(opts.thirdPartyInDist ? dir : engine, "THIRD-PARTY.md"), "# 제3자 고지\n");
  if (opts.sums) write(path.join(dir, "SHA256SUMS.txt"), Object.entries(opts.sums).map(([n, s]) => `${s}  ${n}`).join("\n") + "\n");
  return dir;
}

function capture() {
  const lines: string[] = [];
  return { lines, log: (s: string) => lines.push(s), error: (s: string) => lines.push(s) };
}

/** 저장만 하는 zip (의존성 없이 테스트 묶음을 만든다) */
function storedZip(files: Record<string, string | Buffer>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const nameBuf = Buffer.from(name);
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

function templatesZip(commit = COMMIT, extra: Record<string, string> = {}) {
  const files = { "scripts/lua/scene_loader.lua": "-- loader\n", "resources/templates/tilemap/map.json": "{}\n" };
  const manifest = { engineCommit: commit, describe: commit.slice(0, 7), files: Object.entries(files).map(([p, c]) => ({ path: p, size: c.length, sha256: sha(c), generated: false })) };
  return storedZip({ "MANIFEST.json": JSON.stringify(manifest), ...files, ...extra });
}

function fakeFetch(assets: Record<string, Buffer | string>, seen: string[] = []): Fetch {
  return async (url: string) => {
    seen.push(url);
    const name = url.split("/").pop()!;
    const body = assets[name];
    if (body === undefined) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer };
  };
}

describe("engineDist 공용 함수", () => {
  it("이 컴퓨터의 타깃 트리플 (Intel 맥은 없다)", () => {
    expect(dist.hostTriple("darwin", "arm64")).toBe("aarch64-apple-darwin");
    expect(dist.hostTriple("linux", "x64")).toBe("x86_64-unknown-linux-gnu");
    expect(dist.hostTriple("win32", "x64")).toBe("x86_64-pc-windows-msvc");
    expect(dist.hostTriple("darwin", "x64")).toBeNull();
  });

  it("핀과 engine-dist.json 의 모양", () => {
    expect(dist.validatePin({ engineTag: null, engineCommit: COMMIT, ciEngineRef: null })).toEqual([]);
    expect(dist.validatePin({ engineCommit: "cac4b94" })).toEqual(["engineCommit 이 40자 커밋이 아니다"]);
    expect(dist.validatePin({ engineCommit: COMMIT, native: { [TRIPLE]: { asset: "a", sha256: "x", features: ["lua"] } } })).toEqual([`native.${TRIPLE}.sha256 이 64자 16진수가 아니다`]);
    expect(dist.validatePin({ engineCommit: COMMIT, ciEngineRef: 3 })).toEqual(["ciEngineRef 는 글이나 null 이다"]);
    expect(dist.validateDist({ engineCommit: COMMIT, describe: "cac4b94", native: {} })).toEqual([]);
    expect(dist.validateDist({ engineCommit: COMMIT, native: [] })).toEqual(["describe 가 없다", "native 가 객체가 아니다"]);
  });

  it("SHA256SUMS.txt 를 읽는다 (sha256sum 과 shasum 의 두 모양)", () => {
    const sums = dist.parseSha256Sums(`${"a".repeat(64)}  Initial2D-${TRIPLE}\n${"b".repeat(64)} *THIRD-PARTY.md\nnoise\n`);
    expect([...sums]).toEqual([
      [`Initial2D-${TRIPLE}`, "a".repeat(64)],
      ["THIRD-PARTY.md", "b".repeat(64)],
    ]);
  });

  it("이 저장소의 엔진에서 온 MANIFEST 를 찾는다", () => {
    const rels = dist.findEngineManifests(REPO).map((m) => m.rel);
    expect(rels).toContain("packages/app/templates/MANIFEST.json");
    expect(rels).toContain("packages/app/public/engine/MANIFEST.json");
    expect(rels).toContain("packages/ext-rpg/test/fixtures/MANIFEST.json");
    expect(rels.some((r) => r.includes("node_modules"))).toBe(false);
  });
});

describe("yarn engine:fetch --from", () => {
  it.skipIf(!unix)("엔진 dist 폴더에서 사이드카와 engine.json 과 고지를 받는다", async () => {
    const repo = fakeRepo();
    const from = fakeDist();
    const out = capture();
    expect(await fetchEngine.main(["--from", from, "--target", TRIPLE], { repo, ...out })).toBe(0);
    const exe = path.join(repo, "src-tauri", "binaries", `Initial2D-${TRIPLE}`);
    expect(fs.readFileSync(exe, "utf8")).toBe(ENGINE_BYTES);
    expect(fs.statSync(exe).mode & 0o777).toBe(0o755);
    const meta = JSON.parse(fs.readFileSync(path.join(repo, "src-tauri", "binaries", "engine.json"), "utf8"));
    expect(meta).toMatchObject({ engineTag: null, engineCommit: COMMIT, describe: "cac4b94", target: TRIPLE, sha256: sha(ENGINE_BYTES), features: ["lua", "mruby"], source: "dist-folder", pinned: true });
    // dist 폴더에 고지가 없으면 한 단계 위(엔진 저장소 루트)의 것
    expect(fs.readFileSync(path.join(repo, "src-tauri", "licenses", "engine", "THIRD-PARTY.md"), "utf8")).toBe("# 제3자 고지\n");
    expect(out.lines.join("\n")).toContain(`엔진 cac4b94 (cac4b94) ← ${from}`);
  });

  it("dist 의 엔진 커밋이 핀과 다르면 받지 않는다. --any-commit 이면 받고 표시한다", async () => {
    const repo = fakeRepo();
    const from = fakeDist({ commit: OTHER, describe: "179cecc" });
    const out = capture();
    expect(await fetchEngine.main(["--from", from, "--target", TRIPLE], { repo, ...out })).toBe(1);
    expect(out.lines.join("\n")).toContain("dist 의 엔진 커밋 179cecc 이 핀 cac4b94 과 다르다");
    expect(fs.existsSync(path.join(repo, "src-tauri", "binaries"))).toBe(false);
    expect(await fetchEngine.main(["--from", from, "--target", TRIPLE, "--any-commit"], { repo, ...out })).toBe(0);
    const meta = JSON.parse(fs.readFileSync(path.join(repo, "src-tauri", "binaries", "engine.json"), "utf8"));
    expect(meta.pinned).toBe(false);
    expect(out.lines.at(-1)).toContain("핀(cac4b94)과 다른 엔진이다");
  });

  it("sha256, 크기, SHA256SUMS.txt 가 어긋나면 받지 않는다", async () => {
    const repo = fakeRepo();
    for (const [opts, message] of [
      [{ entrySha: "0".repeat(64) }, "sha256 이 engine-dist.json 과 다르다"],
      [{ size: 1 }, "크기가 engine-dist.json 과 다르다"],
      [{ sums: { [`Initial2D-${TRIPLE}`]: "f".repeat(64) } }, "SHA256SUMS.txt 와 sha256 이 다르다"],
      [{ features: ["mruby"] }, "기능에 lua 가 없다"],
    ] as const) {
      fs.rmSync(path.join(tmp, "Initial2D"), { recursive: true, force: true });
      const out = capture();
      expect(await fetchEngine.main(["--from", fakeDist(opts), "--target", TRIPLE], { repo, ...out })).toBe(1);
      expect(out.lines.join("\n")).toContain(message);
    }
  });

  it("dist 폴더의 모양이 틀리면 이유를 알린다", async () => {
    const repo = fakeRepo();
    const empty = path.join(tmp, "empty");
    fs.mkdirSync(empty);
    const out = capture();
    expect(await fetchEngine.main(["--from", empty, "--target", TRIPLE], { repo, ...out })).toBe(1);
    expect(out.lines.join("\n")).toContain("engine-dist.json 이 없다");
    expect(await fetchEngine.main(["--from", path.join(tmp, "nope"), "--target", TRIPLE], { repo, ...out })).toBe(1);
    expect(await fetchEngine.main(["--from", fakeDist(), "--target", "x86_64-unknown-linux-gnu"], { repo, ...out })).toBe(1);
    expect(out.lines.at(-1)).toContain(`x86_64-unknown-linux-gnu 엔진이 없다 (있는 것: ${TRIPLE})`);
  });

  it("Windows 는 사이드카 없이 고지만 받는다", async () => {
    const repo = fakeRepo();
    const out = capture();
    expect(await fetchEngine.main(["--from", fakeDist({ thirdPartyInDist: true }), "--target", "x86_64-pc-windows-msvc"], { repo, ...out })).toBe(0);
    expect(fs.existsSync(path.join(repo, "src-tauri", "binaries"))).toBe(false);
    expect(fs.existsSync(path.join(repo, "src-tauri", "licenses", "engine", "THIRD-PARTY.md"))).toBe(true);
    expect(out.lines[0]).toContain("엔진 사이드카가 없다");
  });

  it("인자 오류와 지원하지 않는 타깃은 종료 코드 2", async () => {
    const repo = fakeRepo();
    const out = capture();
    expect(await fetchEngine.main(["--bogus"], { repo, ...out })).toBe(2);
    expect(await fetchEngine.main(["--from"], { repo, ...out })).toBe(2);
    expect(await fetchEngine.main(["--target", "x86_64-apple-darwin"], { repo, ...out })).toBe(2);
    expect(await fetchEngine.main([], { repo, platform: "darwin", arch: "x64", ...out })).toBe(2);
    expect(out.lines.join("\n")).toContain("지원하지 않는 타깃: x86_64-apple-darwin");
  });

  it("핀이 없거나 모양이 틀리면 1", async () => {
    const out = capture();
    expect(await fetchEngine.main(["--from", tmp], { repo: path.join(tmp, "none"), ...out })).toBe(1);
    const repo = fakeRepo({ engineCommit: "short" });
    expect(await fetchEngine.main(["--from", tmp], { repo, ...out })).toBe(1);
    expect(out.lines.at(-1)).toContain("engineCommit 이 40자 커밋이 아니다");
  });
});

describe("yarn engine:fetch (공개 릴리스)", () => {
  it("핀에 엔진 태그가 없으면 --from 을 쓰라고 한다", async () => {
    const out = capture();
    expect(await fetchEngine.main(["--target", TRIPLE], { repo: fakeRepo(), ...out, fetchImpl: fakeFetch({}) })).toBe(1);
    expect(out.lines.join("\n")).toContain("공개 릴리스가 생기기 전에는");
  });

  it("태그가 있으면 공개 자산 주소에서 받고 핀의 sha256 으로 확인한다", async () => {
    const third = "# 고지\n";
    const pin = {
      engineTag: "v2.0.0-alpha.1",
      engineCommit: COMMIT,
      native: { [TRIPLE]: { asset: `Initial2D-${TRIPLE}`, sha256: sha(ENGINE_BYTES), features: ["lua", "mruby"] } },
      thirdParty: { asset: "THIRD-PARTY.md", sha256: sha(third) },
    };
    const repo = fakeRepo(pin);
    const seen: string[] = [];
    const out = capture();
    expect(await fetchEngine.main(["--target", TRIPLE], { repo, ...out, fetchImpl: fakeFetch({ [`Initial2D-${TRIPLE}`]: ENGINE_BYTES, "THIRD-PARTY.md": third }, seen) })).toBe(0);
    expect(seen).toEqual([
      `https://github.com/biud436/Initial2D/releases/download/v2.0.0-alpha.1/Initial2D-${TRIPLE}`,
      "https://github.com/biud436/Initial2D/releases/download/v2.0.0-alpha.1/THIRD-PARTY.md",
    ]);
    const meta = JSON.parse(fs.readFileSync(path.join(repo, "src-tauri", "binaries", "engine.json"), "utf8"));
    expect(meta).toMatchObject({ engineTag: "v2.0.0-alpha.1", describe: "v2.0.0-alpha.1", source: "release", pinned: true });

    const bad = capture();
    expect(await fetchEngine.main(["--target", TRIPLE], { repo, ...bad, fetchImpl: fakeFetch({ [`Initial2D-${TRIPLE}`]: "tampered", "THIRD-PARTY.md": third }) })).toBe(1);
    expect(bad.lines.join("\n")).toContain(`Initial2D-${TRIPLE} 의 sha256 이 핀과 다르다`);
    const missing = capture();
    expect(await fetchEngine.main(["--target", TRIPLE], { repo, ...missing, fetchImpl: fakeFetch({}) })).toBe(1);
    expect(missing.lines.join("\n")).toContain("HTTP 404");
  });
});

describe("yarn engine:pin", () => {
  const TAG = "v2.0.0-alpha.1";
  const LINUX = "x86_64-unknown-linux-gnu";
  const TEMPLATES = "templates zip";
  const THIRD = "# 고지\n";

  /** 릴리스에 올린 dist 의 두 파일 */
  function releaseFiles(opts: { tag?: string | null; commit?: string; sums?: Record<string, string> } = {}) {
    const native = {
      [TRIPLE]: { asset: `Initial2D-${TRIPLE}`, size: 3, sha256: sha("mac"), features: ["lua", "mruby"] },
      [LINUX]: { asset: `Initial2D-${LINUX}`, size: 5, sha256: sha("linux"), features: ["lua", "mruby"] },
    };
    const sums = opts.sums ?? { [`Initial2D-${TRIPLE}`]: sha("mac"), [`Initial2D-${LINUX}`]: sha("linux"), "Initial2D-templates.zip": sha(TEMPLATES), "THIRD-PARTY.md": sha(THIRD), "engine-dist.json": sha("x") };
    return {
      "engine-dist.json": JSON.stringify({ comment: "test", engineTag: opts.tag === undefined ? TAG : opts.tag, describe: TAG, engineCommit: opts.commit ?? COMMIT, native }),
      "SHA256SUMS.txt": Object.entries(sums).map(([n, s]) => `${s}  ${n}`).join("\n") + "\n",
    };
  }

  it("릴리스의 engine-dist.json 과 SHA256SUMS.txt 로 태그와 자산의 sha256 을 적고, comment 와 ciEngineRef 는 그대로 둔다", async () => {
    const repo = fakeRepo({ comment: "핀", engineTag: null, engineCommit: COMMIT, ciEngineRef: null });
    const seen: string[] = [];
    const out = capture();
    expect(await pinEngine.main([TAG], { repo, ...out, fetchImpl: fakeFetch(releaseFiles(), seen) })).toBe(0);
    expect(seen).toEqual([`https://github.com/biud436/Initial2D/releases/download/${TAG}/engine-dist.json`, `https://github.com/biud436/Initial2D/releases/download/${TAG}/SHA256SUMS.txt`]);
    const pin = JSON.parse(fs.readFileSync(path.join(repo, "engine-pin.json"), "utf8"));
    expect(pin).toEqual({
      comment: "핀",
      engineTag: TAG,
      engineCommit: COMMIT,
      ciEngineRef: null,
      native: {
        [TRIPLE]: { asset: `Initial2D-${TRIPLE}`, sha256: sha("mac"), size: 3, features: ["lua", "mruby"] },
        [LINUX]: { asset: `Initial2D-${LINUX}`, sha256: sha("linux"), size: 5, features: ["lua", "mruby"] },
      },
      templates: { asset: "Initial2D-templates.zip", sha256: sha(TEMPLATES) },
      thirdParty: { asset: "THIRD-PARTY.md", sha256: sha(THIRD) },
    });
    expect(dist.validatePin(pin)).toEqual([]);
    // 그 핀으로 engine:fetch 가 릴리스에서 받는다
    const fetched = capture();
    expect(await fetchEngine.main(["--target", TRIPLE], { repo, ...fetched, fetchImpl: fakeFetch({ [`Initial2D-${TRIPLE}`]: "mac", "THIRD-PARTY.md": THIRD }) })).toBe(0);
  });

  it("--from 은 폴더에서 읽는다", async () => {
    const repo = fakeRepo();
    const dir = path.join(tmp, "release");
    for (const [name, text] of Object.entries(releaseFiles())) write(path.join(dir, name), text);
    expect(await pinEngine.main([TAG, "--from", dir], { repo, ...capture() })).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(repo, "engine-pin.json"), "utf8")).engineTag).toBe(TAG);
  });

  it("태그나 커밋이 다르거나 sha256 이 SHA256SUMS.txt 와 다르거나 템플릿이 없으면 핀을 바꾸지 않는다", async () => {
    const cases: Array<[Record<string, string>, string]> = [
      [releaseFiles({ tag: "v2.0.0-alpha.0" }), "engineTag 가 v2.0.0-alpha.1 가 아님"],
      [releaseFiles({ tag: null }), "engineTag 가 v2.0.0-alpha.1 가 아님 (현재: null)"],
      [releaseFiles({ commit: OTHER }), "핀의 커밋 cac4b94 과 다름"],
      [releaseFiles({ sums: { [`Initial2D-${TRIPLE}`]: sha("other"), [`Initial2D-${LINUX}`]: sha("linux"), "Initial2D-templates.zip": sha(TEMPLATES), "THIRD-PARTY.md": sha(THIRD) } }), `Initial2D-${TRIPLE} 의 sha256 이 SHA256SUMS.txt 와 다름`],
      [releaseFiles({ sums: { [`Initial2D-${TRIPLE}`]: sha("mac"), [`Initial2D-${LINUX}`]: sha("linux"), "THIRD-PARTY.md": sha(THIRD) } }), "SHA256SUMS.txt 에 Initial2D-templates.zip 없음"],
    ];
    for (const [files, message] of cases) {
      const repo = fakeRepo();
      const before = fs.readFileSync(path.join(repo, "engine-pin.json"), "utf8");
      const out = capture();
      expect(await pinEngine.main([TAG], { repo, ...out, fetchImpl: fakeFetch(files) }), message).toBe(1);
      expect(out.lines.join("\n")).toContain(message);
      expect(fs.readFileSync(path.join(repo, "engine-pin.json"), "utf8")).toBe(before);
    }
    const missing = capture();
    expect(await pinEngine.main([TAG], { repo: fakeRepo(), ...missing, fetchImpl: fakeFetch({}) })).toBe(1);
    expect(missing.lines.join("\n")).toContain("HTTP 404");
  });

  it("태그가 없거나 둘이거나 모르는 인자는 종료 코드 2", async () => {
    for (const argv of [[], [TAG, "v2"], [TAG, "--bogus"], [TAG, "--from"]]) expect(await pinEngine.main(argv, { repo: fakeRepo(), ...capture() }), argv.join(" ")).toBe(2);
  });
});

describe("yarn engine:fetch --templates", () => {
  it("템플릿 묶음을 빈 폴더에 풀고 MANIFEST 의 sha256 과 커밋을 확인한다", async () => {
    const repo = fakeRepo();
    const from = fakeDist();
    write(path.join(from, "Initial2D-templates.zip"), templatesZip());
    const out = path.join(tmp, "unpacked");
    const log = capture();
    expect(await fetchEngine.main(["--from", from, "--templates", out], { repo, ...log })).toBe(0);
    expect(fs.readFileSync(path.join(out, "resources/templates/tilemap/map.json"), "utf8")).toBe("{}\n");
    expect(JSON.parse(fs.readFileSync(path.join(out, "MANIFEST.json"), "utf8")).engineCommit).toBe(COMMIT);
    // 엔진은 받지 않는다
    expect(fs.existsSync(path.join(repo, "src-tauri"))).toBe(false);
    // 다시 풀면 폴더가 비어 있지 않아 멈춘다
    expect(await fetchEngine.main(["--from", from, "--templates", out], { repo, ...log })).toBe(1);
    expect(log.lines.at(-1)).toContain("비어 있지 않다");
  });

  it("묶음의 커밋이 핀과 다르거나 폴더 밖을 가리키는 이름이 있으면 멈춘다", async () => {
    const repo = fakeRepo();
    const from = fakeDist();
    write(path.join(from, "Initial2D-templates.zip"), templatesZip(OTHER));
    const log = capture();
    expect(await fetchEngine.main(["--from", from, "--templates", path.join(tmp, "a")], { repo, ...log })).toBe(1);
    expect(log.lines.at(-1)).toContain("템플릿 묶음의 엔진 커밋 179cecc 이 핀 cac4b94 과 다르다");
    write(path.join(from, "Initial2D-templates.zip"), templatesZip(COMMIT, { "../escape.txt": "x" }));
    expect(await fetchEngine.main(["--from", from, "--templates", path.join(tmp, "b")], { repo, ...log })).toBe(1);
    expect(log.lines.at(-1)).toContain("폴더 밖을 가리킨다");
    expect(fs.existsSync(path.join(tmp, "escape.txt"))).toBe(false);
  });
});

describe("yarn engine:check", () => {
  function manifestRepo(manifests: Record<string, unknown>, pin?: Record<string, unknown>) {
    const repo = fakeRepo(pin);
    for (const [rel, data] of Object.entries(manifests)) write(path.join(repo, rel), JSON.stringify(data));
    return repo;
  }
  const good = { source: "checkout", syncCommand: "yarn sync:templates", engineCommit: COMMIT, files: [] };

  it("엔진에서 온 MANIFEST 가 모두 핀의 커밋이면 통과한다", async () => {
    const repo = manifestRepo({
      "packages/app/templates/MANIFEST.json": good,
      "packages/app/public/engine/MANIFEST.json": { ...good, syncCommand: "yarn sync:engine-web" },
      "packages/app/node_modules/x/MANIFEST.json": { engineCommit: "zzz" },
      "packages/other/MANIFEST.json": { name: "엔진에서 온 것이 아니다" },
    });
    const log = capture();
    expect(await checkPin.main({ repo, ...log })).toBe(0);
    expect(log.lines.filter((l) => l.includes("PASS"))).toHaveLength(4);
    expect(log.lines.at(-1)).toBe("engine:check: 전부 통과");
    expect(log.lines.join("\n")).toContain("핀에 web 자산이 없다");
  });

  it("커밋이 다르거나 짧거나, source 와 syncCommand 가 없으면 실패한다", async () => {
    const repo = manifestRepo({
      "a/MANIFEST.json": { ...good, engineCommit: OTHER },
      "b/MANIFEST.json": { ...good, engineCommit: "cac4b94" },
      "c/MANIFEST.json": { engineCommit: COMMIT },
    });
    const log = capture();
    expect(await checkPin.main({ repo, ...log })).toBe(1);
    const text = log.lines.join("\n");
    expect(text).toContain("FAIL  a/MANIFEST.json (179cecc, checkout, yarn sync:templates): 엔진 커밋 179cecc 이 핀 cac4b94 과 다르다");
    expect(text).toContain("b/MANIFEST.json (cac4b94, checkout, yarn sync:templates): engineCommit 이 40자 커밋이 아니다");
    expect(text).toContain("c/MANIFEST.json (cac4b94, source 없음): source 가 release 나 checkout 이 아니다 (없음), syncCommand 가 없다");
    expect(log.lines.at(-1)).toBe("engine:check: 3건 어긋남");
  });

  it("ciEngineRef 가 남아 있으면 실패한다", async () => {
    const repo = manifestRepo({ "a/MANIFEST.json": good }, { engineTag: null, engineCommit: COMMIT, ciEngineRef: "feat/r6" });
    const log = capture();
    expect(await checkPin.main({ repo, ...log })).toBe(1);
    expect(log.lines.join("\n")).toContain("ciEngineRef 가 남아 있다 (feat/r6)");
  });

  it("받아 둔 사이드카의 engine.json 커밋도 대조한다", async () => {
    const repo = manifestRepo({ "a/MANIFEST.json": good, "src-tauri/binaries/engine.json": { engineCommit: OTHER, describe: "179cecc", target: TRIPLE } });
    const log = capture();
    expect(await checkPin.main({ repo, ...log })).toBe(1);
    expect(log.lines.join("\n")).toContain("engine.json 의 엔진 커밋 179cecc 이 핀과 다르다");
  });

  it("MANIFEST 가 하나도 없거나 핀이 틀리면 실패한다", async () => {
    const log = capture();
    expect(await checkPin.main({ repo: fakeRepo(), ...log })).toBe(1);
    expect(log.lines.join("\n")).toContain("엔진에서 온 MANIFEST.json 이 하나도 없다");
    expect(await checkPin.main({ repo: fakeRepo({ engineCommit: "x" }), ...log })).toBe(1);
    expect(await checkPin.main({ repo: path.join(tmp, "none"), ...log })).toBe(1);
  });

  it("핀에 web 자산이 있으면 public/engine 의 파일을 릴리스의 zip 과 대조한다", async () => {
    const js = "engine js";
    const zip = storedZip({ "Initial2D.js": js, "engine-web.json": "{}" });
    const pin = { engineTag: "v2.0.0-alpha.1", engineCommit: COMMIT, web: { asset: "Initial2D-web.zip", sha256: sha(zip) } };
    const repo = manifestRepo({ "packages/app/public/engine/MANIFEST.json": { ...good, files: [{ path: "Initial2D.js", sha256: sha(js) }] } }, pin);
    const log = capture();
    expect(await checkPin.main({ repo, ...log, fetchImpl: fakeFetch({ "Initial2D-web.zip": zip }) })).toBe(0);
    expect(log.lines.join("\n")).toContain("PASS  packages/app/public/engine/Initial2D.js = Initial2D-web.zip");
    const other = storedZip({ "Initial2D.js": "different" });
    const bad = capture();
    expect(await checkPin.main({ repo, ...bad, fetchImpl: fakeFetch({ "Initial2D-web.zip": other }) })).toBe(1);
    expect(bad.lines.join("\n")).toContain("sha256 이 핀과 다르다");
  });
});

describe("yarn sync:rpg 가 쓴 MANIFEST 와 yarn engine:check", () => {
  const SYNC_RPG = path.join(REPO, "scripts", "sync-engine-rpg.mjs");
  const FIXTURES = path.join(REPO, "packages", "ext-rpg", "test", "fixtures");
  const git = (dir: string, ...args: string[]) =>
    execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

  /** 지금의 픽스처 사본으로 엔진 체크아웃 흉내 */
  function fakeEngineCheckout(): string {
    const dir = path.join(tmp, "engine");
    const files = (JSON.parse(fs.readFileSync(path.join(FIXTURES, "MANIFEST.json"), "utf8")) as { files: Array<{ path: string }> }).files;
    for (const f of files) write(path.join(dir, f.path), fs.readFileSync(path.join(FIXTURES, f.path)));
    git(dir, "init", "-q", "-b", "main");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "fake engine");
    return dir;
  }

  function syncRpg(engine: string, args: string[]) {
    return spawnSync(process.execPath, [SYNC_RPG, ...args], { encoding: "utf8", env: { ...process.env, INITIAL2D_DIR: engine } });
  }

  it("체크아웃에서 쓴 MANIFEST 는 source 와 syncCommand 와 40자 커밋을 가지고, 핀이 그 커밋이면 engine:check 가 통과한다", async () => {
    const engine = fakeEngineCheckout();
    const head = git(engine, "rev-parse", "HEAD");
    const repo = fakeRepo({ engineTag: null, engineCommit: head, ciEngineRef: null });
    const out = path.join(repo, "packages", "ext-rpg", "test", "fixtures");
    const r = syncRpg(engine, ["--out", out]);
    expect(r.status, r.stderr).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, "MANIFEST.json"), "utf8")) as Record<string, unknown>;
    expect(manifest).toMatchObject({ source: "checkout", syncCommand: "yarn sync:rpg", engineCommit: head });
    expect(manifest.dirty).toBeUndefined();

    const log = capture();
    expect(await checkPin.main({ repo, ...log })).toBe(0);
    expect(log.lines.join("\n")).toContain(`PASS  packages/ext-rpg/test/fixtures/MANIFEST.json (${head.slice(0, 7)}, checkout, yarn sync:rpg)`);

    write(path.join(repo, "engine-pin.json"), JSON.stringify({ engineTag: null, engineCommit: COMMIT, ciEngineRef: null }));
    const stale = capture();
    expect(await checkPin.main({ repo, ...stale })).toBe(1);
    expect(stale.lines.join("\n")).toContain(`엔진 커밋 ${head.slice(0, 7)} 이 핀 cac4b94 과 다르다`);
  });

  it("엔진의 작업 트리가 커밋과 다르면 멈추고, --allow-dirty 면 dirty 를 적는다. 모르는 인자는 2", () => {
    const engine = fakeEngineCheckout();
    fs.appendFileSync(path.join(engine, "resources", "data", "items.json"), "\n");
    const out = path.join(tmp, "out");
    const stopped = syncRpg(engine, ["--out", out]);
    expect(stopped.status).toBe(1);
    expect(stopped.stderr).toContain("엔진 작업 트리에 커밋 안 된 변경 있음");
    expect(fs.existsSync(out)).toBe(false);
    const dirty = syncRpg(engine, ["--out", out, "--allow-dirty"]);
    expect(dirty.status, dirty.stderr).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(out, "MANIFEST.json"), "utf8"))).toMatchObject({ dirty: true, source: "checkout" });
    expect(syncRpg(engine, ["--bogus"]).status).toBe(2);
  });
});

describe("check-sidecar", () => {
  const OTOOL_L = `/x/Initial2D:
\t/System/Library/Frameworks/Cocoa.framework/Versions/A/Cocoa (compatibility version 1.0.0, current version 24.0.0)
\t/usr/lib/libc++.1.dylib (compatibility version 1.0.0, current version 1900.180.0)
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1351.0.0)
`;
  const HOMEBREW = `${OTOOL_L}\t/opt/homebrew/opt/sdl2/lib/libSDL2-2.0.0.dylib (compatibility version 3001.0.0, current version 3001.10.0)\n`;
  const LDD = `\tlinux-vdso.so.1 (0x00007ffd)
\tlibstdc++.so.6 => /lib/x86_64-linux-gnu/libstdc++.so.6 (0x00007f)
\tlibm.so.6 => /lib/x86_64-linux-gnu/libm.so.6 (0x00007f)
\tlibgcc_s.so.1 => /lib/x86_64-linux-gnu/libgcc_s.so.1 (0x00007f)
\tlibc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007f)
\t/lib64/ld-linux-x86-64.so.2 (0x00007f)
`;

  it("otool 과 ldd 의 출력을 읽고 허용 밖 의존을 고른다", () => {
    expect(sidecar.parseOtoolL(OTOOL_L)).toEqual([
      "/System/Library/Frameworks/Cocoa.framework/Versions/A/Cocoa",
      "/usr/lib/libc++.1.dylib",
      "/usr/lib/libSystem.B.dylib",
    ]);
    expect(sidecar.macDepProblems(sidecar.parseOtoolL(OTOOL_L))).toEqual([]);
    expect(sidecar.macDepProblems(sidecar.parseOtoolL(HOMEBREW))).toEqual(["/opt/homebrew/opt/sdl2/lib/libSDL2-2.0.0.dylib"]);
    expect(sidecar.parseMinos("Load command 9\n      cmd LC_BUILD_VERSION\n  cmdsize 32\n platform 1\n    minos 11.0\n      sdk 15.5\n")).toBe("11.0");
    expect(sidecar.parseMinos("cmd LC_VERSION_MIN_MACOSX\n  cmdsize 16\n  version 10.13\n      sdk 11.0")).toBe("10.13");
    expect(sidecar.parseMinos("")).toBeNull();
    const ldd = sidecar.parseLdd(LDD);
    expect(ldd.missing).toEqual([]);
    expect(sidecar.linuxDepProblems(ldd.libs)).toEqual([]);
    const withX = sidecar.parseLdd(`${LDD}\tlibX11.so.6 => not found\n`);
    expect(withX.missing).toEqual(["libX11.so.6"]);
    expect(sidecar.linuxDepProblems(withX.libs)).toEqual(["libX11.so.6"]);
  });

  it("앱 번들과 폴더와 받은 사이드카에서 사이드카와 engine.json 을 찾는다", () => {
    const app = path.join(tmp, "InitialEditor.app");
    write(path.join(app, "Contents", "MacOS", "Initial2D"), "x");
    write(path.join(app, "Contents", "Resources", "engine", "engine.json"), "{}");
    const appMeta = path.join(app, "Contents", "Resources", "engine", "engine.json");
    expect(sidecar.locate(app, null)).toEqual({ exe: path.join(app, "Contents", "MacOS", "Initial2D"), meta: appMeta, looked: [appMeta] });
    // 개발 빌드: target/debug/ 옆의 engine/engine.json
    const debug = path.join(tmp, "target", "debug");
    write(path.join(debug, "Initial2D"), "x");
    expect(sidecar.locate(debug, null)).toEqual({ exe: path.join(debug, "Initial2D"), meta: null, looked: [path.join(debug, "engine", "engine.json"), path.join(debug, "engine.json")] });
    write(path.join(debug, "engine", "engine.json"), "{}");
    expect(sidecar.locate(path.join(debug, "Initial2D"), null).meta).toBe(path.join(debug, "engine", "engine.json"));
    // yarn engine:fetch: src-tauri/binaries/ 에 사이드카와 engine.json 이 나란히
    const binaries = path.join(tmp, "src-tauri", "binaries");
    write(path.join(binaries, `Initial2D-${TRIPLE}`), "x");
    write(path.join(binaries, "engine.json"), "{}");
    expect(sidecar.locate(path.join(binaries, `Initial2D-${TRIPLE}`), null).meta).toBe(path.join(binaries, "engine.json"));
    // --engine-json 을 주면 그곳만 본다
    expect(sidecar.locate(path.join(binaries, `Initial2D-${TRIPLE}`), path.join(tmp, "nope.json"))).toMatchObject({ meta: null, looked: [path.join(tmp, "nope.json")] });
    expect(sidecar.locate(path.join(tmp, "nope"), null).error).toContain("없다");
  });

  it.skipIf(!unix)("engine.json 이 없으면 찾아본 곳과 함께 실패하고, --no-engine-json 이면 뺀다고 밝힌다", () => {
    const repo = fakeRepo();
    const exe = fakeEngine();
    const log = capture();
    expect(sidecar.main([exe], { repo, platform: "other", log: log.log })).toBe(1);
    const fails = log.lines.filter((l) => l.includes("FAIL"));
    expect(fails).toHaveLength(1);
    expect(fails[0]).toContain(`engine.json 이 없다 (찾아본 곳: ${path.join(tmp, "bin", "engine", "engine.json")}, ${path.join(tmp, "bin", "engine.json")})`);
    const bare = capture();
    expect(sidecar.main([exe, "--no-engine-json"], { repo, platform: "other", log: bare.log })).toBe(0);
    expect(bare.lines).toContain("engine.json: (보지 않는다, --no-engine-json)");
    const missing = capture();
    expect(sidecar.main([exe, "--engine-json", path.join(tmp, "nope.json")], { repo, platform: "other", log: missing.log })).toBe(1);
    expect(missing.lines.join("\n")).toContain("engine.json 이 없다 (찾아본 곳: " + path.join(tmp, "nope.json") + ")");
    expect(sidecar.main([exe, "--engine-json"], { repo, log: missing.log })).toBe(2);
    expect(sidecar.main([exe, "--engine-json", "a.json", "--no-engine-json"], { repo, log: missing.log })).toBe(2);
  });

  it.skipIf(!unix)("받은 사이드카 옆의 engine.json 을 찾아 그 커밋을 대조한다 (README 의 명령 그대로)", () => {
    const repo = fakeRepo();
    const exe = fakeEngine();
    const fetched = path.join(tmp, "binaries", `Initial2D-${TRIPLE}`);
    write(fetched, fs.readFileSync(exe), 0o755);
    write(path.join(tmp, "binaries", "engine.json"), JSON.stringify({ engineCommit: OTHER, sha256: "0".repeat(64) }));
    const log = capture();
    expect(sidecar.main([fetched], { repo, platform: "other", log: log.log })).toBe(1);
    expect(log.lines).toContain(`engine.json: ${path.join(tmp, "binaries", "engine.json")}`);
    expect(log.lines.filter((l) => l.includes("FAIL"))).toEqual(["  FAIL  engine.json 의 커밋 179cecc 이 실행 파일과 다르다"]);
  });

  /** --features, --version, --bogus 에 답하는 가짜 엔진 */
  function fakeEngine(opts: { commit?: string; bogusExit?: number; writes?: boolean } = {}) {
    const exe = path.join(tmp, "bin", "Initial2D");
    const touch = opts.writes ? "echo x > config.setting\n" : "";
    write(
      exe,
      `#!/bin/sh\n${touch}case "$1" in\n  --features) echo "lua mruby" ;;\n  --version) echo "Initial2D cac4b94 ${opts.commit ?? COMMIT}" ;;\n  *) echo "사용법" 1>&2; exit ${opts.bogusExit ?? 2} ;;\nesac\n`,
      0o755,
    );
    return exe;
  }

  it.skipIf(!unix)("인자 셋과 작업 폴더를 본다 (의존 검사는 가짜 도구로)", () => {
    const repo = fakeRepo();
    const exe = fakeEngine();
    write(path.join(tmp, "bin", "engine.json"), JSON.stringify({ engineCommit: COMMIT, sha256: sha(fs.readFileSync(exe)) }));
    const log = capture();
    const tool = (cmd: string, args: string[]) => {
      if (cmd === "otool" && args[0] === "-L") return { status: 0, stdout: OTOOL_L, stderr: "" };
      if (cmd === "otool") return { status: 0, stdout: "cmd LC_BUILD_VERSION\n minos 11.0\n", stderr: "" };
      if (cmd === "lipo") return { status: 0, stdout: "arm64\n", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    };
    expect(sidecar.main([exe], { repo, platform: "darwin", tool, log: log.log })).toBe(0);
    expect(log.lines.filter((l) => l.includes("FAIL"))).toEqual([]);
    expect(log.lines.at(-1)).toBe("check-sidecar: 전부 통과");

    const brew = capture();
    const brewTool = (cmd: string, args: string[]) => (cmd === "otool" && args[0] === "-L" ? { status: 0, stdout: HOMEBREW, stderr: "" } : tool(cmd, args));
    expect(sidecar.main([exe], { repo, platform: "darwin", tool: brewTool, log: brew.log })).toBe(1);
    expect(brew.lines.join("\n")).toContain("허용 밖 의존: /opt/homebrew/opt/sdl2/lib/libSDL2-2.0.0.dylib");
  });

  it.skipIf(!unix)("커밋이 핀이나 engine.json 과 다르면 실패하고, --any-commit 은 핀만 봐준다", () => {
    const repo = fakeRepo();
    const exe = fakeEngine({ commit: OTHER });
    write(path.join(tmp, "bin", "engine", "engine.json"), JSON.stringify({ engineCommit: COMMIT, sha256: "0".repeat(64) }));
    const log = capture();
    expect(sidecar.main([exe], { repo, platform: "other", log: log.log })).toBe(1);
    const text = log.lines.join("\n");
    expect(text).toContain("커밋 179cecc 이 핀 cac4b94 과 다르다");
    expect(text).toContain("engine.json 의 커밋 cac4b94 이 실행 파일과 다르다");
    expect(text).toContain("INFO  sha256 이 engine.json 과 다르다");
    const any = capture();
    expect(sidecar.main([exe, "--any-commit"], { repo, platform: "other", log: any.log })).toBe(1);
    expect(any.lines.filter((l) => l.includes("FAIL"))).toEqual(["  FAIL  engine.json 의 커밋 cac4b94 이 실행 파일과 다르다"]);
  });

  it.skipIf(!unix)("모르는 인자에 0 으로 끝나거나 작업 폴더에 쓰면 실패한다", () => {
    const repo = fakeRepo();
    const log = capture();
    expect(sidecar.main([fakeEngine({ bogusExit: 0 })], { repo, platform: "other", log: log.log })).toBe(1);
    expect(log.lines.join("\n")).toContain("--bogus: 종료 코드 0");
    const writes = capture();
    expect(sidecar.main([fakeEngine({ writes: true })], { repo, platform: "other", log: writes.log })).toBe(1);
    expect(writes.lines.join("\n")).toContain("작업 폴더에 썼다: config.setting");
  });

  it("인자가 없거나 모르면 2", () => {
    const log = capture();
    expect(sidecar.main([], { repo: fakeRepo(), log: log.log })).toBe(2);
    expect(sidecar.main(["a", "--nope"], { repo: fakeRepo(), log: log.log })).toBe(2);
  });

  it.skipIf(!unix || !fs.existsSync(path.join(REPO, "src-tauri", "binaries", `Initial2D-${dist.hostTriple() ?? "none"}`)))(
    "받아 둔 진짜 사이드카가 있으면 그것도 통과한다 (yarn engine:fetch 뒤)",
    () => {
      const triple = dist.hostTriple()!;
      const log = capture();
      const code = sidecar.main([path.join(REPO, "src-tauri", "binaries", `Initial2D-${triple}`), "--engine-json", path.join(REPO, "src-tauri", "binaries", "engine.json"), "--any-commit"], { log: log.log });
      expect(log.lines.filter((l) => l.includes("FAIL")), log.lines.join("\n")).toEqual([]);
      expect(code).toBe(0);
    },
  );
});
