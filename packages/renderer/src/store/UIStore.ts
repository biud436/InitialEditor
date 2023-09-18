import { makeAutoObservable } from 'mobx';

export class UIStore {
    /**
     * 윈도우 타이틀 바 이름
     * TODO: 설정 파일로 분리시키는 것이 좋습니다.
     */
    windowTitleBarName = 'Initial Editor - 맵 에디터';

    constructor() {
        makeAutoObservable(this);
    }
}

export const uiStore = new UIStore();
