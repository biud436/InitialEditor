import App from "../app";
import Store from "electron-store";

/**
 * @class Store
 */
export class DataStore<T = any> extends Store {
    forEach(callback: (value: T, key: string) => void) {
        // const keys = Object.keys(this.data);
        // keys.forEach((key) => {
        //     callback(this.data[key], key);
        // });

        const keys = Object.keys(this.store);
        keys.forEach((key) => {
            callback(this.store[key] as any, key);
        });
    }
}

export type InitialAction = (...args: any[]) => void;
export const store = new Store();

/**
 * 기본 일렉트론 스토어를 반환합니다.
 * @returns
 */
export function useStore() {
    return store;
}

/**
 * @class InitialStore
 */
export class InitialStore {
    public static INSTANCE: InitialStore;
    private _app!: App;

    public static GetInstance(app?: App): InitialStore {
        if (!InitialStore.INSTANCE) {
            InitialStore.INSTANCE = new InitialStore();

            if (!InitialStore.INSTANCE.app) {
                InitialStore.INSTANCE.app = <App>app;
            }
            InitialStore.INSTANCE.app.emit(
                "store:ready",
                InitialStore.INSTANCE
            );
        }

        return InitialStore.INSTANCE;
    }

    private _fetchStore: DataStore<InitialAction>;

    constructor() {
        this._fetchStore = new DataStore();
    }

    set app(app: App) {
        this._app = app;
    }

    get app() {
        return this._app;
    }

    set(key: string, action: InitialAction): InitialStore {
        this._fetchStore.set(key, action);
        const uniqueKey = this.getUniqueKey(key);
        this._app.on(uniqueKey, action);

        return this;
    }

    startHook(app: App): () => void {
        return () => {
            this._fetchStore.forEach((action, key) => {
                app.on(this.getUniqueKey(key), action);
            });
        };
    }

    getUniqueKey(key: string) {
        return `store:${key}`;
    }

    dispatch(key: string, ...args: any[]) {
        const currentAction = this._fetchStore.get(key);

        if (currentAction) {
            this._app.emit(this.getUniqueKey(key), ...args);
        }
    }
}
