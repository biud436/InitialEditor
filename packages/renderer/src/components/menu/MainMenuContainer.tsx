/* eslint-disable @typescript-eslint/no-unused-vars */
import { WindowTitleBar } from './WindowTitleBar';
import * as menu from './menuItems';
import { Box } from '@components/atomics/Box';

export function MainMenuContainer() {
    return (
        <Box className="menu">
            <WindowTitleBar />
            <input type="radio" name="menu" id="file" />
            <input type="radio" name="menu" id="edit" />
            <input type="radio" name="menu" id="mode" />
            <input type="radio" name="menu" id="draw" />
            <input type="radio" name="menu" id="scale" />
            <input type="radio" name="menu" id="tools" />
            <input type="radio" name="menu" id="game" />
            <input type="radio" name="menu" id="help" />
            <input type="radio" name="menu" id="none" />

            <menu.TopDownNavigationMenu />
            <menu.FileMenuItem />
            <menu.EditMenuItem />
            <menu.ModeMenuItem />
            <menu.DrawMenuitem />
            <menu.ScaleMenuItem />
            <menu.ToolMenuItem />
            <menu.GameMenuItem />
            <menu.HelpMenuItem />
        </Box>
    );
}
