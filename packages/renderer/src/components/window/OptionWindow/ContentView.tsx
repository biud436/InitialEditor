/* eslint-disable @typescript-eslint/no-explicit-any */
import { OptionWindowProps } from './Theme';
import { Division } from '@components/atomics/Wrapper';
import { ListContainer } from '@components/atomics/ListContainer';
import { ListItem } from '@components/atomics/ListItem';
import { Label } from '@components/atomics/Label';
import { Input } from '@components/atomics/Input';
import { Select } from '@components/atomics/Select';
import { OptionItem } from '@components/atomics/OptionItem';
import classNames from 'classnames';
import { styled } from 'styled-components';

interface ContentViewProps {
    selectedIndex: string;
    setSelectedIndex: OptionWindowProps['setSelectedIndex'];
    theme: { theme: string };
}

export function ContentView({
    selectedIndex,
    setSelectedIndex,
    theme,
}: ContentViewProps) {
    return (
        <Division
            className={classNames(
                'tilesetWindow-tile',
                'tilesetWindow__tab-border',
            )}
            tab-name="타일"
        >
            <ContentViewContainer>
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
                        onChange={(e: any) => {
                            setSelectedIndex(e?.target.value);
                        }}
                    >
                        <OptionItem
                            value="dark"
                            selected={theme.theme === 'dark'}
                        >
                            다크 테마
                        </OptionItem>
                        <OptionItem
                            value="light"
                            selected={theme.theme === 'light'}
                        >
                            라이트 테마
                        </OptionItem>
                    </Select>
                </ListItem>
            </ContentViewContainer>
        </Division>
    );
}

const ContentViewContainer = styled(ListContainer)`
    display: flex;
    flex-direction: column;
    gap: 0.4em;

    input {
        background: var(--dark-input-background-color);
        color: var(--dark-text-color);
        border: 1px solid var(--dark-border-color);
        border-radius: 4px;
    }

    select {
        background: var(--dark-input-background-color);
        color: var(--dark-text-color);
        border: 1px solid var(--dark-border-color);
        border-radius: 4px;
    }
`;
