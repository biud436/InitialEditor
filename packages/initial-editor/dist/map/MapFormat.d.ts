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
export declare const MAP_FORMAT_VERSION: 1;
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
export declare function basenameOf(path: string): string;
/**
 * 합성 캔버스 전역 ID → (타일셋, 지역 ID). 어느 타일셋에도 속하지 않는 칸(타일셋 폭보다
 * 오른쪽의 여백, 마지막 타일셋 아래)은 null.
 *
 * **ID 0 은 "빈 칸"이다.** 에디터 전체가 0 을 빈 칸으로 쓰기 때문에(tilemap.draw 는 0 을
 * 건너뛴다), 합성 캔버스 좌상단 = 첫 타일셋의 첫 타일은 에디터에서 표현할 수 없다.
 * 맵 파일에 그 타일이 들어 있으면 불러올 때 빈 칸이 되며, 그 개수를 보고한다
 * (ImportMapResult.unrepresentableTiles).
 */
export declare function compositeIdToTile(layout: CompositeLayout, id: number): TileRef | null;
/** (타일셋, 지역 ID) → 합성 캔버스 전역 ID. 범위 밖이면 0. */
export declare function tileToCompositeId(layout: CompositeLayout, ref: TileRef): number;
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
export declare function defaultImagePath(tileset: CompositeTileset): string;
/** 맵 파일이 놓이는 기본 디렉터리 (프로젝트 루트 기준) */
export declare const DEFAULT_MAP_DIR = "resources/maps";
/** 사용자가 적은 경로를 resources/maps/ 아래 .json 으로 정리한다 */
export declare function normalizeMapPath(input: string): string;
/** 에디터 내부 표현 → 맵 파일 v1. 쓰이는 타일셋만 firstGid 를 촘촘히 배정해 넣는다. */
export declare function exportMapV1(opts: ExportMapOptions): ExportMapResult;
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
export declare function assertMapFileV1(value: unknown): asserts value is MapFileV1;
/** 맵 파일 v1 → 에디터 내부 표현. 타일셋은 파일 이름(basename)으로 합성 레이아웃과 맞춘다. */
export declare function importMapV1(map: MapFileV1, layout: CompositeLayout, layerCount: number): ImportMapResult;
