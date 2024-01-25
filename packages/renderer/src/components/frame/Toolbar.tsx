import { IconItem } from '../atomics/IconItem';
import { ListContainer } from '../atomics/ListContainer';
import { ListItem } from '../atomics/ListItem';
import { Box } from '../atomics/Box';

export function Toolbar() {
    return (
        <Box className="toolbar">
            <ListContainer>
                <ListItem
                    data-action="file-new"
                    className="file-menu-new-button"
                >
                    <IconItem className="far fa-file" title="게임 만들기" />
                </ListItem>
                <ListItem data-action="file-open">
                    <IconItem
                        className="far fa-folder-open"
                        title="게임 열기"
                    />
                </ListItem>
                <ListItem data-action="file-save">
                    <IconItem className="far fa-save" />
                </ListItem>
                <ListItem data-action="edit-undo">
                    <IconItem className="fas fa-undo" />
                </ListItem>
                <ListItem className="toolbar__empty-line--modifier"></ListItem>
                <ListItem data-action="edit-cut">
                    <IconItem className="fas fa-cut" />
                </ListItem>
                <ListItem data-action="edit-copy">
                    <IconItem className="fas fa-copy" />
                </ListItem>
                <ListItem data-action="edit-paste">
                    <IconItem className="fas fa-paste" />
                </ListItem>
                <ListItem data-action="edit-delete">
                    <IconItem className="fas fa-trash-alt" />
                </ListItem>
                <ListItem className="toolbar__empty-line--modifier"></ListItem>
                <ListItem data-action="mode-map">
                    <IconItem className="fas fa-layer-group" />
                </ListItem>
                <ListItem data-action="mode-event">
                    <IconItem className="fas fa-flag-checkered" />
                </ListItem>
                <ListItem data-action="mode-region">
                    <IconItem className="fas fa-map" />
                </ListItem>
                <ListItem className="toolbar__empty-line--modifier"></ListItem>
                <ListItem data-action="draw-pencil">
                    <IconItem
                        id="pen-tool"
                        className="fas fa-pencil-alt"
                        title="펜"
                    />
                </ListItem>
                <ListItem data-action="draw-rectangle">
                    <IconItem
                        id="square-tool"
                        className="fas fa-square-full"
                        title="사각형"
                    />
                </ListItem>
                <ListItem data-action="draw-ellipse">
                    <IconItem
                        id="rectangle-tool"
                        className="fas fa-circle"
                        title="직사각형"
                    />
                </ListItem>
                <ListItem data-action="draw-flood-fill">
                    <IconItem
                        id="pen-tool"
                        className="fas fa-fill"
                        title="채우기"
                    />
                </ListItem>
                <ListItem data-action="draw-shadow-pen">
                    <IconItem
                        id="shadow-tool"
                        className="fas fa-paint-brush"
                        title="그림자"
                    />
                </ListItem>
                <ListItem className="toolbar__empty-line--modifier"></ListItem>
                <ListItem data-action="take-screenshot">
                    <IconItem
                        id="take-screenshot"
                        title="맵 파일 내보내기"
                        className="fas fa-book"
                    />
                </ListItem>
                <ListItem data-action="tools-resource-manager">
                    <IconItem className="fas fa-scroll" />
                </ListItem>
                <ListItem data-action="tools-script-editor">
                    <IconItem className="fas fa-toolbox" />
                </ListItem>
                <ListItem data-action="tools-sound-test">
                    <IconItem className="fas fa-music" />
                </ListItem>
                <ListItem className="toolbar__empty-line--modifier"></ListItem>
                <ListItem data-action="tools-options">
                    <IconItem className="fas fa-user-cog" />
                </ListItem>
                <ListItem className="toolbar__empty-line--modifier"></ListItem>
                <ListItem data-action="game-playtest">
                    <IconItem className="fas fa-gamepad" />
                </ListItem>
                <ListItem className="toolbar__empty-line--modifier"></ListItem>
                <ListItem data-action="game-folder-open">
                    <IconItem className="fas fa-folder-open" />
                </ListItem>
            </ListContainer>
        </Box>
    );
}
