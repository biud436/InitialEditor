import "reflect-metadata";
import Container, { Service } from "typedi";
import { MenuKeys } from "../menu/KoreanMenu";
import { MenuInjector } from "../menu/MenuInjector";

export const MENU_COMMAND = "MENU_COMMAND";
export type InferMenuName = `${keyof MenuKeys}-${string}`;

export function MenuCommand(
    menuId: keyof MenuKeys,
    name: InferMenuName,
    description: string,
    shortcut: string[]
): ClassDecorator {
    return function (target: any) {
        Service()(target);
        const clazz = Container.get(target) as any;
        clazz.name = description;
        clazz.shortcut = shortcut;

        const TOKEN = `${MENU_COMMAND}_${menuId}-${name}`;

        console.log("TOKEN : %s", TOKEN);
        console.log(clazz);

        const injectableClass = Container.get(MenuInjector);
        Reflect.set(injectableClass, TOKEN, clazz);
    };
}
