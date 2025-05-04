/**
 * @class ToolbarContainer
 */
export class ToolbarContainer {
    constructor(selectors) {
        this._isReady = false;
        this.initMembers(selectors);
    }
    initMembers(selectors) {
        if (selectors) {
            this._element = document.querySelector(selectors);
            this._isReady = true;
        }
    }
    show() {
        if (!this._isReady)
            return;
        if (!this._element)
            return;
        this._element.style.display = "block";
    }
    hide() {
        if (!this._isReady)
            return;
        if (!this._element)
            return;
        this._element.style.display = "none";
    }
    unlock(originPosition) {
        if (!this._isReady)
            return;
        if (!this._element)
            return;
        if (originPosition) {
            this._element.style.left = originPosition.x + "px";
            this._element.style.top = originPosition.y + "px";
        }
    }
    getBoundingClientRect() {
        if (!this._isReady)
            return;
        if (!this._element)
            return;
        return this._element.getBoundingClientRect();
    }
}
//# sourceMappingURL=ToolbarContainer.js.map