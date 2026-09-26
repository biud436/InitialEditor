import { CompositeLayout, MapFileV1 } from "./MapFormat";
export interface MapDocumentInfo {
    name: string;
    id: number;
    path: string | null;
    width: number;
    height: number;
}
export interface ExportResult {
    path: string;
    bytes: number;
    /** 프로젝트에 없어서 이번에 올린 타일셋 이미지 경로 */
    uploadedTilesets: string[];
    usedTilesets: string[];
    droppedTiles: number;
}
export interface OpenResult {
    path: string;
    name: string;
    id: number;
    width: number;
    height: number;
    unknownTilesets: string[];
    droppedLayers: number;
    /** 에디터의 빈 칸 ID 와 겹쳐 표현할 수 없었던 타일 칸 수 */
    unrepresentableTiles: number;
}
export interface NewMapOptions {
    name: string;
    id: number;
    width: number;
    height: number;
}
/**
 * 맵 문서의 저장, 내보내기, 불러오기, 새로 만들기.
 * 타일맵(데이터)과 합성 타일셋 캔버스(전역 ID 해석)를 읽고, 브리지로 프로젝트에 읽고 쓴다.
 * 변환 자체는 map/MapFormat.ts 의 순수 함수가 맡는다.
 */
export declare class MapDocumentService {
    private client;
    constructor();
    private get app();
    info(): MapDocumentInfo;
    layout(): CompositeLayout;
    /** 이름으로 기본 저장 경로를 만든다 (resources/maps/<slug>.json) */
    defaultPathFor(name: string): string;
    /** 현재 맵을 맵 포맷 v1 객체로 만든다 (파일 IO 없음) */
    buildMapFile(meta?: {
        name?: string;
        id?: number;
    }): import("./MapFormat").ExportMapResult;
    /**
     * 현재 맵을 프로젝트에 내보낸다. 맵이 쓰는 타일셋 이미지가 프로젝트에 없으면
     * 에디터가 가진 이미지를 함께 올린다 (엔진은 이미지가 없으면 맵 로드를 거부한다).
     */
    exportTo(path: string, meta?: {
        name?: string;
        id?: number;
    }): Promise<ExportResult>;
    /** 이미 경로가 있는 맵을 같은 자리에 저장한다. 경로가 없으면 예외 (내보내기 대화상자를 띄울 것) */
    save(): Promise<ExportResult>;
    /** 프로젝트의 맵 파일 목록 (resources/maps/*.json) */
    listMaps(): Promise<string[]>;
    /** 맵 파일 v1 을 읽어 에디터에 올린다 */
    open(path: string): Promise<OpenResult>;
    /** 이미 읽어 둔 맵 객체를 에디터에 올린다 (경로는 저장 위치 기억용) */
    load(map: MapFileV1, path: string | null): OpenResult;
    /** 빈 맵을 새로 만든다 */
    newMap(opts: NewMapOptions): MapDocumentInfo;
    /** 맵 크기만 바꾼다 (겹치는 영역 유지) */
    resize(width: number, height: number): MapDocumentInfo;
    private ensureTilesetImages;
}
export declare function getMapDocumentService(): MapDocumentService;
