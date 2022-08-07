import { IconItem } from "@components/atomics/IconItem";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";

export function FileMenuItem() {
    return (
        <ListContainer
            className="menu__file-sub menu-style"
            defaultValue="File"
        >
            <ListItem data-action="file-new" className="file-menu-new-button">
                <IconItem className="far fa-file" />
                New<em>Ctrl+N</em>
            </ListItem>
            <ListItem data-action="file-open">
                <IconItem className="far fa-folder-open" />
                Open<em>Ctrl+O</em>
            </ListItem>
            <ListItem data-action="file-close">
                <IconItem className="far fa-window-close" />
                Close
            </ListItem>
            <ListItem data-action="file-save">
                <IconItem className="far fa-save" />
                Save<em>Ctrl+S</em>
            </ListItem>
            <ListItem data-action="file-preferences">
                <IconItem className="fas fa-wrench" />
                User Preferences<em>Ctrl+M</em>
            </ListItem>
            <ListItem className="menu__empty-line"></ListItem>
            <ListItem data-action="file-export">
                <IconItem className="fas fa-file-download" />
                Export
            </ListItem>
            <ListItem className="menu__empty-line"></ListItem>
            <ListItem data-action="file-exit">
                <IconItem className="far fa-times-circle" />
                Exit
            </ListItem>
        </ListContainer>
    );
}
