// 맵 편집의 엔진 교차 검사 판정 (docs/plans/e3-tilemap.md 완료 기준). scripts/e2e-engine-map.mjs 가 쓴다.
//   통행: 탐침 컴포넌트가 찍은 줄(엔진의 IsPassable, Ruby 는 passable?)을 저장한 파일과 에디터 모델의 collision 과 칸마다 견준다
//   항구 마을: 저장한 파일이 칠한 칸 하나만 다른지(JSON 과 줄), 엔진 테스트 러너의 출력 요약, 두 화면의 다른 픽셀

/** 탐침 줄의 머리. collisionProbe:size <w> <h>, collisionProbe:row <y> <칸마다 1 막힘 0 지나감>, collisionProbe:done */
export const PROBE_TAG = "collisionProbe";

/** 로그에서 탐침 줄을 읽는다. 돌려주는 것: { width, height, rows(y → 글), done } (size 줄이 없으면 width 와 height 가 null) */
export function parseCollisionProbe(log) {
  const out = { width: null, height: null, rows: new Map(), done: false };
  for (const raw of String(log).split("\n")) {
    const line = raw.trim();
    let m = /^collisionProbe:size (\d+) (\d+)$/.exec(line);
    if (m) {
      out.width = Number(m[1]);
      out.height = Number(m[2]);
      continue;
    }
    m = /^collisionProbe:row (\d+) ([01]*)$/.exec(line);
    if (m) {
      out.rows.set(Number(m[1]), m[2]);
      continue;
    }
    if (line === "collisionProbe:done") out.done = true;
  }
  return out;
}

/** 탐침이 맵 전체를 답했으면 칸마다 0 과 1 의 배열 (행 우선). 모자라면 null */
export function probeCells(probe, width, height) {
  if (probe.width !== width || probe.height !== height || !probe.done) return null;
  const cells = [];
  for (let y = 0; y < height; y++) {
    const row = probe.rows.get(y);
    if (row === undefined || row.length !== width) return null;
    for (const c of row) cells.push(c === "1" ? 1 : 0);
  }
  return cells;
}

const blocked = (v) => (v ? 1 : 0);

/** 다른 칸 목록 "x,y" (앞의 몇 개만 글로) */
function mismatches(a, b, width) {
  const out = [];
  for (let i = 0; i < a.length; i++) if (blocked(a[i]) !== blocked(b[i])) out.push(`${i % width},${Math.floor(i / width)}`);
  return out;
}

const listed = (cells) => (cells.length ? `: ${cells.slice(0, 12).join(" ")}${cells.length > 12 ? " ..." : ""}` : "");

/**
 * 엔진의 막힘 판정이 에디터가 저장한 통행과 같은가. [{ name, ok, detail }]
 *   log: 엔진 출력, width, height: 맵 크기, saved: 저장한 파일의 collision, model: 에디터 모델의 collision,
 *   original: 고치기 전 파일의 collision. 막힘은 0 이 아닌 값이다 (엔진의 Tilemap::IsPassable 과 같다)
 */
export function collisionChecks({ log, width, height, saved, model, original }) {
  const checks = [];
  const probe = parseCollisionProbe(log);
  const engine = probeCells(probe, width, height);
  checks.push({
    name: `엔진이 맵 전체 ${width}x${height} 칸의 통행을 답했다`,
    ok: engine !== null,
    detail: `size ${probe.width}x${probe.height}, 줄 ${probe.rows.size}, done ${probe.done}`,
  });
  const cells = width * height;
  const sizesOk = [saved, model, original].every((a) => Array.isArray(a) && a.length === cells);
  checks.push({ name: "저장한 파일과 모델과 원본에 통행이 있고 칸 수가 맞다", ok: sizesOk, detail: [saved, model, original].map((a) => (Array.isArray(a) ? a.length : String(a))).join(", ") });
  if (!engine || !sizesOk) return checks;

  const vsFile = mismatches(engine, saved, width);
  checks.push({ name: `엔진의 막힘이 저장한 파일의 통행과 칸마다 같다 (${cells} 칸)`, ok: vsFile.length === 0, detail: `${vsFile.length} 칸 다름${listed(vsFile)}` });
  const vsModel = mismatches(engine, model, width);
  checks.push({ name: `엔진의 막힘이 에디터 모델의 통행과 칸마다 같다 (${cells} 칸)`, ok: vsModel.length === 0, detail: `${vsModel.length} 칸 다름${listed(vsModel)}` });

  // 고친 칸: 원본과 저장한 파일이 다른 칸. 막은 칸과 푼 칸이 다 있어야 하고, 엔진이 그 칸들을 원본과 반대로 답해야 한다
  let madeBlocked = 0;
  let cleared = 0;
  const wrong = [];
  for (let i = 0; i < cells; i++) {
    if (blocked(saved[i]) === blocked(original[i])) continue;
    if (blocked(saved[i])) madeBlocked++;
    else cleared++;
    if (engine[i] !== blocked(saved[i])) wrong.push(`${i % width},${Math.floor(i / width)}`);
  }
  checks.push({
    name: "고친 칸(막은 칸과 푼 칸)을 엔진이 원본과 반대로 답한다",
    ok: madeBlocked > 0 && cleared > 0 && wrong.length === 0,
    detail: `막음 ${madeBlocked}, 풂 ${cleared}, 원본대로 답한 칸 ${wrong.length}${listed(wrong)}`,
  });
  return checks;
}

