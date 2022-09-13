import * as electron from "electron";
import { ElectronService } from "../ElectronService";
import "reflect-metadata";
import { OnMenuClick } from "../decorators/OnMenuClick";
import { NewFileCommand } from "./commands/NewFileCommand";
import { OpenFileCommand } from "./commands/OpenFileCommand";
import { FileExitCommand } from "./commands/FileExitCommand";
import { IBaseMenuCommand } from "./commands/IBaseMenuCommand";
import { FileCloseCommand } from "./commands/FileCloseCommand";
import { FileSaveCommand } from "./commands/FileSaveCommand";
import { FilePreferencesCommand } from "./commands/FilePreferencesCommand";
import { FileExportCommand } from "./commands/FileExportCommand";

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
    [key in typeof FileMenuNameMap[number]]: {
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

// if (process.platform === "darwin") {
//     electron.ipcRenderer.on("new-file", () => {
//         const children = FileMenu.children;
//         if (children && children["file-new"].action) {
//             children["file-new"].action(null);
//         }
//     });
// }
