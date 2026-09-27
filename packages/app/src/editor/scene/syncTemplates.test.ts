// scripts/sync-engine-templates.mjs 의 검사 (docs/plans/e6-packaging.md 마일스톤 3).
// 가짜 엔진 체크아웃(git 저장소)과 가짜 템플릿 묶음(zip)을 임시 폴더에 만들고 스크립트를 돌린다. 내용은 지금의 사본이다.
// 엔진 저장소(INITIAL2D_DIR)에 tools/pack_templates.py 와 플래피 그림이 있으면 진짜 묶음으로도 돌려 체크아웃과 같은지 본다.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TemplateManifest } from "./templateManifest";

const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const SCRIPT = path.join(REPO, "scripts", "sync-engine-templates.mjs");
const TEMPLATES_DIR = path.join(REPO, "packages", "app", "templates");
const current = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, "MANIFEST.json"), "utf8")) as TemplateManifest;
const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? path.join(REPO, "..", "Initial2D"));
const GENERATED = current.files.filter((f) => f.generated).map((f) => f.path);
const hasPython = spawnSync("python3", ["--version"]).status === 0;
const realEngineReady =
  hasPython && fs.existsSync(path.join(engineDir, "tools", "pack_templates.py")) && GENERATED.every((p) => fs.existsSync(path.join(engineDir, p)));

let work = "";

function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** 지금의 사본으로 엔진 체크아웃 흉내. 생성물은 추적하지 않는다 */
function fakeEngine(name: string): string {
  const dir = path.join(work, name);
  for (const f of current.files) {
    fs.mkdirSync(path.dirname(path.join(dir, f.path)), { recursive: true });
    fs.copyFileSync(path.join(TEMPLATES_DIR, f.path), path.join(dir, f.path));
  }
  fs.writeFileSync(path.join(dir, ".gitignore"), GENERATED.join("\n") + "\n");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "fake engine");
  return dir;
}

function run(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function readManifest(dir: string): TemplateManifest {
  return JSON.parse(fs.readFileSync(path.join(dir, "MANIFEST.json"), "utf8")) as TemplateManifest;
}

/** 저장(0)이나 deflate(8) zip. 테스트용 최소 구현 */
function makeZip(entries: Array<[string, Buffer]>, method: 0 | 8 = 8): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const body = method === 8 ? zlib.deflateRawSync(data) : data;
    const crc = zlib.crc32(data) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, body);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

/** pack_templates.py 와 같은 모양의 묶음. change 로 파일을 바꾸거나 빼거나 더한다 */
function fakeBundle(name: string, change: { tamper?: string; drop?: string; extra?: string; dirty?: boolean } = {}): string {
  const dir = path.join(work, name);
  fs.mkdirSync(dir, { recursive: true });
  const blobs: Array<[string, Buffer]> = [];
  const files: Array<{ path: string; size: number; sha256: string; generated: boolean }> = [];
  const add = (rel: string, data: Buffer, generated: boolean) => {
    files.push({ path: rel, size: data.length, sha256: sha256(data), generated });
    blobs.push([rel, rel === change.tamper ? Buffer.concat([data, Buffer.from("x")]) : data]);
  };
  for (const f of current.files) {
    if (f.path === change.drop) continue;
    add(f.path, fs.readFileSync(path.join(TEMPLATES_DIR, f.path)), GENERATED.includes(f.path));
  }
  if (change.extra) add(change.extra, Buffer.from("extra\n"), false);
  const manifest = { comment: "test", engineCommit: COMMIT, describe: "0123456", files, ...(change.dirty ? { dirty: true } : {}) };
  fs.writeFileSync(path.join(dir, "Initial2D-templates.zip"), makeZip([["MANIFEST.json", Buffer.from(JSON.stringify(manifest))], ...blobs]));
  return dir;
}

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "initial-editor-sync-templates-"));
});

