import { EmptySegment } from "./EmptySegment";
import { ToolbarBase } from "./interface/toolbar.dto";

const EditToolbar: ToolbarBase[] = [
    {
        name: "",
        children: "edit-cut",
        action: (ev: unknown) => {},
    },
    {
        name: "",
        children: "edit-copy",
        action: (ev: unknown) => {},
    },
    {
        name: "",
        children: "edit-paste",
        action: (ev: unknown) => {},
    },
    {
        name: "",
        children: "edit-delete",
        action: (ev: unknown) => {},
    },
    EmptySegment,
];

export { EditToolbar };
