// 메모리 모드 샘플 프로젝트의 초원 맵(resources/maps/meadow.json)과 그 타일셋(resources/tiles/meadow16.png).
// 타일셋은 코드로 그린 16x16 타일 8열 4행이고, 압축하지 않은 deflate 블록으로 PNG를 만든다.

type Rgb = readonly [number, number, number];

const TILE = 16;
const COLUMNS = 8;
const ROWS = 4;

// ---- PNG ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const v of bytes) {
    a = (a + v) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** RGBA 픽셀을 PNG 파일 바이트로 (필터 없음, 저장 블록 deflate) */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const blocks: number[] = [0x78, 0x01];
  for (let pos = 0; pos < raw.length || pos === 0; pos += 65535) {
    const len = Math.min(65535, raw.length - pos);
    const final = pos + len >= raw.length ? 1 : 0;
    blocks.push(final, len & 0xff, len >> 8, ~len & 0xff, (~len >> 8) & 0xff);
    for (let i = 0; i < len; i++) blocks.push(raw[pos + i]);
    if (final) break;
  }
  const adler = adler32(raw);
  blocks.push(adler >>> 24, (adler >>> 16) & 0xff, (adler >>> 8) & 0xff, adler & 0xff);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const chunks = [chunk("IHDR", ihdr), chunk("IDAT", Uint8Array.from(blocks)), chunk("IEND", new Uint8Array(0))];
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const out = new Uint8Array(signature.length + chunks.reduce((n, c) => n + c.length, 0));
  out.set(signature, 0);
  let offset = signature.length;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

// ---- 타일 그리기 ----

class Canvas {
  readonly data: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  set(x: number, y: number, c: Rgb, a = 255): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }
}

/** 칸 안에서 되풀이되는 의사 난수 (같은 입력이면 같은 값) */
function noise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function shade(c: Rgb, f: number): Rgb {
  return [Math.min(255, Math.round(c[0] * f)), Math.min(255, Math.round(c[1] * f)), Math.min(255, Math.round(c[2] * f))];
}

const GRASS: Rgb = [86, 158, 72];
const GRASS_DARK: Rgb = [60, 122, 58];
const DIRT: Rgb = [150, 112, 70];
const STONE: Rgb = [132, 136, 142];
const SAND: Rgb = [214, 196, 136];
const WATER: Rgb = [58, 118, 196];
const DEEP: Rgb = [36, 78, 150];
const WOOD: Rgb = [166, 118, 72];
const LEAF: Rgb = [46, 110, 52];
const BARK: Rgb = [104, 70, 44];
const PETAL: Rgb = [232, 92, 110];
const YELLOW: Rgb = [240, 206, 80];
const ROCK: Rgb = [120, 120, 126];
const BRICK: Rgb = [168, 84, 64];
const ROOF: Rgb = [70, 90, 150];
const DARK: Rgb = [40, 36, 40];
const LIGHT: Rgb = [236, 236, 228];
const LAVA: Rgb = [226, 96, 40];
const ICE: Rgb = [176, 222, 236];

type Painter = (c: Canvas, ox: number, oy: number, seed: number) => void;

function fillNoise(base: Rgb, spread: number): Painter {
  return (c, ox, oy, seed) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) c.set(ox + x, oy + y, shade(base, 1 - spread / 2 + noise(x, y, seed) * spread));
  };
}

function layered(...painters: Painter[]): Painter {
  return (c, ox, oy, seed) => painters.forEach((p, i) => p(c, ox, oy, seed + i * 17));
}

function blob(color: Rgb, cx: number, cy: number, r: number): Painter {
  return (c, ox, oy, seed) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r) c.set(ox + x, oy + y, shade(color, d > r - 1.5 ? 0.75 : 0.9 + noise(x, y, seed) * 0.2));
      }
    }
  };
}

function rect(color: Rgb, x0: number, y0: number, w: number, h: number, edge = 0.7): Painter {
  return (c, ox, oy) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) c.set(ox + x, oy + y, x === x0 || y === y0 + h - 1 || x === x0 + w - 1 ? shade(color, edge) : color);
  };
}

function waves(color: Rgb): Painter {
  return (c, ox, oy) => {
    for (const row of [4, 11]) for (let x = 0; x < TILE; x++) if ((x + row) % 6 < 3) c.set(ox + x, oy + row + ((x >> 1) % 2), color);
  };
}

