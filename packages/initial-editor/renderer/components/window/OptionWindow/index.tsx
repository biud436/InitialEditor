import React, {
    Dispatch,
    memo,
    SetStateAction,
    useEffect,
    useState,
} from "react";
import Draggable from "react-draggable";
import { useRecoilState } from "recoil";
import { useClose } from "../../../providers/window.providers";
import { ThemeState } from "../../../recoil/theme";
import { THEME, WindowGroup, OptionWindowProps } from "./THEME";
import { ConfirmPanel } from "./ConfirmPanel";
import { ClosePanel } from "./ClosePanel";
import { ContentView } from "./ContentView";
import { ContentHeader } from "./ContentHeader";
import { ContainerWrapper } from "./ContainerWrapper";
import { Division } from "@components/atomics/Wrapper";
import styled from "styled-components";

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

const OptionWindowPresent = memo(function OptionWindowPresent({
    close,
    selectedIndex,
    setSelectedIndex,
    setTheme,
    ok,
    theme,
}: OptionWindowProps) {
    return (
        <Draggable grid={[16, 16]} defaultPosition={{ x: 200, y: 200 }}>
            <OptionWindowPresentDiv id="tilesetWindow" window-name="타일셋">
                <ClosePanel close={close} />
                <ContentHeader />
                <ContentView {...{ selectedIndex, setSelectedIndex, theme }} />
                <ConfirmPanel ok={ok} close={close} />
            </OptionWindowPresentDiv>
        </Draggable>
    );
});

const OptionWindowPresentDiv = styled(Division)`
    display: flex;
    flex-direction: column;
    line-height: 1.5;
    gap: 1.2em;
    padding: 1rem;
`;
