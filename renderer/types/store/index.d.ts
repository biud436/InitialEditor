import App from "../app";
/**
 * @class Store
 */
export declare class Store<T = any> {
    protected data: Record<string, T>;
    set(key: string, value: T): void;
    get(key: string): T | undefined;
    forEach(callback: (value: T, key: string) => void): void;
}
export declare type InitialAction = (...args: any[]) => void;
/**
 * @class InitialStore
 */
export declare class InitialStore {
    static INSTANCE: InitialStore;
    private _app;
    static GetInstance(app?: App): InitialStore;
    private _fetchStore;
    constructor();
    set app(app: App);
    get app(): App;
    set(key: string, action: InitialAction): InitialStore;
    startHook(app: App): () => void;
    getUniqueKey(key: string): string;
    dispatch(key: string, ...args: any[]): void;
}
