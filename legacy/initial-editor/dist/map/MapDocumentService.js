var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Service } from "typedi";
import Container from "typedi";
import App from "../app";
import { getBridgeClient } from "../bridge/BridgeClient";
import { DEFAULT_MAP_DIR, assertMapFileV1, defaultImagePath, exportMapV1, importMapV1, normalizeMapPath, } from "./MapFormat";
/**
 * 맵 문서의 저장, 내보내기, 불러오기, 새로 만들기.
 * 타일맵(데이터)과 합성 타일셋 캔버스(전역 ID 해석)를 읽고, 브리지로 프로젝트에 읽고 쓴다.
 * 변환 자체는 map/MapFormat.ts 의 순수 함수가 맡는다.
 */
let MapDocumentService = class MapDocumentService {
    constructor() {
        this.client = getBridgeClient();
    }
    get app() {
        return App.GetInstance();
    }
    info() {
        const tilemap = this.app.tilemap;
        return {
            name: tilemap.mapName,
            id: tilemap.mapId,
            path: tilemap.mapPath,
            width: tilemap.mapWidth,
            height: tilemap.mapHeight,
        };
    }
    layout() {
        return this.app.tilesetCanvas.getLayout();
    }
    /** 이름으로 기본 저장 경로를 만든다 (resources/maps/<slug>.json) */
    defaultPathFor(name) {
        const slug = (name || "map1")
            .trim()
            .replace(/[\\/:*?"<>|]+/g, "_")
            .replace(/\s+/g, "_");
        return `${DEFAULT_MAP_DIR}/${slug || "map1"}.json`;
    }
    /** 현재 맵을 맵 포맷 v1 객체로 만든다 (파일 IO 없음) */
    buildMapFile(meta) {
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
    async exportTo(path, meta) {
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
    async save() {
        const path = this.app.tilemap.mapPath;
        if (!path) {
            throw new Error("아직 저장한 적이 없는 맵입니다. 내보내기(Ctrl+E)로 경로를 정하세요.");
        }
        return this.exportTo(path);
    }
    /** 프로젝트의 맵 파일 목록 (resources/maps/*.json) */
    async listMaps() {
        const info = await this.client.project();
        return info.maps;
    }
    /** 맵 파일 v1 을 읽어 에디터에 올린다 */
    async open(path) {
        const target = normalizeMapPath(path);
        const raw = await this.client.readJson(target);
        assertMapFileV1(raw);
        return this.load(raw, target);
    }
    /** 이미 읽어 둔 맵 객체를 에디터에 올린다 (경로는 저장 위치 기억용) */
    load(map, path) {
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
    newMap(opts) {
        const tilemap = this.app.tilemap;
        const width = Math.max(1, Math.floor(opts.width));
        const height = Math.max(1, Math.floor(opts.height));
        const data = new Array(width * height * tilemap.layerCount).fill(0);
        tilemap.setRawData(width, height, data);
        tilemap.mapName = opts.name || "map1";
        tilemap.mapId = opts.id || 1;
        tilemap.mapPath = null;
        tilemap.setCurrentLayerId(0);
        tilemap.draw();
        return this.info();
    }
    /** 맵 크기만 바꾼다 (겹치는 영역 유지) */
    resize(width, height) {
        this.app.tilemap.resize(width, height).draw();
        return this.info();
    }
    async ensureTilesetImages(tilesets) {
        const uploaded = [];
        for (const ts of tilesets) {
            const path = defaultImagePath(ts);
            if (await this.client.exists(path))
                continue;
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
};
MapDocumentService = __decorate([
    Service(),
    __metadata("design:paramtypes", [])
], MapDocumentService);
export { MapDocumentService };
export function getMapDocumentService() {
    return Container.get(MapDocumentService);
}
//# sourceMappingURL=MapDocumentService.js.map