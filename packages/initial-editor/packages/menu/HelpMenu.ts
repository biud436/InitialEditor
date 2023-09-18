export const HelpMenuNameMap = <const>["help-contents", "help-about"];

export type HelpMenuImpl = {
    name: string;
    children: {
        [key in typeof HelpMenuNameMap[number]]: {
            name: string;
            children: Partial<Record<string, any>>;
            action: (ev: any) => void;
        };
    };
};

export const HelpMenu = <Partial<HelpMenuImpl>>{
    name: "도움말",
    children: {
        "help-contents": {
            name: "도움말",
            children: {},
            action: (ev: any) => {
                alert("도움말이 아직 없습니다.");
            },
        },
        "help-about": {
            name: "버전 정보",
            children: {},
            action: (ev: any) => {},
        },
    },
};
