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

// ---- 저장한 맵으로 그린 기준 (숲, E3 완료 기준 1) ----
// 맵 뷰 뽑기와 게임 화면을 서로만 견주면, 게임이 레이어 하나를 통째로 빼고 그려도(숲의 deco) 그 레이어가 사각형에서 차지하는
// 몫이 작아 비율 문턱을 넘는다. 그래서 판정이 저장한 맵 파일과 타일셋 그림으로 기준을 직접 그리고, 레이어마다 "그 레이어를
// 빼면 달라지는 픽셀" 과 칠한 칸마다 "칠하기 전 gid 로 그리면 달라지는 픽셀" 이 게임 화면에 있는지 따로 본다.

/** 레이어마다, 칠한 칸마다 게임 화면과 같아야 하는 비율 (그 위의 스프라이트 몫을 넘긴다) */
export const LAYER_MIN_RATIO = 0.9;
/** 레이어와 칠한 칸이 사각형 안에서 이만큼은 보여야 증명이 된다 */
export const LAYER_MIN_PIXELS = 64;
/** 칸 하나가 게임 화면과 같아야 하는 비율. 이보다 낮은 칸은 빠지거나 다르게 그려진 칸이다 */
export const CELL_MIN_RATIO = 0.75;
/** 그런 칸이 이보다 많으면 실패. 좋은 실행의 숲 화면은 플레이어가 덮은 한 칸만 어긋난다 */
export const CELL_MAX_MISMATCH = 2;
/** 맵 뷰 뽑기가 기준과 같아야 하는 비율 (둘 다 같은 타일셋을 1배로 그린다) */
export const VIEW_REFERENCE_MIN_RATIO = 0.999;

/** { width, height, rgba } 에 pixel(x, y) 를 붙인다 (tests/e2e/support/bmp.ts 의 readBmp 와 같은 꼴) */
export function rgbaImage(width, height, rgba) {
  return {
    width,
    height,
    rgba,
    pixel(x, y) {
      const i = (y * width + x) * 4;
      return { r: rgba[i], g: rgba[i + 1], b: rgba[i + 2], a: rgba[i + 3] };
    },
  };
}

/** gid 가 속한 타일셋 (firstGid 가 gid 이하인 것 가운데 가장 큰 것). 없으면 null */
function tilesetFor(tilesets, gid) {
  let best = null;
  for (const t of tilesets ?? []) if (t.firstGid <= gid && (!best || t.firstGid > best.firstGid)) best = t;
  return best;
}

/**
 * 맵(포맷 v2 JSON)의 타일 레이어를 월드 픽셀 사각형 rect 안에서 1배로, 앞 레이어부터 알파로 겹쳐 그린다.
 * images: 타일셋의 image 칸 → { width, height, rgba }. opts.skipLayer: 빼고 그릴 레이어 번호.
 * opts.cell: { layer, x, y, gid } 그 칸만 이 gid 로 그린다. 돌려주는 것은 rgbaImage.
 */
export function renderMapRect(map, images, rect, opts = {}) {
  const tw = map.tileWidth;
  const th = map.tileHeight;
  const out = new Uint8Array(rect.width * rect.height * 4);
  const c0 = Math.max(0, Math.floor(rect.x / tw));
  const c1 = Math.min(map.width - 1, Math.floor((rect.x + rect.width - 1) / tw));
  const r0 = Math.max(0, Math.floor(rect.y / th));
  const r1 = Math.min(map.height - 1, Math.floor((rect.y + rect.height - 1) / th));
  (map.layers ?? []).forEach((layer, li) => {
    if (li === opts.skipLayer) return;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = opts.cell;
        const gid = cell && cell.layer === li && cell.x === c && cell.y === r ? cell.gid : (layer.data?.[r * map.width + c] ?? 0);
        if (!gid) continue;
        const ts = tilesetFor(map.tilesets, gid);
        if (!ts) throw new Error(`gid ${gid} 의 타일셋이 없다 (레이어 ${li}, 칸 ${c}, ${r})`);
        const img = images.get(ts.image);
        if (!img) throw new Error(`타일셋 그림이 없다: ${ts.image}`);
        const index = gid - ts.firstGid;
        const sx0 = (index % ts.columns) * tw;
        const sy0 = Math.floor(index / ts.columns) * th;
        for (let py = 0; py < th; py++) {
          const oy = r * th + py - rect.y;
          if (oy < 0 || oy >= rect.height || sy0 + py >= img.height) continue;
          for (let px = 0; px < tw; px++) {
            const ox = c * tw + px - rect.x;
            if (ox < 0 || ox >= rect.width || sx0 + px >= img.width) continue;
            const s = ((sy0 + py) * img.width + sx0 + px) * 4;
            const sa = img.rgba[s + 3];
            if (sa === 0) continue;
            const d = (oy * rect.width + ox) * 4;
            if (sa === 255) {
              out[d] = img.rgba[s];
              out[d + 1] = img.rgba[s + 1];
              out[d + 2] = img.rgba[s + 2];
              out[d + 3] = 255;
              continue;
            }
            // 곧은 알파의 source-over
            const a = sa / 255;
            const da = out[d + 3] / 255;
            const oa = a + da * (1 - a);
            for (let k = 0; k < 3; k++) out[d + k] = Math.round((img.rgba[s + k] * a + out[d + k] * da * (1 - a)) / oa);
            out[d + 3] = Math.round(oa * 255);
          }
        }
      }
    }
  });
  return rgbaImage(rect.width, rect.height, out);
}

