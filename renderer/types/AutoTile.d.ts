import { EventEmitter } from "./EventEmitter";
interface Point {
    x: number;
    y: number;
}
interface Tile extends Point {
    width: number;
    height: number;
}
/**
 * @class AutoTile
 * @see
 * <a href="http://www.cr31.co.uk/stagecast/wang/blob.html">reference</a>
 */
export declare class AutoTile extends EventEmitter {
    /**
     * Wang Blob 6 x 8 Layout (RM-Custom)
     */
    static TABLE: number[];
    static TABLE2: number[];
    static COLS: number;
    static ROWS: number;
    private _normalTile;
    private _filename;
    constructor(filename: string);
    findNormalTile(): Tile;
    /**
     * 이미지가 오토타일인 지 감별합니다.
     *
     * @param filename
     * @return Promise<PIXI.Sprite>
     */
    checkToValidAutoTile(filename: string): Promise<PIXI.Sprite>;
}
export {};
