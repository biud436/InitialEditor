// 엔진의 검수 줄 (INITIAL2D_ALDEBARAN_TRACE=1). 알데바란 씬은 스테이지를 열 때 읽은 맵 파일과 그 타일 검사합을,
// 몬스터를 세울 때마다 종류와 x와 순찰 범위를 찍는다 (엔진 README의 "맵 오브젝트", stages/placement의 tileChecksum).
//   "알데바란: 맵 ./resources/maps/aldebaran_forest.json 타일 221069392"
//   "알데바란: 몬스터 wolf x 1990 범위 1950..2030"
// 인수 테스트는 저장한 맵 파일에서 같은 검사합과 몬스터 목록을 만들어, 엔진이 그 파일을 읽었는지 맞춰 본다.

export const TRACE_VAR = "INITIAL2D_ALDEBARAN_TRACE";
export const CHECKSUM_MOD = 1_000_000_007;

const NUM = "(-?\\d+(?:\\.\\d+)?)";
export const MAP_TRACE_LINE = /^알데바란: 맵 (.+) 타일 (\d+)$/;
export const MONSTER_TRACE_LINE = new RegExp(`^알데바란: 몬스터 (\\S+) x ${NUM} 범위 ${NUM}\\.\\.${NUM}$`);

export interface MapTrace {
  line: string;
  /** 엔진이 연 경로 (스테이지 모듈의 값 그대로, 보통 ./resources/maps/...) */
  path: string;
  checksum: number;
}

export interface MonsterTrace {
  species: string;
  x: number;
  minX: number;
  maxX: number;
}

function lines(log: string): string[] {
  return log.split("\n").map((l) => l.trim());
}

/** 검수 줄이면 true (스테이지 문제 줄이 아니다) */
export function isTraceLine(line: string): boolean {
  return MAP_TRACE_LINE.test(line) || MONSTER_TRACE_LINE.test(line);
}

/**
 * 맵 파일 텍스트의 타일 검사합: layers의 순서와 data의 칸 순서대로 (합 * 31 + gid) mod 1000000007.
 * 엔진처럼 해석한 JSON을 그대로 본다 (collision과 objects는 넣지 않는다). gid가 정수가 아니면 던진다
 */
export function tileChecksum(mapText: string): number {
  const data = JSON.parse(mapText) as { layers?: Array<{ data?: unknown[] }> };
  let sum = 0;
  for (const layer of data.layers ?? []) {
    for (const gid of layer.data ?? []) {
      if (typeof gid !== "number" || !Number.isInteger(gid)) throw new Error(`타일 gid가 정수가 아니다: ${JSON.stringify(gid)}`);
      // sum * 31 + gid는 2^53 아래라 정확하다
      sum = (sum * 31 + gid) % CHECKSUM_MOD;
    }
  }
  return sum;
}

/** 로그의 첫 맵 줄. 없으면 null */
export function parseMapTrace(log: string): MapTrace | null {
  for (const line of lines(log)) {
    const m = MAP_TRACE_LINE.exec(line);
    if (m) return { line, path: m[1], checksum: Number(m[2]) };
  }
  return null;
}

/** 로그의 몬스터 줄 전부 (찍힌 순서) */
export function parseMonsterTraces(log: string): MonsterTrace[] {
  const out: MonsterTrace[] = [];
  for (const line of lines(log)) {
    const m = MONSTER_TRACE_LINE.exec(line);
    if (m) out.push({ species: m[1], x: Number(m[2]), minX: Number(m[3]), maxX: Number(m[4]) });
  }
  return out;
}

/** 맵 파일의 spawn 오브젝트에서 엔진이 찍을 몬스터 줄 (파일 순서. 순찰 범위가 없으면 x) */
export function expectedMonsters(mapText: string): MonsterTrace[] {
  const data = JSON.parse(mapText) as { objects?: Array<{ type?: unknown; x?: unknown; props?: Record<string, unknown> }> };
  return (data.objects ?? [])
    .filter((o) => o.type === "spawn")
    .map((o) => {
      const x = Number(o.x);
      const p = o.props ?? {};
      return { species: String(p.species), x, minX: typeof p.minX === "number" ? p.minX : x, maxX: typeof p.maxX === "number" ? p.maxX : x };
    });
}
