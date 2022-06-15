import { useRouter } from "next/dist/client/router";
import { useEffect, useState } from "react";
import Draggable from "react-draggable";
import "./OptionWindow.module.css";
import { ThemeState } from "../../recoil/theme";
import { useClose } from "../../providers/window.providers";
import { useRecoilState } from "recoil";

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

export default function OptionWindow() {
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
                                <option
                                    value="dark"
                                    selected={theme.theme === "dark"}
                                >
                                    다크 테마
                                </option>
                                <option
                                    value="light"
                                    selected={theme.theme === "light"}
                                >
                                    라이트 테마
                                </option>
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
                {/* <img
                    src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                    onLoad={() => {
                        window.app.onLoad(this, "tileset");
                        this.parentNode.removeChild(this);
                    }}
                /> */}
            </div>
        </Draggable>
    );
}
