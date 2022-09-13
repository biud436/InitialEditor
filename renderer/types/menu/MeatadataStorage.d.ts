import { IBaseMenuCommand } from "./commands/IBaseMenuCommand";
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
export declare class MetadataStorage {
    menuCommands: MenuCommandTarget[];
    menuActions: MenuAction[];
}
export declare function getMetadataStorage(): MetadataStorage;
