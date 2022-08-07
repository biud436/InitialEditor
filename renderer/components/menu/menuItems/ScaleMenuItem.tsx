import { IconItem } from "@components/atomics/IconItem";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";

export function ScaleMenuItem() {
    return (
        <ListContainer
            className="menu__scale-sub menu-style"
            defaultValue="Scale"
        >
            <ListItem data-action="scale-1x">
                <IconItem className="fas fa-search-plus"></IconItem>1:1
            </ListItem>
            <ListItem data-action="scale-2x">
                <IconItem className="fas fa-search-plus"></IconItem>1:2
            </ListItem>
            <ListItem data-action="scale-4x">
                <IconItem className="fas fa-search-plus"></IconItem>1:4
            </ListItem>
            <ListItem data-action="scale-8x">
                <IconItem className="fas fa-search-plus"></IconItem>1:8
            </ListItem>
        </ListContainer>
    );
}