function bricks(color: Rgb): Painter {
  return (c, ox, oy) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const mortar = y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 7;
        c.set(ox + x, oy + y, mortar ? shade(color, 0.55) : color);
      }
    }
  };
}

function dots(color: Rgb, count: number): Painter {
  return (c, ox, oy, seed) => {
    for (let i = 0; i < count; i++) {
      const x = 2 + Math.floor(noise(i, 1, seed) * 12);
      const y = 2 + Math.floor(noise(i, 2, seed) * 12);
      c.set(ox + x, oy + y, color);
      c.set(ox + x + 1, oy + y, color);
      c.set(ox + x, oy + y + 1, color);
    }
  };
}

/** 번호 표식: n 개의 점 (4 행의 디버그 타일) */
function pips(n: number): Painter {
  return (c, ox, oy) => {
    for (let i = 0; i < n; i++) rect(DARK, 2 + (i % 4) * 3, 3 + Math.floor(i / 4) * 6, 2, 3, 1)(c, ox, oy, 0);
  };
}

const grass = fillNoise(GRASS, 0.25);

/** gid 1..32의 그림. 1 행은 바닥, 2 행은 장식, 3 행은 건물, 4 행은 번호가 찍힌 색 칸 */
const PAINTERS: Painter[] = [
  grass,
  fillNoise(GRASS_DARK, 0.3),
  layered(fillNoise(DIRT, 0.3), dots(shade(DIRT, 0.7), 5)),
  layered(fillNoise(STONE, 0.2), rect(STONE, 0, 0, 8, 8, 0.8), rect(STONE, 8, 8, 8, 8, 0.8)),
  fillNoise(SAND, 0.15),
  layered(fillNoise(WATER, 0.1), waves(shade(WATER, 1.3))),
  layered(fillNoise(DEEP, 0.1), waves(shade(DEEP, 1.3))),
  layered(fillNoise(WOOD, 0.15), rect(WOOD, 0, 0, 16, 4), rect(WOOD, 0, 4, 16, 4), rect(WOOD, 0, 8, 16, 4), rect(WOOD, 0, 12, 16, 4)),

  layered(grass, dots(PETAL, 4), dots(YELLOW, 2)),
  layered(grass, blob(LEAF, 8, 9, 6.5)),
  layered(grass, blob(ROCK, 8, 9, 5.5)),
  layered(grass, blob(LEAF, 8, 8, 8)),
  layered(grass, rect(BARK, 5, 0, 6, 14), blob(shade(GRASS, 0.8), 8, 15, 3)),
  layered(grass, rect(WOOD, 0, 5, 16, 2, 0.8), rect(WOOD, 0, 10, 16, 2, 0.8), rect(WOOD, 2, 3, 2, 11, 0.8), rect(WOOD, 12, 3, 2, 11, 0.8)),
  layered(grass, rect(WOOD, 7, 8, 2, 7, 0.8), rect(WOOD, 2, 2, 12, 7, 0.75)),
  layered(grass, rect(BARK, 2, 5, 12, 9, 0.7), rect(YELLOW, 7, 8, 2, 2, 1)),

  bricks(BRICK),
  layered(bricks(shade(BRICK, 0.8)), rect(DARK, 0, 14, 16, 2, 1)),
  layered(fillNoise(ROOF, 0.15), bricks(ROOF)),
  layered(bricks(BRICK), rect(BARK, 4, 3, 8, 13, 0.7), rect(YELLOW, 9, 9, 1, 2, 1)),
  layered(bricks(BRICK), rect(ICE, 4, 4, 8, 8, 0.6)),
  layered(fillNoise(WATER, 0.1), rect(WOOD, 0, 2, 16, 12, 0.75)),
  layered(fillNoise(LAVA, 0.35), dots(YELLOW, 4)),
  layered(fillNoise(ICE, 0.12), dots(LIGHT, 3)),
];
const DEBUG_COLORS: Rgb[] = [PETAL, YELLOW, GRASS, WATER, ROOF, SAND, STONE, LIGHT];
for (let i = 0; i < 8; i++) PAINTERS.push(layered(fillNoise(DEBUG_COLORS[i], 0.05), pips(i + 1)));

let cachedPng: Uint8Array | null = null;

