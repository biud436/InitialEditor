// scripts/gen-licenses.mjs (제3자 고지). 가짜 node_modules 와 가짜 cargo metadata 로 본다.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

interface Pkg {
  name: string;
  version: string;
  chosen?: string;
  license: string | null;
  repository: string | null;
  dir: string;
}

const licenses = (await import(pathToFileURL(path.join(REPO, "scripts", "gen-licenses.mjs")).href)) as {
  OUT_REL: string;
  pickLicense(expr: string | null): string;
  licenseFiles(dir: string, chosen: string): string[];
  normalizeText(text: string): string;
  npmPackages(repo: string): Pkg[];
  cargoPackages(meta: unknown): Pkg[];
  render(npm: Pkg[], cargo: Pkg[]): string;
  main(argv: string[], deps?: Record<string, unknown>): Promise<number>;
};

let tmp = "";
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "licenses-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(rel: string, text: string) {
  const file = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const json = (v: unknown) => JSON.stringify(v, null, 2);

/** 가짜 저장소: packages/app 이 워크스페이스 core 와 react 를, core 가 mobx 를 쓴다. react 는 loose-envify 의 다른 판을 품는다 */
function fakeRepo() {
  write("packages/app/package.json", json({ name: "@initial-editor/app", version: "1.0.0", dependencies: { "@initial-editor/core": "1.0.0", react: "^18" }, devDependencies: { vite: "^6" } }));
  write("packages/core/package.json", json({ name: "@initial-editor/core", version: "1.0.0", dependencies: { mobx: "^6" } }));
  write("node_modules/react/package.json", json({ name: "react", version: "18.3.1", license: "MIT", repository: { type: "git", url: "git+https://github.com/facebook/react.git" }, dependencies: { "loose-envify": "^2" } }));
  write("node_modules/react/LICENSE", "MIT License\r\n\r\nCopyright (c) Meta   \r\n");
  write("node_modules/react/node_modules/loose-envify/package.json", json({ name: "loose-envify", version: "2.0.0", license: "MIT", repository: "zertosh/loose-envify" }));
  write("node_modules/loose-envify/package.json", json({ name: "loose-envify", version: "1.4.0", license: "MIT" }));
  write("node_modules/mobx/package.json", json({ name: "mobx", version: "6.16.1", license: "MIT", repository: "https://github.com/mobxjs/mobx" }));
  write("node_modules/mobx/LICENSE", "MIT License\n\nCopyright (c) Meta\n");
  write("node_modules/vite/package.json", json({ name: "vite", version: "6.0.0", license: "MIT" }));
}

