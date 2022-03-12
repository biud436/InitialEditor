export function Toolbar() {
    return (
        <div className="toolbar">
            <ul>
                <li data-action="file-new" className="file-menu-new-button">
                    <i className="far fa-file" title="게임 만들기"></i>
                </li>
                <li data-action="file-open">
                    <i className="far fa-folder-open" title="게임 열기"></i>
                </li>
                <li data-action="file-save">
                    <i className="far fa-save"></i>
                </li>
                <li data-action="edit-undo">
                    <i className="fas fa-undo"></i>
                </li>
                <li className="toolbar__empty-line--modifier"></li>
                <li data-action="edit-cut">
                    <i className="fas fa-cut"></i>
                </li>
                <li data-action="edit-copy">
                    <i className="fas fa-copy"></i>
                </li>
                <li data-action="edit-paste">
                    <i className="fas fa-paste"></i>
                </li>
                <li data-action="edit-delete">
                    <i className="fas fa-trash-alt"></i>
                </li>
                <li className="toolbar__empty-line--modifier"></li>
                <li data-action="mode-map">
                    <i className="fas fa-layer-group"></i>
                </li>
                <li data-action="mode-event">
                    <i className="fas fa-flag-checkered"></i>
                </li>
                <li data-action="mode-region">
                    <i className="fas fa-map"></i>
                </li>
                <li className="toolbar__empty-line--modifier"></li>
                <li data-action="draw-pencil">
                    <i
                        id="pen-tool"
                        className="fas fa-pencil-alt"
                        title="펜"
                    ></i>
                </li>
                <li data-action="draw-rectangle">
                    <i
                        id="square-tool"
                        className="fas fa-square-full"
                        title="사각형"
                    ></i>
                </li>
                <li data-action="draw-ellipse">
                    <i
                        id="rectangle-tool"
                        className="fas fa-circle"
                        title="직사각형"
                    ></i>
                </li>
                <li data-action="draw-flood-fill">
                    <i id="pen-tool" className="fas fa-fill" title="채우기"></i>
                </li>
                <li data-action="draw-shadow-pen">
                    <i
                        id="shadow-tool"
                        className="fas fa-paint-brush"
                        title="그림자"
                    ></i>
                </li>
                <li className="toolbar__empty-line--modifier"></li>
                <li data-action="take-screenshot">
                    <i
                        id="take-screenshot"
                        title="맵 파일 내보내기"
                        className="fas fa-book"
                    ></i>
                </li>
                <li data-action="tools-resource-manager">
                    <i className="fas fa-scroll"></i>
                </li>
                <li data-action="tools-script-eidtor">
                    <i className="fas fa-toolbox"></i>
                </li>
                <li data-action="tools-sound-test">
                    <i className="fas fa-music"></i>
                </li>
                <li className="toolbar__empty-line--modifier"></li>
                <li data-action="tools-options">
                    <i className="fas fa-user-cog"></i>
                </li>
                <li className="toolbar__empty-line--modifier"></li>
                <li data-action="game-playtest">
                    <i className="fas fa-gamepad"></i>
                </li>
                <li className="toolbar__empty-line--modifier"></li>
                <li data-action="game-folder-open">
                    <i className="fas fa-folder-open"></i>
                </li>
            </ul>
        </div>
    );
}
