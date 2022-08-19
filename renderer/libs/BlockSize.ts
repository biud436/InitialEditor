export class BlockSize {
    private _x = 0;
    private _y = 0;
    private _width = 0;
    private _height = 0;
    private _parent: JQuery<HTMLElement> | null;

    constructor(x: number, y: number, width: number, height: number) {
        this._x = x;
        this._y = y;
        this._width = width;
        this._height = height;
        this._parent = null;
    }

    set width(value) {
        this._width = value;
    }

    set height(value) {
        this._height = value;
    }

    get width() {
        return this._width;
    }

    get height() {
        return this._height;
    }

    set x(value) {
        this._x = value;
    }

    set y(value) {
        this._y = value;
    }

    get x() {
        return this._x;
    }

    get y() {
        return this._y;
    }

    public setParent(parent: JQuery<HTMLElement>) {
        this._parent = parent;
    }

    public refresh() {
        this._parent?.css({
            width: this.width,
            height: this.height,
            left: this._x,
            top: this._y,
            position: "absolute",
        });
    }
}
