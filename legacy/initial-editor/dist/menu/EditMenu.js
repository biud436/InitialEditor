import { EditCopyCommand } from "./commands/edit/EditCopyCommand";
import { EditCutCommand } from "./commands/edit/EditCutCommand";
import { EditDeleteCommand } from "./commands/edit/EditDeleteCommand";
import { EditPasteCommand } from "./commands/edit/EditPasteCommand";
import { EditUndoCommand } from "./commands/edit/EditUndoCommand";
export const EditMenuNameMap = [
    "edit-undo",
    "edit-cut",
    "edit-copy",
    "edit-paste",
    "edit-delete",
];
export const EditMenu = {
    name: "편집",
    children: {
        "edit-undo": new EditUndoCommand(),
        "edit-cut": new EditCutCommand(),
        "edit-copy": new EditCopyCommand(),
        "edit-paste": new EditPasteCommand(),
        "edit-delete": new EditDeleteCommand(),
    },
};
//# sourceMappingURL=EditMenu.js.map