/**
 * Initial2D 맵 포맷 v1 (docs/plans/02-tilemap.md) 과 에디터 내부 표현 사이의 순수 변환 함수.
 *
 * 에디터 내부:
 * - 타일 ID 는 "합성 타일셋 캔버스"의 전역 인덱스다. TilesetCanvas 는 설정된 타일셋 이미지를
 *   위에서 아래로 쌓아 폭 MAP_COLS(32) 타일짜리 캔버스 하나로 만들고, 타일 ID = row * 32 + col.
 * - 맵 데이터는 평탄한 배열 하나: data[z * W * H + y * W + x].
 *
 * 맵 파일 v1:
 * - 타일 ID 는 Tiled 방식 gid. 0 은 빈 칸, 타일셋마다 firstGid, 지역 ID = gid - firstGid,
 *   아틀라스 좌표는 그 타일셋의 columns 로 계산.
 * - 레이어별 배열, 행 우선.
 *
 * 이 모듈은 PIXI 나 DOM 을 모른다. 렌더링 코드와 얽히지 않게 데이터만 다룬다.
 * (예전의 미사용 MapSchema 클래스를 대신한다. 맵 파일은 Schema/FileProvider 계층이 아니라
 *  브리지 서버를 통해 오가므로, 변환은 의존성 없는 순수 함수로 두고 IO 는 MapDocumentService 가 맡는다.)
 */

export const MAP_FORMAT_VERSION = 1 as const;

export interface MapTilesetV1 {
    /** 프로젝트 루트 기준 경로 (예: resources/tiles/Exterior.png) */
    image: string;
    firstGid: number;
    columns: number;
}

export interface MapLayerV1 {
    name: string;
    data: number[];
}

export interface MapFileV1 {
    version: typeof MAP_FORMAT_VERSION;
    name: string;
    id: number;
    width: number;
    height: number;
    tileWidth: number;
    tileHeight: number;
    layers: MapLayerV1[];
    collision?: number[];
    tilesets: MapTilesetV1[];
}

/** 합성 캔버스 안에서 타일셋 이미지 하나가 차지하는 띠 */
export interface CompositeTileset {
    /** 파일 이름 (예: 2k_town05.png) — 프로젝트의 resources/tiles/ 안 이름과 맞춘다 */
    name: string;
    /** 에디터가 이미지를 읽은 원본 URL */
    src: string;
    /** 합성 캔버스 안의 세로 시작 픽셀 */
    y0: number;
    width: number;
    height: number;
    /** 이 타일셋 자체의 열 수 (width / tileWidth) */
    columns: number;
    rows: number;
}

export interface CompositeLayout {
    /** 합성 캔버스의 열 수 (config.MAP_COLS) — 전역 타일 ID 계산의 기준 */
    columns: number;
    tileWidth: number;
    tileHeight: number;
    tilesets: CompositeTileset[];
}

export interface TileRef {
    tilesetIndex: number;
    localId: number;
}

/** 이미지 URL 또는 경로에서 파일 이름만 뽑는다 (쿼리 문자열 제거) */
export function basenameOf(path: string): string {
    const clean = path.split("?")[0].split("#")[0];
    const parts = clean.split(/[\\/]/);
    return parts[parts.length - 1] || clean;
}

/**
 * 합성 캔버스 전역 ID → (타일셋, 지역 ID). 어느 타일셋에도 속하지 않는 칸(타일셋 폭보다
 * 오른쪽의 여백, 마지막 타일셋 아래)은 null.
 *
 * **ID 0 은 "빈 칸"이다.** 에디터 전체가 0 을 빈 칸으로 쓰기 때문에(tilemap.draw 는 0 을
 * 건너뛴다), 합성 캔버스 좌상단 = 첫 타일셋의 첫 타일은 에디터에서 표현할 수 없다.
 * 맵 파일에 그 타일이 들어 있으면 불러올 때 빈 칸이 되며, 그 개수를 보고한다
 * (ImportMapResult.unrepresentableTiles).
 */
export function compositeIdToTile(layout: CompositeLayout, id: number): TileRef | null {
    if (!Number.isInteger(id) || id <= 0) return null;
    const col = id % layout.columns;
    const row = Math.floor(id / layout.columns);
    const y = row * layout.tileHeight;
    for (let i = 0; i < layout.tilesets.length; i++) {
        const ts = layout.tilesets[i];
        if (y >= ts.y0 && y < ts.y0 + ts.height) {
            if (col >= ts.columns) return null;
            const localRow = Math.floor((y - ts.y0) / layout.tileHeight);
            if (localRow >= ts.rows) return null;
            return { tilesetIndex: i, localId: localRow * ts.columns + col };
        }
    }
    return null;
}