afterAll(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

describe("sync-engine-templates.mjs", () => {
  it("엔진 체크아웃에서: source checkout, 커밋 40자, 생성물은 git 이 추적하지 않는 것", () => {
    const engine = fakeEngine("engine-ok");
    const out = path.join(work, "out-ok");
    const r = run(["--out", out], { INITIAL2D_DIR: engine });
    expect(r.status, r.stderr).toBe(0);
    const m = readManifest(out);
    expect(m.source).toBe("checkout");
    expect(m.syncCommand).toBe("yarn sync:templates");
    expect(m.engineCommit).toBe(git(engine, "rev-parse", "HEAD"));
    expect(m.dirty).toBeUndefined();
    expect(m.files.filter((f) => f.generated).map((f) => f.path)).toEqual(GENERATED);
    // 목록과 내용은 지금의 사본과 같다 (출처 칸만 다르다)
    expect(m.files).toEqual(current.files);
    for (const f of m.files) expect(sha256(fs.readFileSync(path.join(out, f.path))), f.path).toBe(f.sha256);
    expect(r.stdout).toContain("생성물");
  });

  it("추적 파일이 커밋과 다르면 멈추고, --allow-dirty 면 dirty 로 적는다", () => {
    const engine = fakeEngine("engine-dirty");
    fs.appendFileSync(path.join(engine, "scripts/lua/scene_loader.lua"), "-- local change\n");
    const out = path.join(work, "out-dirty");
    const r = run(["--out", out], { INITIAL2D_DIR: engine });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("작업 트리가 커밋과 다르다");
    expect(r.stderr).toContain("scripts/lua/scene_loader.lua");
    expect(fs.existsSync(out)).toBe(false);
    const ok = run(["--out", out, "--allow-dirty"], { INITIAL2D_DIR: engine });
    expect(ok.status, ok.stderr).toBe(0);
    const m = readManifest(out);
    expect(m.dirty).toBe(true);
    expect(m.files.find((f) => f.path === "scripts/lua/scene_loader.lua")!.sha256).toBe(sha256(fs.readFileSync(path.join(engine, "scripts/lua/scene_loader.lua"))));
  });

  it("생성물이 없으면 멈추고 만드는 법을 알린다", () => {
    const engine = fakeEngine("engine-nogen");
    fs.rmSync(path.join(engine, "resources/bird_276x64.png"));
    const r = run(["--out", path.join(work, "out-nogen")], { INITIAL2D_DIR: engine });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("resources/bird_276x64.png");
    expect(r.stderr).toContain("generate_placeholder_assets.py");
  });

  it("git 체크아웃이 아니면 멈춘다", () => {
    const engine = fakeEngine("engine-nogit");
    fs.rmSync(path.join(engine, ".git"), { recursive: true, force: true });
    const r = run(["--out", path.join(work, "out-nogit")], { INITIAL2D_DIR: engine });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("git 체크아웃이어야 한다");
  });

  it("템플릿 묶음에서 (--from-zip, dist 폴더도 받는다): source release, 커밋과 생성물은 묶음의 MANIFEST", () => {
    const dist = fakeBundle("bundle-ok", { extra: "resources/templates/extra.txt" });
    for (const [arg, out] of [
      [dist, path.join(work, "out-zip-dir")],
      [path.join(dist, "Initial2D-templates.zip"), path.join(work, "out-zip-file")],
    ]) {
      const r = run(["--from-zip", arg, "--out", out]);
      expect(r.status, r.stderr).toBe(0);
      const m = readManifest(out);
      expect(m.source).toBe("release");
      expect(m.syncCommand).toBe("yarn sync:templates --from-zip <Initial2D-templates.zip>");
      expect(m.engineCommit).toBe(COMMIT);
      expect(m.dirty).toBeUndefined();
      expect(m.files).toEqual(current.files);
      // 목록에 없는 묶음 파일은 알리고 건너뛴다
      expect(r.stdout).toContain("목록에 없어 건너뜀: resources/templates/extra.txt");
      expect(fs.existsSync(path.join(out, "resources/templates/extra.txt"))).toBe(false);
    }
    const dirty = run(["--from-zip", fakeBundle("bundle-dirty", { dirty: true }), "--out", path.join(work, "out-zip-dirty")]);
    expect(dirty.status, dirty.stderr).toBe(0);
    expect(readManifest(path.join(work, "out-zip-dirty")).dirty).toBe(true);
  });

  it("묶음의 파일이 MANIFEST 와 다르거나 목록의 파일이 빠졌으면 멈춘다", () => {
    const tampered = run(["--from-zip", fakeBundle("bundle-tamper", { tamper: "resources/scenes/flappy.json" }), "--out", path.join(work, "out-tamper")]);
    expect(tampered.status).toBe(1);
    expect(tampered.stderr).toContain("sha256 이 다르다: resources/scenes/flappy.json");
    const dropped = run(["--from-zip", fakeBundle("bundle-drop", { drop: "resources/templates/tilemap/map.json" }), "--out", path.join(work, "out-drop")]);
    expect(dropped.status).toBe(1);
    expect(dropped.stderr).toContain("묶음에 없다");
    expect(dropped.stderr).toContain("resources/templates/tilemap/map.json");
    const none = run(["--from-zip", path.join(work, "no-such-dist"), "--out", path.join(work, "out-none")]);
    expect(none.status).toBe(1);
    expect(none.stderr).toContain("템플릿 묶음이 없다");
  });

  it("이 스크립트가 만든 폴더가 아니면 비우지 않는다", () => {
    const out = path.join(work, "not-ours");
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "keep.txt"), "mine\n");
    const r = run(["--from-zip", fakeBundle("bundle-guard"), "--out", out]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("비우지 않는다");
    expect(fs.readFileSync(path.join(out, "keep.txt"), "utf8")).toBe("mine\n");
  });

  it("모르는 인자는 사용법과 함께 멈춘다", () => {
    const r = run(["--bogus"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("모르는 인자: --bogus");
    expect(r.stderr).toContain("사용법");
  });

  it("readZip: 저장과 deflate 를 읽고, CRC 가 틀리거나 zip 이 아니면 멈춘다", async () => {
    const mod = (await import(pathToFileURL(SCRIPT).href)) as { readZip(buf: Buffer): Map<string, Buffer> };
    const a = Buffer.from("가나다 abc\n".repeat(50));
    const b = Buffer.from([0, 1, 2, 3, 255]);
    for (const method of [0, 8] as const) {
      const files = mod.readZip(makeZip([["dir/a.txt", a], ["b.bin", b]], method));
      expect([...files.keys()]).toEqual(["dir/a.txt", "b.bin"]);
      expect(files.get("dir/a.txt")!.equals(a)).toBe(true);
      expect(files.get("b.bin")!.equals(b)).toBe(true);
    }
    const broken = makeZip([["b.bin", b]], 0);
    broken[30 + "b.bin".length] ^= 0xff; // 저장된 첫 바이트
    expect(() => mod.readZip(broken)).toThrow("CRC 가 다르다: b.bin");
    expect(() => mod.readZip(Buffer.from("not a zip at all, just text that is long enough"))).toThrow("zip 이 아니다");
  });

  it.skipIf(!realEngineReady)("엔진의 pack_templates.py 묶음에서 맞춘 것과 체크아웃에서 맞춘 것이 같다 (INITIAL2D_DIR)", () => {
    const dist = path.join(work, "real-dist");
    execFileSync("python3", [path.join(engineDir, "tools", "pack_templates.py"), "--allow-dirty", "--out", path.join(dist, "Initial2D-templates.zip")], { encoding: "utf8" });
    const fromZip = path.join(work, "real-zip");
    const fromCheckout = path.join(work, "real-checkout");
    const z = run(["--from-zip", dist, "--out", fromZip]);
    expect(z.status, z.stderr).toBe(0);
    const c = run(["--allow-dirty", "--out", fromCheckout], { INITIAL2D_DIR: engineDir });
    expect(c.status, c.stderr).toBe(0);
    const mz = readManifest(fromZip);
    const mc = readManifest(fromCheckout);
    expect(mz.engineCommit).toBe(mc.engineCommit);
    expect(mz.files).toEqual(mc.files);
    expect(mz.files.filter((f) => f.generated).map((f) => f.path)).toEqual(GENERATED);
  });
});