function sameRgb(p, q, tol) {
  return Math.abs(p.r - q.r) <= tol && Math.abs(p.g - q.g) <= tol && Math.abs(p.b - q.b) <= tol;
}

/** ref 의 불투명한 픽셀 가운데 pick(x, y) 가 고른 것이 게임 화면(배율 scale)의 같은 자리와 같은 수 */
function matchFrame(ref, frame, scale, pick, tol) {
  let count = 0;
  let match = 0;
  for (let y = 0; y < ref.height; y++) {
    for (let x = 0; x < ref.width; x++) {
      const p = ref.pixel(x, y);
      if (p.a < 255 || !pick(x, y, p)) continue;
      count++;
      if (sameRgb(p, frame.pixel(x * scale, y * scale), tol)) match++;
    }
  }
  return { count, match, ratio: count ? match / count : 0 };
}

const pct = (m) => `${m.match}/${m.count} (${(m.ratio * 100).toFixed(2)}%)`;

/**
 * 저장한 맵으로 그린 기준(레이어 전부)을 게임 화면과 맵 뷰 뽑기에 견준다. 돌려주는 것은 [{ name, ok, detail }].
 *   - 맵 뷰 뽑기가 기준과 같다 (맵 뷰가 저장한 맵을 그렸다)
 *   - 게임 화면의 불투명한 타일 픽셀이 기준과 같다 (MAP_FRAME_MIN_RATIO)
 *   - 레이어마다: 그 레이어를 빼고 그리면 달라지는 픽셀이 LAYER_MIN_PIXELS 이상이고 게임 화면에서 LAYER_MIN_RATIO 이상 기준과 같다
 *   - edit 이 있으면: 칠한 칸이 사각형 안이고, 그 칸을 cellBefore 로 그리면 달라지는 픽셀이 게임 화면에서 기준과 같다
 * map: 저장한 맵 JSON, images: 타일셋 그림, rect: 게임의 카메라(월드 픽셀), frame: 게임 스크린샷, capture: 맵 뷰 뽑기(없으면 null)
 */
