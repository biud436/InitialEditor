import { atom, useRecoilState } from "recoil";

export const ThemeState = atom({
    key: "themeState",
    default: {
        theme: "light",
    },
});
