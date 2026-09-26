declare class ThemeManager {
    static INSTANCE_COUNT: number;
    constructor();
    set(key: string, value: string): void;
    flush(theme: number): void;
    changeDarkTheme(isOption?: boolean): void;
    changeLightTheme(isOption?: boolean): void;
}
export { ThemeManager };
