export function GameMenuItem() {
    return (
        <ul className="menu__game-sub menu-style" defaultValue="Game">
            <li data-action="game-playtest">
                <i className="fas fa-gamepad"></i>Playtest<em>F12</em>
            </li>
            <li className="menu__empty-line"></li>
            <li data-action="game-fullscreen">Launch in Full Screen</li>
            <li data-action="game-show-console">Show Console</li>
            <li data-action="game-folder-open">
                <i className="fas fa-folder-open"></i>Open Game Folder
            </li>
        </ul>
    );
}
