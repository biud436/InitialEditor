// 맵 포맷 v1 변환 검수 — node --test test/*.test.mjs
//
// 대상은 빌드 결과(dist/map/MapFormat.js)다. 이 패키지는 package.json 에 type: module 이
// 없어서 .js 를 그대로 import 하면 CommonJS 로 해석된다. MapFormat 은 의존성이 전혀 없는
// 순수 모듈이므로(그 자체가 설계 조건이다) 소스를 data: URL 로 읽어 ESM 으로 평가한다.
// 테스트를 돌리기 전에 `yarn build:editor` 로 dist 를 갱신할 것.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const distFile = path.join(here, '..', 'dist', 'map', 'MapFormat.js');
const source = fs.readFileSync(distFile, 'utf8');
assert.ok(
  !/^\s*import\s/m.test(source),
  'MapFormat 은 의존성 없는 순수 모듈이어야 합니다 (import 발견)',
);
const {
  MAP_FORMAT_VERSION,
  assertMapFileV1,
  basenameOf,
  compositeIdToTile,
  defaultImagePath,
  exportMapV1,
  importMapV1,
  normalizeMapPath,
  tileToCompositeId,
} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

// 실제 에디터 설정과 같은 배치: 폭 32타일 합성 캔버스에 세 이미지를 위에서 아래로 쌓는다
// (tileset16-8x13.png 128x208, 2k_town05.png 480x256, 2k_town05-01.png 480x256)
const LAYOUT = {
  columns: 32,
  tileWidth: 16,
  tileHeight: 16,
  tilesets: [
    { name: 'tileset16-8x13.png', src: '/images/tiles/tileset16-8x13.png', y0: 0, width: 128, height: 208, columns: 8, rows: 13 },
    { name: '2k_town05.png', src: '/images/tiles/2k_town05.png', y0: 208, width: 480, height: 256, columns: 30, rows: 16 },
    { name: '2k_town05-01.png', src: '/images/tiles/2k_town05-01.png', y0: 464, width: 480, height: 256, columns: 30, rows: 16 },
  ],
};

const emptyData = (w, h, layers) => new Array(w * h * layers).fill(0);
const at = (w, h, x, y, z) => w * h * z + w * y + x;

describe('composite tile id ↔ tileset local id', () => {
  it('maps ids inside a tileset band', () => {
    // 첫 타일셋: 캔버스 (0,0) → 지역 0, (3,2) → 행2*8열 + 3 = 19
    assert.deepEqual(compositeIdToTile(LAYOUT, 3 + 2 * 32), { tilesetIndex: 0, localId: 19 });
    // 두 번째 타일셋의 첫 줄은 캔버스 행 13 (208/16)
    assert.deepEqual(compositeIdToTile(LAYOUT, 13 * 32), { tilesetIndex: 1, localId: 0 });
    assert.deepEqual(compositeIdToTile(LAYOUT, 13 * 32 + 29), { tilesetIndex: 1, localId: 29 });
    // 세 번째 타일셋은 캔버스 행 29 (464/16)
    assert.deepEqual(compositeIdToTile(LAYOUT, 29 * 32 + 1), { tilesetIndex: 2, localId: 1 });
  });

  it('rejects id 0, the empty right-hand gap and the area below the last tileset', () => {
    assert.equal(compositeIdToTile(LAYOUT, 0), null); // 빈 칸
    assert.equal(compositeIdToTile(LAYOUT, 10 + 2 * 32), null); // 폭 8인 타일셋의 오른쪽 여백
    assert.equal(compositeIdToTile(LAYOUT, 13 * 32 + 30), null); // 폭 30인 타일셋의 오른쪽 여백
    assert.equal(compositeIdToTile(LAYOUT, 45 * 32), null); // 마지막 타일셋 아래
  });

  it('round-trips every valid tile of every tileset', () => {
    for (let i = 0; i < LAYOUT.tilesets.length; i++) {
      const ts = LAYOUT.tilesets[i];
      for (let localId = 0; localId < ts.columns * ts.rows; localId++) {
        // 합성 캔버스 좌상단은 에디터의 "빈 칸"(0)이라 표현 대상이 아니다 (아래 테스트 참고)
        if (i === 0 && localId === 0) continue;
        const gid = tileToCompositeId(LAYOUT, { tilesetIndex: i, localId });
        assert.notEqual(gid, 0, `tileset ${i} local ${localId} should map to a composite id`);
        assert.deepEqual(compositeIdToTile(LAYOUT, gid), { tilesetIndex: i, localId });
      }
    }
  });

  it('reserves id 0 as "empty", so the first tile of the first tileset has no id', () => {
    assert.equal(tileToCompositeId(LAYOUT, { tilesetIndex: 0, localId: 0 }), 0);
    assert.equal(compositeIdToTile(LAYOUT, 0), null);
  });
});

