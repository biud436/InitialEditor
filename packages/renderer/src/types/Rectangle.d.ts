export default class Rectangle {
    private _x;
    private _y;
    private _width;
    private _height;
    static EMPTY: Rectangle;
    constructor(x: number, y: number, width: number, height: number);
    get x(): number;
    get y(): number;
    get width(): number;
    get height(): number;
    set x(value: number);
    set y(value: number);
    set width(value: number);
    set height(value: number);
    contains(mx: number, my: number): boolean;
}
