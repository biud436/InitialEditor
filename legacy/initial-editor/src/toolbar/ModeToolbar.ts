import { EmptySegment } from "./EmptySegment";
import { ToolbarBase } from "./interface/toolbar.dto";

const ModeToolbar: ToolbarBase[] = [
    {
        name: "",
        children: "mode-map",
        action: (ev: unknown) => {},
    },
    {
        name: "",
        children: "mode-event",
        action: (ev: unknown) => {},
    },
    {
        name: "",
        children: "mode-region",
        action: (ev: unknown) => {},
    },
    EmptySegment,
];

export { ModeToolbar };
