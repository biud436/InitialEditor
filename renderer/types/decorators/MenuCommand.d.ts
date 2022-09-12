import "reflect-metadata";
import { MenuKeys } from "../menu/KoreanMenu";
export declare const MENU_COMMAND = "MENU_COMMAND";
export declare type InferMenuName = `${keyof MenuKeys}-${string}`;
export declare function MenuCommand(menuId: keyof MenuKeys, name: InferMenuName, description: string, shortcut: string[]): ClassDecorator;
