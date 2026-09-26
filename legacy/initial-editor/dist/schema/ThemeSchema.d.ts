import { Schema } from "./Schema";
interface ColorTheme {
    TITLE_COLOR: string;
    SELECTION_COLOR: string;
    INPUT_BACKGROUND_COLOR: string;
    INPUT_TEXT_COLOR: string;
    TEXT_COLOR: string;
    SHADOW_COLOR: string;
    BORDER_COLOR: string;
}
export declare class ThemeSchema extends Schema {
    DARK: ColorTheme;
    LIGHT: ColorTheme;
    initMembers(config?: any): void;
    loadSync(filename: string): any;
}
export {};
