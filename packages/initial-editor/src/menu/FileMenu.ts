import "reflect-metadata";
import { NewFileCommand } from "./commands/file/NewFileCommand";
import { OpenFileCommand } from "./commands/file/OpenFileCommand";
import { FileExitCommand } from "./commands/file/FileExitCommand";
import { FileCloseCommand } from "./commands/file/FileCloseCommand";
import { FileSaveCommand } from "./commands/file/FileSaveCommand";
import { FilePreferencesCommand } from "./commands/file/FilePreferencesCommand";
import { FileExportCommand } from "./commands/file/FileExportCommand";

export const FileMenuNameMap = <const>[
    "file-new",
    "file-open",
    "file-close",
    "file-save",
    "file-preferences",
    "file-exit",
];

export type FileMenuImpl = {
    name: string;
    children: {
        [key in (typeof FileMenuNameMap)[number]]: {
            name?: string;
            children?: Partial<Record<string, any>>;
            shortcut?: string[];
            action?: (ev: any) => void | Function;
        };
    };
};

export const FileMenu = <Partial<FileMenuImpl>>{
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
