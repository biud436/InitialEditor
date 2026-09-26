declare class InitialDOM {
    static query<T extends Element = Element>(selectors: string): T | null;
    static queryAll<T extends Element = Element>(selectors: string): NodeListOf<T>;
    static fetch<K extends keyof HTMLElementTagNameMap>(tagName: K, options?: ElementCreationOptions): HTMLElementTagNameMap[K];
    /**
     * 리액트 스타일의 css 바인딩을 사용할 수 있습니다.
     *
     * @param strings
     * @param values
     * @returns
     */
    static css(strings: TemplateStringsArray, ...values: any[]): string;
    static createStyleTagName(): string;
}
export default InitialDOM;
