export interface MouseButton<T extends Element = Element> {
    /**
     * 왼쪽 버튼을 누르고 있을 때
     */
    left: boolean;
    /**
     * 왼쪽 버튼을 눌렀다 뗐을 때
     */
    leftFire: boolean;
    /**
     * 마우스 버튼을 클릭한 순간, 최상위 요소
     */
    menuTarget?: T;
}

export type Mouse = {
    /**
     * x 좌표
     */
    x: number;
    /**
     * y 좌표
     */
    y: number;
    /**
     * 스크린 상에서의 x좌표
     */
    screenX: number;
    /**
     * 스크린 상에서의 y좌표
     */
    screenY: number;

    buttons: MouseButton;
    /**
     * @type {HTMLElement}
     */
    target: HTMLElement;
    /**
     * @type {HTMLElement}
     */
    menuTarget?: HTMLElement;
    isDrawing: boolean;
    startX: number;
    startY: number;
    dragTime: number;
};