/** (타일셋, 지역 ID) → 합성 캔버스 전역 ID. 범위 밖이면 0. */
export function tileToCompositeId(layout: CompositeLayout, ref: TileRef): number {
    const ts = layout.tilesets[ref.tilesetIndex];
    if (!ts || ref.localId < 0) return 0;
    const localRow = Math.floor(ref.localId / ts.columns);
    const col = ref.localId % ts.columns;
    if (localRow >= ts.rows) return 0;
    const row = Math.floor(ts.y0 / layout.tileHeight) + localRow;
    return row * layout.columns + col;
}

export interface ExportMapOptions {
    name: string;
    id: number;
    width: number;
    height: number;
    layerCount: number;
    /** data[z * W * H + y * W + x] (undefined 나 NaN 은 0 으로 취급) */
    data: ArrayLike<number>;
    layout: CompositeLayout;
    /** 타일셋 파일 이름 → 맵 파일에 적을 경로 (기본: resources/tiles/<name>) */
    imagePathFor?: (tileset: CompositeTileset) => string;
    layerNames?: string[];
    collision?: number[];
    /**
     * 뒤쪽의 빈 레이어를 잘라낸다 (기본 true). 에디터는 레이어 수가 늘 4 로 고정이라
     * 그대로 내보내면 파일 대부분이 0 으로 채워진다. 불러올 때 다시 4 층으로 채우므로
     * 왕복은 그대로다. 최소 한 층은 남긴다.
     */
    trimEmptyLayers?: boolean;
}

export interface ExportMapResult {
    map: MapFileV1;
    /** 맵이 실제로 쓰는 타일셋 (합성 순서) — 프로젝트에 이미지가 있어야 엔진이 읽는다 */
    usedTilesets: CompositeTileset[];
    /** 어느 타일셋에도 속하지 않아 0 으로 바뀐 칸 수 */
    droppedTiles: number;
}

export function defaultImagePath(tileset: CompositeTileset): string {
    return `resources/tiles/${tileset.name}`;
}

/** 맵 파일이 놓이는 기본 디렉터리 (프로젝트 루트 기준) */
export const DEFAULT_MAP_DIR = "resources/maps";

