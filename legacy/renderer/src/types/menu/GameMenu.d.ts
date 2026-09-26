export declare const GameMenuNameMap: readonly ["game-playtest", "game-fullscreen", "game-show-console", "game-folder-open"];
export type GameMenuImpl = {
    name: string;
    children: {
        [key in (typeof GameMenuNameMap)[number]]: {
            name: string;
            children: Partial<Record<string, unknown>>;
            action?: (ev: unknown) => void;
        };
    };
};
export declare const GameMenu: Partial<GameMenuImpl>;
