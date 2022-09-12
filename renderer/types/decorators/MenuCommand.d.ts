import "reflect-metadata";
import { IBaseMenuCommand } from "../menu/commands/IBaseMenuCommand";
import { MenuKeys } from "../menu/KoreanMenu";
export declare const MENU_COMMAND = "MENU_COMMAND";
export declare type InferMenuName = `${MenuKeys}-${string}`;
export declare const injectableMenuCommands: Record<string, IBaseMenuCommand>;
export declare function MenuCommand(menuId: MenuKeys, name: InferMenuName, description: string, shortcut: string[]): ClassDecorator;
