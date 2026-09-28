// scripts/check-terms.mjs (yarn check:terms) 의 판정: 문자열 리터럴과 JSX 텍스트만 보고, 주석과 테스트와 terms-ok 줄은 건너뛴다.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
type Problem = { line: number; rule: string; detail: string; text: string };
const terms = (await import(pathToFileURL(path.join(REPO, "scripts", "check-terms.mjs")).href)) as {
  scanSource(file: string, text: string): Problem[];
  isTestPath(rel: string): boolean;
  main(argv: string[], cwd: string, log: { log(s: string): void; error(s: string): void }): number;
};

const words = (file: string, text: string) => terms.scanSource(file, text).map((p) => `${p.line} ${p.rule} ${p.detail}`);

describe("찾는 것", () => {
  it("문자열 리터럴 안의 쓰지 않는 말과 한다체 끝맺음", () => {
    expect(words("a.ts", 'const a = "이 타입은 칸이 없다";')).toEqual([
      "1 word 쓰지 않는 말 '칸' (쓰는 말: 타일, 속성, 요소)",
      "1 ending 한다체 끝맺음 '없다' (명사형으로)",
    ]);
  });

  it("템플릿 조각, JSX 텍스트와 속성, 여러 줄 템플릿의 줄 번호", () => {
    expect(words("a.ts", "const m = `${path} 을(를) 읽지 못했다: ${e}`;")).toEqual(["1 ending 한다체 끝맺음 '못했다' (명사형으로)"]);
    expect(words("a.tsx", 'const v = <div title="붓 고르기">\n  여기서 실행\n</div>;')).toEqual([
      "1 word 쓰지 않는 말 '붓' (쓰는 말: 브러시)",
      "1 word 쓰지 않는 말 '고르' (쓰는 말: 선택)",
      "2 word 쓰지 않는 말 '여기서 실행' (쓰는 말: 이 맵에서 실행)",
    ]);
    expect(words("a.ts", "const t = `첫 줄\n둘째 줄은 폭이다`;")).toEqual([
      "2 word 쓰지 않는 말 '폭' (쓰는 말: 너비)",
      "2 ending 한다체 끝맺음 '폭이다' (명사형으로)",
    ]);
  });

  it("Rust 의 문자열 (테스트 모듈 앞까지)", () => {
    const rs = 'fn f() -> String {\n    format!("엔진 저장소가 없다: {repo}")\n}\n\n#[cfg(test)]\nmod tests {\n    const A: &str = "칸이 없다";\n}\n';
    expect(words("a.rs", rs)).toEqual(["2 ending 한다체 끝맺음 '없다' (명사형으로)"]);
  });
});

describe("건너뛰는 것", () => {
  it("주석, 명사형 끝맺음, 조사 보다와 마다, 그리기 순서의 그림", () => {
    const ts = [
      "// 칸이 없다",
      "/* 붓을 고른다 */",
      'const a = "0보다 큰 숫자여야 함";',
      'const b = "프레임마다 호출";',
      'const c = "나중에 그림";',
      'const d = "불리언, 숫자, 문자열 중 하나";',
      'const e = "열린 프로젝트 없음";',
    ].join("\n");
    expect(words("a.ts", ts)).toEqual([]);
  });

  it("줄 끝의 terms-ok 주석과 여러 줄 리터럴의 끝 줄", () => {
    expect(words("a.ts", 'const a = "칸이 없다"; // terms-ok: 게임 콘텐츠 이름')).toEqual([]);
    expect(words("a.ts", "const t = `-- 씬이 계약 함수를 부른다.\n-- 둘째 줄도 문장이다.\n`; // terms-ok: 생성하는 스크립트의 주석")).toEqual([]);
    // 이유가 없는 주석이나 다른 줄의 주석은 예외가 아니다
    expect(words("a.ts", 'const a = "칸";\n// terms-ok: 다음 줄')).toHaveLength(1);
  });

  it("테스트 파일과 폴더", () => {
    for (const rel of ["packages/app/src/a.test.ts", "packages/app/src/b.spec.tsx", "packages/core/src/testing/x.ts", "packages/ext-rpg/test/y.ts", "packages/app/src/editor/maps/__fixtures__/z.ts"]) {
      expect(terms.isTestPath(rel), rel).toBe(true);
    }
    expect(terms.isTestPath("packages/app/src/editor/newProject.ts")).toBe(false);
  });
});

describe("main", () => {
  let tmp = "";
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "check-terms-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function write(rel: string, text: string) {
    const file = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }

  it("packages/*/src 와 src-tauri/src 를 보고, 문제가 있으면 1과 위치를 알린다", () => {
    write("packages/app/src/ok.ts", 'export const A = "저장됨";\n');
    write("packages/app/src/ok.test.ts", 'expect(a).toBe("저장했다");\n');
    write("src-tauri/src/lib.rs", 'pub const B: &str = "창이 없다";\n');
    const out: string[] = [];
    const log = { log: (s: string) => out.push(s), error: (s: string) => out.push(s) };
    expect(terms.main([], tmp, log)).toBe(1);
    expect(out[0]).toMatch(/^UI 문구 1건/);
    expect(out[1]).toContain("src-tauri/src/lib.rs:1: 한다체 끝맺음 '없다'");
    fs.rmSync(path.join(tmp, "src-tauri"), { recursive: true });
    out.length = 0;
    expect(terms.main([], tmp, log)).toBe(0);
    expect(out).toEqual(["UI 문구 검사 통과 (쓰지 않는 말, 한다체 끝맺음 없음)"]);
  });
});
