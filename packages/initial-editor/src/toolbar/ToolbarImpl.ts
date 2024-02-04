/**
 * @interface ToolbarImpl
 */
export interface ToolbarImpl {
    initMembers(): void;
    initMembers(selectors?: keyof HTMLElementTagNameMap): void;

    show(): void;
    hide(): void;

    unlock(): void;
    unlock(originPosition?: DOMRect): void;
}
