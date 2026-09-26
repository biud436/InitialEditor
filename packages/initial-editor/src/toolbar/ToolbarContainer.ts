import { HTMLTagMap } from "./Toolbar";
import { ToolbarImpl } from "./ToolbarImpl";

/**
 * @class ToolbarContainer
 */
export class ToolbarContainer implements ToolbarImpl {
    private _element?: HTMLElement;
    private _isReady = false;

    constructor(selectors: HTMLTagMap) {
        this.initMembers(selectors);
    }

    initMembers(selectors?: HTMLTagMap): void {
        if (selectors) {
            this._element = document.querySelector<HTMLElement>(selectors)!;
            this._isReady = true;
        }
    }

    show(): void {
        if (!this._isReady) return;
        if (!this._element) return;
        this._element.style.display = "block";
    }

    hide(): void {
        if (!this._isReady) return;
        if (!this._element) return;
        this._element.style.display = "none";
    }

    unlock(originPosition?: DOMRect): void {
        if (!this._isReady) return;
        if (!this._element) return;
        if (originPosition) {
            this._element.style.left = originPosition.x + "px";
            this._element.style.top = originPosition.y + "px";
        }
    }

    getBoundingClientRect(): DOMRect | void {
        if (!this._isReady) return;
        if (!this._element) return;
        return this._element.getBoundingClientRect();
    }
}
