import { PlayTestCommand } from "./commands/game/PlayTestCommand";
import { OpenGameFolderCommand } from "./commands/game/OpenGameFolderCommand";
import { ShowConsoleCommand } from "./commands/game/ShowConsoleCommand";
import { FullscreenCommand } from "./commands/game/FullscreenCommand";
export const GameMenuNameMap = [
    "game-playtest",
    "game-fullscreen",
    "game-show-console",
    "game-folder-open",
];
export const GameMenu = {
    name: "게임",
    children: {
        "game-playtest": new PlayTestCommand(),
        "game-fullscreen": new FullscreenCommand(),
        "game-show-console": new ShowConsoleCommand(),
        "game-folder-open": new OpenGameFolderCommand(),
    },
};
//# sourceMappingURL=GameMenu.js.map