import { useRouter } from "next/dist/client/router";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import Draggable from "react-draggable";
import "./OptionWindow.module.css";
import { SetterOrUpdater, useRecoilState } from "recoil";
import { useClose } from "../../../providers/window.providers";
import { ThemeState } from "../../../recoil/theme";

const THEME = {
    DARK: "dark",
    LIGHT: "light",
};

namespace WindowGroup {
    export enum Theme {
        Light = 1,
        Dark = 2,
    }
}

type OptionWindowProps = {
    close: () => void;
    selectedIndex: string;
    setSelectedIndex: Dispatch<SetStateAction<string>>;
    theme: { theme: string };
    ok: () => void;
    setTheme: SetterOrUpdater<{
        theme: string;
    }>;
};

export default function OptionWindowContainer() {
    const { close } = useClose();
    const [selectedIndex, setSelectedIndex] = useState("dark");
    const [theme, setTheme] = useRecoilState(ThemeState);

    const ok = () => {
        applyTheme();
        close();
    };

    useEffect(() => {
        setSelectedIndex(theme.theme);
    }, [theme]);

    const applyTheme = () => {
        const themeIndex = selectedIndex;

        if (themeIndex == THEME.DARK) {
            window.app.emit("changeTheme", WindowGroup.Theme.Dark);
        } else {
            window.app.emit("changeTheme", WindowGroup.Theme.Light);
        }

        setTheme({ theme: themeIndex });
    };

    return (
        <OptionWindowPresent
            {...{ close, selectedIndex, setSelectedIndex, setTheme, ok, theme }}
        />
    );
}

function OptionWindowPresent({
    close,
    selectedIndex,
    setSelectedIndex,
    setTheme,
    ok,
    theme,
}: OptionWindowProps) {
    return (
        <Draggable grid={[16, 16]}>
            <div id="tilesetWindow" window-name="타일셋 창">
                <div
                    className="tilesetWindow__tileset tilesetWindow__tab-border"
                    tab-name="타일셋"
                >
                    <ul>
                        <li>
                            <label htmlFor="name">이름 : </label>
                            <input type="text" placeholder="name" name="name" />
                        </li>
                        <li>
                            <label htmlFor="name">이미지: </label>
                            <input type="file" name="" id="image-load-dialog" />
                        </li>
                    </ul>
                </div>
                <div
                    className="tilesetWindow-tile tilesetWindow__tab-border"
                    tab-name="타일"
                >
                    <ul>
                        <li>
                            <label htmlFor="tile-width">가로 크기 : </label>
                            <input
                                type="number"
                                id="tile-width"
                                value="32"
                                name="tileWidth"
                            />
                            px
                        </li>
                        <li>
                            <label htmlFor="tile-height">세로 크기 : </label>
                            <input
                                type="number"
                                id="tile-height"
                                value="32"
                                name="tileHeight"
                            />
                            px
                        </li>
                        <li>
                            <label htmlFor="theme">테마 설정 : </label>

                            <select
                                name="theme"
                                id="theme-select-box"
                                value={selectedIndex}
                                onChange={(e) => {
                                    console.log(e.target.value);
                                    setSelectedIndex(e.target.value);
                                }}
                            >
                                <ThemeOption
                                    value="dark"
                                    selected={theme}
                                    text="다크 테마"
                                />
                                <ThemeOption
                                    value="light"
                                    selected={theme}
                                    text="라이트 테마"
                                />
                            </select>
                        </li>
                    </ul>
                </div>

                <div className="tilesetWindow__control-box">
                    <p>
                        <span>
                            <i
                                className="far fa-window-close"
                                id="action-close"
                                onClick={close}
                            ></i>
                        </span>
                    </p>
                </div>

                <div className="tilesetWindow__panel">
                    <button className="ok" onClick={ok}>
                        확인
                    </button>
                    <button className="cancel" onClick={close}>
                        취소
                    </button>
                </div>
            </div>
        </Draggable>
    );
}

export function ThemeOption({
    value,
    selected,
    text,
}: {
    value: "dark" | "light";
    selected: {
        theme: string;
    };
    text: string;
}) {
    return (
        <option value={value} selected={selected.theme === value}>
            {text}
        </option>
    );
}
