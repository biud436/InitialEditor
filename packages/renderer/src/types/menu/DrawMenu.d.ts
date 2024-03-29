export declare const DrawMenuNameMap: readonly ["draw-pencil", "draw-rectangle", "draw-ellipse", "draw-ellipse", "draw-flood-fill", "draw-shadow-pen"];
export declare const PenTypeNameMap: readonly ["펜", "정사각형", "원형", "채우기", "그림자"];
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
export declare const DrawMenu: Partial<DrawMenuImpl>;
