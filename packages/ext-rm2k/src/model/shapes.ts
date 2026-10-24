// 오토타일의 모양. 칸 하나는 8x8 조각 넷(왼쪽 위, 오른쪽 위, 왼쪽 아래, 오른쪽 아래)으로 그리고, 조각마다 ChipSet 의 어느
// 조각을 쓸지는 이웃 여덟 칸이 같은 지형인지로 정한다. 땅(D)과 물(A)이 같은 47 모양 번호(variant)를 쓴다.
// 표는 EasyRPG Player 의 BlockD_Subtiles_IDS, BlockA_Subtiles_IDS 와 같다 (docs/plans/rm2k-tilemap.md 3절).

/** 조각 순서: 0 왼쪽 위, 1 오른쪽 위, 2 왼쪽 아래, 3 오른쪽 아래 */
export const QUARTERS = [
  { qx: 0, qy: 0 },
  { qx: 1, qy: 0 },
  { qx: 0, qy: 1 },
  { qx: 1, qy: 1 },
] as const;

export const VARIANTS = 47;

/**
 * 이웃 여덟 칸이 같은 지형인지로 모양 번호(0..46)를 고른다. 가장자리는 같지 않은 동서남북 이웃이고, 모서리는 동서남북 둘이 같은데
 * 그 사이의 대각선만 다른 이웃이다 (가장자리에 붙은 대각선은 모양을 바꾸지 않는다)
 */
export function blobVariant(same: (dx: number, dy: number) => boolean): number {
  const n = same(0, -1);
  const s = same(0, 1);
  const w = same(-1, 0);
  const e = same(1, 0);
  const nw = n && w && !same(-1, -1) ? 1 : 0;
  const ne = n && e && !same(1, -1) ? 1 : 0;
  const se = s && e && !same(1, 1) ? 1 : 0;
  const sw = s && w && !same(-1, 1) ? 1 : 0;
  const N = !n;
  const S = !s;
  const W = !w;
  const E = !e;
  if (!N && !S && !W && !E) return nw + ne * 2 + se * 4 + sw * 8;
  if (W && !N && !E && !S) return 16 + ne + 2 * se;
  if (N && !W && !E && !S) return 20 + se + 2 * sw;
  if (E && !N && !W && !S) return 24 + sw + 2 * nw;
  if (S && !N && !W && !E) return 28 + nw + 2 * ne;
  if (W && E && !N && !S) return 32;
  if (N && S && !W && !E) return 33;
  if (N && W && !E && !S) return 34 + se;
  if (N && E && !W && !S) return 36 + sw;
  if (S && E && !N && !W) return 38 + nw;
  if (S && W && !N && !E) return 40 + ne;
  if (N && W && E && !S) return 42;
  if (N && W && S && !E) return 43;
  if (W && E && S && !N) return 44;
  if (N && E && S && !W) return 45;
  return 46;
}

// ---- 땅 (D) ----

/**
 * D 덩어리(3x4 타일) 안의 원본 타일. 글자 하나가 타일 하나다:
 *   S (0,0) 견본(팔레트 그림)   I (2,0) 안쪽 모서리 넷        (1,0) 은 쓰지 않는다
 *   a (0,1) 왼쪽 위 모서리      T (1,1) 위 가장자리          b (2,1) 오른쪽 위 모서리
 *   L (0,2) 왼쪽 가장자리       C (1,2) 가운데               R (2,2) 오른쪽 가장자리
 *   c (0,3) 왼쪽 아래 모서리    B (1,3) 아래 가장자리        d (2,3) 오른쪽 아래 모서리
 * 조각은 원본 타일의 같은 자리 조각을 쓴다 (왼쪽 위 조각은 원본의 왼쪽 위 조각)
 */
export const D_SOURCE: Readonly<Record<string, { tx: number; ty: number }>> = {
  S: { tx: 0, ty: 0 },
  I: { tx: 2, ty: 0 },
  a: { tx: 0, ty: 1 },
  T: { tx: 1, ty: 1 },
  b: { tx: 2, ty: 1 },
  L: { tx: 0, ty: 2 },
  C: { tx: 1, ty: 2 },
  R: { tx: 2, ty: 2 },
  c: { tx: 0, ty: 3 },
  B: { tx: 1, ty: 3 },
  d: { tx: 2, ty: 3 },
};

