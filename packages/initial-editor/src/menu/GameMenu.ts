import { ElectronService } from "../ElectronService";

export const GameMenuNameMap = <const>[
    "game-playtest",
    "game-fullscreen",
    "game-show-console",
    "game-folder-open",
];

export type GameMenuImpl = {
    name: string;
    children: {
        [key in (typeof GameMenuNameMap)[number]]: {
            name: string;
            children: Partial<Record<string, any>>;
            action?: (ev: any) => void;
        };
    };
};

export const GameMenu = <Partial<GameMenuImpl>>{
    name: "게임",
    children: {
        "game-playtest": {
            name: "플레이 테스트",
            children: {},
            action: (ev: any) => {
                alert("플레이 테스트 기능을 지원하지 않습니다.");
            },
        },
        "game-fullscreen": {
            name: "전체 화면",
            children: {},
            action: (ev: any) => {},
        },
        "game-show-console": {
            name: "콘솔 표시",
            children: {},
            action: (ev: any) => {},
        },
        "game-folder-open": {
            name: "게임 폴더 열기",
            children: {},
            action: (ev: any) => {
                const service = new ElectronService();
                service.openFolder();
            },
        },
    },
};