// ---- 항구 마을 ----

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 두 JSON 값이 다른 자리의 경로 ($.layers[0].data[12] 꼴). 객체는 키 순서를 보지 않는다. limit 개까지 */
export function jsonDiff(a, b, limit = 50) {
  const out = [];
  const walk = (x, y, at) => {
    if (out.length >= limit) return;
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length) out.push(`${at}.length`);
      for (let i = 0; i < Math.min(x.length, y.length); i++) walk(x[i], y[i], `${at}[${i}]`);
      return;
    }
    if (isRecord(x) && isRecord(y)) {
      const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
      for (const k of keys) {
        if (!(k in x) || !(k in y)) out.push(`${at}.${k}`);
        else walk(x[k], y[k], `${at}.${k}`);
      }
      return;
    }
    if (!Object.is(x, y)) out.push(at);
  };
  walk(a, b, "$");
  return out;
}

/** 두 글의 다른 줄 번호 (1 부터). 줄 수가 다르면 긴 쪽의 남은 줄도 다르다 */
export function lineDiff(a, b) {
  const x = String(a).split("\n");
  const y = String(b).split("\n");
  const out = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) out.push(i + 1);
  return out;
}

/**
 * 엔진 테스트 러너(tests/run_engine_tests.py)의 출력 요약.
 * 돌려주는 것: { passed(이름 배열), failed, total(결과 줄의 PASS, FAIL 수 또는 null), golden(골든을 새로 쓰거나 갱신한 줄) }
 */
export function runnerSummary(output) {
  const passed = [];
  const failed = [];
  const golden = [];
  let total = null;
  for (const line of String(output).split("\n")) {
    let m = /^ {2}PASS {2}(.+)$/.exec(line);
    if (m) {
      passed.push(m[1].trim());
      continue;
    }
    m = /^ {2}FAIL {2}(.+?)(?: {2}.*)?$/.exec(line);
    if (m) {
      failed.push(m[1].trim());
      continue;
    }
    if (/^\s*GOLDEN /.test(line)) golden.push(line.trim());
    m = /^결과: (\d+) PASS \/ (\d+) FAIL$/.exec(line.trim());
    if (m) total = { pass: Number(m[1]), fail: Number(m[2]) };
  }
  return { passed, failed, total, golden };
}

/** 두 화면(readBmp 꼴)의 RGB 가 다른 픽셀 수와 그 둘레 사각형 (크기가 다르면 sizeMismatch) */
export function frameDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return { sizeMismatch: true, count: null, box: null };
  let count = 0;
  let box = null;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const p = a.pixel(x, y);
      const q = b.pixel(x, y);
      if (p.r === q.r && p.g === q.g && p.b === q.b) continue;
      count++;
      if (!box) box = { x0: x, y0: y, x1: x, y1: y };
      else {
        box.x0 = Math.min(box.x0, x);
        box.y0 = Math.min(box.y0, y);
        box.x1 = Math.max(box.x1, x);
        box.y1 = Math.max(box.y1, y);
      }
    }
  }
  return { sizeMismatch: false, count, box };
}
