#!/usr/bin/env node
// 화면 부품과 크기 토큰 검사 (docs/plans/quality.md 5.1절, 6절).
// scripts/ui-kit-scope.json 의 파일과 폴더(부품으로 옮긴 화면)만 본다. 화면을 옮기면 그 목록에 더한다.
//   1. CSS 의 font-size, padding, margin, gap, height, min-height, border-radius 에 토큰이 아닌 px 를 쓰면 실패한다.
//      1px 와 2px (선과 아주 작은 틈)는 허용한다.
//   2. TSX 에서 <button>, <input>, <select>, <textarea> 를 직접 쓰면 실패한다 (부품 자신인 packages/ui/src/kit 은 제외).
// 한 줄을 예외로 두려면 그 줄에 `ui-kit-ok` 주석을 이유와 함께 적는다.
//
// 사용: node scripts/check-ui-kit.mjs

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const scope = JSON.parse(readFileSync(new URL("./ui-kit-scope.json", import.meta.url), "utf8"));
const KIT_DIR = "packages/ui/src/kit/";
const SIZE_PROPS = /^\s*(font-size|padding(?:-\w+)?|margin(?:-\w+)?|gap|row-gap|column-gap|height|min-height|max-height|border-radius)\s*:\s*([^;]+);/;
const RAW_PX = /(?<![\w-])(\d+(?:\.\d+)?)px\b/g;
const RAW_ELEMENT = /<(button|input|select|textarea)[\s>]/;

function* walk(path) {
  if (!existsSync(path)) return;
  if (statSync(path).isFile()) {
    yield path;
    return;
  }
  for (const name of readdirSync(path)) {
    if (name === "node_modules" || name === "dist") continue;
    yield* walk(join(path, name));
  }
}

const problems = [];
for (const entry of scope.paths) {
  for (const file of walk(entry)) {
    const rel = relative(process.cwd(), file).split(sep).join("/");
    const lines = readFileSync(file, "utf8").split("\n");
    if (rel.endsWith(".css")) {
      lines.forEach((line, i) => {
        if (line.includes("ui-kit-ok")) return;
        const m = SIZE_PROPS.exec(line);
        if (!m) return;
        for (const px of m[2].matchAll(RAW_PX)) {
          if (px[1] === "1" || px[1] === "2") continue;
          problems.push(`${rel}:${i + 1}: ${m[1]} 에 토큰이 아닌 ${px[0]} (${line.trim()})`);
        }
      });
    } else if (rel.endsWith(".tsx") && !rel.startsWith(KIT_DIR) && !rel.endsWith(".test.tsx")) {
      lines.forEach((line, i) => {
        if (line.includes("ui-kit-ok")) return;
        const m = RAW_ELEMENT.exec(line);
        if (m) problems.push(`${rel}:${i + 1}: <${m[1]}> 대신 @initial-editor/ui 의 부품을 쓴다 (${line.trim()})`);
      });
    }
  }
}

if (problems.length) {
  console.error(`화면 부품 검사: 문제 ${problems.length}개`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`화면 부품 검사: 문제 없음 (${scope.paths.length}곳)`);
