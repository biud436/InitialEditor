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
        this.set("--dark-title-color", "rgb(60, 60, 60)");
        this.set("--dark-selection-color", "rgb(80, 80, 80)");
        this.set("--dark-input-background-color", "rgb(90, 90, 90)");
        this.set("--dark-input-text-color", "rgb(194, 194, 194)");
        this.set("--dark-text-color", "rgb(159, 159, 159)");
        this.set("--dark-shadow-color", "rgb(40, 40, 40)");
        this.set("--dark-border-color", "rgb(90, 90, 90)");
        if (isOption) {
            this.flush(0);
        }
    }

    changeLightTheme(isOption: boolean = false) {
        this.set("--dark-title-color", "#DDDDDD");
        this.set("--dark-selection-color", "#C6C6C6");
        this.set("--dark-input-background-color", "#DDDDDD");
        this.set("--dark-input-text-color", "#000000");
        this.set("--dark-text-color", "#000000");
        this.set("--dark-shadow-color", "#F3F3F3");
        this.set("--dark-border-color", "#DDDDDD");

        if (isOption) {
            this.flush(1);
        }
    }
}

(window as any).ThemeManager = ThemeManager;

export { ThemeManager };
