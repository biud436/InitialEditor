import { ipcRenderer } from "electron";
import { makeAutoObservable } from "mobx";

export class UIStore {
    constructor() {
        makeAutoObservable(this);
    }
}

export const uiStore = new UIStore();
