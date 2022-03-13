import { Schema } from "./Schema";
import * as fs from "fs";

interface ColorTheme {
    TITLE_COLOR: string;
    SELECTION_COLOR: string;
    INPUT_BACKGROUND_COLOR: string;
    INPUT_TEXT_COLOR: string;
    TEXT_COLOR: string;
    SHADOW_COLOR: string;
    BORDER_COLOR: string;
}

export class ThemeSchema extends Schema {
    DARK: ColorTheme;
    LIGHT: ColorTheme;

    initMembers(config?: any) {
        if (!config) {
            return;
        }
        this.DARK = config.DARK;
        this.LIGHT = config.LIGHT;
    }

    loadSync(filename: string): any {
        const data = fs.readFileSync(filename, "utf8");
        return JSON.parse(data);
    }
}
