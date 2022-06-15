import { ThemeSchema } from "./schema/ThemeSchema";

enum Theme {
    DARK = 0,
    LIGHT = 1,
}

const themeSchema = new ThemeSchema({});
const ThemeColor = themeSchema.loadSync("./conf/theme.json");

class ThemeManager {
    public static INSTANCE_COUNT = 0;

    constructor() {
        // ? ThemeManager가 한 번만 생성되었나?
        if (ThemeManager.INSTANCE_COUNT === 0) {
            window.app.on("save-config", () => {
                Object.assign(themeSchema, ThemeColor);
                themeSchema
                    .toFile("./conf/theme.json")
                    .then((res) => {})
                    .catch((err) => {
                        console.error(err);
                    });
            });
        }

        ThemeManager.INSTANCE_COUNT++;
    }

    public set(key: string, value: string) {
        // document.documentElement.style.setProperty(key, value);
        $(":root").css(key, value);
    }

    public flush(theme: number) {
        window.app.emit("save-config", {
            Theme: theme,
        });
    }

    public changeDarkTheme(isOption: boolean = false) {
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

    public changeLightTheme(isOption: boolean = false) {
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

export { ThemeManager };