export function referenceChecks({ map, images, rect, frame, capture = null, edit = null, cellBefore = null, tol = CHANNEL_TOLERANCE }) {
  const checks = [];
  const scale = frame.width / rect.width;
  if (!Number.isInteger(scale) || scale < 1 || frame.height !== rect.height * scale) {
    checks.push({ name: "게임 화면이 카메라 사각형의 정수배다", ok: false, detail: `${frame.width}x${frame.height}, 사각형 ${rect.width}x${rect.height}` });
    return checks;
  }
  const ref = renderMapRect(map, images, rect);

  if (capture) {
    let union = 0;
    let agree = 0;
    for (let y = 0; y < ref.height; y++) {
      for (let x = 0; x < ref.width; x++) {
        const p = ref.pixel(x, y);
        const q = x < capture.width && y < capture.height ? capture.pixel(x, y) : { r: 0, g: 0, b: 0, a: 0 };
        if (p.a < 255 && q.a < 255) continue;
        union++;
        if (p.a === 255 && q.a === 255 && sameRgb(p, q, tol)) agree++;
      }
    }
    const ratio = union ? agree / union : 0;
    checks.push({
      name: `맵 뷰가 저장한 맵을 그렸다 (뽑기와 기준의 불투명 픽셀 ${VIEW_REFERENCE_MIN_RATIO * 100}% 이상)`,
      ok: union > 0 && ratio >= VIEW_REFERENCE_MIN_RATIO,
      detail: `${agree}/${union} (${(ratio * 100).toFixed(2)}%)`,
    });
  }

  const all = matchFrame(ref, frame, scale, () => true, tol);
  checks.push({ name: `게임 화면이 저장한 맵의 타일과 같다 (레이어 전부, ${MAP_FRAME_MIN_RATIO * 100}% 이상)`, ok: all.count > 0 && all.ratio >= MAP_FRAME_MIN_RATIO, detail: pct(all) });

  // 칸마다: 전체 비율은 몇 칸이 통째로 빠져도 문턱을 넘으므로, 기준이 불투명한 칸 하나하나를 따로 본다
  const tw = map.tileWidth;
  const th = map.tileHeight;
  const bad = [];
  let cells = 0;
  for (let cy = Math.ceil(rect.y / th); (cy + 1) * th <= rect.y + rect.height; cy++) {
    for (let cx = Math.ceil(rect.x / tw); (cx + 1) * tw <= rect.x + rect.width; cx++) {
      const x0 = cx * tw - rect.x;
      const y0 = cy * th - rect.y;
      const m = matchFrame(ref, frame, scale, (x, y) => x >= x0 && x < x0 + tw && y >= y0 && y < y0 + th, tol);
      if (m.count < (tw * th) / 4) continue;
      cells++;
      if (m.ratio < CELL_MIN_RATIO) bad.push(`${cx},${cy}`);
    }
  }
  checks.push({
    name: `칸마다 게임 화면이 저장한 맵과 같다 (칸의 ${CELL_MIN_RATIO * 100}% 이상, 어긋난 칸 ${CELL_MAX_MISMATCH} 개 이하)`,
    ok: cells > 0 && bad.length <= CELL_MAX_MISMATCH,
    detail: `${cells} 칸 가운데 ${bad.length} 칸 어긋남${bad.length ? `: ${bad.slice(0, 12).join(" ")}` : ""}`,
  });

  (map.layers ?? []).forEach((layer, li) => {
    const without = renderMapRect(map, images, rect, { skipLayer: li });
    const m = matchFrame(ref, frame, scale, (x, y, p) => {
      const q = without.pixel(x, y);
      return q.a < 255 || !sameRgb(p, q, tol);
    }, tol);
    const name = layer.name ?? `#${li}`;
    checks.push({
      name: `레이어 ${name} 가 게임 화면에 있다 (그 레이어만 보이는 픽셀 ${LAYER_MIN_PIXELS} 개 이상, ${LAYER_MIN_RATIO * 100}% 이상)`,
      ok: m.count >= LAYER_MIN_PIXELS && m.ratio >= LAYER_MIN_RATIO,
      detail: pct(m),
    });
  });

  if (edit) {
    const inside = edit.x * map.tileWidth >= rect.x && (edit.x + 1) * map.tileWidth <= rect.x + rect.width && edit.y * map.tileHeight >= rect.y && (edit.y + 1) * map.tileHeight <= rect.y + rect.height;
    checks.push({ name: `칠한 칸 (${edit.x}, ${edit.y}) 이 카메라 안에 있다`, ok: inside, detail: JSON.stringify(rect) });
    if (inside && Number.isInteger(cellBefore)) {
      const before = renderMapRect(map, images, rect, { cell: { layer: edit.layer, x: edit.x, y: edit.y, gid: cellBefore } });
      const m = matchFrame(ref, frame, scale, (x, y, p) => {
        const q = before.pixel(x, y);
        return q.a < 255 || !sameRgb(p, q, tol);
      }, tol);
      checks.push({
        name: `칠한 칸 (${edit.x}, ${edit.y}) 이 게임 화면에 있다 (칠하기 전 gid ${cellBefore} 와 다른 픽셀 ${LAYER_MIN_PIXELS} 개 이상, ${LAYER_MIN_RATIO * 100}% 이상)`,
        ok: m.count >= LAYER_MIN_PIXELS && m.ratio >= LAYER_MIN_RATIO,
        detail: pct(m),
      });
    }
  }
  return checks;
}
