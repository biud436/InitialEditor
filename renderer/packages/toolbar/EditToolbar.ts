import { EmptySegment } from "./EmptySegment";
import { WindowCreator } from "../WindowCreator";
import { ToolbarBase } from "./interface/toolbar.dto";

const EditToolbar: ToolbarBase[] = [
    {
        name: "",
        children: "edit-cut",
        action: (ev: any) => {},
    },
    {
        name: "",
        children: "edit-copy",
        action: (ev: any) => {},
    },
    {
        name: "",
        children: "edit-paste",
        action: (ev: any) => {},
    },
    {
        name: "",
        children: "edit-delete",
        action: (ev: any) => {},
    },
    EmptySegment,
];

export { EditToolbar };
