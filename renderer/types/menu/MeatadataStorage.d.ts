import { IBaseMenuCommand } from "./commands/IBaseMenuCommand";
import { IMenuItem, MenuType } from "./KoreanMenu";
export declare type MenuCommandTarget = {
    target: IBaseMenuCommand;
    menuId: string;
    name: string;
    description: string;
    shortcut: string[];
};
export interface MenuAction {
    name: string;
    token: string;
    action<T = any>(ev: T): void;
}
export declare type Optional<T> = {
    [P in keyof T]?: T[P];
};
/**
 * @class MetadataStorage
 */
export declare class MetadataStorage {
    menuCommands: MenuCommandTarget[];
    menuActions: MenuAction[];
    getCommand(name: string): MenuCommandTarget | undefined;
    getCommandItems(menuId: MenuType): Optional<IMenuItem>;
}
/**
 * Getting the metadata storage from the global scope.
 *
 * @returns {MetadataStorage} MetadataStorage
 */
export declare function getMetadataStorage(): MetadataStorage;
