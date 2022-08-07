import { IconItem } from "@components/atomics/IconItem";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";

export function ModeMenuItem() {
    return (
        <ListContainer
            className="menu__mode-sub menu-style"
            defaultValue="Mode"
        >
            <ListItem data-action="mode-map">
                <IconItem className="fas fa-layer-group"></IconItem>Map
            </ListItem>
            <ListItem data-action="mode-event">
                <IconItem className="fas fa-flag-checkered"></IconItem>Event
            </ListItem>
            <ListItem data-action="mode-region">
                <IconItem className="fas fa-map"></IconItem>Region
            </ListItem>
        </ListContainer>
    );
}
