import { ElectronService } from "../ElectronService";
import { PlayTestCommand } from "./commands/game/PlayTestCommand";
import { OpenGameFolderCommand } from "./commands/game/OpenGameFolderCommand";
import { ShowConsoleCommand } from "./commands/game/ShowConsoleCommand";
import { FullscreenCommand } from "./commands/game/FullscreenCommand";

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
        "game-playtest": new PlayTestCommand(),
        "game-fullscreen": new FullscreenCommand(),
        "game-show-console": new ShowConsoleCommand(),
        "game-folder-open": new OpenGameFolderCommand(),
    },
};
