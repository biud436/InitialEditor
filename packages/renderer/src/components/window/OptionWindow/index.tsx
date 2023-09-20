/* eslint-disable @typescript-eslint/no-unused-vars */
import { memo, useEffect, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { useRecoilState } from 'recoil';
import { THEME, WindowGroup, OptionWindowProps } from './Theme';
import { ConfirmPanel } from './ConfirmPanel';
import { ClosePanel } from './ClosePanel';
import { ContentView } from './ContentView';
import { ContentHeader } from './ContentHeader';
import { Box } from '@components/atomics/Box';
import styled from 'styled-components';
import { ThemeState } from '@store/theme';
import { useClose } from '@hooks/useClose';
import { getWindowCenterPosition } from '@libs/getWindowCenterPosition';

const OptionWindowPresent = memo(
    ({
        close,
        selectedIndex,
        setSelectedIndex,
        ok,
        theme,
    }: OptionWindowProps) => {
        const ref = useRef<HTMLDivElement>(null);

        return (
            <Draggable
                grid={[16, 16]}
                defaultPosition={getWindowCenterPosition(ref)}
            >
                <OptionWindowPresentDiv
                    id="tilesetWindow"
                    window-name="타일셋"
                    ref={ref}
                >
                    <ClosePanel close={close} />
                    <ContentHeader />
                    <ContentView
                        {...{ selectedIndex, setSelectedIndex, theme }}
                    />
                    <ConfirmPanel ok={ok} close={close} />
                </OptionWindowPresentDiv>
            </Draggable>
        );
    },
);

const OptionWindowPresentDiv = styled(Box)`
    display: flex;
    flex-direction: column;
    line-height: 1.5;
    gap: 1.2em;
    padding: 1rem;
`;

export default function OptionWindowContainer() {
    const { close } = useClose();
    const [selectedIndex, setSelectedIndex] = useState('dark');
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
            window.app.emit('changeTheme', WindowGroup.Theme.Dark);
        } else {
            window.app.emit('changeTheme', WindowGroup.Theme.Light);
        }

        setTheme({ theme: themeIndex });
    };

    return (
        <OptionWindowPresent
            {...{ close, selectedIndex, setSelectedIndex, setTheme, ok, theme }}
        />
    );
}
