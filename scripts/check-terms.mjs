#!/usr/bin/env node
// UI 문구 검사 (docs/design/ui-terms.md 3절).
// packages/*/src 와 src-tauri/src 의 문자열 리터럴과 JSX 텍스트에서 용어표(1절)의 쓰지 않는 말과
// 한다체 서술 끝맺음(-다)을 찾는다. 합니다체(-니다), 요청(-세요), 질문(-까요)은 허용한다.
// 주석과 테스트(*.test.*, *.spec.*, test/, testing/, __fixtures__/, Rust 의 cfg(test) 모듈)는 보지 않는다.
// JSON 도 보지 않는다 (api-fallback.json 의 설명은 엔진 resources/api/initial2d-api.json 과 같은 글이어야 한다).
//
// 사용: node scripts/check-terms.mjs [파일이나 폴더...]   (기본: packages/*/src, src-tauri/src)
// 한 줄을 예외로 두려면 그 줄 끝에 `// terms-ok: <이유>` 주석을 적는다. 여러 줄 리터럴은 시작 줄이나 끝 줄에 적는다.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** 용어표의 쓰지 않는 말. re 는 리터럴 안의 글에 맞춘다 */
export const BANNED = [
  { re: /편집기/, word: "편집기", use: "에디터" },
  { re: /(?<![가-힣])판(?![가-힣])/, word: "판", use: "버전" },
  { re: /읽는 중/, word: "읽는 중", use: "불러오는 중" },
  { re: /기본값으로/, word: "기본값으로", use: "기본값 복원" },
  { re: /씬 로더 (?:바꾸기|바꿈)/, word: "씬 로더 바꾸기", use: "씬 로더 교체" },
  { re: /미리 세기|세는 중/, word: "미리 세기", use: "파일 수 확인" },
  { re: /RTP 변환물/, word: "RTP 변환물", use: "RTP 변환 파일" },
  { re: /칸/, word: "칸", use: "타일, 속성, 요소" },
  { re: /폭(?!발)/, word: "폭", use: "너비" },
  { re: /가로|세로/, word: "가로, 세로", use: "너비, 높이" },
  { re: /(?<!먼저 |나중에 |에 )그림/, word: "그림", use: "이미지 (그리기 순서의 먼저 그림, 나중에 그림은 쓴다)" },
  { re: /붓/, word: "붓", use: "브러시" },
  { re: /지나감|막힘|막힌/, word: "지나감, 막힘", use: "통행 가능(0), 통행 불가(1)" },
  { re: /표식/, word: "표식", use: "오버레이, 마커" },
  { re: /겹쳐 보기/, word: "겹쳐 보기", use: "오버레이" },
  { re: /(?<!중 )하나|다섯/, word: "하나, 다섯", use: "숫자와 개 (1개)" },
  { re: /가지(?!고)/, word: "가지", use: "분기, N개" },
  { re: /구간/, word: "구간", use: "범위" },
  { re: /손잡이/, word: "손잡이", use: "끝점" },
  { re: /띠/, word: "띠", use: "band" },
  { re: /구역/, word: "구역", use: "영역" },
  { re: /자리/, word: "자리", use: "인덱스, 위치" },
  { re: /붙이|붙인|붙일|붙임|붙여(?!넣)|떼기|떼어|떼면|뗀/, word: "붙이기, 떼기", use: "추가, 제거, 붙여넣기" },
  { re: /글자|(?<![가-힣])글(?:이|은|을|과|만|(?![가-힣]))/, word: "글, 글자", use: "텍스트, 문자열" },
  { re: /글꼴/, word: "글꼴", use: "폰트" },
  { re: /(?<!불)투명도/, word: "투명도", use: "불투명도" },
  { re: /바닥 레이어/, word: "바닥 레이어", use: "오브젝트 아래 레이어" },
  { re: /참거짓/, word: "참거짓", use: "불리언" },
  { re: /별명/, word: "별명", use: "별칭" },
  { re: /모르는|예상하지 않은/, word: "모르는", use: "지원하지 않는, 등록되지 않은, 스키마에 없는" },
  { re: /조각/, word: "조각", use: "경로 구성 요소" },
  { re: /명령/, word: "명령", use: "커맨드" },
  { re: /걸음|돌기/, word: "걸음, 돌기", use: "루트 단계, 방향 전환" },
  { re: /말 걸기|밟/, word: "말 걸기, 밟기", use: "결정 키, 플레이어 접촉" },
  { re: /깃발/, word: "깃발", use: "플래그" },
  { re: /꼴/, word: "꼴", use: "종류" },
  { re: /곁/, word: "곁", use: "인접 타일" },
  { re: /묶음/, word: "묶음", use: "번들, 같은 연속 커맨드" },
  { re: /여기서 실행/, word: "여기서 실행", use: "이 맵에서 실행" },
  { re: /(?<!되)돌리|(?<!되)돌려|(?<!되)돌린|돈다|띄우|띄운|띄워|뜬다|떴다/, word: "돌리다, 띄우다", use: "실행" },
  { re: /끝나|끝남|끝났|끝낸|끝내/, word: "끝나다", use: "종료" },
  { re: /실행 취소/, word: "실행 취소", use: "되돌리기, 시작 취소됨" },
  { re: /에디터 안(?!내)|에디터 내장/, word: "에디터 안", use: "게임 탭" },
  { re: /웹판|브라우저판/, word: "웹판", use: "브라우저 모드, 브라우저 폴더 모드" },
  { re: /게임 뷰/, word: "게임 뷰", use: "게임 탭" },
  { re: /밖에서 바뀌|밖에서 바꾼/, word: "밖에서 바뀌다", use: "외부에서 변경됨" },
  { re: /내 것/, word: "내 것", use: "편집 내용" },
  { re: /저장 안 된 것|저장하지 않은 수정/, word: "저장 안 된 것", use: "저장하지 않은 변경" },
  { re: /기억한/, word: "기억한", use: "최근" },
  { re: /(?<=[\d}])곳/, word: "N곳", use: "일치 N개" },
  { re: /Tauri 앱/, word: "Tauri 앱", use: "데스크톱 앱" },
  { re: /형제 폴더/, word: "형제 폴더", use: "프로젝트 상위 폴더" },
  { re: /템플릿 자산/, word: "템플릿 자산", use: "템플릿 파일" },
  { re: /소재/, word: "소재", use: "리소스" },
  { re: /고르|고른|골라/, word: "고르다", use: "선택" },
  { re: /끌(?:면|어|기|고|린|었)/, word: "끌다", use: "드래그" },
  { re: /두 번 누르/, word: "두 번 누르다", use: "더블클릭" },
  { re: /적는|적어(?!도)|적으면|적힌/, word: "적다", use: "입력" },
  { re: /빼기|빼면|빼고|뺀|빼서|빼는/, word: "빼다", use: "삭제, 제거" },
  { re: /(?<!붙여)넣(?:기|는|어|을|으|고)/, word: "넣다", use: "삽입, 추가" },
  { re: /더하|더한|더해/, word: "더하다", use: "추가" },
  { re: /고치|고친|고쳐|옮기|옮긴|옮겨/, word: "고치다, 옮기다", use: "편집, 이동, 변경" },
  { re: /놓(?:기|고|은|는|아|을|인|여)/, word: "놓다", use: "배치, 로드" },
  { re: /되살리|되살린|되살려/, word: "되살리다", use: "복원" },
  { re: /펴기/, word: "펴기", use: "펼치기" },
  { re: /지금|손수|(?<![가-힣])늘(?![가-힣])/, word: "지금, 늘, 손수", use: "현재, 항상, 직접" },
];

