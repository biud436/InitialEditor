declare class InitialDOM {
    query<T extends Element = Element>(selectors: string): T | null;
    fetch<K extends keyof HTMLElementTagNameMap>(tagName: K, options?: ElementCreationOptions): HTMLElementTagNameMap[K];
    /**
     * 리액트 스타일의 css 바인딩을 사용할 수 있습니다.
     *
     * @param strings
     * @param values
     * @returns
     */
    css(strings: TemplateStringsArray, ...values: any[]): string;
}
declare const _default: InitialDOM;
export default _default;
