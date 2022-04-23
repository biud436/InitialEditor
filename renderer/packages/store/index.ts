import App from "../app";

/**
 * @class Store
 */
export class Store<T = any> {
    protected data: Record<string, T> = {};

    set(key: string, value: T) {
        this.data[key] = value;
    }

    get(key: string): T | undefined {
        return this.data[key];
    }

    forEach(callback: (value: T, key: string) => void) {
        const keys = Object.keys(this.data);
        keys.forEach((key) => {
            callback(this.data[key], key);
        });
    }
}

export type InitialAction = (...args: any[]) => void;

/**
 * @class InitialStore
 */
export class InitialStore {
    private _fetchStore: Store<InitialAction>;

    constructor(private readonly _app = App.GetInstance()) {
        this._fetchStore = new Store();
    }

    set(key: string, action: InitialAction): InitialStore {
        this._fetchStore.set(key, action);
        const uniqueKey = this.getUniqueKey(key);
        this._app.on(uniqueKey, action);

        return this;
    }

    startHook(): () => void {
        return () => {
            this._fetchStore.forEach((action, key) => {
                this._app.on(this.getUniqueKey(key), action);
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
