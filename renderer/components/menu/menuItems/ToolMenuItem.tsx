import { Emphasis } from "@components/atomics/Emphasis";
import { IconItem } from "@components/atomics/IconItem";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";

export function ToolMenuItem() {
    return (
        <ListContainer
            className="menu__tools-sub menu-style"
            defaultValue="Tools"
        >
            <ListItem data-action="tools-database">
                <IconItem className="fas fa-book"></IconItem>Database...
                <Emphasis>F9</Emphasis>
            </ListItem>
            <ListItem data-action="tools-resource-manager">
                <IconItem className="fas fa-scroll"></IconItem>Resource Manager
            </ListItem>
            <ListItem data-action="tools-script-eidtor">
                <IconItem className="fas fa-toolbox"></IconItem>Script Editor
            </ListItem>
            <ListItem data-action="tools-sound-test">
                <IconItem className="fas fa-music"></IconItem>Sound Test
            </ListItem>
            <ListItem className="menu__empty-line"></ListItem>
            <ListItem data-action="tools-options">
                <IconItem className="fas fa-user-cog"></IconItem>Options...
            </ListItem>
        </ListContainer>
    );
}
