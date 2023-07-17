declare class InitialDOM {
    query<T extends Element = Element>(selectors: string): T | null;
    fetch<K extends keyof HTMLElementTagNameMap>(tagName: K, options?: ElementCreationOptions): HTMLElementTagNameMap[K];
}
declare const _default: InitialDOM;
export default _default;
