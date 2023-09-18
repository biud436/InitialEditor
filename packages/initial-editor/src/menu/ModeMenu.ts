export const ModeMenuNameMap = <const>["mode-map", "mode-event", "mode-region"];

export type ModeMenuImpl = {
    name: string;
    children: {
        [key in (typeof ModeMenuNameMap)[number]]: {
            name: string;
            children: Partial<Record<string, any>>;
        };
    };
};

export const ModeMenu = <Partial<ModeMenuImpl>>{
    name: "모드",
    children: {
        "mode-map": {
            name: "맵",
            children: {},
        },
        "mode-event": {
            name: "이벤트",
            children: {},
        },
        "mode-region": {
            name: "지역",
            children: {},
        },
    },
};
