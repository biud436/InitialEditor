export interface Mouse {
    x: number;
    y: number;
    screenX: number;
    screenY: number;
    buttons: {
        left: boolean;
        leftFire: boolean;
    };
    /**
     * @type {HTMLElement}
     */
    target: HTMLElement;
    /**
     * @type {HTMLElement}
     */
    menuTarget: HTMLElement;
    startX: number;
    startY: number;    
}
