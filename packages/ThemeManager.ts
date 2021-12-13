namespace ThemeColor {
    /**
     * 이렇게 파일 내에 하드 코딩하는 것은 좋지 않습니다.
     * 재컴파일을 해야 하기 때문입니다.
     *
     * 파일로부터 설정 파일을 로드할 수 있어야 합니다.
     * 또한 상수로 설정하는 것도 좋지 않습니다.
     *
     * 모든 것을 설정 파일로부터 가져오는 것이 좋습니다.
     *
     * TODO : 설정 파일로 디커플링하기
     *
     */
    export const DARK = {
        TITLE_COLOR: "rgb(60, 60, 60)",
        SELECTION_COLOR: "rgb(80, 80, 80)",
        INPUT_BACKGROUND_COLOR: "rgb(90, 90, 90)",
        INPUT_TEXT_COLOR: "rgb(194, 194, 194)",
        TEXT_COLOR: "rgb(159, 159, 159)",
        SHADOW_COLOR: "rgb(40, 40, 40)",
        BORDER_COLOR: "rgb(90, 90, 90)"
    };

    export const LIGHT = {
        TITLE_COLOR: "#DDDDDD",
        SELECTION_COLOR: "#C6C6C6",
        INPUT_BACKGROUND_COLOR: "#DDDDDD",
        INPUT_TEXT_COLOR: "#000000",
        TEXT_COLOR: "#000000",
        SHADOW_COLOR: "#F3F3F3",
        BORDER_COLOR: "#DDDDDD"
    };
}

enum Theme {
    DARK = 0,
    LIGHT = 1
}

class ThemeManager {
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
