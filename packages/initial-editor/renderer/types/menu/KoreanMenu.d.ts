import { Optional } from "../store/MeatadataStorage";
export declare type IMenuParent = {
    [key in MenuType]: Optional<IMenuItem>;
};
export interface IMenuItem {
    name: string;
    children: {
        [key: string]: {
            name?: string;
            children?: Partial<Record<string, any>>;
            shortcut?: string[];
            action?: (ev: any) => void | Function;
        };
    };
}
export declare type MenuType = "file" | "edit" | "mode" | "draw" | "scale" | "tools" | "game" | "help";
export declare type MenuKeys = keyof IMenuParent;
declare const KoreanMenu: IMenuParent;
export { KoreanMenu };
