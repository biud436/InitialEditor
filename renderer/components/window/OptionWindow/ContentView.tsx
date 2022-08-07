import { ThemeOption } from "./ThemeOption";
import { OptionWindowProps } from "./THEME";
import { Division } from "@components/atomics/Wrapper";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";
import { Label } from "@components/atomics/Label";
import { Input } from "@components/atomics/Input";
import { Select } from "@components/atomics/Select";
import { OptionItem } from "@components/atomics/OptionItem";

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
        <Division
            className="tilesetWindow-tile tilesetWindow__tab-border"
            tab-name="타일"
        >
            <ListContainer>
                <ListItem key="tileset-window-tile-width">
                    <Label htmlFor="tile-width">가로 크기: </Label>
                    <Input
                        type="number"
                        id="tile-width"
                        value="32"
                        name="tileWidth"
                    />
                    px
                </ListItem>
                <ListItem key="tileset-window-tile-height">
                    <Label htmlFor="tile-height">세로 크기: </Label>
                    <Input
                        type="number"
                        id="tile-height"
                        value="32"
                        name="tileHeight"
                    />
                    px
                </ListItem>
                <ListItem key="tileset-window-theme-setting">
                    <Label htmlFor="theme">테마 설정: </Label>

                    <Select
                        name="theme"
                        id="theme-select-box"
                        value={selectedIndex}
                        onChange={(e) => {
                            console.log(e.target.value);
                            setSelectedIndex(e.target.value);
                        }}
                    >
                        <OptionItem
                            value="dark"
                            selected={theme.theme === "dark"}
                        >
                            다크 테마
                        </OptionItem>
                        <OptionItem
                            value="light"
                            selected={theme.theme === "light"}
                        >
                            라이트 테마
                        </OptionItem>
                    </Select>
                </ListItem>
            </ListContainer>
        </Division>
    );
}
