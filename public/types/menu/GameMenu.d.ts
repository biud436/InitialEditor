export namespace GameMenu {
    const name: string;
    const children: {
        "game-playtest": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
        "game-fullscreen": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
        "game-show-console": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
        "game-folder-open": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
    };
}
