import { makeAutoObservable } from "mobx";

export default class Rectangle {
    private _x: number;
    private _y: number;
    private _width: number;
    private _height: number;

    public static EMPTY = new Rectangle(0, 0, 0, 0);

    constructor(x: number, y: number, width: number, height: number) {
        // makeAutoObservable(this);
        this._x = x;
        this._y = y;
        this._width = width;
        this._height = height;
    }

    get x() {
        return this._x;
    }

    get y() {
        return this._x;
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
        this._x = value;
    }

    set width(value) {
        this._width = value;
    }

    set height(value: number) {
        this._height = value;
    }

    public contains(mx: number, my: number): boolean {
        const x = this._x;
        const y = this._y;
        const width = this._width;
        const height = this._height;
        return mx >= x && mx <= x + width && my >= y && my <= y + height;
    }
}
