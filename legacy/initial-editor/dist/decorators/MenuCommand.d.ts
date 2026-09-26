import "reflect-metadata";
import { IBaseMenuCommand } from "../menu/commands/IBaseMenuCommand";
import { MenuKeys } from "../menu/KoreanMenu";
export declare const MENU_COMMAND = "MENU_COMMAND";
export type InferMenuName = `${MenuKeys}-${string}`;
/**
 * 파일 읽는 순서에 따라 메뉴 파일이 먼저 읽히기 때문에 변수가 여기에 선언됩니다.
 */
export declare const injectableMenuCommands: Record<string, IBaseMenuCommand>;
export declare function MenuCommand(menuId: MenuKeys, name: InferMenuName, description: string, shortcut: string[]): ClassDecorator;
