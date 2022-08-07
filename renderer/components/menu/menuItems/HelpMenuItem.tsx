import { IconItem } from "@components/atomics/IconItem";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";

export function HelpMenuItem() {
    return (
        <ListContainer
            className="menu__help-sub menu-style"
            defaultValue="Help"
        >
            <ListItem data-action="help-contents">
                <IconItem className="fas fa-question-circle"></IconItem>Contents
                <em>F1</em>
            </ListItem>
            <ListItem className="menu__empty-line"></ListItem>
            <ListItem data-action="help-about">
                <IconItem className="fas fa-info-circle"></IconItem>About...
            </ListItem>
        </ListContainer>
    );
}
