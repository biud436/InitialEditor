import { EmptySegment } from "./EmptySegment";
import { WindowCreator } from "../WindowCreator";
import { ToolbarBase } from "./interface/toolbar.dto";

const ModeToolbar: ToolbarBase[] = [
    {
        name: "",
        children: "mode-map",
        action: (ev: any) => {},
    },
    {
        name: "",
        children: "mode-event",
        action: (ev: any) => {},
    },
    {
        name: "",
        children: "mode-region",
        action: (ev: any) => {},
    },
    EmptySegment,
];

export { ModeToolbar };
