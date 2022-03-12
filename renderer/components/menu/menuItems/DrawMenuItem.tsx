export function DrawMenuitem() {
    return (
        <ul className="menu__draw-sub menu-style" defaultValue="Draw">
            <li data-action="draw-pencil">
                <i className="fas fa-pencil-alt"></i>Pencil
            </li>
            <li data-action="draw-rectangle">
                <i className="fas fa-square-full"></i>Rectangle
            </li>
            <li data-action="draw-ellipse">
                <i className="fas fa-circle"></i>Ellipse
            </li>
            <li data-action="draw-flood-fill">
                <i className="fas fa-fill"></i>Flood Fill
            </li>
            <li data-action="draw-shadow-pen">
                <i className="fas fa-paint-brush"></i>Shadow Pen
            </li>
        </ul>
    );
}
