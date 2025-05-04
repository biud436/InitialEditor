import { HTMLTagMap } from "./Toolbar";
import { ToolbarImpl } from "./ToolbarImpl";
/**
 * @class ToolbarContainer
 */
export declare class ToolbarContainer implements ToolbarImpl {
    private _element?;
    private _isReady;
    constructor(selectors: HTMLTagMap);
    initMembers(selectors?: HTMLTagMap): void;
    show(): void;
    hide(): void;
    unlock(originPosition?: DOMRect): void;
    getBoundingClientRect(): DOMRect | void;
}
