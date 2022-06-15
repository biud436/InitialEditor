import { ipcRenderer } from "electron";
import { makeAutoObservable } from "mobx";

export class UIStore {
    /**
     * 창 제목 입니다.
     */
    titleName = "Initial Editor - 맵 에디터";

    constructor() {
        makeAutoObservable(this);
    }
}

export const uiStore = new UIStore();
