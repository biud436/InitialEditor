// 엔진 출력 검사 (docs/plans/e6-packaging.md 5절). scripts/e2e-engine-scene.mjs 와 scripts/selftest-check.mjs 가 같이 쓴다.
// 기준은 엔진 테스트 러너(tests/run_engine_tests.py)와 같다: iCCP 경고를 빼고 error, panic, uncaught exception, "scene: " 이
// 든 줄은 오류다. 플래피의 자동 시연(INITIAL2D_AUTOPLAY=1)은 상태 전이 셋을 찍고 900틱에 요약 한 줄을 찍고 스스로 끝난다.

export const FLAPPY_TICKS = 900;
export const FLAPPY_FINAL = /flappyFinal state=(\w+) score=(\d+) best=(\d+) ticks=(\d+)/;

/** 로그(글 전체)의 오류 줄 */
export function errorLines(log) {
  return String(log)
    .split("\n")
    .filter((l) => !/iccp/i.test(l))
    .filter((l) => /error|panic|uncaught exception|scene: /i.test(l));
}

function tail(log, n = 400) {
  return String(log).slice(-n).replace(/\n/g, " | ");
}

/** 종료 코드와 오류 줄. [{ name, ok, detail }] */
export function exitChecks(log, exitCode) {
  const errors = errorLines(log);
  return [
    { name: "프로세스 정상 종료 (코드 0)", ok: exitCode === 0, detail: `exitCode=${exitCode} | ${tail(log)}` },
    { name: "스크립트 오류 없음", ok: errors.length === 0, detail: errors.slice(0, 5).join(" | ") },
  ];
}

/** 플래피 자동 시연의 로그 전체를 본다 (초반 줄은 마지막 몇 줄에서 이미 빠지므로 꼭 전체로) */
export function flappyChecks(log, exitCode) {
  const text = String(log);
  const checks = [
    ...exitChecks(text, exitCode),
    { name: "대기에서 시작한다 (flappy:state:ready)", ok: text.includes("flappy:state:ready"), detail: tail(text) },
    { name: "자동 시연이 플레이로 들어간다 (flappy:state:play)", ok: text.includes("flappy:state:play"), detail: tail(text) },
    { name: "부딪히면 게임 오버 (flappy:state:dead)", ok: text.includes("flappy:state:dead"), detail: tail(text) },
  ];
  const m = FLAPPY_FINAL.exec(text);
  checks.push({ name: "최종 요약 (씬이 스스로 끝냈다)", ok: m !== null, detail: tail(text) });
  if (m) {
    checks.push({ name: "파이프를 하나 이상 지난다 (best >= 1)", ok: Number(m[3]) >= 1, detail: m[0] });
    checks.push({ name: `${FLAPPY_TICKS}틱에 끝낸다`, ok: Number(m[4]) === FLAPPY_TICKS, detail: m[0] });
  }
  return checks;
}
