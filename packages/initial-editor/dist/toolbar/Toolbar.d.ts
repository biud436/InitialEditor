import { ToolbarBase } from "./interface/toolbar.dto";
import { ToolbarContainer } from "./ToolbarContainer";
import { ToolbarImpl } from "./ToolbarImpl";
declare const Toolbar: ToolbarBase[];
export type HTMLTagMap = keyof HTMLElementTagNameMap | string;
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