describe('exportMapV1', () => {
  it('emits only the tilesets that are used, with packed firstGid values', () => {
    const [w, h, layers] = [4, 3, 4];
    const data = emptyData(w, h, layers);
    data[at(w, h, 0, 0, 0)] = 3 + 2 * 32; // 첫 타일셋 지역 19
    data[at(w, h, 1, 0, 0)] = 29 * 32 + 1; // 세 번째 타일셋 지역 1
    const { map, usedTilesets, droppedTiles } = exportMapV1({
      name: '마을', id: 7, width: w, height: h, layerCount: layers, data, layout: LAYOUT,
    });

    assert.equal(map.version, MAP_FORMAT_VERSION);
    assert.equal(map.name, '마을');
    assert.equal(map.id, 7);
    assert.equal(map.width, 4);
    assert.equal(map.height, 3);
    assert.equal(map.tileWidth, 16);
    assert.equal(droppedTiles, 0);

    // 쓰이지 않은 2k_town05.png 는 빠지고, firstGid 는 1부터 촘촘하게
    assert.deepEqual(map.tilesets, [
      { image: 'resources/tiles/tileset16-8x13.png', firstGid: 1, columns: 8 },
      { image: 'resources/tiles/2k_town05-01.png', firstGid: 1 + 8 * 13, columns: 30 },
    ]);
    assert.deepEqual(usedTilesets.map(t => t.name), ['tileset16-8x13.png', '2k_town05-01.png']);

    // gid = firstGid + 지역 ID, 행 우선
    assert.equal(map.layers[0].data[0], 1 + 19);
    assert.equal(map.layers[0].data[1], 1 + 8 * 13 + 1);
    // 뒤쪽 빈 레이어는 잘린다 (불러올 때 다시 4층으로 채워지므로 왕복은 그대로)
    assert.equal(map.layers.length, 1);
    for (const layer of map.layers) assert.equal(layer.data.length, w * h);
  });

  it('keeps empty layers that sit under a painted one, and can keep all of them', () => {
    const [w, h, layers] = [2, 1, 4];
    const data = emptyData(w, h, layers);
    data[at(w, h, 0, 0, 2)] = 3 + 2 * 32; // 3번째 층에만 그림
    const trimmed = exportMapV1({ name: 'x', id: 1, width: w, height: h, layerCount: layers, data, layout: LAYOUT });
    assert.equal(trimmed.map.layers.length, 3);
    assert.deepEqual(trimmed.map.layers[0].data, [0, 0]);

    const kept = exportMapV1({ name: 'x', id: 1, width: w, height: h, layerCount: layers, data, layout: LAYOUT, trimEmptyLayers: false });
    assert.equal(kept.map.layers.length, 4);

    // 완전히 빈 맵도 최소 한 층은 남는다
    const blank = exportMapV1({ name: 'x', id: 1, width: w, height: h, layerCount: layers, data: emptyData(w, h, layers), layout: LAYOUT });
    assert.equal(blank.map.layers.length, 1);
  });

  it('keeps layer names given by the caller', () => {
    const [w, h] = [2, 1];
    const data = emptyData(w, h, 2);
    data[at(w, h, 0, 0, 1)] = 3 + 2 * 32;
    const { map } = exportMapV1({
      name: 'x', id: 1, width: w, height: h, layerCount: 2, data, layout: LAYOUT, layerNames: ['ground', 'deco'],
    });
    assert.deepEqual(map.layers.map(l => l.name), ['ground', 'deco']);
  });

  it('drops tiles that belong to no tileset and reports the count', () => {
    const [w, h, layers] = [2, 1, 1];
    const data = emptyData(w, h, layers);
    data[0] = 10 + 2 * 32; // 여백 (어느 타일셋에도 속하지 않음)
    data[1] = 0;
    const { map, droppedTiles } = exportMapV1({
      name: 'x', id: 1, width: w, height: h, layerCount: layers, data, layout: LAYOUT,
    });
    assert.equal(droppedTiles, 1);
    assert.deepEqual(map.layers[0].data, [0, 0]);
    assert.deepEqual(map.tilesets, []);
  });

  it('keeps a collision layer only when its length matches', () => {
    const base = { name: 'x', id: 1, width: 2, height: 2, layerCount: 1, data: emptyData(2, 2, 1), layout: LAYOUT };
    assert.deepEqual(exportMapV1({ ...base, collision: [0, 1, 0, 1] }).map.collision, [0, 1, 0, 1]);
    assert.equal(exportMapV1({ ...base, collision: [0, 1] }).map.collision, undefined);
    assert.equal(exportMapV1(base).map.collision, undefined);
  });

  it('treats holes and non-numbers in the sparse editor array as empty', () => {
    const data = new Array(4); // new Array(n) 은 구멍투성이 — 에디터의 _data 가 이 모양이다
    data[0] = 3 + 2 * 32;
    const { map, droppedTiles } = exportMapV1({
      name: 'x', id: 1, width: 2, height: 2, layerCount: 1, data, layout: LAYOUT,
    });
    assert.deepEqual(map.layers[0].data, [20, 0, 0, 0]);
    assert.equal(droppedTiles, 0);
  });
});

