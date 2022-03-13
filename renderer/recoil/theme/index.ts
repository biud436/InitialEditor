import { atom, useRecoilState } from "recoil";

export const ThemeState = atom({
    key: "themeState",
    default: {
        theme: "light",
    },
});

export const ThemeActions = {
    setTheme: (themeType: string) => {
        const [theme, setTheme] = useRecoilState(ThemeState);
        setTheme({ theme: themeType });
    },
};
