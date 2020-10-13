/**
 * @class TilesetMarker
 */
export class TilesetMarker extends Component {
    constructor(...args: any[]);
    _config: any;
    _tileWidth: any;
    _tileHeight: any;
    _isReady: boolean;
    initWithElement(): void;
    _element: JQuery<HTMLElement>;
    _isDraw: boolean;
    _isClicked: boolean;
    _blockSize: BlockSize;
    touches: {
        x: number;
        y: number;
    }[];
}
import { Component } from "./Component.js";
declare class BlockSize {
    constructor(x: any, y: any, width: any, height: any);
    _x: any;
    _y: any;
    _width: any;
    _height: any;
    _parent: any;
    set width(arg: any);
    get width(): any;
    set height(arg: any);
    get height(): any;
    set x(arg: any);
    get x(): any;
    set y(arg: any);
    get y(): any;
    setParent(parent: any): void;
    refresh(): void;
}
export {};
