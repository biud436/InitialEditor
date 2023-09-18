import "reflect-metadata";
import { getMetadataStorage } from "../store/MeatadataStorage";

export const ON_MENU_CLICK_TOKEN = "ON_MENU_CLICK";
export function OnMenuClick(name: string): MethodDecorator {
    return function (target: any, propertyKey, descriptor) {
        const action = descriptor.value as any;
        const TOKEN = `MENU_${name}`;

        const metadataStorage = getMetadataStorage();
        metadataStorage.menuActions.push({
            name,
            token: TOKEN,
            action,
        });

        Reflect.set(window, TOKEN, action);
        Reflect.defineMetadata(ON_MENU_CLICK_TOKEN, true, target, propertyKey);
    };
}
