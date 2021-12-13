import { ThemeSchema } from "./schema/ThemeSchema";

enum Theme {
    DARK = 0,
    LIGHT = 1
}

const themeSchema = new ThemeSchema({
    DARK: {
        TITLE_COLOR: "rgb(60, 60, 60)",
        SELECTION_COLOR: "rgb(80, 80, 80)",
        INPUT_BACKGROUND_COLOR: "rgb(90, 90, 90)",
        INPUT_TEXT_COLOR: "rgb(194, 194, 194)",
        TEXT_COLOR: "rgb(159, 159, 159)",
        SHADOW_COLOR: "rgb(40, 40, 40)",
        BORDER_COLOR: "rgb(90, 90, 90)"
    },
    LIGHT: {
        TITLE_COLOR: "#DDDDDD",
        SELECTION_COLOR: "#C6C6C6",
        INPUT_BACKGROUND_COLOR: "#DDDDDD",
        INPUT_TEXT_COLOR: "#000000",
        TEXT_COLOR: "#000000",
        SHADOW_COLOR: "#F3F3F3",
        BORDER_COLOR: "#DDDDDD"
    }
});
const ThemeColor = themeSchema.loadSync("./conf/theme.json");

class ThemeManager {
    public static INSTANCE_COUNT = 0;

    constructor() {
        // ? ThemeManager가 한 번만 생성되었나?
        if (ThemeManager.INSTANCE_COUNT === 0) {
            window.app.on("save-config", () => {
                themeSchema
                    .toFile("./conf/theme.json")
                    .then(res => {})
                    .catch(err => {
                        console.error(err);
                    });
            });
        }

        ThemeManager.INSTANCE_COUNT++;
    }

    set(key: string, value: string) {
        // document.documentElement.style.setProperty(key, value);
        $(":root").css(key, value);
    }

    flush(theme: number) {
        window.app.emit("save-config", {
            Theme: theme
        });
    }

    changeDarkTheme(isOption: boolean = false) {
        this.set("--dark-title-color", ThemeColor.DARK.TITLE_COLOR);
        this.set("--dark-selection-color", ThemeColor.DARK.SELECTION_COLOR);
        this.set(
            "--dark-input-background-color",
            ThemeColor.DARK.INPUT_BACKGROUND_COLOR
        );
        this.set("--dark-input-text-color", ThemeColor.DARK.INPUT_TEXT_COLOR);
        this.set("--dark-text-color", ThemeColor.DARK.TEXT_COLOR);
        this.set("--dark-shadow-color", ThemeColor.DARK.SHADOW_COLOR);
        this.set("--dark-border-color", ThemeColor.DARK.BORDER_COLOR);
        if (isOption) {
            this.flush(Theme.DARK);
        }
    }

    changeLightTheme(isOption: boolean = false) {
        this.set("--dark-title-color", ThemeColor.LIGHT.TITLE_COLOR);
        this.set("--dark-selection-color", ThemeColor.LIGHT.SELECTION_COLOR);
        this.set(
            "--dark-input-background-color",
            ThemeColor.LIGHT.INPUT_BACKGROUND_COLOR
        );
        this.set("--dark-input-text-color", ThemeColor.LIGHT.INPUT_TEXT_COLOR);
        this.set("--dark-text-color", ThemeColor.LIGHT.TEXT_COLOR);
        this.set("--dark-shadow-color", ThemeColor.LIGHT.SHADOW_COLOR);
        this.set("--dark-border-color", ThemeColor.LIGHT.BORDER_COLOR);

        if (isOption) {
            this.flush(Theme.LIGHT);
        }
    }
}

(window as any).ThemeManager = ThemeManager;

export { ThemeManager };
