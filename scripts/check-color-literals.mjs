#!/usr/bin/env node
// 색 리터럴 검사 (docs/plans/02-scope-and-screens.md 6절).
// 토큰 파일(packages/app/src/theme/tokens.css) 밖에서 #rgb, rgb(), hsl() 를 쓰면 실패한다.
// 확장과 패널은 var(--...) 만 쓴다. 그래야 테마가 토큰 한 벌로 끝난다.
//
// 사용: node scripts/check-color-literals.mjs [폴더...]   (기본: packages)
// 한 줄을 예외로 두려면 그 줄에 `color-literal-ok` 주석을 적는다 (이유를 함께).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const roots = process.argv.slice(2);
const targets = roots.length ? roots : ["packages"];
const ALLOWED_FILES = new Set(["packages/app/src/theme/tokens.css"]);
const EXTENSIONS = new Set([".css", ".scss", ".ts", ".tsx", ".jsx", ".js", ".html"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "legacy", "target", ".git"]);
// `#abc` 는 값 자리(콜론, 따옴표, 괄호, 공백, 쉼표 뒤)에 올 때만 색으로 본다. `this.#field` 는 잡지 않는다.
const PATTERN = /(?<=[:"'`(\s,=])#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTENSIONS.has(name.slice(name.lastIndexOf(".")))) yield full;
  }
}

const problems = [];
for (const target of targets) {
  for (const file of walk(target)) {
    const rel = relative(process.cwd(), file).split(sep).join("/");
    if (ALLOWED_FILES.has(rel)) continue;
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (line.includes("color-literal-ok")) return;
      if (PATTERN.test(line)) problems.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
}

if (problems.length) {
  console.error(`색 리터럴 ${problems.length}곳. 토큰(var(--...))을 쓰거나 이유를 적고 color-literal-ok 를 붙인다.`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("색 리터럴 없음 (토큰 파일 제외)");
