export default class Rectangle {

    constructor(x, y, width, height) {
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

    set height(value) {
        this._height = value;
    }

    contains(mx, my) {
        const x = this._x;
        const y = this._y;
        const width = this._width;
        const height = this._height;
        return mx >= x && mx <= (x + width) && my >= y && my <= (y + height);
    }
}

Rectangle.EMPTY = new Rectangle(0, 0, 0, 0);