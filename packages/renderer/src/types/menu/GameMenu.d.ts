export declare const GameMenuNameMap: readonly ["game-playtest", "game-fullscreen", "game-show-console", "game-folder-open"];
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
export declare const GameMenu: Partial<GameMenuImpl>;