/** 한다체 서술 끝맺음: 한글 낱말이 -다 로 끝남 (합니다체와 요청, 질문, 조사 보다와 마다, 명사 바다는 뺀다) */
const NARRATIVE = /[가-힣]+다(?![가-힣])/g;
const NOT_NARRATIVE = /(?:니다|세요|까요|보다|마다|바다)$/;
/** 레이블과 구별할 수 있는 전보체만 찾는다: 조건형과, 둘째 문장 이후의 명사형 종결 */
const TELEGRAPH_CONDITION = /[가-힣]+야 함(?![가-힣])/g;
const TELEGRAPH_AFTER_SENTENCE = /[.!?]\s+[^.!?\n]*(?:되지 않음|하지 않음|할 수 없음|필요|불가|미지원|아님|없음|있음|됨|함)(?=\s*(?:[.!?]|$))/g;
const ENGINE_TEXT_MIRRORS = new Set([
  "packages/ext-rpg/src/model/validate.ts",
  "packages/ext-rpg/src/model/game.ts",
  "packages/ext-rpg/src/model/play.ts",
]);

const OPT_OUT = /\/[/*]\s*terms-ok:/;
const SOURCE_EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".rs"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "target", ".git", "test", "testing", "__fixtures__", "__tests__"]);

/** 테스트 파일인가 */
export function isTestPath(rel) {
  const parts = rel.split("/");
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  const name = parts[parts.length - 1];
  return /\.(test|spec)\.[^.]+$/.test(name);
}

/**
 * 한 리터럴 조각의 글에서 찾은 문제. 반환값의 index 는 글 안의 위치
 * @param {string} text
 * @returns {{ index: number, rule: string, detail: string }[]}
 */
export function checkText(text) {
  const out = [];
  if (!/[가-힣]/.test(text)) return out;
  for (const b of BANNED) {
    const m = b.re.exec(text);
    if (m) out.push({ index: m.index, rule: "word", detail: `쓰지 않는 말 '${m[0]}' (쓰는 말: ${b.use})` });
  }
  for (const m of text.matchAll(NARRATIVE)) {
    if (NOT_NARRATIVE.test(m[0])) continue;
    out.push({ index: m.index, rule: "ending", detail: `한다체 끝맺음 '${m[0]}' (합니다체로)` });
  }
  for (const re of [TELEGRAPH_CONDITION, TELEGRAPH_AFTER_SENTENCE]) {
    for (const m of text.matchAll(re)) {
      const ending = m[0].trim().replace(/^[.!?]\s+/, "");
      out.push({ index: m.index, rule: "telegraph", detail: `문장형이 아닌 끝맺음 '${ending}' (합니다체로)` });
    }
  }
  return out;
}

/** TS, TSX, JS 의 문자열 리터럴, 템플릿 조각, JSX 텍스트의 범위 (start, end 는 글, outer 는 리터럴 전체) */
function tsSegments(file, text) {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  const visit = (node) => {
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral: {
        const s = node.getStart(sf);
        out.push({ start: s + 1, end: node.end - 1, outer: [s, node.end] });
        return;
      }
      case ts.SyntaxKind.TemplateExpression: {
        const outer = [node.getStart(sf), node.end];
        out.push({ start: node.head.getStart(sf) + 1, end: node.head.end - 2, outer });
        for (const span of node.templateSpans) {
          visit(span.expression);
          const lit = span.literal;
          const tail = lit.kind === ts.SyntaxKind.TemplateTail;
          out.push({ start: lit.getStart(sf) + 1, end: lit.end - (tail ? 1 : 2), outer });
        }
        return;
      }
      case ts.SyntaxKind.JsxText:
        out.push({ start: node.pos, end: node.end, outer: [node.pos, node.end] });
        return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Rust 의 문자열 리터럴 범위. 줄 맨 앞의 #[cfg(test)] 모듈부터는 보지 않는다 */
function rustSegments(text) {
  const out = [];
  const testMod = /^#\[cfg\((?:test|all\(test\b[^\]]*)\)\]/m.exec(text);
  const limit = testMod ? testMod.index : text.length;
  let i = 0;
  while (i < limit) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      i = nl < 0 ? limit : nl;
    } else if (c === "/" && text[i + 1] === "*") {
      let depth = 1;
      i += 2;
      while (i < limit && depth > 0) {
        if (text[i] === "/" && text[i + 1] === "*") (depth++, (i += 2));
        else if (text[i] === "*" && text[i + 1] === "/") (depth--, (i += 2));
        else i++;
      }
    } else if (c === "r" && /^r#*"/.test(text.slice(i, i + 10)) && !/[A-Za-z0-9_]/.test(text[i - 1] ?? "")) {
      const hashes = /^r(#*)"/.exec(text.slice(i))[1];
      const start = i + 2 + hashes.length;
      const end = text.indexOf('"' + hashes, start);
      out.push({ start, end, outer: [i, end + 1 + hashes.length] });
      i = end + 1 + hashes.length;
    } else if (c === '"') {
      let j = i + 1;
      while (j < limit && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out.push({ start: i + 1, end: j, outer: [i, j + 1] });
      i = j + 1;
    } else if (c === "'" && (text[i + 2] === "'" || text[i + 1] === "\\")) {
      const close = text.indexOf("'", i + 2);
      i = close < 0 ? limit : close + 1;
    } else i++;
  }
  return out;
}

/**
 * 파일 하나의 문제
 * @param {string} file 경로 (확장자로 언어를 고른다)
 * @param {string} text 내용
 * @returns {{ line: number, rule: string, detail: string, text: string }[]}
 */
export function scanSource(file, text) {
  const segments = file.endsWith(".rs") ? rustSegments(text) : tsSegments(file, text);
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (pos) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const lines = text.split("\n");
  const problems = [];
  for (const seg of segments) {
    const found = checkText(text.slice(seg.start, seg.end)).filter((f) => f.rule !== "telegraph" || !ENGINE_TEXT_MIRRORS.has(file));
    if (found.length === 0) continue;
    const exempt = [seg.outer[0], Math.max(seg.outer[0], seg.outer[1] - 1)].some((p) => OPT_OUT.test(lines[lineOf(p)]));
    for (const f of found) {
      const ln = lineOf(seg.start + f.index);
      if (exempt || OPT_OUT.test(lines[ln])) continue;
      problems.push({ line: ln + 1, rule: f.rule, detail: f.detail, text: lines[ln].trim() });
    }
  }
  return problems;
}

function* walk(path) {
  if (!statSync(path).isDirectory()) {
    yield path;
    return;
  }
  for (const name of readdirSync(path).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(path, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (SOURCE_EXT.has(name.slice(name.lastIndexOf(".")))) yield full;
  }
}

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** 각 패키지의 src 와 src-tauri/src 가운데 있는 폴더 */
function defaultRoots(cwd) {
  const packages = isDir(join(cwd, "packages")) ? readdirSync(join(cwd, "packages")).map((p) => join("packages", p, "src")) : [];
  return [...packages, "src-tauri/src"].filter((p) => isDir(join(cwd, p)));
}

/** @returns {number} 종료 코드 */
export function main(argv = process.argv.slice(2), cwd = process.cwd(), log = console) {
  const roots = argv.length ? argv : defaultRoots(cwd);
  const problems = [];
  for (const root of roots) {
    for (const file of walk(join(cwd, root))) {
      const rel = relative(cwd, file).split(sep).join("/");
      if (isTestPath(rel)) continue;
      for (const p of scanSource(rel, readFileSync(file, "utf8"))) problems.push(`${rel}:${p.line}: ${p.detail}: ${p.text}`);
    }
  }
  if (problems.length) {
    log.error(`UI 문구 ${problems.length}건. docs/design/ui-terms.md의 용어와 끝맺음으로 바꾸거나 이유와 함께 // terms-ok: 주석을 추가해야 합니다`);
    for (const p of problems) log.error("  " + p);
    return 1;
  }
  log.log("UI 문구 검사 통과 (쓰지 않는 말과 어색한 끝맺음 없음)");
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
