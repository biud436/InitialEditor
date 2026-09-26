import App from "./app";
import { ThemeSchema } from "./schema/ThemeSchema";
var Theme;
(function (Theme) {
    Theme[Theme["DARK"] = 0] = "DARK";
    Theme[Theme["LIGHT"] = 1] = "LIGHT";
})(Theme || (Theme = {}));
const themeSchema = new ThemeSchema({});
const ThemeColor = themeSchema.loadSync("./conf/theme.json");
class ThemeManager {
    constructor() {
        // ? ThemeManager가 한 번만 생성되었나?
        if (ThemeManager.INSTANCE_COUNT === 0) {
            App.GetInstance().on("save-config", () => {
                Object.assign(themeSchema, ThemeColor);
                themeSchema
                    .toFile("./conf/theme.json")
                    .then((res) => { })
                    .catch((err) => {
                    console.error(err);
                });
            });
        }
        ThemeManager.INSTANCE_COUNT++;
    }
    set(key, value) {
        const root = document.querySelector(":root");
        if (root) {
            root.style.setProperty(key, value);
        }
    }
    flush(theme) {
        App.GetInstance().emit("save-config", {
            Theme: theme,
        });
    }
    changeDarkTheme(isOption = false) {
        this.set("--dark-title-color", ThemeColor.DARK.TITLE_COLOR);
        this.set("--dark-selection-color", ThemeColor.DARK.SELECTION_COLOR);
        this.set("--dark-input-background-color", ThemeColor.DARK.INPUT_BACKGROUND_COLOR);
        this.set("--dark-input-text-color", ThemeColor.DARK.INPUT_TEXT_COLOR);
        this.set("--dark-text-color", ThemeColor.DARK.TEXT_COLOR);
        this.set("--dark-shadow-color", ThemeColor.DARK.SHADOW_COLOR);
        this.set("--dark-border-color", ThemeColor.DARK.BORDER_COLOR);
        if (isOption) {
            this.flush(Theme.DARK);
        }
    }
    changeLightTheme(isOption = false) {
        this.set("--dark-title-color", ThemeColor.LIGHT.TITLE_COLOR);
        this.set("--dark-selection-color", ThemeColor.LIGHT.SELECTION_COLOR);
        this.set("--dark-input-background-color", ThemeColor.LIGHT.INPUT_BACKGROUND_COLOR);
        this.set("--dark-input-text-color", ThemeColor.LIGHT.INPUT_TEXT_COLOR);
        this.set("--dark-text-color", ThemeColor.LIGHT.TEXT_COLOR);
        this.set("--dark-shadow-color", ThemeColor.LIGHT.SHADOW_COLOR);
        this.set("--dark-border-color", ThemeColor.LIGHT.BORDER_COLOR);
        if (isOption) {
            this.flush(Theme.LIGHT);
        }
    }
}
ThemeManager.INSTANCE_COUNT = 0;
export { ThemeManager };
//# sourceMappingURL=ThemeManager.js.map