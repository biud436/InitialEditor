import "reflect-metadata";
import Container from "typedi";
import { getMetadataStorage, MetadataStorage } from "../store/MeatadataStorage";

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
    };
}
