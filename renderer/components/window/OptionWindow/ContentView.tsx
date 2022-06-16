import { ThemeOption } from "./ThemeOption";
import { OptionWindowProps } from "./THEME";

export function ContentView({
    selectedIndex,
    setSelectedIndex,
    theme,
}: {
    selectedIndex: string;
    setSelectedIndex: OptionWindowProps["setSelectedIndex"];
    theme: { theme: string };
}) {
    return (
        <div
            className="tilesetWindow-tile tilesetWindow__tab-border"
            tab-name="타일"
        >
            <ul>
                <li>
                    <label htmlFor="tile-width">가로 크기: </label>
                    <input
                        type="number"
                        id="tile-width"
                        value="32"
                        name="tileWidth"
                    />
                    px
                </li>
                <li>
                    <label htmlFor="tile-height">세로 크기: </label>
                    <input
                        type="number"
                        id="tile-height"
                        value="32"
                        name="tileHeight"
                    />
                    px
                </li>
                <li>
                    <label htmlFor="theme">테마 설정: </label>

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
    );
}
