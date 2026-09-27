// 화면 검사 (docs/plans/e6-packaging.md 5절). BMP 는 tests/e2e/support/bmp.ts 의 readBmp 로 읽은 것을 받는다
// ({ width, height, pixel(x, y) → { r, g, b, a } }). scripts/e2e-engine-scene.mjs 와 scripts/selftest-check.mjs 가 같이 쓴다.
//
// 타일맵 템플릿의 표식 (엔진 docs/plans/r4-dist-build.md 6절): 타일 44(gid 45)는 256 픽셀 가운데 251 개가 #d8c880 이고
// 템플릿 맵에는 없다. 칠해 보는 칸은 (24, 28), 이웃 (25, 28) 은 잔디 #40b080 이다.
// 맵 뷰와 게임 프레임 견주기: 맵 뷰에서 뽑은 타일(알파가 있는 32비트)의 불투명한 픽셀만 게임 화면의 같은 자리와 견준다.
// 타일이 없거나 비치는 곳(배경), 그 위의 스프라이트와 HUD 는 비율의 여유로 넘긴다.

export const TILE = 16;
export const SCREEN_WIDTH = 768;
export const SCREEN_HEIGHT = 896;
export const MARKER = { gid: 45, x: 24, y: 28, rgb: [0xd8, 0xc8, 0x80] };
export const NEIGHBOR = { x: 25, y: 28 };
export const GRASS_RGB = [0x40, 0xb0, 0x80];
/** 칠한 칸의 256 픽셀 가운데 표식 색이어야 하는 수 */
export const MARKER_MIN = 240;
export const CHANNEL_TOLERANCE = 8;
/** 맵 뷰의 불투명한 타일 픽셀 가운데 게임 화면과 같아야 하는 비율 (2026-09-27 이 맥: 숲 x 1200 에서 0.9985, 나머지는 주인공과 거미) */
export const MAP_FRAME_MIN_RATIO = 0.97;
/** 뽑은 사각형 가운데 불투명한 타일이 이만큼은 있어야 한다 (빈 뽑기를 통과로 치지 않게) */
export const MAP_FRAME_MIN_OPAQUE = 0.2;

function near(p, rgb, tol) {
  return Math.abs(p.r - rgb[0]) <= tol && Math.abs(p.g - rgb[1]) <= tol && Math.abs(p.b - rgb[2]) <= tol;
}

/** 칸 하나에서 rgb 와 채널마다 tol 안인 픽셀 수를 256 칸 기준으로 (엔진 templates_test.py 의 cell_count 와 같은 셈) */
export function cellCount(img, cell, rgb, tol = CHANNEL_TOLERANCE) {
  const scale = img.width / SCREEN_WIDTH;
  const size = Math.round(TILE * scale);
  const x0 = Math.round(cell.x * TILE * scale);
  const y0 = Math.round(cell.y * TILE * scale);
  let n = 0;
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) {
      if (near(img.pixel(x, y), rgb, tol)) n++;
    }
  }
  return Math.floor((n * 256) / (size * size));
}

/** 칠한 칸이 표식 색이고 이웃은 표식 색이 아니고 잔디다. [{ name, ok, detail }] */
export function tilemapPixelChecks(img, cell = MARKER) {
  const checks = [];
  const ratioOk = img.width * SCREEN_HEIGHT === img.height * SCREEN_WIDTH;
  checks.push({ name: "화면이 맵 크기(768x896)의 배율이다", ok: ratioOk, detail: `${img.width}x${img.height}` });
  if (!ratioOk) return checks;
  const neighbor = { x: cell.x + 1, y: cell.y };
  const marker = cellCount(img, cell, MARKER.rgb);
  checks.push({ name: `칠한 칸 (${cell.x}, ${cell.y}) 이 표식 색 #d8c880 이다`, ok: marker >= MARKER_MIN, detail: `${marker}/256` });
  const nMarker = cellCount(img, neighbor, MARKER.rgb);
  const nGrass = cellCount(img, neighbor, GRASS_RGB);
  checks.push({ name: `옆 칸 (${neighbor.x}, ${neighbor.y}) 은 표식 색이 아니고 잔디다`, ok: nMarker < 16 && nGrass >= 200, detail: `표식 ${nMarker}/256, 잔디 ${nGrass}/256` });
  return checks;
}

/** 로그에서 placement 정규식이 잡은 마지막 숫자 무리 (옮긴 자리가 있으면 그것). 앱의 selftest/runSelftest.ts 와 같은 셈 */
export function placementX(log, pattern) {
  const re = new RegExp(pattern);
  let found = null;
  for (const line of String(log).split("\n")) {
    const m = re.exec(line);
    if (!m) continue;
    for (let i = m.length - 1; i >= 1; i--) {
      if (m[i] !== undefined && m[i] !== "" && Number.isFinite(Number(m[i]))) {
        found = Number(m[i]);
        break;
      }
    }
  }
  return found;
}

/** 게임과 같은 카메라: x 를 가운데에 두고 맵 안으로 자른 뒤 내림, y 는 0 (알데바란의 camX) */
export function followCamera(x, width, height, mapPixelWidth) {
  return { x: Math.floor(Math.max(0, Math.min(x - width / 2, mapPixelWidth - width))), y: 0, width, height };
}

/**
 * 맵 뷰에서 뽑은 타일(map, 논리 화면 크기)과 게임 화면(frame, 배율 scale)을 불투명한 타일 픽셀에서 견준다.
 * 돌려주는 것: { opaque, match, ratio, opaqueShare, scale }
 */
export function compareMapFrame(map, frame, tol = CHANNEL_TOLERANCE) {
  const scale = frame.width / map.width;
  if (!Number.isInteger(scale) || scale < 1 || frame.height !== map.height * scale) {
    throw new Error(`게임 화면 ${frame.width}x${frame.height} 이 맵 뽑기 ${map.width}x${map.height} 의 정수배가 아니다`);
  }
  let opaque = 0;
  let match = 0;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const p = map.pixel(x, y);
      if (p.a < 255) continue;
      opaque++;
      const q = frame.pixel(x * scale, y * scale);
      if (Math.abs(p.r - q.r) <= tol && Math.abs(p.g - q.g) <= tol && Math.abs(p.b - q.b) <= tol) match++;
    }
  }
  return { opaque, match, ratio: opaque ? match / opaque : 0, opaqueShare: opaque / (map.width * map.height), scale };
}
