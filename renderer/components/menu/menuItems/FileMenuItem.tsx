export function FileMenuItem() {
    return (
        <ul className="menu__file-sub menu-style" defaultValue="File">
            <li data-action="file-new" className="file-menu-new-button">
                <i className="far fa-file" />
                New<em>Ctrl+N</em>
            </li>
            <li data-action="file-open">
                <i className="far fa-folder-open" />
                Open<em>Ctrl+O</em>
            </li>
            <li data-action="file-close">
                <i className="far fa-window-close" />
                Close
            </li>
            <li data-action="file-save">
                <i className="far fa-save" />
                Save<em>Ctrl+S</em>
            </li>
            <li data-action="file-preferences">
                <i className="fas fa-wrench" />
                User Preferences<em>Ctrl+M</em>
            </li>
            <li className="menu__empty-line"></li>
            <li data-action="file-export">
                <i className="fas fa-file-download" />
                Export
            </li>
            <li className="menu__empty-line"></li>
            <li data-action="file-exit">
                <i className="far fa-times-circle" />
                Exit
            </li>
        </ul>
    );
}
