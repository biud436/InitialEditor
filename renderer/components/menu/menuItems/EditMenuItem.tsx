export function EditMenuItem() {
    return (
        <ul className="menu__edit-sub menu-style" defaultValue="Edit">
            <li data-action="edit-undo">
                <i className="fas fa-undo"></i>Undo
            </li>
            <li className="menu__empty-line"></li>
            <li data-action="edit-cut">
                <i className="fas fa-cut"></i>Cut
            </li>
            <li data-action="edit-copy">
                <i className="fas fa-copy"></i>Copy
            </li>
            <li data-action="edit-paste">
                <i className="fas fa-paste"></i>Paste
            </li>
            <li data-action="edit-delete">
                <i className="fas fa-trash-alt"></i>Delete
            </li>
        </ul>
    );
}
