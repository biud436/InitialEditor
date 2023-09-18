import { FileProvider } from "./FileProvider";
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
    DARK!: ColorTheme;
    LIGHT!: ColorTheme;

    initMembers(config?: any) {
        if (!config) {
            return;
        }
        this.DARK = config.DARK;
        this.LIGHT = config.LIGHT;
    }

    loadSync(filename: string): any {
        try {
            const data = this.fileProvider.readFileSync(filename, "utf8");

            return JSON.parse(data);
        } catch (e) {
            return {
                DARK: {
                    TITLE_COLOR: "rgb(60, 60, 60)",
                    SELECTION_COLOR: "rgb(80, 80, 80)",
                    INPUT_BACKGROUND_COLOR: "rgb(90, 90, 90)",
                    INPUT_TEXT_COLOR: "rgb(194, 194, 194)",
                    TEXT_COLOR: "rgb(159, 159, 159)",
                    SHADOW_COLOR: "rgb(40, 40, 40)",
                    BORDER_COLOR: "rgb(90, 90, 90)",
                },
                LIGHT: {
                    TITLE_COLOR: "#DDDDDD",
                    SELECTION_COLOR: "#C6C6C6",
                    INPUT_BACKGROUND_COLOR: "#DDDDDD",
                    INPUT_TEXT_COLOR: "#000000",
                    TEXT_COLOR: "#000000",
                    SHADOW_COLOR: "#F3F3F3",
                    BORDER_COLOR: "#DDDDDD",
                },
            };
        }
    }
}
