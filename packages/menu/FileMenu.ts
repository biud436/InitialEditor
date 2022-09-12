import * as electron from "electron";
import { ElectronService } from "../ElectronService";
import "reflect-metadata";
import { OnMenuClick } from "../decorators/OnMenuClick";
import { NewFileEventHandler } from "./handlers/NewFileEventHandler";
import { OpenFileEventHandler } from "./handlers/OpenFileEventHandler";

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
            name: string;
            children: Partial<Record<string, any>>;
            shortcut?: string[];
            action?: (ev: any) => void | Function;
        };
    };
};

export const FileMenu = <Partial<FileMenuImpl>>{
    name: "파일",
    children: {
        "file-new": new NewFileEventHandler(),
        "file-open": new OpenFileEventHandler(),
        "file-close": {
            name: "파일 닫기",
            children: {},
        },
        "file-save": {
            name: "파일 저장",
            children: {},
        },
        "file-preferences": {
            name: "환경 설정",
            children: {},
        },
        "file-export": {
            name: "내보내기",
            children: {},
        },
        "file-exit": {
            name: "프로그램 종료",
            children: {},
            action: function (ev: any) {
                const service = ElectronService.getInstance();
                service.quit();
            },
        },
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