describe('importMapV1', () => {
  const exportSample = () => {
    const [w, h, layers] = [3, 2, 4];
    const data = emptyData(w, h, layers);
    data[at(w, h, 0, 0, 0)] = 3 + 2 * 32;
    data[at(w, h, 2, 1, 0)] = 13 * 32 + 5;
    data[at(w, h, 1, 1, 2)] = 29 * 32 + 7;
    return { w, h, layers, data, ...exportMapV1({ name: 'm', id: 2, width: w, height: h, layerCount: layers, data, layout: LAYOUT }) };
  };

  it('round-trips an exported map back to the same editor data', () => {
    const { w, h, layers, data, map } = exportSample();
    assert.ok(map.layers.length <= layers);
    const result = importMapV1(map, LAYOUT, layers);
    assert.equal(result.name, 'm');
    assert.equal(result.id, 2);
    assert.equal(result.width, w);
    assert.equal(result.height, h);
    assert.deepEqual(result.data, data);
    assert.deepEqual(result.unknownTilesets, []);
    assert.equal(result.droppedLayers, 0);
  });

  it('reports tilesets the editor does not have and blanks those tiles', () => {
    const { map } = exportSample();
    const layout = { ...LAYOUT, tilesets: [LAYOUT.tilesets[0]] }; // 첫 타일셋만 아는 에디터
    const result = importMapV1(map, layout, 4);
    assert.deepEqual(result.unknownTilesets, [
      'resources/tiles/2k_town05.png',
      'resources/tiles/2k_town05-01.png',
    ]);
    assert.equal(result.data[at(3, 2, 0, 0, 0)], 3 + 2 * 32); // 아는 타일은 그대로
    assert.equal(result.data[at(3, 2, 2, 1, 0)], 0); // 모르는 타일셋의 타일은 빈 칸
  });

  it('remaps local ids when the file columns disagree with the editor image', () => {
    // 파일은 columns=4 로 기록됐지만 에디터가 아는 이미지는 8열이다.
    // 지역 ID 6 은 파일 기준 (행1, 열2) → 에디터 기준 행1*8+2 = 10.
    const map = {
      version: 1, name: 'c', id: 1, width: 1, height: 1, tileWidth: 16, tileHeight: 16,
      layers: [{ name: 'ground', data: [1 + 6] }],
      tilesets: [{ image: 'resources/tiles/tileset16-8x13.png', firstGid: 1, columns: 4 }],
    };
    const result = importMapV1(map, LAYOUT, 1);
    assert.deepEqual(compositeIdToTile(LAYOUT, result.data[0]), { tilesetIndex: 0, localId: 10 });
  });

  it('drops layers beyond the editor layer count', () => {
    const [w, h] = [3, 2];
    const data = emptyData(w, h, 4);
    data[at(w, h, 0, 0, 3)] = 3 + 2 * 32; // 4층까지 쓰는 파일을 만든다
    const { map } = exportMapV1({ name: 'm', id: 1, width: w, height: h, layerCount: 4, data, layout: LAYOUT });
    assert.equal(map.layers.length, 4);

    const result = importMapV1(map, LAYOUT, 2); // 레이어 2개짜리 에디터로 불러오면
    assert.equal(result.droppedLayers, 2);
    assert.equal(result.data.length, w * h * 2);
  });

  it('counts tiles that collide with the editor empty marker', () => {
    // firstGid 1, 지역 0 = 첫 타일셋의 첫 타일 → 에디터에서는 빈 칸이 된다
    const map = {
      version: 1, name: 'z', id: 1, width: 2, height: 1, tileWidth: 16, tileHeight: 16,
      layers: [{ name: 'ground', data: [1, 2] }],
      tilesets: [{ image: 'resources/tiles/tileset16-8x13.png', firstGid: 1, columns: 8 }],
    };
    const result = importMapV1(map, LAYOUT, 1);
    assert.equal(result.unrepresentableTiles, 1);
    assert.deepEqual(result.data, [0, 1]);
  });

  it('keeps the collision layer', () => {
    const map = {
      version: 1, name: 'c', id: 1, width: 2, height: 2, tileWidth: 16, tileHeight: 16,
      layers: [{ name: 'ground', data: [0, 0, 0, 0] }],
      collision: [0, 1, 1, 0],
      tilesets: [],
    };
    assert.deepEqual(importMapV1(map, LAYOUT, 1).collision, [0, 1, 1, 0]);
  });
});

