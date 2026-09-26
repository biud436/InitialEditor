import { ToolsOptionsCommand } from "./commands/ToolsOptionsCommand";
import { ToolsSoundTestCommand } from "./commands/tools/ToolsSoundTestCommand";
import { ToolsScriptEditorCommand } from "./commands/tools/ToolsScriptEditorCommand";
import { ToolsResourceManagerCommand } from "./commands/tools/ToolsResourceManagerCommand";
import { ToolsDatabaseCommand } from "./commands/tools/ToolsDatabaseCommand";

export const ToolMenuNameMap = <const>[
    "tools-database",
    "tools-resource-manager",
    "tools-script-editor",
    "tools-sound-test",
    "tools-options",
];

export type ToolMenuImpl = {
    name: string;
    children: {
        [key in (typeof ToolMenuNameMap)[number]]: {
            name: string;
            children: Partial<Record<string, unknown>>;
            action: (ev: unknown) => void;
        };
    };
};

export const ToolMenu = <Partial<ToolMenuImpl>>{
    name: "도구",
    children: {
        "tools-database": new ToolsDatabaseCommand(),
        "tools-resource-manager": new ToolsResourceManagerCommand(),
        "tools-script-editor": new ToolsScriptEditorCommand(),
        "tools-sound-test": new ToolsSoundTestCommand(),
        "tools-options": new ToolsOptionsCommand(),
    },
};
