import { EditCopyCommand } from "./commands/edit/EditCopyCommand";
import { EditCutCommand } from "./commands/edit/EditCutCommand";
import { EditDeleteCommand } from "./commands/edit/EditDeleteCommand";
import { EditPasteCommand } from "./commands/edit/EditPasteCommand";
import { EditUndoCommand } from "./commands/edit/EditUndoCommand";

export const EditMenuNameMap = <const>[
    "edit-undo",
    "edit-cut",
    "edit-copy",
    "edit-paste",
    "edit-delete",
];

export type EditMenuImpl = {
    name: string;
    children: {
        [key in (typeof EditMenuNameMap)[number]]: {
            name: string;
            children: Partial<Record<string, any>>;
            action: (ev: any) => void;
        };
    };
};

export const EditMenu = <Partial<EditMenuImpl>>{
    name: "편집",
    children: {
        "edit-undo": new EditUndoCommand(),
        "edit-cut": new EditCutCommand(),
        "edit-copy": new EditCopyCommand(),
        "edit-paste": new EditPasteCommand(),
        "edit-delete": new EditDeleteCommand(),
    },
};
