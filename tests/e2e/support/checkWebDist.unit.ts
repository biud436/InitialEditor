// scripts/check-web-dist.mjs 를 명령으로 돌려 본다 (CI 의 web 잡이 yarn build 뒤에 부르는 것과 같다).
// 임시 폴더에 작은 dist 를 만들고(헤더 규칙은 저장소의 packages/app/public/_headers 그대로) 한 가지씩 망가뜨린다.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = path.resolve("scripts/check-web-dist.mjs");
const HEADERS = readFileSync(path.resolve("packages/app/public/_headers"), "utf8");

let root = "";
let n = 0;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "initial-editor-check-web-dist-"));
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** 검사를 통과하는 작은 dist. 돌려준 폴더를 망가뜨려 본다 */
function makeDist(): string {
  const dist = path.join(root, `dist-${++n}`);
  const put = (rel: string, data: string | Uint8Array) => {
    mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true });
    writeFileSync(path.join(dist, rel), data);
  };
  put("index.html", '<!doctype html><script type="module" crossorigin src="/assets/index-AbC123.js"></script><link rel="stylesheet" href="/assets/index-DeF456.css">');
  put("assets/index-AbC123.js", "console.log(1)\n");
  put("assets/index-DeF456.css", "body{}\n");
  put("_headers", HEADERS);
  const engine: Record<string, string | Uint8Array> = {
    "Initial2D.js": "var createInitial2D;\n",
    "Initial2D.wasm": new Uint8Array([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0]),
    "initial2d-loader.js": "export async function bootInitial2D() {}\n",
  };
  for (const [name, data] of Object.entries(engine)) put(`engine/${name}`, data);
  const files = Object.entries(engine).map(([name, data]) => ({ path: name, size: typeof data === "string" ? Buffer.byteLength(data) : data.length, sha256: sha256(data) }));
  put("engine/MANIFEST.json", JSON.stringify({ engineCommit: "a".repeat(40), features: ["lua", "wasm"], files }, null, 2));
  put("engine/THIRD-PARTY.md", "# 제3자 고지\n");
  return dist;
}

function check(dist: string, ...args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, "--dist", dist, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, fails: r.stderr.split("\n").filter((l) => l.startsWith("FAIL ")) };
}

function edit(dist: string, rel: string, fn: (text: string) => string): void {
  const file = path.join(dist, rel);
  writeFileSync(file, fn(readFileSync(file, "utf8")));
}

