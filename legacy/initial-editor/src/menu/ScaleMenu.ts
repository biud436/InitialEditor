export const ScaleMenuNameMap = <const>[
    "scale-1x",
    "scale-2x",
    "scale-4x",
    "scale-8x",
];

export type ScaleMenuImpl = {
    name: string;
    children: {
        [key in (typeof ScaleMenuNameMap)[number]]: {
            name: string;
            children: Partial<Record<string, unknown>>;
            action: (ev: unknown) => void;
        };
    };
};

export const ScaleMenu = <Partial<ScaleMenuImpl>>{
    name: "배율",
    children: {
        "scale-1x": {
            name: "실제 비율",
            children: {},
            action: (ev: any) => {},
        },
        "scale-2x": {
            name: "2배 축소",
            children: {},
            action: (ev: any) => {},
        },
        "scale-4x": {
            name: "4배 축소",
            children: {},
            action: (ev: any) => {},
        },
        "scale-8x": {
            name: "8배 축소",
            children: {},
            action: (ev: any) => {},
        },
    },
};
