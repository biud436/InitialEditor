import Rectangle from "./Rectangle";

export interface BlockRect {
    isDrawing: boolean;
    rect: Rectangle;
}

export namespace WindowGroup {
    export enum Theme {
        Light = 1,
        Dark = 2,
    }
}
export type InitialEventListener = Partial<{
    touchmove: (ev: any) => void;
    mousemove: (ev: any) => void;
    mousedown: (ev: any) => void;
    mouseup: (ev: any) => void;
    mouseover: (ev: any) => void;
    [key: string]: (ev: any) => void;
}>;
