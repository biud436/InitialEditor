import { WindowTitleBar } from "./WindowTitleBar";
import * as menu from "./menuItems";
import Draggable from "react-draggable";
import { Input } from "@components/atomics/Input";
import { Division } from "@components/atomics/Wrapper";

export function MainMenuContainer(children: React.ReactNode) {
    return (
        <Division className="menu">
            <WindowTitleBar></WindowTitleBar>
            <Input type="radio" name="menu" id="file" />
            <Input type="radio" name="menu" id="edit" />
            <Input type="radio" name="menu" id="mode" />
            <Input type="radio" name="menu" id="draw" />
            <Input type="radio" name="menu" id="scale" />
            <Input type="radio" name="menu" id="tools" />
            <Input type="radio" name="menu" id="game" />
            <Input type="radio" name="menu" id="help" />
            <Input type="radio" name="menu" id="none" />

            <menu.TopDownNavigationMenu />
            <menu.FileMenuItem />
            <menu.EditMenuItem />
            <menu.ModeMenuItem />
            <menu.DrawMenuitem />
            <menu.ScaleMenuItem />
            <menu.ToolMenuItem />
            <menu.GameMenuItem />
            <menu.HelpMenuItem />
        </Division>
    );
}
