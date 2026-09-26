import { Service } from "typedi";
import Container from "typedi";
import App from "../app";
import { BridgeClient, getBridgeClient } from "../bridge/BridgeClient";
import {
    CompositeLayout,
    CompositeTileset,
    MapFileV1,
    DEFAULT_MAP_DIR,
    assertMapFileV1,
    defaultImagePath,
    exportMapV1,
    importMapV1,
    normalizeMapPath,
} from "./MapFormat";

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
@Service()
export class MapDocumentService {
    private client: BridgeClient;

    constructor() {
        this.client = getBridgeClient();
    }

    private get app() {
        return App.GetInstance();
    }

    public info(): MapDocumentInfo {
        const tilemap = this.app.tilemap;
        return {
            name: tilemap.mapName,
            id: tilemap.mapId,
            path: tilemap.mapPath,
            width: tilemap.mapWidth,
            height: tilemap.mapHeight,
        };
    }

    public layout(): CompositeLayout {
        return this.app.tilesetCanvas.getLayout();
    }

    /** 이름으로 기본 저장 경로를 만든다 (resources/maps/<slug>.json) */
    public defaultPathFor(name: string): string {
        const slug = (name || "map1")
            .trim()
            .replace(/[\\/:*?"<>|]+/g, "_")
            .replace(/\s+/g, "_");
        return `${DEFAULT_MAP_DIR}/${slug || "map1"}.json`;
    }

    /** 현재 맵을 맵 포맷 v1 객체로 만든다 (파일 IO 없음) */
    public buildMapFile(meta?: { name?: string; id?: number }) {
        const tilemap = this.app.tilemap;
        return exportMapV1({
            name: meta?.name ?? tilemap.mapName,
            id: meta?.id ?? tilemap.mapId,
            width: tilemap.mapWidth,
            height: tilemap.mapHeight,
            layerCount: tilemap.layerCount,
            data: tilemap.getRawData(),
            layout: this.layout(),
            // 에디터가 아직 편집하지 못하는 데이터도 불러온 그대로 되돌려준다
            layerNames: tilemap.getLayerNames(),
            collision: tilemap.getCollision() ?? undefined,
        });
    }

    /**
     * 현재 맵을 프로젝트에 내보낸다. 맵이 쓰는 타일셋 이미지가 프로젝트에 없으면
     * 에디터가 가진 이미지를 함께 올린다 (엔진은 이미지가 없으면 맵 로드를 거부한다).
     */
    public async exportTo(path: string, meta?: { name?: string; id?: number }): Promise<ExportResult> {
        const target = normalizeMapPath(path);
        const { map, usedTilesets, droppedTiles } = this.buildMapFile(meta);
        const uploaded = await this.ensureTilesetImages(usedTilesets);
        const result = await this.client.writeJson(target, map);

        const tilemap = this.app.tilemap;
        tilemap.mapName = map.name;
        tilemap.mapId = map.id;
        tilemap.mapPath = target;

        return {
            path: result.path,
            bytes: result.bytes,
            uploadedTilesets: uploaded,
            usedTilesets: usedTilesets.map(defaultImagePath),
            droppedTiles,
        };
    }

    /** 이미 경로가 있는 맵을 같은 자리에 저장한다. 경로가 없으면 예외 (내보내기 대화상자를 띄울 것) */
    public async save(): Promise<ExportResult> {
        const path = this.app.tilemap.mapPath;
        if (!path) {
            throw new Error("아직 저장한 적이 없는 맵입니다. 내보내기(Ctrl+E)로 경로를 정하세요.");
        }
        return this.exportTo(path);
    }

    /** 프로젝트의 맵 파일 목록 (resources/maps/*.json) */
    public async listMaps(): Promise<string[]> {
        const info = await this.client.project();
        return info.maps;
    }

    /** 맵 파일 v1 을 읽어 에디터에 올린다 */
    public async open(path: string): Promise<OpenResult> {
        const target = normalizeMapPath(path);
        const raw = await this.client.readJson<unknown>(target);
        assertMapFileV1(raw);
        return this.load(raw, target);
    }

    /** 이미 읽어 둔 맵 객체를 에디터에 올린다 (경로는 저장 위치 기억용) */
    public load(map: MapFileV1, path: string | null): OpenResult {
        const tilemap = this.app.tilemap;
        const imported = importMapV1(map, this.layout(), tilemap.layerCount);
        tilemap.setRawData(imported.width, imported.height, imported.data);
        tilemap.setCollision(imported.collision ?? null);
        tilemap.setLayerNames(map.layers.map((layer) => layer.name));
        tilemap.mapName = imported.name;
        tilemap.mapId = imported.id;
        tilemap.mapPath = path;
        tilemap.setCurrentLayerId(0);
        tilemap.draw();
        return {
            path: path || "",
            name: imported.name,
            id: imported.id,
            width: imported.width,
            height: imported.height,
            unknownTilesets: imported.unknownTilesets,
            droppedLayers: imported.droppedLayers,
            unrepresentableTiles: imported.unrepresentableTiles,
        };
    }

    /** 빈 맵을 새로 만든다 */
    public newMap(opts: NewMapOptions): MapDocumentInfo {
        const tilemap = this.app.tilemap;
        const width = Math.max(1, Math.floor(opts.width));
        const height = Math.max(1, Math.floor(opts.height));
        const data = new Array<number>(width * height * tilemap.layerCount).fill(0);
        tilemap.setRawData(width, height, data);
        tilemap.mapName = opts.name || "map1";
        tilemap.mapId = opts.id || 1;
        tilemap.mapPath = null;
        tilemap.setCurrentLayerId(0);
        tilemap.draw();
        return this.info();
    }

    /** 맵 크기만 바꾼다 (겹치는 영역 유지) */
    public resize(width: number, height: number): MapDocumentInfo {
        this.app.tilemap.resize(width, height).draw();
        return this.info();
    }

    private async ensureTilesetImages(tilesets: CompositeTileset[]): Promise<string[]> {
        const uploaded: string[] = [];
        for (const ts of tilesets) {
            const path = defaultImagePath(ts);
            if (await this.client.exists(path)) continue;
            const res = await fetch(ts.src);
            if (!res.ok) {
                throw new Error(`타일셋 이미지를 읽지 못했습니다: ${ts.src} (${res.status})`);
            }
            const blob = await res.blob();
            await this.client.writeBinary(path, blob);
            uploaded.push(path);
        }
        return uploaded;
    }
}

export function getMapDocumentService(): MapDocumentService {
    return Container.get(MapDocumentService);
}
