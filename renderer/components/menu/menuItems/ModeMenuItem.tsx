export function ModeMenuItem() {
    return (
        <ul className="menu__mode-sub menu-style" defaultValue="Mode">
            <li data-action="mode-map">
                <i className="fas fa-layer-group"></i>Map
            </li>
            <li data-action="mode-event">
                <i className="fas fa-flag-checkered"></i>Event
            </li>
            <li data-action="mode-region">
                <i className="fas fa-map"></i>Region
            </li>
        </ul>
    );
}