describe("check-web-dist", () => {
  it("저장소의 _headers 로 만든 dist 는 통과한다 (요약 한 줄, 종료 코드 0)", () => {
    const r = check(makeDist());
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("OK 웹판 dist: 파일 9 개, 0.0 MiB, 소스맵 0 개, _headers 규칙 5 개");
  });

  it("dist 가 없으면 실패한다", () => {
    const r = check(path.join(root, "nope"));
    expect(r.code).toBe(1);
    expect(r.fails).toEqual([`FAIL dist 폴더가 없다: ${path.join(root, "nope")} (yarn build 를 먼저)`]);
  });

  it(".wasm 의 Content-Type 규칙이 없으면 실패한다 (스트리밍 컴파일)", () => {
    const dist = makeDist();
    edit(dist, "_headers", (t) => t.replace("  Content-Type: application/wasm\n", "  X-Note: none\n"));
    const r = check(dist);
    expect(r.code).toBe(1);
    expect(r.fails).toEqual(["FAIL /engine/Initial2D.wasm 의 Content-Type 규칙이 application/wasm 이 아니다 (없음). 스트리밍 컴파일이 실패한다"]);
  });

  it("engine/ 이 no-cache 가 아니거나 immutable 이면, assets/ 가 immutable 이 아니면 실패한다", () => {
    const dist = makeDist();
    edit(dist, "_headers", (t) => t.replace("/engine/*\n  Cache-Control: no-cache\n", "/engine/*\n  Cache-Control: public, max-age=31536000, immutable\n").replace("/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n", "/assets/*\n  Cache-Control: no-store\n"));
    const r = check(dist);
    expect(r.code).toBe(1);
    expect(r.fails).toContain("FAIL /engine/Initial2D.wasm 의 Cache-Control 에 no-cache 가 없다 (public, max-age=31536000, immutable). 엔진 파일은 이름에 해시가 없다");
    expect(r.fails).toContain("FAIL /engine/MANIFEST.json 이(가) immutable 이다. 엔진 파일은 이름에 해시가 없다");
    expect(r.fails).toContain("FAIL /assets/index-AbC123.js 의 Cache-Control 에 immutable 이 없다");
  });

  it("nosniff 가 없거나 교차 출처 격리 헤더가 있으면 실패한다", () => {
    const dist = makeDist();
    edit(dist, "_headers", (t) => t.replace("  X-Content-Type-Options: nosniff\n", "  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n"));
    const r = check(dist);
    expect(r.code).toBe(1);
    expect(r.fails).toContain("FAIL / 에 X-Content-Type-Options: nosniff 가 없다");
    expect(r.fails).toContain("FAIL / 에 cross-origin-opener-policy 가 있다. 교차 출처 격리는 두지 않는다 (엔진이 스레드를 쓰지 않는다)");
    expect(r.fails).toContain("FAIL /engine/Initial2D.wasm 에 cross-origin-embedder-policy 가 있다. 교차 출처 격리는 두지 않는다 (엔진이 스레드를 쓰지 않는다)");
  });

  it("_headers 가 없거나 문법이 틀리면 실패한다", () => {
    const missing = makeDist();
    unlinkSync(path.join(missing, "_headers"));
    expect(check(missing).fails).toContain("FAIL _headers 가 없다 (packages/app/public/_headers 가 dist 로 옮겨져야 한다)");

    const broken = makeDist();
    edit(broken, "_headers", (t) => `  Orphan: 1\nengine/*\n  Cache-Control: no-cache\n/empty\n${t}\n/assets/x\n  no colon here\n`);
    const r = check(broken);
    expect(r.code).toBe(1);
    expect(r.fails).toContain("FAIL _headers 1행: 규칙 줄 없이 헤더가 왔다: Orphan: 1");
    expect(r.fails).toContain("FAIL _headers 2행: 규칙은 / 나 https:// 로 시작한다: engine/*");
    expect(r.fails).toContain("FAIL _headers 4행: 헤더가 없는 규칙이다: /empty");
    expect(r.fails.some((l) => /^FAIL _headers \d+행: "이름: 값" 꼴이 아니다: no colon here$/.test(l))).toBe(true);
  });

  it("웹 엔진 파일이 MANIFEST 와 다르거나 없으면, 고지가 없으면 실패한다", () => {
    const dist = makeDist();
    writeFileSync(path.join(dist, "engine", "Initial2D.js"), "var createInitial2D; // 손으로 고침\n");
    edit(dist, "engine/initial2d-loader.js", (t) => t.replace("boot", "BOOT"));
    unlinkSync(path.join(dist, "engine", "THIRD-PARTY.md"));
    const r = check(dist);
    expect(r.code).toBe(1);
    expect(r.fails).toContain(`FAIL engine/Initial2D.js 의 크기가 MANIFEST 와 다르다: ${Buffer.byteLength("var createInitial2D; // 손으로 고침\n")} (MANIFEST ${Buffer.byteLength("var createInitial2D;\n")})`);
    expect(r.fails).toContain("FAIL engine/initial2d-loader.js 의 sha256 이 MANIFEST 와 다르다");
    expect(r.fails).toContain("FAIL engine/THIRD-PARTY.md 이(가) 없다 (엔진 제3자 고지, yarn sync:engine-web 이 엔진 저장소에서 복사한다)");

    const gone = makeDist();
    unlinkSync(path.join(gone, "engine", "Initial2D.wasm"));
    edit(gone, "engine/MANIFEST.json", (t) => JSON.stringify({ ...JSON.parse(t), files: JSON.parse(t).files.filter((f: { path: string }) => f.path !== "Initial2D.js") }));
    const g = check(gone);
    expect(g.fails).toContain("FAIL engine/Initial2D.wasm 이(가) 없다 (MANIFEST 에는 있다)");
    expect(g.fails).toContain("FAIL engine/MANIFEST.json 에 Initial2D.js 이(가) 없다");
    expect(g.fails).toContain("FAIL .wasm 파일이 없다 (웹 엔진이 빠졌다)");
  });

  it("index.html 이 부르는 assets 파일이 없으면 실패한다", () => {
    const dist = makeDist();
    unlinkSync(path.join(dist, "assets", "index-DeF456.css"));
    expect(check(dist).fails).toEqual(["FAIL index.html 이 부르는 assets/index-DeF456.css 이(가) 없다"]);
  });

  it("Pages 한도: 25 MiB 넘는 파일, 20,000 개 이상의 파일이면 실패한다", () => {
    const big = makeDist();
    writeFileSync(path.join(big, "assets", "huge.bin"), "");
    truncateSync(path.join(big, "assets", "huge.bin"), 25 * 1024 * 1024 + 1);
    expect(check(big).fails).toEqual(["FAIL assets/huge.bin 이(가) 25.0 MiB 다. Pages 는 파일 하나에 25 MiB 까지다"]);

    const many = makeDist();
    mkdirSync(path.join(many, "many"));
    for (let i = 0; i < 20_000 - 9; i++) writeFileSync(path.join(many, "many", `${i}.txt`), "");
    const r = check(many);
    expect(r.fails).toEqual(["FAIL 파일이 20000 개다. Pages 는 20,000 개 아래다"]);
  });

  it("--desktop 이면 소스맵이 있을 때 실패하고, 웹판은 소스맵을 둔다", () => {
    const dist = makeDist();
    writeFileSync(path.join(dist, "assets", "index-AbC123.js.map"), "{}");
    const web = check(dist);
    expect(web.code).toBe(0);
    expect(web.out).toContain("소스맵 1 개");
    const desktop = check(dist, "--desktop");
    expect(desktop.code).toBe(1);
    expect(desktop.fails).toEqual(["FAIL 데스크톱 빌드에 소스맵이 1 개 있다 (예: assets/index-AbC123.js.map). yarn build:desktop 은 소스맵 없이 만든다"]);
  });
});
