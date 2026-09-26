import "reflect-metadata";
import { getMetadataStorage } from "../store/MeatadataStorage";
export const MENU_COMMAND = "MENU_COMMAND";
/**
 * 파일 읽는 순서에 따라 메뉴 파일이 먼저 읽히기 때문에 변수가 여기에 선언됩니다.
 */
export const injectableMenuCommands = {};
export function MenuCommand(menuId, name, description, shortcut) {
    return function (target) {
        const TOKEN = `${MENU_COMMAND}_${menuId}_${name}`;
        // TODO: 심볼 공간을 만들어서 관리하는 것이 좋을 것 같습니다.
        target.prototype["name"] = description;
        target.prototype["shortcut"] = shortcut;
        const metadataStorage = getMetadataStorage();
        /**
         * TODO: 2023.09.18) 부적절한 구현으로 보입니다.
         */
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
        injectableMenuCommands[menuId].children[name] = target;
        Reflect.set(window, `${MENU_COMMAND}_${menuId}`, injectableMenuCommands[menuId]);
        return target;
    };
}
//# sourceMappingURL=MenuCommand.js.map