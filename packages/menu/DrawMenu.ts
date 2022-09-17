import { DrawingCommand } from "./commands/DrawCommand";

export const DrawMenuNameMap = <const>[
    "draw-pencil",
    "draw-rectangle",
    "draw-ellipse",
    "draw-ellipse",
    "draw-flood-fill",
    "draw-shadow-pen",
];

export const PenTypeNameMap = <const>[
    "펜",
    "정사각형",
    "원형",
    "채우기",
    "그림자",
];

export type DrawMenuImpl = {
    name: string;
    children: {
        [key in typeof DrawMenuNameMap[number]]: {
            name: typeof PenTypeNameMap[number];
            children: Partial<Record<string, any>>;
            action: (ev: any) => void;
        };
    };
    [key: string]: any;
};

export const DrawMenu = <Partial<DrawMenuImpl>>{
    name: "그리기",
    children: {
        "draw-pencil": new DrawingCommand.DrawPencilCommand(),
        "draw-rectangle": new DrawingCommand.DrawRectangleCommand(),
        "draw-ellipse": new DrawingCommand.DrawEllipseCommand(),
        "draw-flood-fill": new DrawingCommand.DrawFloodFillCommand(),
        "draw-shadow-pen": new DrawingCommand.DrawShadowPen(),
    },
};
