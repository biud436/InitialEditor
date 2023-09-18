import "reflect-metadata";
export default class TilesetCanvas {
    private _config;
    private _isReady;
    private _tilesetImgages;
    private _tilesets;
    private _parent;
    private _canvas;
    private _context;
    constructor(...args: any[]);
    initMembers(...args: any[]): void;
    start(...args: any[]): Promise<unknown>;
    loadTilesets(): Promise<unknown>;
    /**
     * 이 메소드는 타일셋을 지우고 다시 처음부터 그립니다.
     * 새로운 이미지가 있으면 맨 아래에 추가됩니다.
     */
    refreshTilesets(newTileset: string): Promise<void>;
    createCanvas(): void;
}
