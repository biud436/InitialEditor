import { Dispatch, SetStateAction } from "react";
import { SetterOrUpdater } from "recoil";

export const THEME = {
    DARK: "dark",
    LIGHT: "light",
};
export namespace WindowGroup {
    export enum Theme {
        Light = 1,
        Dark = 2,
    }
}
export type OptionWindowProps = {
    close: () => void;
    selectedIndex: string;
    setSelectedIndex: Dispatch<SetStateAction<string>>;
    theme: { theme: string };
    ok: () => void;
    setTheme: SetterOrUpdater<{
        theme: string;
    }>;
};
