import { Component } from "./component";
export interface MarkerRange {
    lastTileID: number;
    targetX: number;
    targetY: number;
}
/**
 * @class TilesetMarker
 * @description
 * This class allows you to select a range of tiles or select a single tile.
 */
declare class TilesetMarker extends Component {
    protected _config: any;
    /** tile width */
    protected _tileWidth: number;
    /** tile height */
    protected _tileHeight: number;
    protected _isReady: boolean;
    protected _element: HTMLDivElement;
    protected _isDraw: boolean;
    protected _isClicked: boolean;
    protected _blockSize: BlockSize;
    protected touches: Array<{
        x: number;
        y: number;
    }>;
    protected _isDragging: boolean;
    /**
     * 마지막 타일 ID
     */
    protected _lastTileId: number;
    protected _tiles: number[];
    static DRAGGING_DELAY: number;
    initMembers(...args: any[]): void;
    initWithElement(): void;
    start(...args: any[]): this;
    update(...args: any[]): void;
    onChangeTileID(range: MarkerRange): void;
    /**
     * 드래그가 시작될 떄 호출됩니다.
     * @param args
     */
    onDragEnter(...args: any[]): void;
    updateBlockSize(x: number, y: number, width: number, height: number): void;
    /**
     * 드래그가 종료될 때 호출됩니다.
     * @param args
     */
    onDragLeave(...args: any[]): void;
}
declare class BlockSize {
    private _x;
    private _y;
    private _width;
    private _height;
    private _parent;
    constructor(x: number, y: number, width: number, height: number);
    set width(value: number);
    set height(value: number);
    get width(): number;
    get height(): number;
    set x(value: number);
    set y(value: number);
    get x(): number;
    get y(): number;
    setParent(parent: HTMLDivElement): void;
    refresh(): void;
}
export { TilesetMarker };