/** 모양 번호마다 네 조각의 원본 (왼쪽 위, 오른쪽 위, 왼쪽 아래, 오른쪽 아래). 0..15 는 가운데에 안쪽 모서리를 넣은 것이다 */
export const D_VARIANT_SOURCES: readonly string[] = (() => {
  const out: string[] = [];
  for (let v = 0; v < 16; v++) out.push((v & 1 ? "I" : "C") + (v & 2 ? "I" : "C") + (v & 8 ? "I" : "C") + (v & 4 ? "I" : "C"));
  out.push(
    "LLLL", "LILL", "LLLI", "LILI", // 16..19 서쪽 가장자리
    "TTTT", "TTTI", "TTIT", "TTII", // 20..23 북쪽
    "RRRR", "RRIR", "IRRR", "IRIR", // 24..27 동쪽
    "BBBB", "IBBB", "BIBB", "IIBB", // 28..31 남쪽
    "LRLR", "TTBB", // 32 서와 동, 33 북과 남
    "aaaa", "aaaI", "bbbb", "bbIb", "dddd", "Iddd", "cccc", "cIcc", // 34..41 두 가장자리가 만나는 모서리
    "abab", "aacc", "cdcd", "bbdd", "abcd", // 42..46 셋, 넷
  );
  return out;
})();

/** 팔레트에 보이는 견본 모양 (네 조각 모두 S) */
export const D_SAMPLE_SOURCES = "SSSS";

// ---- 물 (A) ----

/**
 * 모양 번호마다 네 조각의 물가 줄(0..3). -1 은 물가가 아니라 몸통이다.
 * 1..15 는 가운데에 안쪽 모서리(줄 3)를 넣은 것이고, 비트는 땅과 같다 (1 북서, 2 북동, 4 남동, 8 남서)
 */
export const WATER_SHORE: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  for (let v = 0; v < 16; v++) out.push([v & 1 ? 3 : -1, v & 2 ? 3 : -1, v & 8 ? 3 : -1, v & 4 ? 3 : -1]);
  const rows = [
    "1-1-", "131-", "1-13", "1313", // 16..19
    "22--", "22-3", "223-", "2233", // 20..23
    "-1-1", "-131", "31-1", "3131", // 24..27
    "--22", "3-22", "-322", "3322", // 28..31
    "1111", "2222", // 32, 33
    "021-", "0213", "20-1", "2031", "-120", "3120", "1-02", "1302", // 34..41
    "0011", "0202", "1100", "2020", "0000", // 42..46
  ];
  for (const r of rows) out.push([...r].map((ch) => (ch === "-" ? -1 : Number(ch))));
  return out;
})();

/** 물 칸 조각 하나: 물가 줄이거나 몸통. body 가 참이면 깊은 물과 얕은 물이 만나는 모서리 조각이다 */
export type WaterQuarter = { shore: number } | { body: boolean };

/** 모서리 비트 b 의 조각 순서: 1 왼쪽 위, 2 오른쪽 위, 4 왼쪽 아래, 8 오른쪽 아래 */
export const CORNER_BITS = [1, 2, 4, 8] as const;

/**
 * 물 칸의 네 조각. a 는 물가 모양(0..46), b 는 깊은 물과 얕은 물이 만나는 모서리 비트(0..15).
 * 모서리 비트가 선 조각은 물가보다 앞선다 (EasyRPG Player 의 GenerateAutotileAB)
 */
export function waterQuarters(a: number, b: number): WaterQuarter[] {
  const shore = WATER_SHORE[a];
  return CORNER_BITS.map((bit, q) => {
    if (b & bit) return { body: true };
    return shore[q] >= 0 ? { shore: shore[q] } : { body: false };
  });
}

/** 물 칸 조각 넷의 열쇠 글 (같은 그림의 (a, b) 를 하나로 묶는다). 물가는 0..3, 몸통은 b 와 B */
export function waterKey(a: number, b: number): string {
  return waterQuarters(a, b)
    .map((q) => ("shore" in q ? String(q.shore) : q.body ? "B" : "b"))
    .join("");
}

/**
 * 그림이 다른 (a, b) 묶음. b 가 0 인 47개가 먼저(번호 = a)이고, 나머지는 b 를 바깥으로 a 를 안으로 돌며 처음 나온 순서다.
 * 아틀라스의 물 칸 배치가 이 순서다 (atlas.ts)
 */
export const WATER_TUPLES: { readonly keys: readonly string[]; readonly index: ReadonlyMap<string, number> } = (() => {
  const keys: string[] = [];
  const index = new Map<string, number>();
  for (let b = 0; b < 16; b++) {
    for (let a = 0; a < VARIANTS; a++) {
      const k = waterKey(a, b);
      if (!index.has(k)) {
        index.set(k, keys.length);
        keys.push(k);
      }
    }
  }
  return { keys, index };
})();

/** (a, b) 의 물 칸 번호 (0..WATER_TUPLES.keys.length-1) */
export function waterTuple(a: number, b: number): number {
  return WATER_TUPLES.index.get(waterKey(a, b))!;
}