describe('assertMapFileV1', () => {
  const valid = () => ({
    version: 1, name: 'v', id: 1, width: 2, height: 2, tileWidth: 16, tileHeight: 16,
    layers: [{ name: 'ground', data: [0, 0, 0, 0] }],
    tilesets: [],
  });

  it('accepts a well-formed v1 map', () => {
    assert.doesNotThrow(() => assertMapFileV1(valid()));
  });

  it('rejects other versions and broken shapes with a readable message', () => {
    assert.throws(() => assertMapFileV1({ ...valid(), version: 2 }), /지원하지 않는 맵 버전/);
    assert.throws(() => assertMapFileV1({ ...valid(), width: 0 }), /width/);
    assert.throws(() => assertMapFileV1({ ...valid(), layers: [] }), /layers/);
    assert.throws(() => assertMapFileV1({ ...valid(), layers: [{ name: 'g', data: [0] }] }), /데이터 길이/);
    assert.throws(() => assertMapFileV1({ ...valid(), collision: [0] }), /collision/);
    assert.throws(() => assertMapFileV1(null), /JSON 객체/);
  });
});

describe('path helpers', () => {
  it('normalizes map paths into resources/maps/*.json', () => {
    assert.equal(normalizeMapPath('map1'), 'resources/maps/map1.json');
    assert.equal(normalizeMapPath('resources/maps/town.json'), 'resources/maps/town.json');
    assert.equal(normalizeMapPath('/resources/maps/town'), 'resources/maps/town.json');
    assert.equal(normalizeMapPath('resources\\maps\\town.json'), 'resources/maps/town.json');
    assert.equal(normalizeMapPath('  '), 'resources/maps/map1.json');
  });

  it('takes the basename of urls and paths', () => {
    assert.equal(basenameOf('/images/tiles/a.png?v=2'), 'a.png');
    assert.equal(basenameOf('resources/tiles/a.png'), 'a.png');
    assert.equal(basenameOf('a.png'), 'a.png');
  });

  it('puts tileset images under resources/tiles', () => {
    assert.equal(defaultImagePath({ name: 'a.png' }), 'resources/tiles/a.png');
  });
});