describe("제3자 고지 (gen-licenses.mjs)", () => {
  it("고를 수 있으면 MIT 부터 고르고 AND 는 그대로 둔다", () => {
    expect(licenses.pickLicense("MIT OR Apache-2.0")).toBe("MIT");
    expect(licenses.pickLicense("Apache-2.0/MIT")).toBe("MIT");
    expect(licenses.pickLicense("Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT")).toBe("MIT");
    expect(licenses.pickLicense("Zlib OR Apache-2.0")).toBe("Apache-2.0");
    expect(licenses.pickLicense("(MIT OR Apache-2.0) AND Unicode-3.0")).toBe("(MIT OR Apache-2.0) AND Unicode-3.0");
    expect(licenses.pickLicense("MPL-2.0")).toBe("MPL-2.0");
    expect(licenses.pickLicense(null)).toBe("UNKNOWN");
  });

  it("고른 라이선스의 원문 파일만 싣는다", () => {
    write("a/LICENSE-MIT", "mit");
    write("a/LICENSE-APACHE", "apache");
    write("a/Cargo.toml", "");
    expect(licenses.licenseFiles(path.join(tmp, "a"), "MIT").map((f) => path.basename(f))).toEqual(["LICENSE-MIT"]);
    write("b/LICENSE", "one");
    write("b/LICENSE-APACHE", "apache");
    expect(licenses.licenseFiles(path.join(tmp, "b"), "MIT").map((f) => path.basename(f))).toEqual(["LICENSE"]);
    write("c/COPYING", "c");
    expect(licenses.licenseFiles(path.join(tmp, "c"), "Unlicense").map((f) => path.basename(f))).toEqual(["COPYING"]);
    expect(licenses.licenseFiles(path.join(tmp, "none"), "MIT")).toEqual([]);
  });

  it("줄 끝과 끝 공백을 맞춘다", () => {
    expect(licenses.normalizeText("﻿a  \r\nb\r\n\r\n")).toBe("a\nb");
  });

  it("npm: 앱의 런타임 의존에서 시작해 워크스페이스를 건너 따라가고, 중첩된 판도 Node 규칙대로 찾는다 (dev 는 빼고)", () => {
    fakeRepo();
    const list = licenses.npmPackages(tmp);
    expect(list.map((p) => `${p.name}@${p.version}`)).toEqual(["loose-envify@2.0.0", "mobx@6.16.1", "react@18.3.1"]);
    expect(list.find((p) => p.name === "react")?.repository).toBe("https://github.com/facebook/react");
    expect(list.find((p) => p.name === "loose-envify")?.repository).toBe("https://github.com/zertosh/loose-envify");
  });

  it("npm: node_modules 에 없는 의존이면 멈춘다", () => {
    fakeRepo();
    fs.rmSync(path.join(tmp, "node_modules/mobx"), { recursive: true });
    expect(() => licenses.npmPackages(tmp)).toThrow(/mobx/);
  });

  it("Cargo: 일반 의존만 따라가고 뿌리는 뺀다", () => {
    const pkg = (name: string, license: string) => ({ id: `${name} 1.0.0`, name, version: "1.0.0", license, repository: `https://x/${name}`, manifest_path: path.join(tmp, name, "Cargo.toml") });
    const meta = {
      packages: [pkg("root", "MIT"), pkg("serde", "MIT OR Apache-2.0"), pkg("tempfile", "MIT"), pkg("cc", "MIT"), pkg("itoa", "MIT")],
      resolve: {
        root: "root 1.0.0",
        nodes: [
          {
            id: "root 1.0.0",
            deps: [
              { pkg: "serde 1.0.0", dep_kinds: [{ kind: null }] },
              { pkg: "tempfile 1.0.0", dep_kinds: [{ kind: "dev" }] },
              { pkg: "cc 1.0.0", dep_kinds: [{ kind: "build" }] },
            ],
          },
          { id: "serde 1.0.0", deps: [{ pkg: "itoa 1.0.0", dep_kinds: [{ kind: null, target: "cfg(windows)" }] }] },
          { id: "tempfile 1.0.0", deps: [] },
          { id: "cc 1.0.0", deps: [] },
          { id: "itoa 1.0.0", deps: [] },
        ],
      },
    };
    expect(licenses.cargoPackages(meta).map((p) => p.name)).toEqual(["itoa", "serde"]);
  });

  it("같은 원문은 한 번만 싣고 번호로 가리킨다", () => {
    fakeRepo();
    const text = licenses.render(licenses.npmPackages(tmp), []);
    expect(text).toContain("| mobx | 6.16.1 | MIT | 1 | https://github.com/mobxjs/mobx |");
    expect(text).toContain("| react | 18.3.1 | MIT | 1 | https://github.com/facebook/react |");
    expect(text).toContain("| loose-envify | 2.0.0 | MIT | - |");
    expect(text).toContain("적용: mobx 6.16.1, react 18.3.1");
    expect(text.match(/^### /gm)).toHaveLength(1);
    expect(text).toContain("````text\nMIT License\n\nCopyright (c) Meta\n````");
  });

  it("--check 는 커밋한 파일이 지금 의존성과 다르면 1, 같으면 0", async () => {
    fakeRepo();
    const deps = { repo: tmp, cargoMetadata: () => ({ packages: [], resolve: { root: "r", nodes: [] } }), log: () => {}, error: () => {} };
    const errors: string[] = [];
    expect(await licenses.main(["--check"], { ...deps, error: (s: string) => errors.push(s) })).toBe(1);
    expect(errors[0]).toMatch(/없다/);
    expect(await licenses.main([], deps)).toBe(0);
    expect(fs.existsSync(path.join(tmp, licenses.OUT_REL))).toBe(true);
    expect(await licenses.main(["--check"], deps)).toBe(0);
    write("node_modules/mobx/package.json", json({ name: "mobx", version: "6.17.0", license: "MIT" }));
    errors.length = 0;
    expect(await licenses.main(["--check"], { ...deps, error: (s: string) => errors.push(s) })).toBe(1);
    expect(errors[0]).toMatch(/다르다/);
    expect(await licenses.main(["--bogus"], deps)).toBe(2);
  });
});
