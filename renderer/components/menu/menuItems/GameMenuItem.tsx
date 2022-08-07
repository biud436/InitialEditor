import { Emphasis } from "@components/atomics/Emphasis";
import { IconItem } from "@components/atomics/IconItem";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";

export function GameMenuItem() {
    return (
        <ListContainer
            className="menu__game-sub menu-style"
            defaultValue="Game"
        >
            <ListItem data-action="game-playtest">
                <IconItem className="fas fa-gamepad"></IconItem>Playtest
                <Emphasis>F12</Emphasis>
            </ListItem>
            <ListItem className="menu__empty-line"></ListItem>
            <ListItem data-action="game-fullscreen">
                Launch in Full Screen
            </ListItem>
            <ListItem data-action="game-show-console">Show Console</ListItem>
            <ListItem data-action="game-folder-open">
                <IconItem className="fas fa-folder-open"></IconItem>Open Game
                Folder
            </ListItem>
        </ListContainer>
    );
}
