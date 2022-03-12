export function ToolMenuItem() {
    return (
        <ul className="menu__tools-sub menu-style" defaultValue="Tools">
            <li data-action="tools-database">
                <i className="fas fa-book"></i>Database...<em>F9</em>
            </li>
            <li data-action="tools-resource-manager">
                <i className="fas fa-scroll"></i>Resource Manager
            </li>
            <li data-action="tools-script-eidtor">
                <i className="fas fa-toolbox"></i>Script Editor
            </li>
            <li data-action="tools-sound-test">
                <i className="fas fa-music"></i>Sound Test
            </li>
            <li className="menu__empty-line"></li>
            <li data-action="tools-options">
                <i className="fas fa-user-cog"></i>Options...
            </li>
        </ul>
    );
}
