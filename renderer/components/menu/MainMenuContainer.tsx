import { WindowTitleBar } from "./WindowTitleBar";
import * as menu from "./menuItems";

export function MainMenuContainer(children: React.ReactNode) {
    return (
        <div className="menu">
            <WindowTitleBar></WindowTitleBar>
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
        </div>
    );
}
