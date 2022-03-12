export function FileMenuItem() {
    return (
        <ul className="menu__file-sub menu-style" defaultValue="File">
            <li data-action="file-new" className="file-menu-new-button">
                <i className="far fa-file"></i>New<em>Ctrl+N</em>
            </li>
            <li data-action="file-open">
                <i className="far fa-folder-open"></i>Open<em>Ctrl+O</em>
            </li>
            <li data-action="file-close">
                <i className="far fa-window-close"></i>Close
            </li>
            <li data-action="file-save">
                <i className="far fa-save"></i>Save<em>Ctrl+S</em>
            </li>
            <li data-action="file-preferences">
                <i className="fas fa-wrench"></i>User Preferences<em>Ctrl+M</em>
            </li>
            <li className="menu__empty-line"></li>
            <li data-action="file-export">
                <i className="fas fa-file-download"></i>Export
            </li>
            <li className="menu__empty-line"></li>
            <li data-action="file-exit">
                <i className="far fa-times-circle"></i>Exit
            </li>
        </ul>
    );
}
