import "reflect-metadata";
import Container, { Service } from "typedi";
import { IBaseMenuCommand } from "../menu/commands/IBaseMenuCommand";
import { MenuKeys } from "../menu/KoreanMenu";
import { getMetadataStorage, MetadataStorage } from "../store/MeatadataStorage";

export const MENU_COMMAND = "MENU_COMMAND";
export type InferMenuName = `${MenuKeys}-${string}`;

/**
 * 파일 읽는 순서에 따라 메뉴 파일이 먼저 읽히기 때문에 변수가 여기에 선언됩니다.
 */
export const injectableMenuCommands: Record<string, IBaseMenuCommand> = {};

export function MenuCommand(
    menuId: MenuKeys,
    name: InferMenuName,
    description: string,
    shortcut: string[]
): ClassDecorator {
    return function (target: any) {
        const TOKEN = `${MENU_COMMAND}_${menuId}_${name}`;

        target.prototype["name"] = description;
        target.prototype["shortcut"] = shortcut;

        const metadataStorage = getMetadataStorage();
        Reflect.set(metadataStorage, TOKEN, target);
        Reflect.defineMetadata(MENU_COMMAND, TOKEN, target);

        metadataStorage.menuCommands.push({
            target: target,
            name,
            description,
            menuId,
            shortcut,
        });

        const menu = injectableMenuCommands[menuId];
        if (!menu) {
            injectableMenuCommands[menuId] = {};
            injectableMenuCommands[menuId].children = {};
        }

        injectableMenuCommands[menuId].children![name] = target;

        Reflect.set(
            window,
            `${MENU_COMMAND}_${menuId}`,
            injectableMenuCommands[menuId]
        );

        return target;
    };
}
