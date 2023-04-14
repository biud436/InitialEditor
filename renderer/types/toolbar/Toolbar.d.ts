import { ToolbarBase } from "./interface/toolbar.dto";
declare const Toolbar: ToolbarBase[];
/**
 * @interface ToolbarImpl
 */
interface ToolbarImpl {
    initMembers(): void;
    initMembers(selectors?: keyof HTMLElementTagNameMap): void;
    show(): void;
    hide(): void;
    unlock(): void;
    unlock(originPosition?: DOMRect): void;
}
type HTMLTagMap = keyof HTMLElementTagNameMap | string;
/**
 * @class ToolbarContainer
 */
declare class ToolbarContainer implements ToolbarImpl {
    private _element?;
    private _isReady;
    constructor(selectors: HTMLTagMap);
    initMembers(selectors?: HTMLTagMap): void;
    show(): void;
    hide(): void;
    unlock(originPosition?: DOMRect): void;
    getBoundingClientRect(): DOMRect | void;
}
/**
 * @class ToolbarManager
 * @description
 * This class allows you to control the toolbar and hide or show in the current tool.
 */
declare class ToolbarManager implements ToolbarImpl {
    _mainToolbarId: string;
    _isOpened: boolean;
    _isMovable: boolean;
    _originPosition: DOMRect;
    _toolbarContainer: ToolbarContainer;
    constructor();
    initMembers(): void;
    /**
     * Shows up the toolbar.
     */
    show(): void;
    /**
     * Hides out the toolbar.
     */
    hide(): void;
    lock(): void;
    unlock(): void;
    getElement<T extends Element>(e: ToolbarBase): T;
    create(): void;
}
export { Toolbar, ToolbarManager };
