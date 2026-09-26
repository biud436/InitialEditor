import { Schema } from "./Schema";
export class ThemeSchema extends Schema {
    initMembers(config) {
        if (!config) {
            return;
        }
        this.DARK = config.DARK;
        this.LIGHT = config.LIGHT;
    }
    loadSync(filename) {
        try {
            const data = this.fileProvider.readFileSync(filename, "utf8");
            return JSON.parse(data);
        }
        catch (e) {
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
//# sourceMappingURL=ThemeSchema.js.map