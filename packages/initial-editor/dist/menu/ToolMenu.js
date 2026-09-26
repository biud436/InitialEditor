import { ToolsOptionsCommand } from "./commands/ToolsOptionsCommand";
import { ToolsSoundTestCommand } from "./commands/tools/ToolsSoundTestCommand";
import { ToolsScriptEditorCommand } from "./commands/tools/ToolsScriptEditorCommand";
import { ToolsResourceManagerCommand } from "./commands/tools/ToolsResourceManagerCommand";
import { ToolsDatabaseCommand } from "./commands/tools/ToolsDatabaseCommand";
export const ToolMenuNameMap = [
    "tools-database",
    "tools-resource-manager",
    "tools-script-editor",
    "tools-sound-test",
    "tools-options",
];
export const ToolMenu = {
    name: "도구",
    children: {
        "tools-database": new ToolsDatabaseCommand(),
        "tools-resource-manager": new ToolsResourceManagerCommand(),
        "tools-script-editor": new ToolsScriptEditorCommand(),
        "tools-sound-test": new ToolsSoundTestCommand(),
        "tools-options": new ToolsOptionsCommand(),
    },
};
//# sourceMappingURL=ToolMenu.js.map