import { FileMenu } from "./FileMenu";
import { EditMenu } from "./EditMenu";
import { ModeMenu } from "./ModeMenu";
import { DrawMenu } from "./DrawMenu";
import { ScaleMenu } from "./ScaleMenu";
import { ToolMenu } from "./ToolMenu";
import { GameMenu } from "./GameMenu";
import { HelpMenu } from "./HelpMenu";

// type MenuType =
//     | "file"
//     | "edit"
//     | "mode"
//     | "draw"
//     | "scale"
//     | "tools"
//     | "game"
//     | "help";
// type InferMenuImpl<T> = Partial<
//     T extends `${infer String}${infer MenuImpl}` ? `${String}${MenuImpl}` : any
// >;
// type Menu = {
//     [key in MenuType]: InferMenuImpl<`File`>;
// };

const KoreanMenu = {
    file: FileMenu,
    edit: EditMenu,
    mode: ModeMenu,
    draw: DrawMenu,
    scale: ScaleMenu,
    tools: ToolMenu,
    game: GameMenu,
    help: HelpMenu,
    // $font: {
    //     size: "8pt",
    // },
};

export type MenuKeys = keyof typeof KoreanMenu;

export { KoreanMenu };
