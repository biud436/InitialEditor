export function HelpMenuItem() {
    return (
        <ul className="menu__help-sub menu-style" defaultValue="Help">
            <li data-action="help-contents">
                <i className="fas fa-question-circle"></i>Contents<em>F1</em>
            </li>
            <li className="menu__empty-line"></li>
            <li data-action="help-about">
                <i className="fas fa-info-circle"></i>About...
            </li>
        </ul>
    );
}
