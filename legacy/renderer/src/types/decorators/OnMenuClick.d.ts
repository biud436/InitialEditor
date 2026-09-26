import "reflect-metadata";
export declare const ON_MENU_CLICK_TOKEN = "ON_MENU_CLICK";
export declare function OnMenuClick(name: string): (target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<any>) => TypedPropertyDescriptor<any>;
