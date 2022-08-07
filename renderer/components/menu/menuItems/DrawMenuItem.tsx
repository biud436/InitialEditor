import { IconItem } from "@components/atomics/IconItem";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";

export function DrawMenuitem() {
    return (
        <ListContainer
            className="menu__draw-sub menu-style"
            defaultValue="Draw"
        >
            <ListItem data-action="draw-pencil">
                <IconItem className="fas fa-pencil-alt" />
                Pencil
            </ListItem>
            <ListItem data-action="draw-rectangle">
                <IconItem className="fas fa-square-full" />
                Rectangle
            </ListItem>
            <ListItem data-action="draw-ellipse">
                <IconItem className="fas fa-circle" />
                Ellipse
            </ListItem>
            <ListItem data-action="draw-flood-fill">
                <IconItem className="fas fa-fill" />
                Flood Fill
            </ListItem>
            <ListItem data-action="draw-shadow-pen">
                <IconItem className="fas fa-paint-brush" />
                Shadow Pen
            </ListItem>
        </ListContainer>
    );
}
