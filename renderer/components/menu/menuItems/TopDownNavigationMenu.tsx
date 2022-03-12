export function TopDownNavigationMenu() {
    return (
        <ul className="menu__main">
            <li className="menu__main-program-icon"></li>
            <li className="menu__main-file">
                <label htmlFor="file" data-action="file">
                    File
                </label>
            </li>
            <li>
                <label htmlFor="edit" data-action="edit">
                    Edit
                </label>
            </li>
            <li>
                <label htmlFor="mode" data-action="mode">
                    Mode
                </label>
            </li>
            <li>
                <label htmlFor="draw" data-action="draw">
                    Draw
                </label>
            </li>
            <li>
                <label htmlFor="scale" data-action="scale">
                    Scale
                </label>
            </li>
            <li>
                <label htmlFor="tools" data-action="tools">
                    Tools
                </label>
            </li>
            <li>
                <label htmlFor="game" data-action="game">
                    Game
                </label>
            </li>
            <li>
                <label htmlFor="help" data-action="help">
                    Help
                </label>
            </li>
            <ul className="control-box">
                <li className="minimum" data-action="minimum">
                    <i className="fas fa-minus"></i>
                </li>
                <li className="maximum" data-action="maximum">
                    <i className="fas fa-window-maximize"></i>
                </li>
                <li className="close" data-action="close">
                    <i className="far fa-window-close"></i>
                </li>
            </ul>
        </ul>
    );
}
