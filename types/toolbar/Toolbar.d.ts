export const Toolbar: any[];
/**
 * @class ToolbarManager
 * @description
 * This class allows you to control the toolbar and hide or show in the current tool.
 */
export class ToolbarManager {
    initMembers(): void;
    _mainToolbarId: string;
    _isOpened: boolean;
    _isMovable: boolean;
    _originPosition: DOMRect;
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
    create(): void;
}