/** 초원 타일셋 PNG (128x64, 16x16 타일 8열 4행) */
export function meadowTilesetPng(): Uint8Array {
  if (cachedPng) return cachedPng.slice();
  const canvas = new Canvas(COLUMNS * TILE, ROWS * TILE);
  PAINTERS.forEach((paint, i) => paint(canvas, (i % COLUMNS) * TILE, Math.floor(i / COLUMNS) * TILE, i + 1));
  cachedPng = encodePng(canvas.width, canvas.height, canvas.data);
  return cachedPng.slice();
}

// ---- 맵 ----

export const MEADOW_WIDTH = 20;
export const MEADOW_HEIGHT = 12;

/** 초원 맵의 레이어와 통행 (행 우선 gid 배열) */
export function meadowLayers(): { ground: number[]; deco: number[]; collision: number[] } {
  const W = MEADOW_WIDTH;
  const H = MEADOW_HEIGHT;
  const ground = new Array<number>(W * H).fill(1);
  const deco = new Array<number>(W * H).fill(0);
  const collision = new Array<number>(W * H).fill(0);
  const at = (x: number, y: number) => y * W + x;
  // 어두운 풀 얼룩, 흙길, 돌바닥, 연못(깊은 물 한 칸)
  for (const [x, y] of [[7, 1], [8, 1], [7, 2], [16, 6], [17, 6], [3, 10], [4, 10]]) ground[at(x, y)] = 2;
  for (let x = 0; x < W; x++) ground[at(x, 8)] = 3;
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) ground[at(x, y)] = 4;
  for (let y = 2; y <= 3; y++) for (let x = 13; x <= 15; x++) {
    ground[at(x, y)] = 6;
    collision[at(x, y)] = 1;
  }
  ground[at(14, 3)] = 7;
  // 나무, 바위, 덤불, 꽃, 울타리, 표지판, 상자
  const put = (x: number, y: number, gid: number, blocked = false) => {
    deco[at(x, y)] = gid;
    if (blocked) collision[at(x, y)] = 1;
  };
  put(1, 0, 12);
  put(1, 1, 13, true);
  put(18, 0, 12);
  put(18, 1, 13, true);
  put(9, 4, 11, true);
  put(17, 10, 11, true);
  put(11, 10, 10);
  for (const [x, y] of [[6, 3], [10, 2], [12, 6], [5, 10], [15, 10]]) put(x, y, 9);
  for (let x = 6; x <= 9; x++) put(x, 6, 14, true);
  put(5, 7, 15);
  put(3, 3, 16, true);
  return { ground, deco, collision };
}

function rows(data: number[], indent: string): string {
  const lines: string[] = [];
  for (let y = 0; y < MEADOW_HEIGHT; y++) lines.push(indent + data.slice(y * MEADOW_WIDTH, (y + 1) * MEADOW_WIDTH).join(","));
  return lines.join(",\n");
}

/** 초원 맵 파일 (맵 포맷 v2, 고정 형식). 오브젝트 타입은 샘플 스키마의 것 (시작 지점, 몬스터, 흔적) */
export function meadowMapJson(): string {
  const { ground, deco, collision } = meadowLayers();
  return `{
  "version": 2,
  "name": "meadow",
  "id": 2,
  "width": ${MEADOW_WIDTH},
  "height": ${MEADOW_HEIGHT},
  "tileWidth": 16,
  "tileHeight": 16,
  "layers": [
    {
      "name": "ground",
      "data": [
${rows(ground, "        ")}
      ]
    },
    {
      "name": "deco",
      "data": [
${rows(deco, "        ")}
      ]
    }
  ],
  "collision": [
${rows(collision, "    ")}
  ],
  "tilesets": [
    {
      "image": "resources/tiles/meadow16.png",
      "firstGid": 1,
      "columns": 8
    }
  ],
  "objects": [
    {
      "id": "start",
      "type": "start",
      "x": 24,
      "y": 136
    },
    {
      "id": "slime_1",
      "type": "spawn",
      "x": 200,
      "y": 136,
      "props": {
        "species": "slime",
        "minX": 176,
        "maxX": 248
      }
    },
    {
      "id": "bat_1",
      "type": "spawn",
      "x": 280,
      "y": 56,
      "props": {
        "species": "bat",
        "minX": 240,
        "maxX": 304
      }
    },
    {
      "id": "sign_1",
      "type": "landmark",
      "x": 96,
      "y": 0,
      "width": 32,
      "props": {
        "title": "표지판",
        "text": "초원 입구"
      }
    }
  ]
}
`;
}
