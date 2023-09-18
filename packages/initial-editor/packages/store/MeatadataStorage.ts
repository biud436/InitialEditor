import Container, { Service } from "typedi";
import { IBaseMenuCommand } from "../menu/commands/IBaseMenuCommand";
import { IMenuItem, MenuType } from "../menu/KoreanMenu";
export interface MenuCommandTarget {
    target: IBaseMenuCommand;
    menuId: string;
    name: string;
    description: string;
    shortcut: string[];
}

export interface MenuAction {
    name: string;
    token: string;
    action<T = any>(ev: T): void;
}

export type Optional<T> = {
    [P in keyof T]?: T[P];
};

/**
 * @class MetadataStorage
 */
@Service()
export class MetadataStorage {
    menuCommands: MenuCommandTarget[] = [];
    menuActions: MenuAction[] = [];

    getCommand(name: string): MenuCommandTarget | undefined {
        return this.menuCommands.find((command) => command.name === name);
    }

    getCommandItems(menuId: MenuType) {
        const command = this.getCommand(menuId);
        if (!command) {
            console.warn(`command named '${menuId}' not found`);
            return;
        }

        const ret: Optional<IMenuItem> = {
            ...command,
            name: menuId,
        };

        return ret;
    }
}

/**
 * Getting the metadata storage from the global scope.
 *
 * @returns {MetadataStorage} MetadataStorage
 */
export function getMetadataStorage() {
    const storage = Container.get(MetadataStorage);

    return storage;
}
