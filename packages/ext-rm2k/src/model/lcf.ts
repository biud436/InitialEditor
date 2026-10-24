// RPG Maker 2000 의 데이터 파일(LCF) 읽기: 데이터베이스 RPG_RT.ldb, 맵 트리 RPG_RT.lmt, 맵 MapXXXX.lmu.
// 근거는 EasyRPG liblcf 의 generator/csv/fields.csv (구조체마다 덩어리 번호와 기본값) 와 reader_struct.
//
//   파일 = 머리 글(BER 길이 + "LcfMapUnit" 따위) + 본문
//   BER 수 = 7비트씩 큰 쪽부터, 마지막 바이트 말고는 0x80 이 선다
//   구조체 = (덩어리 번호 BER, 크기 BER, 크기만큼의 바이트) 의 되풀이, 번호 0 이나 파일 끝에서 끝난다
//   구조체 배열 = 개수 BER, 원소마다 (id BER, 구조체)
// 기본값과 같은 덩어리는 파일에 없을 수 있다 (맵의 크기 20x15, ChipSet 1 번 따위). 글은 게임의 코드 페이지 그대로의 바이트다
// (lcfText.ts 가 푼다).

export class LcfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LcfError";
  }
}

export class LcfReader {
  pos = 0;
  constructor(
    readonly bytes: Uint8Array,
    readonly end = bytes.length,
  ) {}

  get done(): boolean {
    return this.pos >= this.end;
  }

  /** BER 로 적힌 수 (32비트를 넘으면 오류) */
  ber(): number {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      if (this.pos >= this.end) throw new LcfError("파일이 수 중간에서 끝납니다");
      const b = this.bytes[this.pos++];
      value = value * 128 + (b & 0x7f);
      if ((b & 0x80) === 0) return value > 0x7fffffff ? value - 0x100000000 : value;
    }
    throw new LcfError("수가 너무 깁니다");
  }

  take(n: number): Uint8Array {
    if (n < 0 || this.pos + n > this.end) throw new LcfError("파일이 덩어리 중간에서 끝납니다");
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
}

/** 덩어리 하나에 든 BER 수 하나 (Int32, Boolean, Enum 덩어리) */
export function berValue(chunk: Uint8Array): number {
  return new LcfReader(chunk).ber();
}

/** 머리 글을 읽고 맞는지 본다 */
export function readHeader(r: LcfReader, expected: string): void {
  const len = r.ber();
  const text = String.fromCharCode(...r.take(Math.min(len, 64)));
  if (len > 64 || text !== expected) throw new LcfError(`${expected} 파일이 아닙니다`);
}

/** 구조체 하나: 덩어리 번호마다 바이트 (번호 0 이나 끝에서 멈춘다) */
export function readStruct(r: LcfReader): Map<number, Uint8Array> {
  const chunks = new Map<number, Uint8Array>();
  while (!r.done) {
    const id = r.ber();
    if (id === 0) break;
    const size = r.ber();
    chunks.set(id, r.take(size));
  }
  return chunks;
}

/** 구조체 배열: id 와 구조체 */
export function readStructArray(r: LcfReader): Array<{ id: number; chunks: Map<number, Uint8Array> }> {
  const count = r.ber();
  if (count < 0) throw new LcfError("배열 크기가 음수입니다");
  const out: Array<{ id: number; chunks: Map<number, Uint8Array> }> = [];
  for (let i = 0; i < count; i++) {
    const id = r.ber();
    out.push({ id, chunks: readStruct(r) });
  }
  return out;
}

const int = (chunks: Map<number, Uint8Array>, id: number, fallback: number): number => {
  const c = chunks.get(id);
  return c && c.length > 0 ? berValue(c) : fallback;
};

const bytesOf = (chunks: Map<number, Uint8Array>, id: number): Uint8Array => chunks.get(id) ?? new Uint8Array(0);

