import { DrawingCommandCollection } from "./commands/draw/DrawCommandCollection";
export const DrawMenuNameMap = [
    "draw-pencil",
    "draw-rectangle",
    "draw-ellipse",
    "draw-ellipse",
    "draw-flood-fill",
    "draw-shadow-pen",
];
export const PenTypeNameMap = [
    "펜",
    "정사각형",
    "원형",
    "채우기",
    "그림자",
];
export const DrawMenu = {
    name: "그리기",
    children: {
        "draw-pencil": new DrawingCommandCollection.DrawPencilCommand(),
        "draw-rectangle": new DrawingCommandCollection.DrawRectangleCommand(),
        "draw-ellipse": new DrawingCommandCollection.DrawEllipseCommand(),
        "draw-flood-fill": new DrawingCommandCollection.DrawFloodFillCommand(),
        "draw-shadow-pen": new DrawingCommandCollection.DrawShadowPen(),
    },
};
//# sourceMappingURL=DrawMenu.js.map