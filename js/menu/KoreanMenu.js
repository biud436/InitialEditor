import { FileMenu } from "./FileMenu.js";
import { EditMenu } from "./EditMenu.js";
import { ModeMenu } from "./ModeMenu.js";
import { DrawMenu } from "./DrawMenu.js";
import { ScaleMenu } from "./ScaleMenu.js";
import { ToolMenu } from "./ToolMenu.js";
import { GameMenu } from "./GameMenu.js";
import { HelpMenu } from "./HelpMenu.js";

const KoreanMenu = {
    file: FileMenu,
    edit: EditMenu,
    mode: ModeMenu,
    draw: DrawMenu,
    scale: ScaleMenu,
    tools: ToolMenu,
    game: GameMenu,
    help: HelpMenu,
    "$font": {
        size: "8pt",
    }
};

export {KoreanMenu};