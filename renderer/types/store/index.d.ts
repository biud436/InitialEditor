import App from "../app";
import Store from "electron-store";
/**
 * @class Store
 */
export declare class DataStore<T = any> extends Store {
    forEach(callback: (value: T, key: string) => void): void;
}
export type InitialAction = (...args: any[]) => void;
export declare const store: Store<Record<string, unknown>>;
/**
 * 기본 일렉트론 스토어를 반환합니다.
 * @returns
 */
export declare function useStore(): Store<Record<string, unknown>>;
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