/** 부호 있는 16비트 배열 (작은 쪽 먼저) */
function int16Array(bytes: Uint8Array): Int16Array {
  const out = new Int16Array(bytes.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = (bytes[2 * i] | (bytes[2 * i + 1] << 8)) << 16 >> 16;
  return out;
}

// ---- 맵 (LcfMapUnit) ----

export interface LcfMap {
  chipsetId: number;
  width: number;
  height: number;
  /** 행 우선 타일 번호 (width * height) */
  lower: Int16Array;
  upper: Int16Array;
  /** 0 이 아니면 원경(파노라마)을 쓴다 */
  parallax: boolean;
  /** 이벤트 수 (가져오지 않는다) */
  events: number;
}

const MAP = { chipsetId: 0x01, width: 0x02, height: 0x03, parallaxFlag: 0x1f, lower: 0x47, upper: 0x48, events: 0x51 } as const;
/** RPG Maker 2000 에디터의 맵 크기 한도 */
export const LCF_MAP_MAX = 500;

export function parseMapUnit(bytes: Uint8Array): LcfMap {
  const r = new LcfReader(bytes);
  readHeader(r, "LcfMapUnit");
  const chunks = readStruct(r);
  const width = int(chunks, MAP.width, 20);
  const height = int(chunks, MAP.height, 15);
  if (width < 1 || height < 1 || width > LCF_MAP_MAX || height > LCF_MAP_MAX) throw new LcfError(`맵 크기가 맞지 않습니다: ${width}x${height}`);
  const cells = width * height;
  const layer = (id: number, empty: number): Int16Array => {
    const raw = chunks.get(id);
    const data = raw ? int16Array(raw) : new Int16Array(0);
    if (data.length === cells) return data;
    if (data.length !== 0) throw new LcfError(`레이어의 타일 수가 맵 크기와 다릅니다 (${data.length}, ${width}x${height})`);
    return new Int16Array(cells).fill(empty);
  };
  const ev = chunks.get(MAP.events);
  return {
    chipsetId: int(chunks, MAP.chipsetId, 1),
    width,
    height,
    lower: layer(MAP.lower, 0),
    upper: layer(MAP.upper, 10000),
    parallax: int(chunks, MAP.parallaxFlag, 0) !== 0,
    events: ev && ev.length > 0 ? new LcfReader(ev).ber() : 0,
  };
}

// ---- 맵 트리 (LcfMapTree) ----

export interface LcfMapInfo {
  id: number;
  /** 게임의 코드 페이지 바이트 */
  name: Uint8Array;
  parent: number;
  /** 0 게임 이름(뿌리), 1 맵, 2 영역 */
  type: number;
}

export const MAP_INFO_MAP = 1;

/** 맵 트리의 맵 목록 (트리 순서와 시작 위치는 읽지 않는다) */
export function parseMapTree(bytes: Uint8Array): LcfMapInfo[] {
  const r = new LcfReader(bytes);
  readHeader(r, "LcfMapTree");
  return readStructArray(r).map(({ id, chunks }) => ({
    id,
    name: bytesOf(chunks, 0x01),
    parent: int(chunks, 0x02, 0),
    type: int(chunks, 0x04, -1),
  }));
}

// ---- 데이터베이스 (LcfDataBase) 의 ChipSet ----

/** 통행 비트 (EasyRPG Player 의 Passable) */
export const PASS = { down: 1, left: 2, right: 4, up: 8, above: 16, wall: 32, counter: 64 } as const;
export const PASS_DIRECTIONS = PASS.down | PASS.left | PASS.right | PASS.up;
export const LOWER_PASSAGES = 162;
export const UPPER_PASSAGES = 144;

export interface LcfChipset {
  id: number;
  name: Uint8Array;
  /** ChipSet 폴더의 그림 이름 (확장자 없이) */
  file: Uint8Array;
  /** 하층 162칸의 통행 (물 A1, A2, 깊은 물, C1..C3, D1..D12, E0..E143 순서) */
  lower: Uint8Array;
  /** 상층 144칸의 통행 (F0..F143) */
  upper: Uint8Array;
  /** 0 왕복(1-2-3-2), 1 한 방향(1-2-3) */
  animationType: number;
  /** 0 보통, 그 밖은 빠르게 */
  animationSpeed: number;
}

const DB_CHIPSETS = 0x14;

function passages(raw: Uint8Array | undefined, count: number, defaults: (i: number) => number): Uint8Array {
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) out[i] = raw && i < raw.length ? raw[i] : defaults(i);
  return out;
}

/** 데이터베이스의 ChipSet 목록 (그 밖의 덩어리는 건너뛴다) */
export function parseDatabaseChipsets(bytes: Uint8Array): LcfChipset[] {
  const r = new LcfReader(bytes);
  readHeader(r, "LcfDataBase");
  const top = readStruct(r);
  const raw = top.get(DB_CHIPSETS);
  if (!raw) return [];
  return readStructArray(new LcfReader(raw)).map(({ id, chunks }) => ({
    id,
    name: bytesOf(chunks, 0x01),
    file: bytesOf(chunks, 0x02),
    lower: passages(chunks.get(0x04), LOWER_PASSAGES, () => 15),
    upper: passages(chunks.get(0x05), UPPER_PASSAGES, (i) => (i === 0 ? 31 : 15)),
    animationType: int(chunks, 0x0b, 0),
    animationSpeed: int(chunks, 0x0c, 0),
  }));
}
