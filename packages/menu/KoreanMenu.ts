import { FileMenu } from "./FileMenu";
import { EditMenu } from "./EditMenu";
import { ModeMenu } from "./ModeMenu";
import { DrawMenu } from "./DrawMenu";
import { ScaleMenu } from "./ScaleMenu";
import { ToolMenu } from "./ToolMenu";
import { GameMenu } from "./GameMenu";
import { HelpMenu } from "./HelpMenu";
import { Optional } from "../store/MeatadataStorage";
import { Shotcut } from "../decorators/Shotcut";

export type IMenuParent = {
    [key in MenuType]: Optional<IMenuItem>;
};

export interface IMenuItem {
    name: string;
    children: {
        [key: string]: {
            name?: string;
            children?: Partial<Record<string, any>>;
            shortcut?: string[];
            action?: (ev: any) => void | Function;
        };
    };
}

export type MenuType =
    | "file"
    | "edit"
    | "mode"
    | "draw"
    | "scale"
    | "tools"
    | "game"
    | "help";

export type MenuKeys = keyof IMenuParent;

const KoreanMenu: IMenuParent = {
    file: FileMenu,
    edit: EditMenu,
    mode: ModeMenu,
    draw: DrawMenu,
    scale: ScaleMenu,
    tools: ToolMenu,
    game: GameMenu,
    help: HelpMenu,
};

export { KoreanMenu };
