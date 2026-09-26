import { makeAutoObservable } from "mobx";

export type ThemeMap = "light" | "dark";

export class ThemeStore {
    private _theme: ThemeMap = "dark";

    constructor() {
        makeAutoObservable(this);
    }

    changeTheme(theme: ThemeMap) {
        this._theme = theme;
    }

    get theme() {
        return this._theme;
    }
}

export const themeStore = new ThemeStore();
