import "reflect-metadata";

export function OnMenuClick(name: string): MethodDecorator {
    return function (target: any, propertyKey, descriptor) {
        const action = descriptor.value;

        Reflect.set(window, `MENU_${name}`, action);
    };
}
