import Rectangle from "./Rectangle";
export interface BlockRect {
    isDrawing: boolean;
    rect: Rectangle;
}
export declare namespace WindowGroup {
    enum Theme {
        Light = 1,
        Dark = 2
    }
}
export declare type InitialEventListener = Partial<{
    touchmove: (ev: any) => void | HTMLElementEventMap["touchmove"];
    mousemove: (ev: any) => void | HTMLElementEventMap["mousemove"];
    mousedown: (ev: any) => void | HTMLElementEventMap["mousedown"];
    mouseup: (ev: any) => void | HTMLElementEventMap["mouseup"];
    mouseover: (ev: any) => void | HTMLElementEventMap["mouseover"];
    [key: string]: (ev: any) => void | HTMLElementEventMap[keyof HTMLElementEventMap];
}>;