/** 사용자가 적은 경로를 resources/maps/ 아래 .json 으로 정리한다 */
export function normalizeMapPath(input: string): string {
    let path = (input || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (!path) path = `${DEFAULT_MAP_DIR}/map1.json`;
    if (!path.includes("/")) path = `${DEFAULT_MAP_DIR}/${path}`;
    if (!path.toLowerCase().endsWith(".json")) path += ".json";
    return path;
}

/** 에디터 내부 표현 → 맵 파일 v1. 쓰이는 타일셋만 firstGid 를 촘촘히 배정해 넣는다. */
export function exportMapV1(opts: ExportMapOptions): ExportMapResult {
    const { width, height, layerCount, data, layout } = opts;
    const cells = width * height;
    const imagePathFor = opts.imagePathFor || defaultImagePath;

    // 1차: 어떤 타일셋이 쓰이는지 조사
    const used = new Set<number>();
    const refs: (TileRef | null)[] = new Array(cells * layerCount);
    for (let i = 0; i < cells * layerCount; i++) {
        const raw = data[i];
        const id = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
        const ref = compositeIdToTile(layout, id);
        refs[i] = ref;
        if (ref) used.add(ref.tilesetIndex);
    }

    // 2차: 쓰이는 타일셋에 firstGid 배정 (합성 순서 유지)
    const usedIndexes = Array.from(used).sort((a, b) => a - b);
    const firstGidOf = new Map<number, number>();
    const tilesets: MapTilesetV1[] = [];
    let nextGid = 1;
    for (const index of usedIndexes) {
        const ts = layout.tilesets[index];
        firstGidOf.set(index, nextGid);
        tilesets.push({ image: imagePathFor(ts), firstGid: nextGid, columns: ts.columns });
        nextGid += ts.columns * ts.rows;
    }

    // 3차: 레이어별 gid 배열
    let droppedTiles = 0;
    const layers: MapLayerV1[] = [];
    for (let z = 0; z < layerCount; z++) {
        const out = new Array<number>(cells);
        for (let i = 0; i < cells; i++) {
            const ref = refs[z * cells + i];
            if (!ref) {
                const raw = data[z * cells + i];
                if (typeof raw === "number" && raw > 0) droppedTiles += 1;
                out[i] = 0;
            } else {
                out[i] = firstGidOf.get(ref.tilesetIndex)! + ref.localId;
            }
        }
        layers.push({ name: opts.layerNames?.[z] || `layer${z + 1}`, data: out });
    }

    if (opts.trimEmptyLayers !== false) {
        while (layers.length > 1 && layers[layers.length - 1].data.every((gid) => gid === 0)) {
            layers.pop();
        }
    }

    const map: MapFileV1 = {
        version: MAP_FORMAT_VERSION,
        name: opts.name,
        id: opts.id,
        width,
        height,
        tileWidth: layout.tileWidth,
        tileHeight: layout.tileHeight,
        layers,
        tilesets,
    };
    if (opts.collision && opts.collision.length === cells) {
        map.collision = opts.collision.slice();
    }
    return { map, usedTilesets: usedIndexes.map((i) => layout.tilesets[i]), droppedTiles };
}

export interface ImportMapResult {
    name: string;
    id: number;
    width: number;
    height: number;
    /** data[z * W * H + y * W + x], 길이 W*H*layerCount */
    data: number[];
    /** 에디터가 모르는 타일셋 이미지 (그 타일들은 0 이 된다) */
    unknownTilesets: string[];
    /** 파일의 레이어 수가 에디터 레이어 수보다 많아 버린 레이어 수 */
    droppedLayers: number;
    /** 에디터의 "빈 칸" ID 와 겹쳐 표현할 수 없는 타일(첫 타일셋의 첫 타일) 칸 수 */
    unrepresentableTiles: number;
    collision?: number[];
}

/** 맵 파일이 v1 형식인지 검사한다. 아니면 이유를 담은 Error 를 던진다. */
export function assertMapFileV1(value: unknown): asserts value is MapFileV1 {
    if (!value || typeof value !== "object") throw new Error("맵 파일이 JSON 객체가 아닙니다");
    const m = value as Record<string, unknown>;
    if (m.version !== MAP_FORMAT_VERSION) throw new Error(`지원하지 않는 맵 버전: ${String(m.version)} (v1 만 지원)`);
    for (const key of ["width", "height", "tileWidth", "tileHeight"]) {
        if (typeof m[key] !== "number" || (m[key] as number) <= 0) throw new Error(`${key} 가 올바르지 않습니다`);
    }
    if (!Array.isArray(m.layers) || m.layers.length === 0) throw new Error("layers 가 비었습니다");
    if (!Array.isArray(m.tilesets)) throw new Error("tilesets 가 없습니다");
    const cells = (m.width as number) * (m.height as number);
    for (const layer of m.layers as unknown[]) {
        const l = layer as Record<string, unknown>;
        if (!Array.isArray(l.data) || l.data.length !== cells) {
            throw new Error(`레이어 "${String(l.name)}" 의 데이터 길이가 width*height 와 다릅니다`);
        }
    }
    if (m.collision !== undefined && (!Array.isArray(m.collision) || m.collision.length !== cells)) {
        throw new Error("collision 길이가 width*height 와 다릅니다");
    }
}

/** 맵 파일 v1 → 에디터 내부 표현. 타일셋은 파일 이름(basename)으로 합성 레이아웃과 맞춘다. */
export function importMapV1(map: MapFileV1, layout: CompositeLayout, layerCount: number): ImportMapResult {
    assertMapFileV1(map);
    const { width, height } = map;
    const cells = width * height;

    // firstGid 오름차순으로 정렬해 gid → 타일셋 탐색
    const sorted = map.tilesets
        .map((ts) => ({ ...ts, name: basenameOf(ts.image) }))
        .sort((a, b) => a.firstGid - b.firstGid);
    const compositeIndexByName = new Map<string, number>();
    layout.tilesets.forEach((ts, i) => compositeIndexByName.set(ts.name, i));
    const unknown = new Set<string>();
    let unrepresentable = 0;

    const resolveGid = (gid: number): number => {
        if (!Number.isInteger(gid) || gid <= 0) return 0;
        let hit: (typeof sorted)[number] | null = null;
        for (const ts of sorted) {
            if (ts.firstGid > gid) break;
            hit = ts;
        }
        if (!hit) return 0;
        const compositeIndex = compositeIndexByName.get(hit.name);
        if (compositeIndex === undefined) {
            unknown.add(hit.image);
            return 0;
        }
        const localId = gid - hit.firstGid;
        // 파일의 columns 와 에디터가 아는 이미지 폭이 다르면 좌표를 다시 계산한다
        const ts = layout.tilesets[compositeIndex];
        const localRow = Math.floor(localId / hit.columns);
        const localCol = localId % hit.columns;
        if (localCol >= ts.columns || localRow >= ts.rows) return 0;
        const compositeId = tileToCompositeId(layout, {
            tilesetIndex: compositeIndex,
            localId: localRow * ts.columns + localCol,
        });
        // 합성 캔버스 좌상단(= 첫 타일셋의 첫 타일)은 에디터의 빈 칸 ID 와 겹친다
        if (compositeId === 0) unrepresentable += 1;
        return compositeId;
    };

    const data = new Array<number>(cells * layerCount).fill(0);
    const layersToRead = Math.min(layerCount, map.layers.length);
    for (let z = 0; z < layersToRead; z++) {
        const src = map.layers[z].data;
        for (let i = 0; i < cells; i++) {
            data[z * cells + i] = resolveGid(src[i]);
        }
    }

    return {
        name: map.name || "",
        id: typeof map.id === "number" ? map.id : 1,
        width,
        height,
        data,
        unknownTilesets: Array.from(unknown),
        droppedLayers: Math.max(0, map.layers.length - layerCount),
        unrepresentableTiles: unrepresentable,
        collision: map.collision ? map.collision.slice() : undefined,
    };
}
