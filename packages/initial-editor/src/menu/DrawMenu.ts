import { DrawingCommandCollection } from "./commands/draw/DrawCommandCollection";

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
        [key in (typeof DrawMenuNameMap)[number]]: {
            name: (typeof PenTypeNameMap)[number];
            children: Partial<Record<string, unknown>>;
            action: (ev: unknown) => void;
        };
    };
    [key: string]: unknown;
};

export const DrawMenu = <Partial<DrawMenuImpl>>{
    name: "그리기",
    children: {
        "draw-pencil": new DrawingCommandCollection.DrawPencilCommand(),
        "draw-rectangle": new DrawingCommandCollection.DrawRectangleCommand(),
        "draw-ellipse": new DrawingCommandCollection.DrawEllipseCommand(),
        "draw-flood-fill": new DrawingCommandCollection.DrawFloodFillCommand(),
        "draw-shadow-pen": new DrawingCommandCollection.DrawShadowPen(),
    },
};
