import "reflect-metadata";
import { NewFileCommand } from "./commands/file/NewFileCommand";
import { OpenFileCommand } from "./commands/file/OpenFileCommand";
import { FileExitCommand } from "./commands/file/FileExitCommand";
import { FileCloseCommand } from "./commands/file/FileCloseCommand";
import { FileSaveCommand } from "./commands/file/FileSaveCommand";
import { FilePreferencesCommand } from "./commands/file/FilePreferencesCommand";
import { FileExportCommand } from "./commands/file/FileExportCommand";
export const FileMenuNameMap = [
    "file-new",
    "file-open",
    "file-close",
    "file-save",
    "file-preferences",
    "file-exit",
];
export const FileMenu = {
    name: "파일",
    children: {
        "file-new": new NewFileCommand(),
        "file-open": new OpenFileCommand(),
        "file-close": new FileCloseCommand(),
        "file-save": new FileSaveCommand(),
        "file-preferences": new FilePreferencesCommand(),
        "file-export": new FileExportCommand(),
        "file-exit": new FileExitCommand(),
    },
};
//# sourceMappingURL=FileMenu.js.map