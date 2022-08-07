import { IconItem } from "@components/atomics/IconItem";
import { ListItem } from "@components/atomics/ListItem";
import { ListContainer } from "../../atomics/ListContainer";

export function EditMenuItem() {
    return (
        <ListContainer
            className="menu__edit-sub menu-style"
            defaultValue="Edit"
        >
            <ListItem data-action="edit-undo">
                <IconItem className="fas fa-undo"></IconItem>Undo
            </ListItem>
            <ListItem className="menu__empty-line"></ListItem>
            <ListItem data-action="edit-cut">
                <IconItem className="fas fa-cut"></IconItem>Cut
            </ListItem>
            <ListItem data-action="edit-copy">
                <IconItem className="fas fa-copy"></IconItem>Copy
            </ListItem>
            <ListItem data-action="edit-paste">
                <IconItem className="fas fa-paste"></IconItem>Paste
            </ListItem>
            <ListItem data-action="edit-delete">
                <IconItem className="fas fa-trash-alt"></IconItem>Delete
            </ListItem>
        </ListContainer>
    );
}
