import { IBaseMenuCommand } from "./commands/IBaseMenuCommand";
export declare type MenuCommandTarget = {
    target: IBaseMenuCommand;
    menuId: string;
    name: string;
    description: string;
    shortcut: string[];
};
export declare class MetadataStorage {
    menuCommands: MenuCommandTarget[];
}
