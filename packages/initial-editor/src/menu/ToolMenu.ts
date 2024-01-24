import { ToolsOptionsCommand } from "./commands/ToolsOptionsCommand";

export const ToolMenuNameMap = <const>[
    "tools-database",
    "tools-resource-manager",
    "tools-script-eidtor",
    "tools-sound-test",
    "tools-options",
];

export type ToolMenuImpl = {
    name: string;
    children: {
        [key in (typeof ToolMenuNameMap)[number]]: {
            name: string;
            children: Partial<Record<string, any>>;
            action: (ev: any) => void;
        };
    };
};

export const ToolMenu = <Partial<ToolMenuImpl>>{
    name: "도구",
    children: {
        "tools-database": {
            name: "데이터베이스",
            children: {},
            action: (ev: any) => {},
        },
        "tools-resource-manager": {
            name: "소재 관리자",
            children: {},
            action: (ev: any) => {},
        },
        "tools-script-eidtor": {
            name: "스크립트 에디터",
            children: {},
            action: (ev: any) => {},
        },
        "tools-sound-test": {
            name: "사운드 테스트",
            children: {},
        },
        "tools-options": new ToolsOptionsCommand(),
    },
};
