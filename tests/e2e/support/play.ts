// 여기서 실행의 기대 위치. 순찰 범위가 있는 오브젝트 하나를 고르면 범위 왼끝에서 PLAY_RANGE_GAP 왼쪽(PLAY_MIN_X 이상)에서
// 시작한다 (packages/app/src/editor/maps/objectTools/rules.ts의 PLAY_POSITION_RULE). 환경 변수는 스펙이 에디터의
// 여기서 실행 커맨드에서 받고, 이 값은 그 결과를 맞춰 보는 기대값이다. play.unit.ts가 rules.ts와 같은지 본다.

export const PLAY_RANGE_GAP = 48;
export const PLAY_MIN_X = 16;

/** 순찰 왼끝이 minX인 오브젝트를 골랐을 때의 시작 x (맵 폭 안쪽일 때) */
export function expectedRangePlayX(minX: number): number {
  return Math.round(Math.max(PLAY_MIN_X, minX - PLAY_RANGE_GAP));
}
