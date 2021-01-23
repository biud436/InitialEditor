export default class TilesetCanvas {
    constructor(...args: any[]);
    initMembers(...args: any[]): void;
    _config: any;
    _isReady: boolean;
    _tilesetImgages: any;
    start(): Promise<any>;
    loadTilesets(): Promise<any>;
    _tilesets: any[];
    /**
     * 이 메소드는 타일셋을 지우고 다시 처음부터 그립니다.
     * 새로운 이미지가 있으면 맨 아래에 추가됩니다.
     */
    refreshTilesets(newTileset: any): Promise<void>;
    createCanvas(): void;
    _parent: JQuery<HTMLElement>;
    _canvas: JQuery<HTMLElement>;
    /**
     * @type {CanvasRenderingContext2D}
     */
    _context: CanvasRenderingContext2D;
}
