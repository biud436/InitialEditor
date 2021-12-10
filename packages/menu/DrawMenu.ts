import { WindowCreator } from "../WindowCreator";

const DrawMenu = {
    name: "그리기",
    children: {
        "draw-pencil": {
            name: "펜",
            children: {},
            action: (ev: any) => {
                window.app.emit("tilemap:drawingType", 0);
            }
        },
        "draw-rectangle": {
            name: "정사각형",
            children: {},
            action: (ev: any) => {
                window.app.emit("tilemap:drawingType", 1);
            }
        },
        "draw-ellipse": {
            name: "직사각형",
            children: {},
            action: (ev: any) => {
                window.app.emit("tilemap:drawingType", 2);
            }
        },
        "draw-flood-fill": {
            name: "채우기",
            children: {},
            action: (ev: any) => {
                window.app.emit("tilemap:drawingType", 3);
            }
        },
        "draw-shadow pen": {
            name: "그림자",
            children: {},
            action: (ev: any) => {}
        }
    }
};

export { DrawMenu };
