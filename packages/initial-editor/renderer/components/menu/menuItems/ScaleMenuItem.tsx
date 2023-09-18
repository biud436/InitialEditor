export function ScaleMenuItem() {
    return (
        <ul className="menu__scale-sub menu-style" defaultValue="Scale">
            <li data-action="scale-1x">
                <i className="fas fa-search-plus"></i>1:1
            </li>
            <li data-action="scale-2x">
                <i className="fas fa-search-plus"></i>1:2
            </li>
            <li data-action="scale-4x">
                <i className="fas fa-search-plus"></i>1:4
            </li>
            <li data-action="scale-8x">
                <i className="fas fa-search-plus"></i>1:8
            </li>
        </ul>
    );
}
